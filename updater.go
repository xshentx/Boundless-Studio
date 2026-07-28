package main

import (
	"archive/zip"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	githubRepositoryOwner  = "xshentx"
	githubRepositoryName   = "Boundless-Studio"
	githubRepositoryURL    = "https://github.com/xshentx/Boundless-Studio"
	githubLatestReleaseAPI = "https://api.github.com/repos/xshentx/Boundless-Studio/releases/latest"
	updateStateEvent       = "boundless:update-state"
	updateUserAgent        = "Boundless-Studio-Updater/" + applicationVersion
	maxReleaseResponseSize = 2 << 20
	maxUpdateArchiveEntry  = int64(2) << 30
)

type UpdateState struct {
	Phase           string  `json:"phase"`
	CurrentVersion  string  `json:"currentVersion"`
	LatestVersion   string  `json:"latestVersion"`
	Available       bool    `json:"available"`
	ReleaseName     string  `json:"releaseName"`
	ReleaseNotes    string  `json:"releaseNotes"`
	ReleaseURL      string  `json:"releaseUrl"`
	PublishedAt     string  `json:"publishedAt"`
	AssetName       string  `json:"assetName"`
	AssetSize       int64   `json:"assetSize"`
	DownloadedBytes int64   `json:"downloadedBytes"`
	TotalBytes      int64   `json:"totalBytes"`
	Progress        float64 `json:"progress"`
	Message         string  `json:"message"`
	Error           string  `json:"error"`
	CheckedAt       string  `json:"checkedAt"`
}

type githubRelease struct {
	TagName     string        `json:"tag_name"`
	Name        string        `json:"name"`
	Body        string        `json:"body"`
	HTMLURL     string        `json:"html_url"`
	PublishedAt time.Time     `json:"published_at"`
	Draft       bool          `json:"draft"`
	Prerelease  bool          `json:"prerelease"`
	Assets      []githubAsset `json:"assets"`
}

type githubAsset struct {
	Name               string `json:"name"`
	Size               int64  `json:"size"`
	BrowserDownloadURL string `json:"browser_download_url"`
}

type UpdateManager struct {
	app           *App
	client        *http.Client
	latestAPI     string
	operationMu   sync.Mutex
	mu            sync.RWMutex
	state         UpdateState
	selectedAsset githubAsset
}

func NewUpdateManager(app *App) *UpdateManager {
	return &UpdateManager{
		app:       app,
		client:    &http.Client{Transport: http.DefaultTransport},
		latestAPI: githubLatestReleaseAPI,
		state: UpdateState{
			Phase:          "idle",
			CurrentVersion: applicationVersion,
			Message:        "尚未检查更新",
		},
	}
}

func (u *UpdateManager) State() UpdateState {
	u.mu.RLock()
	defer u.mu.RUnlock()
	return u.state
}

func (u *UpdateManager) updateState(update func(*UpdateState)) UpdateState {
	u.mu.Lock()
	update(&u.state)
	u.state.CurrentVersion = applicationVersion
	state := u.state
	u.mu.Unlock()
	u.emit(state)
	return state
}

func (u *UpdateManager) emit(state UpdateState) {
	ctx := u.app.runtimeContext()
	if ctx != nil {
		wailsruntime.EventsEmit(ctx, updateStateEvent, state)
	}
}

func (u *UpdateManager) Check(ctx context.Context) (UpdateState, error) {
	if !u.operationMu.TryLock() {
		return u.State(), errors.New("更新操作正在进行中")
	}
	defer u.operationMu.Unlock()

	u.updateState(func(state *UpdateState) {
		state.Phase = "checking"
		state.Message = "正在从 GitHub Releases 检查更新…"
		state.Error = ""
		state.DownloadedBytes = 0
		state.TotalBytes = 0
		state.Progress = 0
	})

	checkCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	release, err := u.fetchLatestRelease(checkCtx)
	if err != nil {
		state := u.updateState(func(state *UpdateState) {
			state.Phase = "error"
			state.Message = "检查更新失败"
			state.Error = friendlyUpdateError(err)
			state.CheckedAt = time.Now().Format(time.RFC3339)
		})
		return state, errors.New(state.Error)
	}

	asset, hasAsset := selectWindowsUpdateAsset(release.Assets)
	available := compareVersions(release.TagName, applicationVersion) > 0
	u.mu.Lock()
	if available && hasAsset {
		u.selectedAsset = asset
	} else {
		u.selectedAsset = githubAsset{}
	}
	u.mu.Unlock()
	state := u.updateState(func(state *UpdateState) {
		state.LatestVersion = normalizeVersion(release.TagName)
		state.Available = available
		state.ReleaseName = strings.TrimSpace(release.Name)
		state.ReleaseNotes = strings.TrimSpace(release.Body)
		state.ReleaseURL = release.HTMLURL
		state.PublishedAt = release.PublishedAt.Format(time.RFC3339)
		state.AssetName = ""
		state.AssetSize = 0
		state.CheckedAt = time.Now().Format(time.RFC3339)
		state.Error = ""
		if hasAsset {
			state.AssetName = asset.Name
			state.AssetSize = asset.Size
		}
		if available {
			state.Phase = "available"
			if hasAsset {
				state.Message = "发现新版本 " + state.LatestVersion
			} else {
				state.Message = "发现新版本，但 Release 中没有可用的 Windows 客户端文件"
				state.Error = "请在 Release Assets 中上传 BoundlessStudio.exe 或包含该程序的 Windows ZIP 包"
			}
		} else {
			state.Phase = "current"
			state.Message = "当前已是最新版本"
		}
	})

	return state, nil

}

func (u *UpdateManager) fetchLatestRelease(ctx context.Context) (githubRelease, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.latestAPI, nil)
	if err != nil {
		return githubRelease{}, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	req.Header.Set("User-Agent", updateUserAgent)

	response, err := u.client.Do(req)
	if err != nil {
		return githubRelease{}, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(response.Body, 8<<10))
		return githubRelease{}, fmt.Errorf("GitHub Releases 返回 %s: %s", response.Status, strings.TrimSpace(string(body)))
	}

	var release githubRelease
	decoder := json.NewDecoder(io.LimitReader(response.Body, maxReleaseResponseSize))
	if err := decoder.Decode(&release); err != nil {
		return githubRelease{}, fmt.Errorf("无法解析 Release 信息: %w", err)
	}
	if release.Draft || strings.TrimSpace(release.TagName) == "" {
		return githubRelease{}, errors.New("最新 Release 无效")
	}
	if release.HTMLURL == "" {
		release.HTMLURL = githubRepositoryURL + "/releases/tag/" + url.PathEscape(release.TagName)
	}
	return release, nil
}

func (u *UpdateManager) StartInstall(ctx context.Context) error {
	if !u.operationMu.TryLock() {
		return errors.New("更新操作正在进行中")
	}

	u.mu.RLock()
	asset := u.selectedAsset
	available := u.state.Available
	u.mu.RUnlock()
	if !available || strings.TrimSpace(asset.BrowserDownloadURL) == "" {
		u.operationMu.Unlock()
		return errors.New("当前没有可下载安装的更新")
	}

	go func() {
		defer u.operationMu.Unlock()
		if err := u.downloadAndApply(ctx, asset); err != nil {
			u.updateState(func(state *UpdateState) {
				state.Phase = "error"
				state.Message = "更新失败"
				state.Error = friendlyUpdateError(err)
			})
		}
	}()
	return nil
}

func (u *UpdateManager) downloadAndApply(ctx context.Context, asset githubAsset) error {
	dataDir, err := resolveDataDir()
	if err != nil {
		return err
	}
	updatesDir := filepath.Join(dataDir, "updates")
	if err := os.MkdirAll(updatesDir, 0o755); err != nil {
		return fmt.Errorf("无法创建更新目录: %w", err)
	}

	downloadName := safeUpdateFileName(asset.Name)
	downloadPath := filepath.Join(updatesDir, fmt.Sprintf("download-%d-%s", time.Now().UnixMilli(), downloadName))
	preparedPath := filepath.Join(updatesDir, fmt.Sprintf("BoundlessStudio-update-%d.exe", time.Now().UnixMilli()))
	defer os.Remove(downloadPath)

	u.updateState(func(state *UpdateState) {
		state.Phase = "downloading"
		state.Message = "正在下载 " + asset.Name
		state.Error = ""
		state.DownloadedBytes = 0
		state.TotalBytes = asset.Size
		state.Progress = 0
	})
	if err := u.downloadAsset(ctx, asset, downloadPath); err != nil {
		return err
	}

	u.updateState(func(state *UpdateState) {
		state.Phase = "preparing"
		state.Message = "正在校验并准备更新…"
		state.Progress = 100
	})
	if strings.EqualFold(filepath.Ext(asset.Name), ".zip") {
		if err := extractClientExecutable(downloadPath, preparedPath); err != nil {
			return err
		}
	} else {
		if err := moveFile(downloadPath, preparedPath); err != nil {
			return fmt.Errorf("无法准备更新程序: %w", err)
		}
	}
	if err := validateWindowsExecutable(preparedPath); err != nil {
		_ = os.Remove(preparedPath)
		return err
	}

	u.updateState(func(state *UpdateState) {
		state.Phase = "installing"
		state.Message = "下载完成，正在重启并安装更新…"
		state.Progress = 100
	})
	if err := launchUpdateHelper(preparedPath); err != nil {
		_ = os.Remove(preparedPath)
		return err
	}

	time.Sleep(900 * time.Millisecond)
	u.app.requestQuit()
	return nil
}

func (u *UpdateManager) downloadAsset(ctx context.Context, asset githubAsset, target string) error {
	downloadURL, err := url.Parse(asset.BrowserDownloadURL)
	if err != nil || !isTrustedGitHubDownloadURL(downloadURL) {
		return errors.New("Release 下载地址不是受信任的 GitHub HTTPS 地址")
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, downloadURL.String(), nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/octet-stream")
	req.Header.Set("User-Agent", updateUserAgent)
	response, err := u.client.Do(req)
	if err != nil {
		return fmt.Errorf("下载更新失败: %w", err)
	}
	defer response.Body.Close()
	if response.Request == nil || response.Request.URL == nil || !isTrustedGitHubDownloadURL(response.Request.URL) {
		return errors.New("Release 下载重定向到了不受信任的地址")
	}
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("下载更新失败，服务器返回 %s", response.Status)
	}

	total := response.ContentLength
	if total <= 0 {
		total = asset.Size
	}
	file, err := os.OpenFile(target, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return fmt.Errorf("无法创建更新文件: %w", err)
	}
	defer file.Close()

	buffer := make([]byte, 128<<10)
	var downloaded int64
	lastEmit := time.Time{}
	for {
		count, readErr := response.Body.Read(buffer)
		if count > 0 {
			written, writeErr := file.Write(buffer[:count])
			if writeErr != nil {
				return fmt.Errorf("无法保存更新文件: %w", writeErr)
			}
			downloaded += int64(written)
			now := time.Now()
			if lastEmit.IsZero() || now.Sub(lastEmit) >= 100*time.Millisecond || (total > 0 && downloaded >= total) {
				progress := float64(0)
				if total > 0 {
					progress = float64(downloaded) * 100 / float64(total)
					if progress > 100 {
						progress = 100
					}
				}
				u.updateState(func(state *UpdateState) {
					state.DownloadedBytes = downloaded
					state.TotalBytes = total
					state.Progress = progress
					state.Message = "正在下载 " + asset.Name
				})
				lastEmit = now
			}
		}
		if errors.Is(readErr, io.EOF) {
			break
		}
		if readErr != nil {
			return fmt.Errorf("下载更新失败: %w", readErr)
		}
	}
	if downloaded == 0 {
		return errors.New("下载的更新文件为空")
	}
	if asset.Size > 0 && downloaded != asset.Size {
		return fmt.Errorf("更新文件大小不完整：收到 %d 字节，应为 %d 字节", downloaded, asset.Size)
	}
	if err := file.Sync(); err != nil {
		return fmt.Errorf("无法写入更新文件: %w", err)
	}
	return nil
}

func isTrustedGitHubDownloadURL(downloadURL *url.URL) bool {
	if downloadURL == nil || !strings.EqualFold(downloadURL.Scheme, "https") {
		return false
	}
	host := strings.ToLower(strings.TrimSuffix(downloadURL.Hostname(), "."))
	return host == "github.com" || host == "githubusercontent.com" || strings.HasSuffix(host, ".githubusercontent.com")
}

func selectWindowsUpdateAsset(assets []githubAsset) (githubAsset, bool) {
	type candidate struct {
		asset githubAsset
		score int
	}
	var candidates []candidate
	for _, asset := range assets {
		name := strings.ToLower(strings.TrimSpace(asset.Name))
		if asset.Size <= 0 || strings.TrimSpace(asset.BrowserDownloadURL) == "" {
			continue
		}
		ext := strings.ToLower(filepath.Ext(name))
		if ext != ".exe" && ext != ".zip" {
			continue
		}
		if strings.Contains(name, "setup") || strings.Contains(name, "installer") || strings.Contains(name, "安装") {
			continue
		}
		score := 0
		if name == "boundlessstudio.exe" || name == "boundless-studio.exe" {
			score += 1000
		}
		if strings.Contains(name, "boundless") {
			score += 300
		}
		if strings.Contains(name, "windows") || strings.Contains(name, "win64") || strings.Contains(name, "win-") {
			score += 200
		}
		if strings.Contains(name, "amd64") || strings.Contains(name, "x64") {
			score += 120
		}
		if ext == ".exe" {
			score += 80
		}
		if strings.Contains(name, "arm64") || strings.Contains(name, "linux") || strings.Contains(name, "darwin") || strings.Contains(name, "macos") {
			continue
		}
		candidates = append(candidates, candidate{asset: asset, score: score})
	}
	if len(candidates) == 0 {
		return githubAsset{}, false
	}
	sort.SliceStable(candidates, func(i, j int) bool { return candidates[i].score > candidates[j].score })
	return candidates[0].asset, true
}

func extractClientExecutable(archivePath, targetPath string) error {
	archive, err := zip.OpenReader(archivePath)
	if err != nil {
		return fmt.Errorf("无法打开更新压缩包: %w", err)
	}
	defer archive.Close()

	var selected *zip.File
	for _, item := range archive.File {
		if item.FileInfo().IsDir() || !strings.EqualFold(filepath.Base(item.Name), "BoundlessStudio.exe") {
			continue
		}
		if item.UncompressedSize64 > uint64(maxUpdateArchiveEntry) {
			return errors.New("压缩包中的客户端文件过大")
		}
		selected = item
		break
	}
	if selected == nil {
		return errors.New("更新压缩包中未找到 BoundlessStudio.exe")
	}

	input, err := selected.Open()
	if err != nil {
		return err
	}
	defer input.Close()
	output, err := os.OpenFile(targetPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o700)
	if err != nil {
		return err
	}
	_, copyErr := io.Copy(output, io.LimitReader(input, maxUpdateArchiveEntry+1))
	closeErr := output.Close()
	if copyErr != nil {
		_ = os.Remove(targetPath)
		return copyErr
	}
	if closeErr != nil {
		_ = os.Remove(targetPath)
		return closeErr
	}
	return nil
}

func validateWindowsExecutable(path string) error {
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()
	header := make([]byte, 2)
	if _, err := io.ReadFull(file, header); err != nil {
		return errors.New("更新程序文件不完整")
	}
	if header[0] != 'M' || header[1] != 'Z' {
		return errors.New("Release 文件不是有效的 Windows 客户端程序")
	}
	return nil
}

func launchUpdateHelper(preparedPath string) error {
	executable, err := os.Executable()
	if err != nil {
		return err
	}
	executable, err = filepath.Abs(executable)
	if err != nil {
		return err
	}
	targetExecutable := resolveUpdateTargetExecutable(executable)
	updatesDir := filepath.Dir(preparedPath)
	helperPath := filepath.Join(updatesDir, fmt.Sprintf("BoundlessStudio-updater-%d.exe", time.Now().UnixMilli()))
	if err := copyFile(executable, helperPath); err != nil {
		return fmt.Errorf("无法创建更新辅助程序: %w", err)
	}
	command := exec.Command(helperPath, updateHelperArgument, preparedPath, targetExecutable, updatesDir, strconv.Itoa(os.Getpid()))
	command.Dir = filepath.Dir(executable)
	configureUpdateHelperCommand(command)
	if err := command.Start(); err != nil {
		_ = os.Remove(helperPath)
		return fmt.Errorf("无法启动更新辅助程序: %w", err)
	}
	return nil
}

func copyFile(source, target string) error {
	input, err := os.Open(source)
	if err != nil {
		return err
	}
	defer input.Close()
	output, err := os.OpenFile(target, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o700)
	if err != nil {
		return err
	}
	_, copyErr := io.Copy(output, input)
	closeErr := output.Close()
	if copyErr != nil {
		_ = os.Remove(target)
		return copyErr
	}
	if closeErr != nil {
		_ = os.Remove(target)
		return closeErr
	}
	return nil
}

func moveFile(source, target string) error {
	if err := os.Rename(source, target); err == nil {
		return nil
	}
	if err := copyFile(source, target); err != nil {
		return err
	}
	return os.Remove(source)
}

func safeUpdateFileName(value string) string {
	value = filepath.Base(strings.TrimSpace(value))
	if value == "." || value == "" {
		return "BoundlessStudio.exe"
	}
	var builder strings.Builder
	for _, char := range value {
		if char >= 'a' && char <= 'z' || char >= 'A' && char <= 'Z' || char >= '0' && char <= '9' || strings.ContainsRune("._-", char) {
			builder.WriteRune(char)
		} else {
			builder.WriteByte('_')
		}
	}
	return builder.String()
}

func compareVersions(left, right string) int {
	leftVersion, leftOK := parseVersion(left)
	rightVersion, rightOK := parseVersion(right)
	if !leftOK || !rightOK {
		return strings.Compare(normalizeVersion(left), normalizeVersion(right))
	}
	for index := 0; index < 3; index++ {
		if leftVersion.numbers[index] > rightVersion.numbers[index] {
			return 1
		}
		if leftVersion.numbers[index] < rightVersion.numbers[index] {
			return -1
		}
	}
	if leftVersion.prerelease == rightVersion.prerelease {
		return 0
	}
	if leftVersion.prerelease == "" {
		return 1
	}
	if rightVersion.prerelease == "" {
		return -1
	}
	return strings.Compare(leftVersion.prerelease, rightVersion.prerelease)
}

type parsedVersion struct {
	numbers    [3]int
	prerelease string
}

func parseVersion(value string) (parsedVersion, bool) {
	value = normalizeVersion(value)
	mainPart, prerelease, _ := strings.Cut(value, "-")
	parts := strings.Split(mainPart, ".")
	if len(parts) == 0 || len(parts) > 3 {
		return parsedVersion{}, false
	}
	var result parsedVersion
	result.prerelease = prerelease
	for index, part := range parts {
		if part == "" {
			return parsedVersion{}, false
		}
		number, err := strconv.Atoi(part)
		if err != nil || number < 0 {
			return parsedVersion{}, false
		}
		result.numbers[index] = number
	}
	return result, true
}

func normalizeVersion(value string) string {
	value = strings.TrimSpace(value)
	value = strings.TrimPrefix(value, "v")
	value = strings.TrimPrefix(value, "V")
	if base, _, ok := strings.Cut(value, "+"); ok {
		value = base
	}
	return value
}

func friendlyUpdateError(err error) string {
	if err == nil {
		return ""
	}
	message := err.Error()
	if strings.Contains(message, "404") {
		return "尚未找到 GitHub Release。请先在 xshentx/Boundless-Studio 仓库发布 Release。"
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return "连接 GitHub 超时，请检查网络后重试"
	}
	if errors.Is(err, context.Canceled) {
		return "更新操作已取消"
	}
	return message
}

func cleanupStaleUpdateArtifacts(ctx context.Context) {
	timer := time.NewTimer(3 * time.Second)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return
	case <-timer.C:
	}

	dataDir, err := resolveDataDir()
	if err != nil {
		return
	}
	updatesDir := filepath.Join(dataDir, "updates")
	entries, err := os.ReadDir(updatesDir)
	if err != nil {
		return
	}
	now := time.Now()
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		remove := strings.HasPrefix(name, "BoundlessStudio-updater-") || strings.HasPrefix(name, "BoundlessStudio-previous-")
		if !remove && (strings.HasPrefix(name, "download-") || strings.HasPrefix(name, "BoundlessStudio-update-")) {
			if info, infoErr := entry.Info(); infoErr == nil && now.Sub(info.ModTime()) > 24*time.Hour {
				remove = true
			}
		}
		if remove {
			_ = os.Remove(filepath.Join(updatesDir, name))
		}
	}
}
