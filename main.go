package main

import (
	"embed"
	"os"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

const (
	applicationTitle       = "无界创作台"
	applicationVersion     = "1.0.2"
	singleInstanceUniqueID = "c5802bd3-a8ec-4e4d-b53e-e3fab276ab83"
	windowsAppUserModelID  = "BoundlessStudio.Desktop"
	windowsWindowClassName = "BoundlessStudioMainWindow"
	windowsIconResourceID  = 3
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	if handled, exitCode := runUpdateHelperIfRequested(os.Args); handled {
		os.Exit(exitCode)
	}
	configureDesktopProcess()
	app := NewApp()
	err := wails.Run(&options.App{
		Title:     applicationTitle,
		Width:     1440,
		Height:    900,
		MinWidth:  1024,
		MinHeight: 680,
		AssetServer: &assetserver.Options{
			Assets:     assets,
			Middleware: app.relay.Middleware,
		},
		BackgroundColour: &options.RGBA{R: 15, G: 15, B: 15, A: 1},
		OnStartup:        app.startup,
		OnBeforeClose:    app.onBeforeClose,
		OnShutdown:       app.shutdown,
		SingleInstanceLock: &options.SingleInstanceLock{
			UniqueId: singleInstanceUniqueID,
			OnSecondInstanceLaunch: func(_ options.SecondInstanceData) {
				app.showMainWindow()
			},
		},
		Bind: []interface{}{app},
		Windows: &windows.Options{
			WebviewIsTransparent: false,
			WindowIsTranslucent:  false,
			DisableWindowIcon:    false,
			WindowClassName:      windowsWindowClassName,
		},
	})
	if err != nil {
		println("Error:", err.Error())
	}
}
