package main

import (
	"bufio"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

const (
	desktopDatabaseName = "canvas.db"
	maxStateValueBytes  = 128 << 20
	maxMediaFileBytes   = int64(20) << 30
)

var errStateNotFound = errors.New("state not found")
var errMediaNotFound = errors.New("media not found")

type DesktopStore struct {
	dataDir  string
	mediaDir string
	db       *sql.DB
}

type MediaRecord struct {
	StorageKey     string `json:"storageKey"`
	RelativePath   string `json:"relativePath"`
	MIMEType       string `json:"mimeType"`
	Bytes          int64  `json:"bytes"`
	CreatedAt      int64  `json:"createdAt"`
	LastAccessedAt int64  `json:"lastAccessedAt"`
	Retained       bool   `json:"retained"`
	Category       string `json:"category"`
}

func resolveDataDir() (string, error) {
	if override := strings.TrimSpace(os.Getenv("INFINITE_CANVAS_DATA_DIR")); override != "" {
		return filepath.Abs(override)
	}
	executable, err := os.Executable()
	if err != nil {
		return "", fmt.Errorf("无法定位程序目录: %w", err)
	}
	return filepath.Join(filepath.Dir(executable), "data"), nil
}

func OpenDesktopStore(dataDir string) (*DesktopStore, error) {
	absolute, err := filepath.Abs(dataDir)
	if err != nil {
		return nil, fmt.Errorf("无法解析数据目录: %w", err)
	}
	mediaDir := filepath.Join(absolute, "media")
	for _, dir := range []string{
		absolute,
		filepath.Join(mediaDir, "images"),
		filepath.Join(mediaDir, "videos"),
		filepath.Join(mediaDir, "audio"),
		filepath.Join(mediaDir, "files"),
	} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return nil, fmt.Errorf("无法创建数据目录 %s: %w", dir, err)
		}
	}

	databasePath := filepath.Join(absolute, desktopDatabaseName)
	db, err := sql.Open("sqlite", databasePath)
	if err != nil {
		return nil, fmt.Errorf("无法打开 SQLite 数据库: %w", err)
	}
	db.SetMaxOpenConns(1)
	store := &DesktopStore{dataDir: absolute, mediaDir: mediaDir, db: db}
	if err := store.initialize(); err != nil {
		_ = db.Close()
		return nil, err
	}
	_ = os.Chmod(databasePath, 0o600)
	return store, nil
}

func (s *DesktopStore) initialize() error {
	statements := []string{
		`PRAGMA busy_timeout = 5000`,
		`PRAGMA journal_mode = WAL`,
		`PRAGMA synchronous = NORMAL`,
		`CREATE TABLE IF NOT EXISTS app_state (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at INTEGER NOT NULL
        )`,
		`CREATE TABLE IF NOT EXISTS media_files (
            storage_key TEXT PRIMARY KEY,
            relative_path TEXT NOT NULL UNIQUE,
            mime_type TEXT NOT NULL,
            bytes INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            last_accessed_at INTEGER NOT NULL,
            retained INTEGER NOT NULL DEFAULT 0,
            category TEXT NOT NULL
        )`,
		`CREATE INDEX IF NOT EXISTS idx_media_last_accessed ON media_files(last_accessed_at)`,
		`CREATE INDEX IF NOT EXISTS idx_media_category ON media_files(category)`,
	}
	for _, statement := range statements {
		if _, err := s.db.Exec(statement); err != nil {
			return fmt.Errorf("无法初始化 SQLite 数据库: %w", err)
		}
	}
	return nil
}

func (s *DesktopStore) Close() error {
	if s == nil || s.db == nil {
		return nil
	}
	return s.db.Close()
}

func (s *DesktopStore) GetState(ctx context.Context, key string) (string, error) {
	var value string
	err := s.db.QueryRowContext(ctx, `SELECT value FROM app_state WHERE key = ?`, key).Scan(&value)
	if errors.Is(err, sql.ErrNoRows) {
		return "", errStateNotFound
	}
	return value, err
}

func (s *DesktopStore) SetState(ctx context.Context, key, value string) error {
	_, err := s.db.ExecContext(ctx, `
        INSERT INTO app_state(key, value, updated_at) VALUES(?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `, key, value, time.Now().UnixMilli())
	return err
}

func (s *DesktopStore) DeleteState(ctx context.Context, key string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM app_state WHERE key = ?`, key)
	return err
}

func (s *DesktopStore) ClearCanvasData(ctx context.Context) error {
	if _, err := s.db.ExecContext(ctx, `DELETE FROM app_state WHERE key LIKE 'infinite-canvas%' OR key LIKE 'logs:%'`); err != nil {
		return err
	}
	records, err := s.ListMedia(ctx, "")
	if err != nil {
		return err
	}
	for _, record := range records {
		if err := s.DeleteMedia(ctx, record.StorageKey); err != nil {
			return err
		}
	}
	return nil
}

func validateStorageKey(key string) error {
	key = strings.TrimSpace(key)
	if key == "" || len(key) > 1024 {
		return errors.New("存储键不能为空且长度不能超过 1024 个字符")
	}
	if strings.ContainsAny(key, "\x00\r\n") {
		return errors.New("存储键包含无效字符")
	}
	return nil
}

func normalizeMIMEType(value string, header []byte) string {
	if mediaType, _, err := mime.ParseMediaType(value); err == nil && mediaType != "" {
		mediaType = strings.ToLower(mediaType)
		if mediaType != "application/octet-stream" || len(header) == 0 {
			return mediaType
		}
	}
	if len(header) > 0 {
		return strings.ToLower(http.DetectContentType(header))
	}
	return "application/octet-stream"
}

func mediaCategory(key, mimeType string) string {
	switch {
	case strings.HasPrefix(mimeType, "image/"):
		return "images"
	case strings.HasPrefix(mimeType, "video/"):
		return "videos"
	case strings.HasPrefix(mimeType, "audio/"):
		return "audio"
	}
	prefix := strings.ToLower(strings.TrimSpace(strings.SplitN(key, ":", 2)[0]))
	switch prefix {
	case "image", "video-reference":
		return "images"
	case "video":
		return "videos"
	case "audio", "audio-reference":
		return "audio"
	default:
		return "files"
	}
}

func mediaExtension(mimeType string) string {
	known := map[string]string{
		"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/gif": ".gif",
		"image/avif": ".avif", "image/bmp": ".bmp", "image/svg+xml": ".svg", "image/tiff": ".tiff",
		"video/mp4": ".mp4", "video/webm": ".webm", "video/quicktime": ".mov", "video/x-matroska": ".mkv",
		"audio/mpeg": ".mp3", "audio/mp4": ".m4a", "audio/wav": ".wav", "audio/x-wav": ".wav",
		"audio/webm": ".webm", "audio/ogg": ".ogg", "application/pdf": ".pdf",
	}
	if extension := known[mimeType]; extension != "" {
		return extension
	}
	extensions, _ := mime.ExtensionsByType(mimeType)
	if len(extensions) > 0 && len(extensions[0]) <= 12 {
		return strings.ToLower(extensions[0])
	}
	return ".bin"
}

func randomSuffix() string {
	value := make([]byte, 6)
	if _, err := rand.Read(value); err == nil {
		return hex.EncodeToString(value)
	}
	return fmt.Sprintf("%x", time.Now().UnixNano())
}

func (s *DesktopStore) WriteMedia(ctx context.Context, key, contentType string, body io.Reader, retained bool) (MediaRecord, error) {
	if err := validateStorageKey(key); err != nil {
		return MediaRecord{}, err
	}

	reader := bufio.NewReader(body)
	header, _ := reader.Peek(512)
	normalizedType := normalizeMIMEType(contentType, header)
	category := mediaCategory(key, normalizedType)
	categoryDir := filepath.Join(s.mediaDir, category)
	if err := os.MkdirAll(categoryDir, 0o755); err != nil {
		return MediaRecord{}, err
	}

	temporary, err := os.CreateTemp(categoryDir, ".upload-*")
	if err != nil {
		return MediaRecord{}, err
	}
	temporaryPath := temporary.Name()
	keepTemporary := false
	defer func() {
		_ = temporary.Close()
		if !keepTemporary {
			_ = os.Remove(temporaryPath)
		}
	}()

	written, err := io.Copy(temporary, io.LimitReader(reader, maxMediaFileBytes+1))
	if err != nil {
		return MediaRecord{}, err
	}
	if written > maxMediaFileBytes {
		return MediaRecord{}, errors.New("媒体文件超过 20 GiB 限制")
	}
	if err := temporary.Sync(); err != nil {
		return MediaRecord{}, err
	}
	if err := temporary.Close(); err != nil {
		return MediaRecord{}, err
	}
	_ = os.Chmod(temporaryPath, 0o600)

	digest := sha256.Sum256([]byte(key))
	filename := hex.EncodeToString(digest[:]) + "-" + randomSuffix() + mediaExtension(normalizedType)
	finalPath := filepath.Join(categoryDir, filename)
	if err := os.Rename(temporaryPath, finalPath); err != nil {
		return MediaRecord{}, err
	}
	keepTemporary = true

	relativePath, err := filepath.Rel(s.dataDir, finalPath)
	if err != nil {
		_ = os.Remove(finalPath)
		return MediaRecord{}, err
	}
	relativePath = filepath.ToSlash(relativePath)

	now := time.Now().UnixMilli()
	existing, existingErr := s.mediaRecord(ctx, key)
	createdAt := now
	if existingErr == nil {
		createdAt = existing.CreatedAt
		if !retained {
			retained = existing.Retained
		}
	}
	_, err = s.db.ExecContext(ctx, `
        INSERT INTO media_files(storage_key, relative_path, mime_type, bytes, created_at, last_accessed_at, retained, category)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(storage_key) DO UPDATE SET
            relative_path = excluded.relative_path,
            mime_type = excluded.mime_type,
            bytes = excluded.bytes,
            last_accessed_at = excluded.last_accessed_at,
            retained = excluded.retained,
            category = excluded.category
    `, key, relativePath, normalizedType, written, createdAt, now, retained, category)
	if err != nil {
		_ = os.Remove(finalPath)
		return MediaRecord{}, err
	}
	if existingErr == nil && existing.RelativePath != relativePath {
		if oldPath, pathErr := s.resolveRelativePath(existing.RelativePath); pathErr == nil {
			_ = os.Remove(oldPath)
		}
	}
	return MediaRecord{
		StorageKey: key, RelativePath: relativePath, MIMEType: normalizedType, Bytes: written,
		CreatedAt: createdAt, LastAccessedAt: now, Retained: retained, Category: category,
	}, nil
}

func (s *DesktopStore) mediaRecord(ctx context.Context, key string) (MediaRecord, error) {
	var record MediaRecord
	var retained int
	err := s.db.QueryRowContext(ctx, `
        SELECT storage_key, relative_path, mime_type, bytes, created_at, last_accessed_at, retained, category
        FROM media_files WHERE storage_key = ?
    `, key).Scan(&record.StorageKey, &record.RelativePath, &record.MIMEType, &record.Bytes, &record.CreatedAt, &record.LastAccessedAt, &retained, &record.Category)
	if errors.Is(err, sql.ErrNoRows) {
		return MediaRecord{}, errMediaNotFound
	}
	record.Retained = retained != 0
	return record, err
}

func (s *DesktopStore) resolveRelativePath(relative string) (string, error) {
	if filepath.IsAbs(relative) {
		return "", errors.New("媒体路径必须是相对路径")
	}
	target := filepath.Clean(filepath.Join(s.dataDir, filepath.FromSlash(relative)))
	relation, err := filepath.Rel(s.dataDir, target)
	if err != nil || relation == ".." || strings.HasPrefix(relation, ".."+string(filepath.Separator)) || filepath.IsAbs(relation) {
		return "", errors.New("媒体路径越过 data 目录")
	}
	return target, nil
}

func (s *DesktopStore) OpenMedia(ctx context.Context, key string) (*os.File, MediaRecord, error) {
	record, err := s.mediaRecord(ctx, key)
	if err != nil {
		return nil, MediaRecord{}, err
	}
	path, err := s.resolveRelativePath(record.RelativePath)
	if err != nil {
		return nil, MediaRecord{}, err
	}
	file, err := os.Open(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, MediaRecord{}, errMediaNotFound
	}
	if err != nil {
		return nil, MediaRecord{}, err
	}
	now := time.Now().UnixMilli()
	_, _ = s.db.ExecContext(ctx, `UPDATE media_files SET last_accessed_at = ? WHERE storage_key = ?`, now, key)
	record.LastAccessedAt = now
	return file, record, nil
}

func (s *DesktopStore) UpdateMedia(ctx context.Context, key string, touch bool, retained *bool) (MediaRecord, error) {
	record, err := s.mediaRecord(ctx, key)
	if err != nil {
		return MediaRecord{}, err
	}
	lastAccessed := record.LastAccessedAt
	if touch {
		lastAccessed = time.Now().UnixMilli()
	}
	retainedValue := record.Retained
	if retained != nil {
		retainedValue = *retained
	}
	_, err = s.db.ExecContext(ctx, `UPDATE media_files SET last_accessed_at = ?, retained = ? WHERE storage_key = ?`, lastAccessed, retainedValue, key)
	if err != nil {
		return MediaRecord{}, err
	}
	record.LastAccessedAt = lastAccessed
	record.Retained = retainedValue
	return record, nil
}

func (s *DesktopStore) DeleteMedia(ctx context.Context, key string) error {
	record, err := s.mediaRecord(ctx, key)
	if errors.Is(err, errMediaNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	transaction, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	if _, err := transaction.ExecContext(ctx, `DELETE FROM media_files WHERE storage_key = ?`, key); err != nil {
		_ = transaction.Rollback()
		return err
	}
	if err := transaction.Commit(); err != nil {
		return err
	}
	path, pathErr := s.resolveRelativePath(record.RelativePath)
	if pathErr == nil {
		_ = os.Remove(path)
	}
	return nil
}

func (s *DesktopStore) ListMedia(ctx context.Context, category string) ([]MediaRecord, error) {
	query := `SELECT storage_key, relative_path, mime_type, bytes, created_at, last_accessed_at, retained, category FROM media_files`
	args := []any{}
	if category != "" {
		query += ` WHERE category = ?`
		args = append(args, category)
	}
	query += ` ORDER BY created_at ASC`
	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	records := make([]MediaRecord, 0)
	for rows.Next() {
		var record MediaRecord
		var retained int
		if err := rows.Scan(&record.StorageKey, &record.RelativePath, &record.MIMEType, &record.Bytes, &record.CreatedAt, &record.LastAccessedAt, &retained, &record.Category); err != nil {
			return nil, err
		}
		record.Retained = retained != 0
		records = append(records, record)
	}
	return records, rows.Err()
}
