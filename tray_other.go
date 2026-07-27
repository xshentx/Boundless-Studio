//go:build !windows

package main

// Wails owns the native application delegate on macOS. The getlantern
// systray delegate conflicts with it, so non-Windows builds use normal window
// close semantics and do not start a separate tray event loop.
func (a *App) startSystemTray() {}

func (a *App) stopSystemTray() {}

func (a *App) shouldPreventClose() bool {
	return false
}
