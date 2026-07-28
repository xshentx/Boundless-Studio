//go:build windows

package main

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"syscall"
	"time"

	"golang.org/x/sys/windows"
)

const (
	updateHelperArgument = "--boundless-apply-update"
	updateAckArgument    = "--boundless-update-ack"
	updateRootArgument   = "--boundless-update-root"
	updateAckTimeout     = 90 * time.Second
)

var legacyVersionedExecutablePattern = regexp.MustCompile(`(?i)^BoundlessStudio-v[0-9]+\.[0-9]+\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?\.exe$`)

func resolveUpdateTargetExecutable(runningExecutable string) string {
	if !legacyVersionedExecutablePattern.MatchString(filepath.Base(runningExecutable)) {
		return runningExecutable
	}
	canonical := filepath.Join(filepath.Dir(runningExecutable), "BoundlessStudio.exe")
	info, err := os.Stat(canonical)
	if err != nil || info.IsDir() {
		return runningExecutable
	}
	return canonical
}

func configureUpdateHelperCommand(command *exec.Cmd) {
	command.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
}

func runUpdateHelperIfRequested(arguments []string) (bool, int) {
	if len(arguments) < 2 || arguments[1] != updateHelperArgument {
		return false, 0
	}
	if len(arguments) != 6 {
		return true, 2
	}
	pid, err := strconv.Atoi(arguments[5])
	if err != nil || pid <= 0 {
		return true, 2
	}
	if err := applyDownloadedUpdate(arguments[2], arguments[3], arguments[4], uint32(pid)); err != nil {
		writeUpdateError(arguments[4], err)
		return true, 1
	}
	return true, 0
}

// acknowledgeAppliedUpdate is called only after Wails has reached its startup
// callback. The helper keeps the previous executable until this acknowledgement
// arrives, so a process that starts and immediately crashes is rolled back.
func acknowledgeAppliedUpdate(arguments []string) {
	ackValue, ackOK := updateArgumentValue(arguments, updateAckArgument)
	rootValue, rootOK := updateArgumentValue(arguments, updateRootArgument)
	if !ackOK || !rootOK {
		return
	}
	ackPath, err := filepath.Abs(ackValue)
	if err != nil || !trustedUpdateArtifactPath(ackPath, rootValue) {
		return
	}
	_ = os.WriteFile(ackPath, []byte(time.Now().Format(time.RFC3339Nano)), 0o600)
}

func updateArgumentValue(arguments []string, name string) (string, bool) {
	for index := 1; index+1 < len(arguments); index++ {
		if arguments[index] == name {
			return arguments[index+1], true
		}
	}
	return "", false
}

func applyDownloadedUpdate(source, target, updatesDir string, processID uint32) error {
	source, err := filepath.Abs(source)
	if err != nil {
		return err
	}
	target, err = filepath.Abs(target)
	if err != nil {
		return err
	}
	updatesDir, err = filepath.Abs(updatesDir)
	if err != nil {
		return err
	}
	if !trustedUpdateArtifactPath(source, updatesDir) {
		return errors.New("更新源文件不在受信任的 data/updates 目录中")
	}
	if !strings.EqualFold(filepath.Ext(source), ".exe") {
		return errors.New("更新源文件不是 Windows 程序")
	}
	if err := validateWindowsExecutable(source); err != nil {
		return err
	}
	if err := waitForProcessExit(processID, 2*time.Minute); err != nil {
		return err
	}

	backup := updateBackupPath(target)
	var lastErr error
	for attempt := 0; attempt < 120; attempt++ {
		if err := os.Rename(target, backup); err != nil {
			lastErr = err
			time.Sleep(250 * time.Millisecond)
			continue
		}
		if err := moveFile(source, target); err != nil {
			if rollbackErr := restorePreviousExecutable(target, backup); rollbackErr != nil {
				return fmt.Errorf("安装新版客户端失败: %v；恢复旧程序也失败: %w", err, rollbackErr)
			}
			lastErr = err
			time.Sleep(250 * time.Millisecond)
			continue
		}
		if err := launchAndVerifyUpdatedExecutable(target, backup, updatesDir); err != nil {
			return err
		}
		cleanupLegacyVersionedExecutables(filepath.Dir(target), target)
		return nil
	}
	return fmt.Errorf("无法替换正在使用的客户端程序: %w", lastErr)
}

func updateBackupPath(target string) string {
	// Keep the rollback file beside the installed executable. The configured
	// data directory may be on another volume, where os.Rename cannot provide
	// the atomic first half of the replacement.
	return target + fmt.Sprintf(".previous-%d.bak", time.Now().UnixMilli())
}

func launchAndVerifyUpdatedExecutable(target, backup, updatesDir string) error {
	ackPath := filepath.Join(updatesDir, fmt.Sprintf("update-ack-%d", time.Now().UnixNano()))
	_ = os.Remove(ackPath)
	command := exec.Command(target, updateAckArgument, ackPath, updateRootArgument, updatesDir)
	command.Dir = filepath.Dir(target)
	configureUpdateHelperCommand(command)
	if err := command.Start(); err != nil {
		rollbackErr := restorePreviousExecutable(target, backup)
		if rollbackErr != nil {
			return fmt.Errorf("新版客户端无法启动: %v；恢复旧程序也失败: %w", err, rollbackErr)
		}
		if restartErr := restartPreviousExecutable(target); restartErr != nil {
			return fmt.Errorf("新版客户端无法启动，旧程序已恢复但无法重启: %v: %w", err, restartErr)
		}
		return fmt.Errorf("新版客户端无法启动，已恢复旧程序: %w", err)
	}

	if err := waitForUpdateAcknowledgement(command, ackPath, updateAckTimeout); err != nil {
		rollbackErr := restorePreviousExecutable(target, backup)
		if rollbackErr != nil {
			return fmt.Errorf("新版客户端启动验证失败: %v；恢复旧程序也失败: %w", err, rollbackErr)
		}
		if restartErr := restartPreviousExecutable(target); restartErr != nil {
			return fmt.Errorf("新版客户端启动验证失败，旧程序已恢复但无法重启: %v: %w", err, restartErr)
		}
		return fmt.Errorf("新版客户端启动验证失败，已恢复并重启旧程序: %w", err)
	}

	_ = os.Remove(ackPath)
	_ = os.Remove(backup)
	return nil
}

func waitForUpdateAcknowledgement(command *exec.Cmd, ackPath string, timeout time.Duration) error {
	processDone := make(chan error, 1)
	go func() { processDone <- command.Wait() }()
	ticker := time.NewTicker(150 * time.Millisecond)
	defer ticker.Stop()
	timer := time.NewTimer(timeout)
	defer timer.Stop()

	acknowledged := func() bool {
		info, err := os.Stat(ackPath)
		return err == nil && info.Size() > 0
	}
	for {
		select {
		case waitErr := <-processDone:
			if acknowledged() {
				return nil
			}
			if waitErr == nil {
				return errors.New("新版客户端在启动确认前已退出")
			}
			return fmt.Errorf("新版客户端在启动确认前退出: %w", waitErr)
		case <-ticker.C:
			if acknowledged() {
				return nil
			}
		case <-timer.C:
			_ = command.Process.Kill()
			<-processDone
			return errors.New("等待新版客户端启动确认超时")
		}
	}
}

func restorePreviousExecutable(target, backup string) error {
	_ = os.Remove(target)
	if err := os.Rename(backup, target); err == nil {
		return nil
	}
	if err := copyFile(backup, target); err != nil {
		return err
	}
	return os.Remove(backup)
}

func restartPreviousExecutable(target string) error {
	command := exec.Command(target)
	command.Dir = filepath.Dir(target)
	configureUpdateHelperCommand(command)
	return command.Start()
}

func cleanupLegacyVersionedExecutablesAtStartup() {
	executable, err := os.Executable()
	if err != nil {
		return
	}
	executable, err = filepath.Abs(executable)
	if err != nil {
		return
	}
	cleanupLegacyVersionedExecutables(filepath.Dir(executable), executable)
}

func cleanupLegacyVersionedExecutables(programDir, activeExecutable string) {
	activeExecutable, _ = filepath.Abs(activeExecutable)
	entries, err := os.ReadDir(programDir)
	if err != nil {
		return
	}
	for _, entry := range entries {
		if entry.IsDir() || !legacyVersionedExecutablePattern.MatchString(entry.Name()) {
			continue
		}
		candidate := filepath.Join(programDir, entry.Name())
		candidate, _ = filepath.Abs(candidate)
		if strings.EqualFold(candidate, activeExecutable) {
			continue
		}
		_ = os.Remove(candidate)
	}
}

func trustedUpdateArtifactPath(path, updatesDir string) bool {
	path, pathErr := filepath.Abs(path)
	updatesDir, dirErr := filepath.Abs(updatesDir)
	if pathErr != nil || dirErr != nil || !strings.EqualFold(filepath.Base(updatesDir), "updates") {
		return false
	}
	relation, err := filepath.Rel(updatesDir, path)
	return err == nil && relation != "." && relation != ".." && !strings.HasPrefix(relation, ".."+string(filepath.Separator))
}

func waitForProcessExit(processID uint32, timeout time.Duration) error {
	handle, err := windows.OpenProcess(windows.SYNCHRONIZE, false, processID)
	if err != nil {
		if errors.Is(err, windows.ERROR_INVALID_PARAMETER) {
			return nil
		}
		return fmt.Errorf("无法等待旧客户端退出: %w", err)
	}
	defer windows.CloseHandle(handle)
	milliseconds := uint32(timeout / time.Millisecond)
	result, err := windows.WaitForSingleObject(handle, milliseconds)
	if err != nil {
		return fmt.Errorf("等待旧客户端退出失败: %w", err)
	}
	if result == uint32(windows.WAIT_TIMEOUT) {
		return errors.New("等待旧客户端退出超时")
	}
	return nil
}

func writeUpdateError(updatesDir string, updateErr error) {
	_ = os.MkdirAll(updatesDir, 0o755)
	_ = os.WriteFile(filepath.Join(updatesDir, "update-error.txt"), []byte(time.Now().Format(time.RFC3339)+"\r\n"+updateErr.Error()+"\r\n"), 0o600)
}
