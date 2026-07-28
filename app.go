package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"sync"
	"sync/atomic"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

type App struct {
	ctxMu   sync.RWMutex
	ctx     context.Context
	relay   *RelayServer
	updater *UpdateManager

	quitting      atomic.Bool
	trayStartOnce sync.Once
	trayStopOnce  sync.Once
	trayReady     atomic.Bool
	trayStopping  atomic.Bool
	trayStop      chan struct{}
}

func NewApp() *App {
	app := &App{
		relay:    NewRelayServer(),
		trayStop: make(chan struct{}),
	}
	app.updater = NewUpdateManager(app)
	return app
}

func (a *App) startup(ctx context.Context) {
	a.ctxMu.Lock()
	a.ctx = ctx
	a.ctxMu.Unlock()
	if err := a.relay.StartLoopback(ctx); err != nil {
		message := fmt.Sprintf("本地服务启动失败，无法监听 127.0.0.1:%s。请关闭占用该端口的程序后重新启动。\n\n详细信息：%v", desktopAPIPort, err)
		wailsruntime.LogError(ctx, message)
		_, _ = wailsruntime.MessageDialog(ctx, wailsruntime.MessageDialogOptions{
			Type:    wailsruntime.ErrorDialog,
			Title:   "无界创作台启动失败",
			Message: message,
		})
		wailsruntime.Quit(ctx)
		return
	}
	a.ensureMainWindowIcon()
	a.startSystemTray()
	acknowledgeAppliedUpdate(os.Args)
	cleanupLegacyVersionedExecutablesAtStartup()
	a.startAutomaticUpdateCheck(ctx)
}

func (a *App) shutdown(_ context.Context) {
	a.stopSystemTray()
	_ = a.relay.Close()
}

func (a *App) runtimeContext() context.Context {
	a.ctxMu.RLock()
	defer a.ctxMu.RUnlock()
	return a.ctx
}

func (a *App) onBeforeClose(ctx context.Context) bool {
	if !a.shouldPreventClose() {
		return false
	}
	wailsruntime.WindowHide(ctx)
	return true
}

func (a *App) showMainWindow() {
	ctx := a.runtimeContext()
	if ctx == nil {
		return
	}
	wailsruntime.WindowShow(ctx)
	wailsruntime.WindowUnminimise(ctx)
	// Toggling topmost brings a restored window to the foreground without
	// leaving it permanently above other applications.
	wailsruntime.WindowSetAlwaysOnTop(ctx, true)
	wailsruntime.WindowSetAlwaysOnTop(ctx, false)
}

func (a *App) hideMainWindow() {
	if ctx := a.runtimeContext(); ctx != nil {
		wailsruntime.WindowHide(ctx)
	}
}

func (a *App) requestQuit() {
	if a.quitting.Swap(true) {
		return
	}
	a.stopSystemTray()
	if ctx := a.runtimeContext(); ctx != nil {
		wailsruntime.Quit(ctx)
	}
}

func (a *App) GetClientConfig() ClientConfig {
	a.relay.mu.RLock()
	defer a.relay.mu.RUnlock()
	return a.relay.config
}

func (a *App) SetUpstreamURL(value string) error {
	normalized, err := normalizeHTTPBaseURL(value)
	if err != nil {
		return err
	}
	a.relay.mu.Lock()
	a.relay.config.UpstreamURL = normalized
	a.relay.mu.Unlock()
	return a.relay.saveConfig()
}

func (a *App) GetUpdateState() UpdateState {
	return a.updater.State()
}

func (a *App) CheckForUpdates() (UpdateState, error) {
	ctx := a.runtimeContext()
	if ctx == nil {
		ctx = context.Background()
	}
	return a.updater.Check(ctx)
}

func (a *App) StartUpdate() error {
	ctx := a.runtimeContext()
	if ctx == nil {
		return errors.New("客户端尚未启动完成")
	}
	return a.updater.StartInstall(ctx)
}

func (a *App) SetAutoCheckUpdates(enabled bool) error {
	a.relay.mu.Lock()
	previous := a.relay.config.AutoCheckUpdates
	a.relay.config.AutoCheckUpdates = enabled
	a.relay.mu.Unlock()
	if err := a.relay.saveConfig(); err != nil {
		a.relay.mu.Lock()
		a.relay.config.AutoCheckUpdates = previous
		a.relay.mu.Unlock()
		return err
	}
	if enabled {
		if ctx := a.runtimeContext(); ctx != nil {
			go func() { _, _ = a.updater.Check(ctx) }()
		}
	}
	return nil
}

func (a *App) startAutomaticUpdateCheck(ctx context.Context) {
	a.relay.mu.RLock()
	enabled := a.relay.config.AutoCheckUpdates
	a.relay.mu.RUnlock()
	if enabled {
		go func() { _, _ = a.updater.Check(ctx) }()
	}
	go cleanupStaleUpdateArtifacts(ctx)
}
