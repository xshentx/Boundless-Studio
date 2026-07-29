package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

const desktopAPIPort = "34116"
const desktopClientConfigStateKey = "desktop:client_config"
const maxRelayVideoResponseSize = 8 << 20

type ClientConfig struct {
	UpstreamURL      string `json:"upstreamUrl"`
	AutoCheckUpdates bool   `json:"autoCheckUpdates"`
}

type RelayModelsResponse struct {
	Models  []string `json:"models"`
	Status  int      `json:"status"`
	Message string   `json:"message"`
}

type RelayVideoResponse struct {
	Status  int    `json:"status"`
	Body    string `json:"body"`
	Message string `json:"message"`
}

type RelayServer struct {
	mu         sync.RWMutex
	config     ClientConfig
	configPath string
	client     *http.Client
	store      *DesktopStore
	storageErr error
}

func NewRelayServer() *RelayServer {
	dataDir, err := resolveDataDir()
	if err != nil {
		return newRelayServerWithStore(nil, err)
	}
	store, storeErr := OpenDesktopStore(dataDir)
	return newRelayServerWithStore(store, storeErr)
}

func newRelayServerAt(dataDir string) *RelayServer {
	store, err := OpenDesktopStore(dataDir)
	return newRelayServerWithStore(store, err)
}

func newRelayServerWithStore(store *DesktopStore, storageErr error) *RelayServer {
	upstream := strings.TrimSpace(os.Getenv("INFINITE_CANVAS_UPSTREAM"))
	if upstream == "" {
		upstream = "http://127.0.0.1:3001"
	}
	server := &RelayServer{
		config:     ClientConfig{UpstreamURL: strings.TrimRight(upstream, "/")},
		client:     &http.Client{Timeout: 10 * time.Minute},
		store:      store,
		storageErr: storageErr,
	}
	if dir, err := os.UserConfigDir(); err == nil {
		server.configPath = filepath.Join(dir, "InfiniteCanvas", "config.json")
	}
	if storageErr == nil {
		// A damaged legacy relay setting must not make all canvas data unavailable.
		_ = server.loadConfig()
	}
	return server
}

func (s *RelayServer) Close() error {
	if s.store == nil {
		return nil
	}
	return s.store.Close()
}

func (s *RelayServer) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if s.handle(w, r) {
			return
		}
		if isSPAPath(r.URL.Path) {
			r.URL.Path = "/"
			r.URL.RawPath = ""
		}
		next.ServeHTTP(w, r)
	})
}

func isSPAPath(path string) bool {
	path = strings.TrimRight(path, "/")
	return path == "/canvas/home" || path == "/canvas/workspace" || path == "/canvas-repair"
}

func (s *RelayServer) Handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !s.handle(w, r) {
			writeJSONError(w, http.StatusNotFound, "客户端接口不存在")
		}
	})
}

func (s *RelayServer) handle(w http.ResponseWriter, r *http.Request) bool {
	path := r.URL.Path
	switch {
	case path == "/client-api/health":
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "service": "boundless-studio"})
		return true
	case path == "/client-api/config":
		s.handleConfig(w, r)
		return true
	case path == "/client-api/state":
		s.handleState(w, r)
		return true
	case path == "/client-api/media":
		s.handleMedia(w, r)
		return true
	case path == "/client-api/media-index":
		s.handleMediaIndex(w, r)
		return true
	case path == "/client-api/canvas-data":
		s.handleCanvasData(w, r)
		return true
	case path == "/webdav-proxy":
		s.handleWebDAVProxy(w, r)
		return true
	case strings.HasPrefix(path, "/local-relay-proxy/"):
		s.handleLocalRelayProxy(w, r)
		return true
	case isUpstreamPath(path):
		s.handleConfiguredUpstream(w, r)
		return true
	default:
		return false
	}
}

func isUpstreamPath(path string) bool {
	for _, prefix := range []string{"/api/", "/v1/", "/auth/", "/images/", "/api-backend/"} {
		if strings.HasPrefix(path, prefix) {
			return true
		}
	}
	return false
}

func (s *RelayServer) handleConfig(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		s.mu.RLock()
		config := s.config
		s.mu.RUnlock()
		writeJSON(w, http.StatusOK, config)
	case http.MethodPut:
		var config ClientConfig
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&config); err != nil {
			writeJSONError(w, http.StatusBadRequest, "客户端配置格式无效")
			return
		}
		normalized, err := normalizeHTTPBaseURL(config.UpstreamURL)
		if err != nil && strings.TrimSpace(config.UpstreamURL) != "" {
			writeJSONError(w, http.StatusBadRequest, "上游地址必须是有效的 HTTP 或 HTTPS 地址")
			return
		}
		config.UpstreamURL = normalized
		s.mu.Lock()
		s.config = config
		s.mu.Unlock()
		if err := s.saveConfig(); err != nil {
			writeJSONError(w, http.StatusInternalServerError, "无法保存客户端配置")
			return
		}
		writeJSON(w, http.StatusOK, config)
	default:
		w.Header().Set("Allow", "GET, PUT")
		writeJSONError(w, http.StatusMethodNotAllowed, "不支持的请求方法")
	}
}

func (s *RelayServer) requireStore(w http.ResponseWriter) bool {
	if s.storageErr != nil || s.store == nil {
		message := "?? data ?????"
		if s.storageErr != nil {
			message += "?" + s.storageErr.Error()
		}
		writeJSONError(w, http.StatusInternalServerError, message)
		return false
	}
	return true
}

func (s *RelayServer) handleState(w http.ResponseWriter, r *http.Request) {
	if !s.requireStore(w) {
		return
	}
	key := strings.TrimSpace(r.URL.Query().Get("key"))
	if err := validateStorageKey(key); err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}
	switch r.Method {
	case http.MethodGet:
		value, err := s.store.GetState(r.Context(), key)
		if errors.Is(err, errStateNotFound) {
			writeJSON(w, http.StatusOK, map[string]any{"value": nil})
			return
		}
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "????????")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"value": value})
	case http.MethodPut:
		var payload struct {
			Value string `json:"value"`
		}
		limit := int64(maxStateValueBytes + (1 << 20))
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, limit)).Decode(&payload); err != nil {
			writeJSONError(w, http.StatusBadRequest, "??????????? 128 MiB")
			return
		}
		if len(payload.Value) > maxStateValueBytes {
			writeJSONError(w, http.StatusRequestEntityTooLarge, "?????? 128 MiB")
			return
		}
		if err := s.store.SetState(r.Context(), key, payload.Value); err != nil {
			writeJSONError(w, http.StatusInternalServerError, "????????")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	case http.MethodDelete:
		if err := s.store.DeleteState(r.Context(), key); err != nil {
			writeJSONError(w, http.StatusInternalServerError, "????????")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	default:
		w.Header().Set("Allow", "GET, PUT, DELETE")
		writeJSONError(w, http.StatusMethodNotAllowed, "????????")
	}
}

func (s *RelayServer) handleMedia(w http.ResponseWriter, r *http.Request) {
	if !s.requireStore(w) {
		return
	}
	key := strings.TrimSpace(r.URL.Query().Get("key"))
	if err := validateStorageKey(key); err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}
	switch r.Method {
	case http.MethodGet, http.MethodHead:
		file, record, err := s.store.OpenMedia(r.Context(), key)
		if errors.Is(err, errMediaNotFound) {
			writeJSONError(w, http.StatusNotFound, "???????")
			return
		}
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "????????")
			return
		}
		defer file.Close()
		info, err := file.Stat()
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "??????????")
			return
		}
		w.Header().Set("Content-Type", record.MIMEType)
		w.Header().Set("Cache-Control", "private, max-age=31536000, immutable")
		http.ServeContent(w, r, filepath.Base(record.RelativePath), info.ModTime(), file)
	case http.MethodPost, http.MethodPut:
		retained := false
		if raw := strings.TrimSpace(r.URL.Query().Get("retained")); raw != "" {
			parsed, err := strconv.ParseBool(raw)
			if err != nil {
				writeJSONError(w, http.StatusBadRequest, "retained ????")
				return
			}
			retained = parsed
		}
		record, err := s.store.WriteMedia(r.Context(), key, r.Header.Get("Content-Type"), r.Body, retained)
		if err != nil {
			status := http.StatusInternalServerError
			if strings.Contains(err.Error(), "20 GiB") {
				status = http.StatusRequestEntityTooLarge
			}
			writeJSONError(w, status, "?????????"+err.Error())
			return
		}
		writeJSON(w, http.StatusOK, record)
	case http.MethodPatch:
		var payload struct {
			Touch    bool  `json:"touch"`
			Retained *bool `json:"retained"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&payload); err != nil {
			writeJSONError(w, http.StatusBadRequest, "?????????")
			return
		}
		record, err := s.store.UpdateMedia(r.Context(), key, payload.Touch, payload.Retained)
		if errors.Is(err, errMediaNotFound) {
			writeJSONError(w, http.StatusNotFound, "???????")
			return
		}
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "?????????")
			return
		}
		writeJSON(w, http.StatusOK, record)
	case http.MethodDelete:
		if err := s.store.DeleteMedia(r.Context(), key); err != nil {
			writeJSONError(w, http.StatusInternalServerError, "????????")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	default:
		w.Header().Set("Allow", "GET, HEAD, POST, PUT, PATCH, DELETE")
		writeJSONError(w, http.StatusMethodNotAllowed, "????????")
	}
}

func (s *RelayServer) handleMediaIndex(w http.ResponseWriter, r *http.Request) {
	if !s.requireStore(w) {
		return
	}
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", "GET")
		writeJSONError(w, http.StatusMethodNotAllowed, "????????")
		return
	}
	category := strings.TrimSpace(r.URL.Query().Get("category"))
	if category != "" && category != "images" && category != "videos" && category != "audio" && category != "files" {
		writeJSONError(w, http.StatusBadRequest, "??????")
		return
	}
	records, err := s.store.ListMedia(r.Context(), category)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "????????")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": records})
}

func (s *RelayServer) handleCanvasData(w http.ResponseWriter, r *http.Request) {
	if !s.requireStore(w) {
		return
	}
	if r.Method != http.MethodDelete {
		w.Header().Set("Allow", "DELETE")
		writeJSONError(w, http.StatusMethodNotAllowed, "????????")
		return
	}
	if err := s.store.ClearCanvasData(r.Context()); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "??????????")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *RelayServer) handleConfiguredUpstream(w http.ResponseWriter, r *http.Request) {
	s.mu.RLock()
	upstream := s.config.UpstreamURL
	s.mu.RUnlock()
	if upstream == "" {
		writeJSONError(w, http.StatusServiceUnavailable, "未配置平台上游；请在 API 设置中使用自定义通道，或配置 INFINITE_CANVAS_UPSTREAM")
		return
	}
	target, err := url.Parse(upstream + r.URL.RequestURI())
	if err != nil {
		writeJSONError(w, http.StatusBadGateway, "平台上游地址无效")
		return
	}
	s.proxy(w, r, target, nil)
}

func (s *RelayServer) handleLocalRelayProxy(w http.ResponseWriter, r *http.Request) {
	baseURL := strings.TrimSpace(r.Header.Get("x-local-relay-base-url"))
	target, err := buildLocalRelayTarget(baseURL, strings.TrimPrefix(r.URL.Path, "/local-relay-proxy/"), r.URL.RawQuery)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}
	s.proxy(w, r, target, func(header http.Header) {
		header.Del("x-local-relay-base-url")
	})
}

func buildLocalRelayTarget(baseURL, relayPath, rawQuery string) (*url.URL, error) {
	normalized, err := normalizeHTTPBaseURL(baseURL)
	if err != nil || normalized == "" {
		return nil, errors.New("自定义 API Base URL 无效")
	}
	parsed, _ := url.Parse(normalized)
	cleanPath := strings.TrimRight(parsed.Path, "/")
	lowerPath := strings.ToLower(cleanPath)
	hasAPISuffix := strings.HasSuffix(lowerPath, "/v1") || strings.HasSuffix(lowerPath, "/api/v3") || strings.HasSuffix(lowerPath, "/api/plan/v3")
	if !hasAPISuffix {
		cleanPath += "/v1"
	}
	parsed.Path = strings.TrimRight(cleanPath, "/") + "/" + strings.Trim(relayPath, "/")
	parsed.RawQuery = rawQuery
	return parsed, nil
}

// FetchModels reads an OpenAI-compatible model list with the native HTTP
// client. It is exposed through the Wails bridge for macOS, where WKWebView's
// custom-scheme/private-network checks can block the browser request to the
// local relay even though the same provider works on Windows.
func (s *RelayServer) FetchModels(ctx context.Context, baseURL, apiKey string) RelayModelsResponse {
	target, err := buildLocalRelayTarget(baseURL, "models", "")
	if err != nil {
		return RelayModelsResponse{Message: err.Error()}
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, target.String(), nil)
	if err != nil {
		return RelayModelsResponse{Message: err.Error()}
	}
	if key := strings.TrimSpace(apiKey); key != "" {
		request.Header.Set("Authorization", "Bearer "+key)
	}
	request.Header.Set("Accept", "application/json")

	response, err := s.client.Do(request)
	if err != nil {
		return RelayModelsResponse{Message: err.Error()}
	}
	defer response.Body.Close()

	body, err := io.ReadAll(io.LimitReader(response.Body, 4<<20))
	if err != nil {
		return RelayModelsResponse{Status: response.StatusCode, Message: err.Error()}
	}
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return RelayModelsResponse{
			Status:  response.StatusCode,
			Message: relayResponseMessage(body, response.Status),
		}
	}

	var payload struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return RelayModelsResponse{Status: response.StatusCode, Message: string(body)}
	}
	if message := strings.TrimSpace(payload.Error.Message); message != "" {
		return RelayModelsResponse{Status: response.StatusCode, Message: message}
	}

	models := make([]string, 0, len(payload.Data))
	seen := make(map[string]struct{}, len(payload.Data))
	for _, model := range payload.Data {
		id := strings.TrimSpace(model.ID)
		if id == "" {
			continue
		}
		if _, exists := seen[id]; exists {
			continue
		}
		seen[id] = struct{}{}
		models = append(models, id)
	}
	return RelayModelsResponse{Models: models, Status: response.StatusCode}
}

// RequestRelayVideo sends the small JSON requests used to create and poll
// OpenAI-compatible video jobs through Go's native HTTP client. Packaged macOS
// pages use the wails: scheme, and WKWebView can block their browser request to
// the HTTP loopback proxy before that request reaches the desktop application.
func (s *RelayServer) RequestRelayVideo(ctx context.Context, method, baseURL, apiKey, relayPath, requestBody string) RelayVideoResponse {
	method = strings.ToUpper(strings.TrimSpace(method))
	relayPath = strings.Trim(strings.TrimSpace(relayPath), "/")
	if !isAllowedRelayVideoRequest(method, relayPath) {
		return RelayVideoResponse{Message: "unsupported relay video request"}
	}

	target, err := buildRelayVideoTarget(baseURL, relayPath)
	if err != nil {
		return RelayVideoResponse{Message: err.Error()}
	}

	var body io.Reader
	if method == http.MethodPost {
		body = strings.NewReader(requestBody)
	}
	request, err := http.NewRequestWithContext(ctx, method, target.String(), body)
	if err != nil {
		return RelayVideoResponse{Message: err.Error()}
	}
	if key := strings.TrimSpace(apiKey); key != "" {
		request.Header.Set("Authorization", "Bearer "+key)
	}
	request.Header.Set("Accept", "application/json")
	if method == http.MethodPost {
		request.Header.Set("Content-Type", "application/json")
	}

	response, err := s.client.Do(request)
	if err != nil {
		return RelayVideoResponse{Message: "fetch failed: " + err.Error()}
	}
	defer response.Body.Close()

	responseBody, err := io.ReadAll(io.LimitReader(response.Body, maxRelayVideoResponseSize+1))
	if err != nil {
		return RelayVideoResponse{Status: response.StatusCode, Message: "fetch failed while reading response: " + err.Error()}
	}
	if len(responseBody) > maxRelayVideoResponseSize {
		return RelayVideoResponse{
			Status:  response.StatusCode,
			Message: "relay video response exceeds 8 MiB limit",
		}
	}
	return RelayVideoResponse{Status: response.StatusCode, Body: string(responseBody)}
}

func buildRelayVideoTarget(baseURL, relayPath string) (*url.URL, error) {
	for _, taskRoute := range []struct {
		prefix   string
		basePath string
		legacy   bool
	}{
		{prefix: "videos/generations/tasks/", basePath: "videos/generations/tasks"},
		{prefix: "api/tasks/", basePath: "api/tasks", legacy: true},
	} {
		encodedTaskID, found := strings.CutPrefix(relayPath, taskRoute.prefix)
		if !found {
			continue
		}
		taskID, err := url.PathUnescape(encodedTaskID)
		if err != nil || taskID == "" {
			return nil, errors.New("invalid video task ID")
		}

		var target *url.URL
		if taskRoute.legacy {
			normalized, normalizeErr := normalizeHTTPBaseURL(baseURL)
			if normalizeErr != nil || normalized == "" {
				return nil, errors.New("invalid video API Base URL")
			}
			target, _ = url.Parse(normalized)
			target.Path = strings.TrimRight(target.Path, "/") + "/" + taskRoute.basePath
			target.RawPath = ""
		} else {
			target, err = buildLocalRelayTarget(baseURL, taskRoute.basePath, "")
			if err != nil {
				return nil, err
			}
		}

		return appendRelayVideoTaskID(target, taskID), nil
	}

	return buildLocalRelayTarget(baseURL, relayPath, "")
}

func appendRelayVideoTaskID(target *url.URL, taskID string) *url.URL {
	escapedBasePath := strings.TrimRight(target.EscapedPath(), "/")
	target.Path = strings.TrimRight(target.Path, "/") + "/" + taskID
	target.RawPath = escapedBasePath + "/" + url.PathEscape(taskID)
	return target
}

func isAllowedRelayVideoRequest(method, relayPath string) bool {
	if method == http.MethodPost {
		return relayPath == "videos/generations"
	}
	if method != http.MethodGet {
		return false
	}
	if relayPath == "tasks" {
		return true
	}
	for _, taskPrefix := range []string{"videos/generations/tasks/", "api/tasks/"} {
		taskID := strings.TrimPrefix(relayPath, taskPrefix)
		if taskID != relayPath && taskID != "" && !strings.Contains(taskID, "/") {
			return true
		}
	}
	return false
}

func relayResponseMessage(body []byte, fallback string) string {
	var payload struct {
		Message string `json:"message"`
		Msg     string `json:"msg"`
		Error   struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if json.Unmarshal(body, &payload) == nil {
		for _, value := range []string{payload.Error.Message, payload.Message, payload.Msg} {
			if message := strings.TrimSpace(value); message != "" {
				return message
			}
		}
	}
	if message := strings.TrimSpace(string(body)); message != "" {
		return message
	}
	return fallback
}

func (s *RelayServer) handleWebDAVProxy(w http.ResponseWriter, r *http.Request) {
	targetURL := strings.TrimSpace(r.Header.Get("x-webdav-target"))
	target, err := url.Parse(targetURL)
	if err != nil || target.Scheme == "" || target.Host == "" || (target.Scheme != "http" && target.Scheme != "https") {
		writeJSONError(w, http.StatusBadRequest, "WebDAV 目标地址无效")
		return
	}
	method := strings.ToUpper(strings.TrimSpace(r.Header.Get("x-webdav-method")))
	if method == "" {
		method = http.MethodGet
	}
	allowed := map[string]bool{"GET": true, "HEAD": true, "PUT": true, "DELETE": true, "MKCOL": true, "PROPFIND": true, "MOVE": true, "COPY": true}
	if !allowed[method] {
		writeJSONError(w, http.StatusBadRequest, "不支持的 WebDAV 请求方法")
		return
	}
	r.Method = method
	s.proxy(w, r, target, func(header http.Header) {
		mappings := map[string]string{
			"x-webdav-authorization": "Authorization",
			"x-webdav-depth":         "Depth",
			"x-webdav-destination":   "Destination",
			"x-webdav-overwrite":     "Overwrite",
			"x-webdav-content-type":  "Content-Type",
		}
		for source, destination := range mappings {
			if value := header.Get(source); value != "" {
				header.Set(destination, value)
			}
		}
		for key := range header {
			if strings.HasPrefix(strings.ToLower(key), "x-webdav-") {
				header.Del(key)
			}
		}
	})
}

func (s *RelayServer) proxy(w http.ResponseWriter, r *http.Request, target *url.URL, mutate func(http.Header)) {
	proxy := &httputil.ReverseProxy{
		Director: func(req *http.Request) {
			req.URL = cloneURL(target)
			req.Host = target.Host
			req.RequestURI = ""
			req.Header.Del("Origin")
			req.Header.Del("Referer")
			req.Header.Del("Sec-Fetch-Dest")
			req.Header.Del("Sec-Fetch-Mode")
			req.Header.Del("Sec-Fetch-Site")
			if mutate != nil {
				mutate(req.Header)
			}
		},
		Transport:     s.client.Transport,
		FlushInterval: -1,
		ErrorHandler: func(w http.ResponseWriter, _ *http.Request, err error) {
			writeJSONError(w, http.StatusBadGateway, fmt.Sprintf("上游连接失败：%v", err))
		},
	}
	proxy.ServeHTTP(w, r)
}

func normalizeHTTPBaseURL(raw string) (string, error) {
	raw = strings.TrimSpace(strings.TrimRight(raw, "/"))
	if raw == "" {
		return "", nil
	}
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return "", errors.New("invalid HTTP URL")
	}
	parsed.RawQuery = ""
	parsed.Fragment = ""
	return strings.TrimRight(parsed.String(), "/"), nil
}

func cloneURL(input *url.URL) *url.URL {
	copy := *input
	return &copy
}

func (s *RelayServer) loadConfig() error {
	if s.store != nil {
		value, err := s.store.GetState(context.Background(), desktopClientConfigStateKey)
		if err == nil {
			return s.applyConfigJSON([]byte(value))
		}
		if !errors.Is(err, errStateNotFound) {
			return err
		}
	}

	if s.configPath == "" {
		return nil
	}
	data, err := os.ReadFile(s.configPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return err
	}
	if err := s.applyConfigJSON(data); err != nil {
		return err
	}
	return s.saveConfig()
}

func (s *RelayServer) applyConfigJSON(data []byte) error {
	var config ClientConfig
	if err := json.Unmarshal(data, &config); err != nil {
		return err
	}
	normalized, err := normalizeHTTPBaseURL(config.UpstreamURL)
	if err != nil {
		return err
	}
	s.config.UpstreamURL = normalized
	s.config.AutoCheckUpdates = config.AutoCheckUpdates
	return nil
}

func (s *RelayServer) saveConfig() error {
	if s.store == nil {
		if s.storageErr != nil {
			return s.storageErr
		}
		return errors.New("?? data ?????")
	}
	s.mu.RLock()
	data, err := json.Marshal(s.config)
	s.mu.RUnlock()
	if err != nil {
		return err
	}
	return s.store.SetState(context.Background(), desktopClientConfigStateKey, string(data))
}

func (s *RelayServer) StartLoopback(ctx context.Context) error {
	listener, err := net.Listen("tcp", "127.0.0.1:"+desktopAPIPort)
	if err != nil {
		return err
	}
	server := &http.Server{Handler: desktopLoopbackCORS(s.Handler()), ReadHeaderTimeout: 15 * time.Second}
	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdownCtx)
	}()
	go func() { _ = server.Serve(listener) }()
	return nil
}

func desktopLoopbackCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := strings.TrimSpace(r.Header.Get("Origin"))
		if origin != "" && !isAllowedDesktopOrigin(origin) {
			writeJSONError(w, http.StatusForbidden, "desktop loopback origin is not allowed")
			return
		}
		if origin != "" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Methods", "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Local-Relay-Base-Url, X-Webdav-Target, X-Webdav-Method, X-Webdav-Authorization, X-Webdav-Depth, X-Webdav-Destination, X-Webdav-Overwrite, X-Webdav-Content-Type")
			w.Header().Set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges")
			w.Header().Set("Vary", "Origin")
			if strings.EqualFold(r.Header.Get("Access-Control-Request-Private-Network"), "true") {
				w.Header().Set("Access-Control-Allow-Private-Network", "true")
			}
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

func isAllowedDesktopOrigin(origin string) bool {
	switch strings.ToLower(strings.TrimSpace(origin)) {
	case "wails://wails", "http://wails.localhost", "https://wails.localhost", "http://127.0.0.1:34115", "http://localhost:34115":
		return true
	default:
		return false
	}
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeJSONError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]any{"code": status, "msg": message, "error": map[string]string{"message": message}})
}
