package main

import (
	_ "embed"
	"runtime"

	"github.com/getlantern/systray"
)

//go:embed build/windows/icon.ico
var trayIcon []byte

const (
	trayOpenLabel = "打开无界创作台"
	trayHideLabel = "隐藏窗口"
	trayQuitLabel = "退出"
)

func (a *App) startSystemTray() {
	a.trayStartOnce.Do(func() {
		go func() {
			// A Win32 notification icon owns a window and message queue; keeping
			// the goroutine on one OS thread makes that queue deterministic.
			runtime.LockOSThread()
			defer runtime.UnlockOSThread()
			systray.Run(a.onTrayReady, nil)
		}()
	})
}

func (a *App) onTrayReady() {
	a.trayReady.Store(true)
	if a.trayStopping.Load() {
		systray.Quit()
		return
	}

	systray.SetIcon(trayIcon)
	systray.SetTooltip(applicationTitle)

	openItem := systray.AddMenuItem(trayOpenLabel, "显示主窗口")
	hideItem := systray.AddMenuItem(trayHideLabel, "隐藏到系统托盘")
	systray.AddSeparator()
	quitItem := systray.AddMenuItem(trayQuitLabel, "完全退出无界创作台")

	go func() {
		for {
			select {
			case <-openItem.ClickedCh:
				a.showMainWindow()
			case <-hideItem.ClickedCh:
				a.hideMainWindow()
			case <-quitItem.ClickedCh:
				a.requestQuit()
				return
			case <-a.trayStop:
				return
			}
		}
	}()
}

func (a *App) stopSystemTray() {
	a.trayStopping.Store(true)
	a.trayStopOnce.Do(func() {
		close(a.trayStop)
	})
	if a.trayReady.Load() {
		systray.Quit()
	}
}
