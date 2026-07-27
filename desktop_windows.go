//go:build windows

package main

import (
	"syscall"
	"time"
	"unsafe"
)

const (
	imageIcon     = 1
	iconSmall     = 0
	iconBig       = 1
	wmSetIcon     = 0x0080
	smCxIcon      = 11
	smCyIcon      = 12
	smCxSmallIcon = 49
	smCySmallIcon = 50
	gclpHIcon     = -14
	gclpHIconSm   = -34
)

var (
	desktopShell32                              = syscall.NewLazyDLL("shell32.dll")
	desktopKernel32                             = syscall.NewLazyDLL("kernel32.dll")
	desktopUser32                               = syscall.NewLazyDLL("user32.dll")
	procSetCurrentProcessExplicitAppUserModelID = desktopShell32.NewProc("SetCurrentProcessExplicitAppUserModelID")
	procGetModuleHandleW                        = desktopKernel32.NewProc("GetModuleHandleW")
	procFindWindowW                             = desktopUser32.NewProc("FindWindowW")
	procGetWindowThreadProcessID                = desktopUser32.NewProc("GetWindowThreadProcessId")
	procGetSystemMetrics                        = desktopUser32.NewProc("GetSystemMetrics")
	procLoadImageW                              = desktopUser32.NewProc("LoadImageW")
	procSendMessageW                            = desktopUser32.NewProc("SendMessageW")
	procSetClassLongPtrW                        = desktopUser32.NewProc("SetClassLongPtrW")
)

var (
	mainWindowBigIcon   uintptr
	mainWindowSmallIcon uintptr
)

// configureDesktopProcess gives Windows a stable application identity before
// Wails creates its native window. This prevents the taskbar from grouping the
// app under the WebView host and falling back to a generic window icon.
func configureDesktopProcess() {
	appID, err := syscall.UTF16PtrFromString(windowsAppUserModelID)
	if err != nil {
		return
	}
	_, _, _ = procSetCurrentProcessExplicitAppUserModelID.Call(uintptr(unsafe.Pointer(appID)))
}

// ensureMainWindowIcon works around Wails setting only ICON_SMALL. Windows uses
// ICON_BIG for the taskbar and Alt+Tab switcher, so both sizes and both class
// fallbacks must be populated after the native window exists.
func (a *App) ensureMainWindowIcon() {
	if applyMainWindowIcon() {
		return
	}

	ctx := a.runtimeContext()
	go func() {
		ticker := time.NewTicker(100 * time.Millisecond)
		defer ticker.Stop()
		timeout := time.NewTimer(5 * time.Second)
		defer timeout.Stop()

		for {
			select {
			case <-ticker.C:
				if applyMainWindowIcon() {
					return
				}
			case <-timeout.C:
				return
			case <-ctx.Done():
				return
			}
		}
	}()
}

func applyMainWindowIcon() bool {
	className, err := syscall.UTF16PtrFromString(windowsWindowClassName)
	if err != nil {
		return false
	}
	windowTitle, err := syscall.UTF16PtrFromString(applicationTitle)
	if err != nil {
		return false
	}

	hwnd, _, _ := procFindWindowW.Call(
		uintptr(unsafe.Pointer(className)),
		uintptr(unsafe.Pointer(windowTitle)),
	)
	if hwnd == 0 {
		return false
	}

	var processID uint32
	procGetWindowThreadProcessID.Call(hwnd, uintptr(unsafe.Pointer(&processID)))
	if processID != uint32(syscall.Getpid()) {
		return false
	}

	if mainWindowBigIcon == 0 || mainWindowSmallIcon == 0 {
		module, _, _ := procGetModuleHandleW.Call(0)
		if module == 0 {
			return false
		}

		bigWidth, _, _ := procGetSystemMetrics.Call(smCxIcon)
		bigHeight, _, _ := procGetSystemMetrics.Call(smCyIcon)
		smallWidth, _, _ := procGetSystemMetrics.Call(smCxSmallIcon)
		smallHeight, _, _ := procGetSystemMetrics.Call(smCySmallIcon)

		mainWindowBigIcon, _, _ = procLoadImageW.Call(
			module,
			uintptr(windowsIconResourceID),
			imageIcon,
			bigWidth,
			bigHeight,
			0,
		)
		mainWindowSmallIcon, _, _ = procLoadImageW.Call(
			module,
			uintptr(windowsIconResourceID),
			imageIcon,
			smallWidth,
			smallHeight,
			0,
		)
		if mainWindowBigIcon == 0 || mainWindowSmallIcon == 0 {
			return false
		}
	}

	procSendMessageW.Call(hwnd, wmSetIcon, iconBig, mainWindowBigIcon)
	procSendMessageW.Call(hwnd, wmSetIcon, iconSmall, mainWindowSmallIcon)
	procSetClassLongPtrW.Call(hwnd, signedIndex(gclpHIcon), mainWindowBigIcon)
	procSetClassLongPtrW.Call(hwnd, signedIndex(gclpHIconSm), mainWindowSmallIcon)
	return true
}

func signedIndex(value int32) uintptr {
	return uintptr(int64(value))
}
