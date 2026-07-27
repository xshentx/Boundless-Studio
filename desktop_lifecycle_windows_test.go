//go:build windows

package main

import (
	"bytes"
	"testing"
)

func TestDesktopLifecycleUsesStableSingleInstanceIdentity(t *testing.T) {
	if applicationTitle != "无界创作台" {
		t.Fatalf("unexpected application title %q", applicationTitle)
	}
	if singleInstanceUniqueID != "c5802bd3-a8ec-4e4d-b53e-e3fab276ab83" {
		t.Fatalf("single-instance ID changed: %q", singleInstanceUniqueID)
	}
}

func TestWindowsTaskbarIdentityAndIconContract(t *testing.T) {
	if windowsAppUserModelID != "BoundlessStudio.Desktop" {
		t.Fatalf("unexpected Windows AppUserModelID %q", windowsAppUserModelID)
	}
	if windowsWindowClassName != "BoundlessStudioMainWindow" {
		t.Fatalf("unexpected Windows window class %q", windowsWindowClassName)
	}
	if windowsIconResourceID != 3 {
		t.Fatalf("Windows icon resource ID is %d, want Wails resource ID 3", windowsIconResourceID)
	}
}

func TestClosePolicyHidesUntilExplicitQuit(t *testing.T) {
	app := NewApp()
	if !app.shouldPreventClose() {
		t.Fatal("window close must be prevented while the tray app is running")
	}
	app.quitting.Store(true)
	if app.shouldPreventClose() {
		t.Fatal("explicit tray quit must allow the application to close")
	}
}

func TestSystemTrayContractAndEmbeddedIcon(t *testing.T) {
	if trayOpenLabel != "打开无界创作台" || trayHideLabel != "隐藏窗口" || trayQuitLabel != "退出" {
		t.Fatalf("unexpected tray labels: %q, %q, %q", trayOpenLabel, trayHideLabel, trayQuitLabel)
	}
	if len(trayIcon) < 6 {
		t.Fatalf("embedded tray icon is too short: %d", len(trayIcon))
	}
	if !bytes.Equal(trayIcon[:4], []byte{0, 0, 1, 0}) {
		t.Fatalf("embedded tray icon has invalid ICO header: %v", trayIcon[:4])
	}
	imageCount := int(trayIcon[4]) | int(trayIcon[5])<<8
	if imageCount != 9 {
		t.Fatalf("embedded tray icon has %d images, want 9", imageCount)
	}
}
