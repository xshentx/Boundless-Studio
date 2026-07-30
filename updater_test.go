package main

import (
	"archive/zip"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestCompareVersions(t *testing.T) {
	tests := []struct {
		left  string
		right string
		want  int
	}{
		{"v1.2.0", "1.1.9", 1},
		{"1.1.0", "v1.1.0", 0},
		{"1.0.9", "1.1.0", -1},
		{"2.0", "1.9.9", 1},
		{"1.2.0", "1.2.0-beta.1", 1},
		{"1.2.0-beta.1", "1.2.0", -1},
		{"1.1.0+build.7", "1.1.0", 0},
	}
	for _, test := range tests {
		actual := compareVersions(test.left, test.right)
		if actual < 0 {
			actual = -1
		} else if actual > 0 {
			actual = 1
		}
		if actual != test.want {
			t.Fatalf("compareVersions(%q, %q)=%d, want %d", test.left, test.right, actual, test.want)
		}
	}
}

func TestTrustedGitHubDownloadURL(t *testing.T) {
	tests := []struct {
		value string
		want  bool
	}{
		{"https://github.com/xshentx/Boundless-Studio/releases/download/v1.2.0/BoundlessStudio.exe", true},
		{"https://release-assets.githubusercontent.com/github-production-release-asset/example", true},
		{"https://githubusercontent.com/example", true},
		{"http://github.com/xshentx/Boundless-Studio/releases/download/v1.2.0/BoundlessStudio.exe", false},
		{"https://github.com.example.invalid/update.exe", false},
		{"https://example.com/update.exe", false},
	}
	for _, test := range tests {
		parsed, err := url.Parse(test.value)
		if err != nil {
			t.Fatal(err)
		}
		if actual := isTrustedGitHubDownloadURL(parsed); actual != test.want {
			t.Fatalf("isTrustedGitHubDownloadURL(%q)=%v, want %v", test.value, actual, test.want)
		}
	}
}

func TestSelectWindowsUpdateAsset(t *testing.T) {
	assets := []githubAsset{
		{Name: "BoundlessStudio-Setup.exe", Size: 10, BrowserDownloadURL: "https://github.com/example/setup"},
		{Name: "BoundlessStudio-linux-amd64.zip", Size: 10, BrowserDownloadURL: "https://github.com/example/linux"},
		{Name: "BoundlessStudio-windows-amd64.zip", Size: 20, BrowserDownloadURL: "https://github.com/example/zip"},
		{Name: "BoundlessStudio.exe", Size: 30, BrowserDownloadURL: "https://github.com/example/exe"},
	}
	asset, ok := selectWindowsUpdateAsset(assets)
	if !ok {
		t.Fatal("expected a compatible Windows update asset")
	}
	if asset.Name != "BoundlessStudio.exe" {
		t.Fatalf("selected %q, want portable executable", asset.Name)
	}
}

func TestUpdateManagerReadsLatestRelease(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Header.Get("User-Agent") != updateUserAgent {
			t.Errorf("unexpected User-Agent %q", request.Header.Get("User-Agent"))
		}
		writer.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(writer).Encode(githubRelease{
			TagName:     "v1.2.0",
			Name:        "Boundless Studio 1.2.0",
			Body:        "更新说明",
			HTMLURL:     "https://github.com/xshentx/Boundless-Studio/releases/tag/v1.2.0",
			PublishedAt: time.Date(2026, 7, 27, 12, 0, 0, 0, time.UTC),
			Assets: []githubAsset{{
				Name:               "BoundlessStudio.exe",
				Size:               1024,
				BrowserDownloadURL: "https://github.com/xshentx/Boundless-Studio/releases/download/v1.2.0/BoundlessStudio.exe",
			}},
		})
	}))
	defer server.Close()

	app := &App{}
	manager := NewUpdateManager(app)
	manager.latestAPI = server.URL
	manager.client = server.Client()
	state, err := manager.Check(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if state.Phase != "available" || !state.Available || state.LatestVersion != "1.2.0" {
		t.Fatalf("unexpected update state: %+v", state)
	}
	if state.AssetName != "BoundlessStudio.exe" || state.AssetSize != 1024 {
		t.Fatalf("unexpected asset state: %+v", state)
	}
	if manager.selectedAsset.Name != "BoundlessStudio.exe" {
		t.Fatal("selected release asset was not retained for installation")
	}
}

func TestUpdateManagerReturnsFriendlyMissingReleaseError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		http.Error(writer, `{"message":"Not Found"}`, http.StatusNotFound)
	}))
	defer server.Close()

	manager := NewUpdateManager(&App{})
	manager.latestAPI = server.URL
	manager.client = server.Client()
	state, err := manager.Check(context.Background())
	if err == nil || !strings.Contains(err.Error(), "尚未找到 GitHub Release") {
		t.Fatalf("expected friendly missing Release error, got %v", err)
	}
	if state.Phase != "error" || !strings.Contains(state.Error, "尚未找到 GitHub Release") {
		t.Fatalf("unexpected update state: %+v", state)
	}
}

func TestExtractClientExecutableFromReleaseZip(t *testing.T) {
	directory := t.TempDir()
	archivePath := filepath.Join(directory, "release.zip")
	file, err := os.Create(archivePath)
	if err != nil {
		t.Fatal(err)
	}
	archive := zip.NewWriter(file)
	entry, err := archive.Create("Boundless-Studio/BoundlessStudio.exe")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := entry.Write([]byte{'M', 'Z', 1, 2, 3}); err != nil {
		t.Fatal(err)
	}
	if err := archive.Close(); err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}

	target := filepath.Join(directory, "prepared.exe")
	if err := extractClientExecutable(archivePath, target); err != nil {
		t.Fatal(err)
	}
	if err := validateWindowsExecutable(target); err != nil {
		t.Fatal(err)
	}
}

func TestAutoUpdateSettingPersistsInSQLite(t *testing.T) {
	dataDir := filepath.Join(t.TempDir(), "data")
	server := newRelayServerAt(dataDir)
	if server.storageErr != nil {
		t.Fatal(server.storageErr)
	}
	server.config.AutoCheckUpdates = true
	if err := server.saveConfig(); err != nil {
		t.Fatal(err)
	}
	if err := server.Close(); err != nil {
		t.Fatal(err)
	}

	reopened := newRelayServerAt(dataDir)
	defer reopened.Close()
	if !reopened.config.AutoCheckUpdates {
		t.Fatal("automatic update setting was not restored from data/canvas.db")
	}
}

func TestAutoUpdateDefaultsToEnabled(t *testing.T) {
	server := newRelayServerWithStore(nil, context.Canceled)
	if !server.config.AutoCheckUpdates {
		t.Fatal("automatic update checks should default to enabled")
	}
}

func TestAutoUpdateDisabledSettingPersistsInSQLite(t *testing.T) {
	dataDir := filepath.Join(t.TempDir(), "data")
	server := newRelayServerAt(dataDir)
	if server.storageErr != nil {
		t.Fatal(server.storageErr)
	}
	server.config.AutoCheckUpdates = false
	if err := server.saveConfig(); err != nil {
		t.Fatal(err)
	}
	if err := server.Close(); err != nil {
		t.Fatal(err)
	}

	reopened := newRelayServerAt(dataDir)
	defer reopened.Close()
	if reopened.config.AutoCheckUpdates {
		t.Fatal("an explicitly disabled automatic update setting was not restored from data/canvas.db")
	}
}

func TestLegacyClientConfigKeepsAutoUpdateDefaultEnabled(t *testing.T) {
	server := newRelayServerWithStore(nil, context.Canceled)
	if err := server.applyConfigJSON([]byte(`{"upstreamUrl":"https://relay.example.com/"}`)); err != nil {
		t.Fatal(err)
	}
	if !server.config.AutoCheckUpdates {
		t.Fatal("a legacy config without autoCheckUpdates should keep the enabled default")
	}
}
