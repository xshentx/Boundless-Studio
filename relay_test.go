package main

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"
)

func TestBuildLocalRelayTargetAddsV1(t *testing.T) {
	target, err := buildLocalRelayTarget("https://api.example.com", "images/generations/", "model=x")
	if err != nil {
		t.Fatal(err)
	}
	if got, want := target.String(), "https://api.example.com/v1/images/generations?model=x"; got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestBuildLocalRelayTargetPreservesKnownAPIBase(t *testing.T) {
	target, err := buildLocalRelayTarget("https://api.example.com/api/plan/v3/", "videos", "")
	if err != nil {
		t.Fatal(err)
	}
	if got, want := target.String(), "https://api.example.com/api/plan/v3/videos"; got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestFetchModelsUsesNativeHTTPClient(t *testing.T) {
	var gotAuthorization string
	var gotPath string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuthorization = r.Header.Get("Authorization")
		gotPath = r.URL.Path
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"id":"video-z"},{"id":"video-a"},{"id":"video-z"}]}`))
	}))
	defer upstream.Close()

	server := newTestRelayServer(t)
	result := server.FetchModels(t.Context(), upstream.URL+"/v1", "test-key")
	if result.Message != "" || result.Status != http.StatusOK {
		t.Fatalf("unexpected result: %+v", result)
	}
	if gotPath != "/v1/models" {
		t.Fatalf("upstream path=%q want=/v1/models", gotPath)
	}
	if gotAuthorization != "Bearer test-key" {
		t.Fatalf("authorization=%q", gotAuthorization)
	}
	if got, want := result.Models, []string{"video-z", "video-a"}; !slices.Equal(got, want) {
		t.Fatalf("models=%v want=%v", got, want)
	}
}

func TestRequestRelayVideoUsesNativeHTTPClient(t *testing.T) {
	var gotMethod string
	var gotPath string
	var gotAuthorization string
	var gotContentType string
	var gotBody []byte
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotMethod = r.Method
		gotPath = r.URL.Path
		gotAuthorization = r.Header.Get("Authorization")
		gotContentType = r.Header.Get("Content-Type")
		gotBody, _ = io.ReadAll(r.Body)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusAccepted)
		_, _ = w.Write([]byte(`{"task_id":"video-task-1"}`))
	}))
	defer upstream.Close()

	server := newTestRelayServer(t)
	result := server.RequestRelayVideo(t.Context(), http.MethodPost, upstream.URL+"/v1", "video-key", "videos/generations", `{"model":"seedance-2.0"}`)
	if result.Message != "" || result.Status != http.StatusAccepted || result.Body != `{"task_id":"video-task-1"}` {
		t.Fatalf("unexpected result: %+v", result)
	}
	if gotMethod != http.MethodPost || gotPath != "/v1/videos/generations" {
		t.Fatalf("method=%q path=%q", gotMethod, gotPath)
	}
	if gotAuthorization != "Bearer video-key" || gotContentType != "application/json" {
		t.Fatalf("authorization=%q content-type=%q", gotAuthorization, gotContentType)
	}
	if got, want := string(gotBody), `{"model":"seedance-2.0"}`; got != want {
		t.Fatalf("body=%q want=%q", got, want)
	}
}

func TestRequestRelayVideoUsesLegacyTaskEndpoint(t *testing.T) {
	var gotMethod string
	var gotPath string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotMethod = r.Method
		gotPath = r.URL.Path
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"task_id":"legacy-task-1","status":"running"}`))
	}))
	defer upstream.Close()

	server := newTestRelayServer(t)
	result := server.RequestRelayVideo(t.Context(), http.MethodGet, upstream.URL, "video-key", "api/tasks/legacy-task-1", "")
	if result.Message != "" || result.Status != http.StatusOK {
		t.Fatalf("unexpected result: %+v", result)
	}
	if gotMethod != http.MethodGet || gotPath != "/api/tasks/legacy-task-1" {
		t.Fatalf("method=%q path=%q", gotMethod, gotPath)
	}
}

func TestRequestRelayVideoPreservesOpaqueTaskID(t *testing.T) {
	var gotPath string
	var gotEscapedPath string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotEscapedPath = r.URL.EscapedPath()
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"task_id":"folder/task?part","status":"running"}`))
	}))
	defer upstream.Close()

	server := newTestRelayServer(t)
	result := server.RequestRelayVideo(t.Context(), http.MethodGet, upstream.URL, "video-key", "api/tasks/folder%2Ftask%3Fpart", "")
	if result.Message != "" || result.Status != http.StatusOK {
		t.Fatalf("unexpected result: %+v", result)
	}
	if gotPath != "/api/tasks/folder/task?part" {
		t.Fatalf("decoded path=%q", gotPath)
	}
	if gotEscapedPath != "/api/tasks/folder%2Ftask%3Fpart" {
		t.Fatalf("escaped path=%q", gotEscapedPath)
	}
}

func TestRequestRelayVideoRejectsOversizedResponse(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, strings.Repeat("x", maxRelayVideoResponseSize+1))
	}))
	defer upstream.Close()

	server := newTestRelayServer(t)
	result := server.RequestRelayVideo(t.Context(), http.MethodGet, upstream.URL, "video-key", "tasks", "")
	if result.Status != http.StatusOK || result.Message == "" || result.Body != "" {
		t.Fatalf("unexpected result: %+v", result)
	}
}

func TestRequestRelayVideoRejectsUnexpectedEndpoint(t *testing.T) {
	server := newTestRelayServer(t)
	result := server.RequestRelayVideo(t.Context(), http.MethodPost, "https://api.example.com", "key", "chat/completions", `{}`)
	if result.Status != 0 || result.Message == "" {
		t.Fatalf("unexpected result: %+v", result)
	}
}

func TestFetchModelsPreservesUpstreamStatusAndMessage(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":{"message":"invalid token"}}`))
	}))
	defer upstream.Close()

	server := newTestRelayServer(t)
	result := server.FetchModels(t.Context(), upstream.URL, "bad-key")
	if result.Status != http.StatusUnauthorized || result.Message != "invalid token" {
		t.Fatalf("unexpected result: %+v", result)
	}
}

func TestRelayHealth(t *testing.T) {
	server := newTestRelayServer(t)
	request := httptest.NewRequest("GET", "/client-api/health", nil)
	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(response, request)
	if response.Code != 200 {
		t.Fatalf("unexpected status %d", response.Code)
	}
}

func TestRejectsInvalidRelayURL(t *testing.T) {
	if _, err := buildLocalRelayTarget("file:///tmp/data", "models", ""); err == nil {
		t.Fatal("expected invalid URL error")
	}
}

func TestDesktopLoopbackCORSAllowsWailsPreflight(t *testing.T) {
	request := httptest.NewRequest(http.MethodOptions, "/local-relay-proxy/images/edits/", nil)
	request.Header.Set("Origin", "wails://wails")
	request.Header.Set("Access-Control-Request-Method", http.MethodPost)
	request.Header.Set("Access-Control-Request-Headers", "content-type,x-local-relay-base-url,authorization")
	response := httptest.NewRecorder()

	desktopLoopbackCORS(http.NotFoundHandler()).ServeHTTP(response, request)

	if response.Code != http.StatusNoContent {
		t.Fatalf("preflight status=%d want=%d", response.Code, http.StatusNoContent)
	}
	if got := response.Header().Get("Access-Control-Allow-Origin"); got != "wails://wails" {
		t.Fatalf("allow origin=%q", got)
	}
	if got := response.Header().Get("Access-Control-Allow-Headers"); got == "" {
		t.Fatal("missing allowed request headers")
	}
}

func TestDesktopLoopbackCORSRejectsUnknownBrowserOrigin(t *testing.T) {
	called := false
	request := httptest.NewRequest(http.MethodPost, "/client-api/media?key=image", bytes.NewReader([]byte("data")))
	request.Header.Set("Origin", "https://example.com")
	response := httptest.NewRecorder()

	desktopLoopbackCORS(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		called = true
	})).ServeHTTP(response, request)

	if response.Code != http.StatusForbidden {
		t.Fatalf("unknown-origin status=%d want=%d", response.Code, http.StatusForbidden)
	}
	if called {
		t.Fatal("unknown browser origin reached the desktop handler")
	}
}

func TestDesktopLoopbackConfiguredUpstreamPreservesJSONRequestBody(t *testing.T) {
	wantBody := []byte(`{"username":"tester","password":"secret"}`)
	var gotBody []byte
	var gotPath string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotBody, _ = io.ReadAll(r.Body)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"code":0,"data":{},"msg":""}`))
	}))
	defer upstream.Close()

	server := newTestRelayServer(t)
	server.mu.Lock()
	server.config.UpstreamURL = upstream.URL
	server.mu.Unlock()
	request := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewReader(wantBody))
	request.Header.Set("Origin", "wails://wails")
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	desktopLoopbackCORS(server.Handler()).ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("configured upstream status=%d body=%s", response.Code, response.Body.String())
	}
	if gotPath != "/api/auth/login" {
		t.Fatalf("upstream path=%q", gotPath)
	}
	if !bytes.Equal(gotBody, wantBody) {
		t.Fatalf("upstream body=%q want=%q", gotBody, wantBody)
	}
}

func TestDesktopLoopbackRelayPreservesMultipartRequestBody(t *testing.T) {
	wantBody := []byte("--boundary\r\nContent-Disposition: form-data; name=\"prompt\"\r\n\r\nhello\r\n--boundary--\r\n")
	var gotBody []byte
	var gotPath string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotBody, _ = io.ReadAll(r.Body)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[]}`))
	}))
	defer upstream.Close()

	server := newTestRelayServer(t)
	request := httptest.NewRequest(http.MethodPost, "/local-relay-proxy/images/edits/", bytes.NewReader(wantBody))
	request.Header.Set("Origin", "wails://wails")
	request.Header.Set("Content-Type", "multipart/form-data; boundary=boundary")
	request.Header.Set("x-local-relay-base-url", upstream.URL)
	request.Header.Set("Authorization", "Bearer test")
	response := httptest.NewRecorder()

	desktopLoopbackCORS(server.Handler()).ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("relay status=%d body=%s", response.Code, response.Body.String())
	}
	if gotPath != "/v1/images/edits" {
		t.Fatalf("upstream path=%q", gotPath)
	}
	if !bytes.Equal(gotBody, wantBody) {
		t.Fatalf("upstream body=%q want=%q", gotBody, wantBody)
	}
	if got := response.Header().Get("Access-Control-Allow-Origin"); got != "wails://wails" {
		t.Fatalf("allow origin=%q", got)
	}
}

func TestMiddlewareRewritesSPARoutesToIndex(t *testing.T) {
	server := newTestRelayServer(t)
	var receivedPath string
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedPath = r.URL.Path
		w.WriteHeader(http.StatusNoContent)
	})

	for _, path := range []string{"/canvas/home", "/canvas/workspace?id=project-1", "/canvas-repair/"} {
		receivedPath = ""
		request := httptest.NewRequest(http.MethodGet, path, nil)
		response := httptest.NewRecorder()
		server.Middleware(next).ServeHTTP(response, request)
		if receivedPath != "/" {
			t.Fatalf("route %q reached asset server as %q, want root index", path, receivedPath)
		}
	}
}

func TestMiddlewareLeavesAssetPathsUnchanged(t *testing.T) {
	server := newTestRelayServer(t)
	var receivedPath string
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedPath = r.URL.Path
	})
	request := httptest.NewRequest(http.MethodGet, "/assets/index.js", nil)
	server.Middleware(next).ServeHTTP(httptest.NewRecorder(), request)
	if receivedPath != "/assets/index.js" {
		t.Fatalf("asset path rewritten to %q", receivedPath)
	}
}

func newTestRelayServer(t *testing.T) *RelayServer {
	t.Helper()
	server := newRelayServerAt(t.TempDir())
	if server.storageErr != nil {
		t.Fatal(server.storageErr)
	}
	t.Cleanup(func() { _ = server.Close() })
	return server
}
