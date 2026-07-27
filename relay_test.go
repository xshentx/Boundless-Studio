package main

import (
	"net/http"
	"net/http/httptest"
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
