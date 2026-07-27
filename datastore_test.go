package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestOpenDesktopStoreCreatesDataLayoutAndSQLite(t *testing.T) {
	dataDir := filepath.Join(t.TempDir(), "data")
	store, err := OpenDesktopStore(dataDir)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	header := make([]byte, 16)
	file, err := os.Open(filepath.Join(dataDir, desktopDatabaseName))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := io.ReadFull(file, header); err != nil {
		t.Fatal(err)
	}
	_ = file.Close()
	if got := string(header); got != "SQLite format 3\x00" {
		t.Fatalf("unexpected database header %q", got)
	}
	for _, relative := range []string{"media/images", "media/videos", "media/audio", "media/files"} {
		info, err := os.Stat(filepath.Join(dataDir, filepath.FromSlash(relative)))
		if err != nil || !info.IsDir() {
			t.Fatalf("expected directory %s: %v", relative, err)
		}
	}
}

func TestDesktopStoreStateCRUD(t *testing.T) {
	store := openTestStore(t)
	ctx := context.Background()
	if err := store.SetState(ctx, "dialog:one", `{"messages":["你好"]}`); err != nil {
		t.Fatal(err)
	}
	value, err := store.GetState(ctx, "dialog:one")
	if err != nil || value != `{"messages":["你好"]}` {
		t.Fatalf("value=%q err=%v", value, err)
	}
	if err := store.DeleteState(ctx, "dialog:one"); err != nil {
		t.Fatal(err)
	}
	if _, err := store.GetState(ctx, "dialog:one"); !errors.Is(err, errStateNotFound) {
		t.Fatalf("expected state not found, got %v", err)
	}
}

func TestStateAPIAcceptsLargeCanvasJSON(t *testing.T) {
	server := newTestRelayServer(t)
	value := strings.Repeat("画布消息", 400_000)
	payload, _ := json.Marshal(map[string]string{"value": value})
	put := httptest.NewRequest(http.MethodPut, "/client-api/state?key=canvas%3Alarge", bytes.NewReader(payload))
	put.Header.Set("Content-Type", "application/json")
	putResponse := httptest.NewRecorder()
	server.Handler().ServeHTTP(putResponse, put)
	if putResponse.Code != http.StatusOK {
		t.Fatalf("put status=%d body=%s", putResponse.Code, putResponse.Body.String())
	}
	getResponse := httptest.NewRecorder()
	server.Handler().ServeHTTP(getResponse, httptest.NewRequest(http.MethodGet, "/client-api/state?key=canvas%3Alarge", nil))
	if getResponse.Code != http.StatusOK {
		t.Fatalf("get status=%d", getResponse.Code)
	}
	var result struct {
		Value string `json:"value"`
	}
	if err := json.Unmarshal(getResponse.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result.Value != value {
		t.Fatalf("large state mismatch: got %d bytes want %d", len(result.Value), len(value))
	}
}

func TestMediaAPIUploadReadRangePatchIndexOverwriteAndDelete(t *testing.T) {
	server := newTestRelayServer(t)
	key := "video:test/item"
	first := []byte("0123456789")
	upload := httptest.NewRequest(http.MethodPost, "/client-api/media?key=video%3Atest%2Fitem", bytes.NewReader(first))
	upload.Header.Set("Content-Type", "video/mp4")
	uploadResponse := httptest.NewRecorder()
	server.Handler().ServeHTTP(uploadResponse, upload)
	if uploadResponse.Code != http.StatusOK {
		t.Fatalf("upload status=%d body=%s", uploadResponse.Code, uploadResponse.Body.String())
	}
	var created MediaRecord
	if err := json.Unmarshal(uploadResponse.Body.Bytes(), &created); err != nil {
		t.Fatal(err)
	}
	if created.StorageKey != key || created.Category != "videos" || !strings.HasSuffix(created.RelativePath, ".mp4") {
		t.Fatalf("unexpected media record: %+v", created)
	}

	rangeRequest := httptest.NewRequest(http.MethodGet, "/client-api/media?key=video%3Atest%2Fitem", nil)
	rangeRequest.Header.Set("Range", "bytes=2-5")
	rangeResponse := httptest.NewRecorder()
	server.Handler().ServeHTTP(rangeResponse, rangeRequest)
	if rangeResponse.Code != http.StatusPartialContent || rangeResponse.Body.String() != "2345" {
		t.Fatalf("range status=%d body=%q", rangeResponse.Code, rangeResponse.Body.String())
	}
	if got := rangeResponse.Header().Get("Content-Type"); got != "video/mp4" {
		t.Fatalf("content type=%q", got)
	}

	retained := true
	patchBody, _ := json.Marshal(map[string]any{"touch": true, "retained": retained})
	patchResponse := httptest.NewRecorder()
	server.Handler().ServeHTTP(patchResponse, httptest.NewRequest(http.MethodPatch, "/client-api/media?key=video%3Atest%2Fitem", bytes.NewReader(patchBody)))
	if patchResponse.Code != http.StatusOK {
		t.Fatalf("patch status=%d body=%s", patchResponse.Code, patchResponse.Body.String())
	}

	indexResponse := httptest.NewRecorder()
	server.Handler().ServeHTTP(indexResponse, httptest.NewRequest(http.MethodGet, "/client-api/media-index?category=videos", nil))
	var index struct {
		Items []MediaRecord `json:"items"`
	}
	if err := json.Unmarshal(indexResponse.Body.Bytes(), &index); err != nil {
		t.Fatal(err)
	}
	if len(index.Items) != 1 || !index.Items[0].Retained {
		t.Fatalf("unexpected index: %+v", index.Items)
	}

	second := []byte("replacement")
	overwrite := httptest.NewRequest(http.MethodPut, "/client-api/media?key=video%3Atest%2Fitem", bytes.NewReader(second))
	overwrite.Header.Set("Content-Type", "video/webm")
	overwriteResponse := httptest.NewRecorder()
	server.Handler().ServeHTTP(overwriteResponse, overwrite)
	if overwriteResponse.Code != http.StatusOK {
		t.Fatalf("overwrite status=%d body=%s", overwriteResponse.Code, overwriteResponse.Body.String())
	}
	readResponse := httptest.NewRecorder()
	server.Handler().ServeHTTP(readResponse, httptest.NewRequest(http.MethodGet, "/client-api/media?key=video%3Atest%2Fitem", nil))
	if readResponse.Body.String() != string(second) || readResponse.Header().Get("Content-Type") != "video/webm" {
		t.Fatalf("overwrite read type=%q body=%q", readResponse.Header().Get("Content-Type"), readResponse.Body.String())
	}

	deleteResponse := httptest.NewRecorder()
	server.Handler().ServeHTTP(deleteResponse, httptest.NewRequest(http.MethodDelete, "/client-api/media?key=video%3Atest%2Fitem", nil))
	if deleteResponse.Code != http.StatusOK {
		t.Fatalf("delete status=%d", deleteResponse.Code)
	}
	missingResponse := httptest.NewRecorder()
	server.Handler().ServeHTTP(missingResponse, httptest.NewRequest(http.MethodGet, "/client-api/media?key=video%3Atest%2Fitem", nil))
	if missingResponse.Code != http.StatusNotFound {
		t.Fatalf("missing status=%d", missingResponse.Code)
	}
}

func TestMediaCategoriesAndMIMESniffing(t *testing.T) {
	store := openTestStore(t)
	ctx := context.Background()
	cases := []struct {
		key, contentType, category, suffix string
		body                               []byte
	}{
		{"image:one", "", "images", ".png", []byte("\x89PNG\r\n\x1a\nmore")},
		{"audio:one", "audio/mpeg", "audio", ".mp3", []byte("audio")},
		{"file:one", "application/pdf", "files", ".pdf", []byte("%PDF")},
	}
	for _, item := range cases {
		record, err := store.WriteMedia(ctx, item.key, item.contentType, bytes.NewReader(item.body), false)
		if err != nil {
			t.Fatal(err)
		}
		if record.Category != item.category || !strings.HasSuffix(record.RelativePath, item.suffix) {
			t.Fatalf("%s -> %+v", item.key, record)
		}
		if _, err := os.Stat(filepath.Join(store.dataDir, filepath.FromSlash(record.RelativePath))); err != nil {
			t.Fatal(err)
		}
	}
}

func TestMediaPathTraversalIsRejected(t *testing.T) {
	store := openTestStore(t)
	now := int64(1)
	_, err := store.db.Exec(`INSERT INTO media_files(storage_key, relative_path, mime_type, bytes, created_at, last_accessed_at, retained, category) VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
		"image:escape", "../outside.png", "image/png", 1, now, now, 0, "images")
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := store.OpenMedia(context.Background(), "image:escape"); err == nil || !strings.Contains(err.Error(), "越过 data") {
		t.Fatalf("expected traversal rejection, got %v", err)
	}
}

func TestClearCanvasDataKeepsDesktopConfigAndRemovesCanvasAndMedia(t *testing.T) {
	store := openTestStore(t)
	ctx := context.Background()
	if err := store.SetState(ctx, "infinite-canvas:canvas_store:user:anonymous", "canvas"); err != nil {
		t.Fatal(err)
	}
	if err := store.SetState(ctx, desktopClientConfigStateKey, "config"); err != nil {
		t.Fatal(err)
	}
	if _, err := store.WriteMedia(ctx, "image:clear-me", "image/png", bytes.NewReader([]byte("image")), false); err != nil {
		t.Fatal(err)
	}
	if err := store.ClearCanvasData(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := store.GetState(ctx, "infinite-canvas:canvas_store:user:anonymous"); !errors.Is(err, errStateNotFound) {
		t.Fatalf("canvas state should be removed: %v", err)
	}
	if value, err := store.GetState(ctx, desktopClientConfigStateKey); err != nil || value != "config" {
		t.Fatalf("desktop config should remain: value=%q err=%v", value, err)
	}
	if records, err := store.ListMedia(ctx, ""); err != nil || len(records) != 0 {
		t.Fatalf("media should be cleared: records=%v err=%v", records, err)
	}
}

func TestLegacyClientConfigMigratesIntoSQLite(t *testing.T) {
	store := openTestStore(t)
	legacyPath := filepath.Join(t.TempDir(), "InfiniteCanvas", "config.json")
	if err := os.MkdirAll(filepath.Dir(legacyPath), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(legacyPath, []byte(`{"upstreamUrl":"https://relay.example.com/"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	server := newRelayServerWithStore(store, nil)
	server.configPath = legacyPath
	if err := store.DeleteState(context.Background(), desktopClientConfigStateKey); err != nil {
		t.Fatal(err)
	}
	if err := server.loadConfig(); err != nil {
		t.Fatal(err)
	}
	if server.config.UpstreamURL != "https://relay.example.com" {
		t.Fatalf("upstream=%q", server.config.UpstreamURL)
	}
	value, err := store.GetState(context.Background(), desktopClientConfigStateKey)
	if err != nil || !strings.Contains(value, "https://relay.example.com") {
		t.Fatalf("migrated value=%q err=%v", value, err)
	}
}

func TestResolveDataDirHonoursOverride(t *testing.T) {
	expected := filepath.Join(t.TempDir(), "portable-data")
	t.Setenv("INFINITE_CANVAS_DATA_DIR", expected)
	actual, err := resolveDataDir()
	if err != nil {
		t.Fatal(err)
	}
	expected, _ = filepath.Abs(expected)
	if actual != expected {
		t.Fatalf("data dir=%q want=%q", actual, expected)
	}
}

func openTestStore(t *testing.T) *DesktopStore {
	t.Helper()
	store, err := OpenDesktopStore(filepath.Join(t.TempDir(), "data"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })
	return store
}
