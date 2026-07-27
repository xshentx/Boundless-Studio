//go:build !windows

package main

import "testing"

func TestClosePolicyUsesNativeWindowLifecycleWithoutTray(t *testing.T) {
	app := NewApp()
	if app.shouldPreventClose() {
		t.Fatal("non-Windows close must use the native application lifecycle")
	}
}
