//go:build windows

package main

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"golang.org/x/sys/windows"
)

const updateHelperArgument = "--boundless-apply-update"

func configureUpdateHelperCommand(command *exec.Cmd) {
	command.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
}

func runUpdateHelperIfRequested(arguments []string) (bool, int) {
	if len(arguments) < 2 || arguments[1] != updateHelperArgument {
		return false, 0
	}
	if len(arguments) != 5 {
		return true, 2
	}
	pid, err := strconv.Atoi(arguments[4])
	if err != nil || pid <= 0 {
		return true, 2
	}
	if err := applyDownloadedUpdate(arguments[2], arguments[3], uint32(pid)); err != nil {
		writeUpdateError(arguments[3], err)
		return true, 1
	}
	return true, 0
}

func applyDownloadedUpdate(source, target string, processID uint32) error {
	source, err := filepath.Abs(source)
	if err != nil {
		return err
	}
	target, err = filepath.Abs(target)
	if err != nil {
		return err
	}
	updatesDir := filepath.Join(filepath.Dir(target), "data", "updates")
	relation, err := filepath.Rel(updatesDir, source)
	if err != nil || relation == ".." || strings.HasPrefix(relation, ".."+string(filepath.Separator)) {
		return errors.New("更新源文件不在受信任的 data/updates 目录中")
	}
	if !strings.EqualFold(filepath.Ext(source), ".exe") {
		return errors.New("更新源文件不是 Windows 程序")
	}
	if err := waitForProcessExit(processID, 2*time.Minute); err != nil {
		return err
	}

	backup := filepath.Join(updatesDir, fmt.Sprintf("BoundlessStudio-previous-%d.exe", time.Now().UnixMilli()))
	var lastErr error
	for attempt := 0; attempt < 120; attempt++ {
		if err := os.Rename(target, backup); err != nil {
			lastErr = err
			time.Sleep(250 * time.Millisecond)
			continue
		}
		if err := os.Rename(source, target); err != nil {
			_ = os.Rename(backup, target)
			lastErr = err
			time.Sleep(250 * time.Millisecond)
			continue
		}
		command := exec.Command(target)
		command.Dir = filepath.Dir(target)
		if err := command.Start(); err != nil {
			_ = os.Remove(target)
			_ = os.Rename(backup, target)
			return fmt.Errorf("新版客户端无法启动: %w", err)
		}
		_ = os.Remove(backup)
		return nil
	}
	return fmt.Errorf("无法替换正在使用的客户端程序: %w", lastErr)
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

func writeUpdateError(target string, updateErr error) {
	updatesDir := filepath.Join(filepath.Dir(target), "data", "updates")
	_ = os.MkdirAll(updatesDir, 0o755)
	_ = os.WriteFile(filepath.Join(updatesDir, "update-error.txt"), []byte(time.Now().Format(time.RFC3339)+"\r\n"+updateErr.Error()+"\r\n"), 0o600)
}
