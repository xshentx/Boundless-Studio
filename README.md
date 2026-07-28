# 无界创作台（Boundless Studio）

无界创作台是一款面向 AI 内容生产的跨平台无限画布桌面应用。它使用 **Wails v2 + Go + React 19 + Vite + TypeScript** 构建，支持在画布中组织文本、图片、视频、音频、模型配置与生成工作流；所有项目数据和媒体文件均可保存在本机。

[![Release](https://img.shields.io/github/v/release/xshentx/Boundless-Studio?display_name=tag)](https://github.com/xshentx/Boundless-Studio/releases/latest)
[![Build](https://github.com/xshentx/Boundless-Studio/actions/workflows/release.yml/badge.svg)](https://github.com/xshentx/Boundless-Studio/actions/workflows/release.yml)

## 功能特性

- **无限画布**：平移、缩放、框选、多选、拖拽、吸附、连线、缩略图、快捷键与右键菜单。
- **丰富节点**：文本、图片、视频、音频、配置、故事导演、视频占位等节点及其编辑能力。
- **图片工具**：裁剪、拆分、放大、蒙版、图层、角度、对比与 Seedance2 人脸编辑。
- **生成工作流**：图片、视频和音频生成，轮询、失败重试、版本历史、Seedance2 与故事导演分阶段流程。
- **项目与资产管理**：新建、重命名、删除、批量操作、ZIP 导入/导出、资产库与恢复修复。
- **本地持久化**：SQLite 保存结构化数据，媒体文件本地落盘，并支持旧浏览器数据迁移与 WebDAV 同步。
- **开放接口**：自定义 OpenAI 兼容 API 中继、模型路由、WebDAV 代理和流式响应。
- **桌面体验**：单实例运行；Windows 支持系统托盘、关闭时隐藏和应用内更新检查。

完整功能矩阵参见 [docs/FEATURE_COMPARISON.md](docs/FEATURE_COMPARISON.md)。

## 下载与安装

请前往 [Releases](https://github.com/xshentx/Boundless-Studio/releases/latest) 下载最新版本。

| 平台 | 下载文件 | 系统要求 |
| --- | --- | --- |
| Windows x64 | `BoundlessStudio.exe` 或 `BoundlessStudio-windows-amd64.zip` | Windows 10/11，Microsoft WebView2 Runtime |
| macOS ARM64 | `BoundlessStudio-macos-arm64.zip` | macOS 11+；Apple Silicon（M1 或更新） |

### Windows

1. 下载 `BoundlessStudio.exe`，或解压 Windows ZIP。
2. 双击 `BoundlessStudio.exe` 启动。
3. 若系统缺少 WebView2，请安装 [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)。

### macOS

1. 解压 `BoundlessStudio-macos-arm64.zip`。
2. 将 `BoundlessStudio.app` 拖入“应用程序”目录并启动。
3. 当前自动构建产物未进行 Apple Developer ID 签名与公证；若 Gatekeeper 阻止首次启动，请在 Finder 中按住 Control 点击应用并选择“打开”。

> Windows 与 macOS 包均由同一 `v1.0.2` 源码标签构建。macOS 包面向 Apple Silicon（ARM64）。Windows 应用内自动更新目前仅处理 Windows 客户端资源；macOS 请从 Releases 手动更新。

## 运行时数据

应用默认在可执行程序附近创建 `data` 目录：

```text
data/
├─ canvas.db                    SQLite 数据库
├─ media/
│  ├─ images/                   图片
│  ├─ videos/                   视频
│  ├─ audio/                    音频
│  └─ files/                    其他文件
└─ updates/                     更新下载与日志
```

- 项目、节点、设置、模型路由、资产索引、认证状态与生成日志等结构化数据保存在 `canvas.db`。
- SQLite 使用 WAL；程序运行时的 `canvas.db-wal` 和 `canvas.db-shm` 是数据库的一部分，请勿手工删除。
- 可通过环境变量 `INFINITE_CANVAS_DATA_DIR` 覆盖数据目录，适合测试或便携部署。
- 升级或移动程序前，建议完整备份 `data` 目录。

## API 配置

设置界面提供以下配置：

1. **中转设置**：填写一个或多个 OpenAI 兼容 Base URL、密钥与可用模型。
2. **模型路由**：按文本、图片、视频和音频能力选择全局或板块模型。
3. **软件更新**：检查 GitHub Releases；Windows 可选择启动时自动检测。

AI 请求由 Go 层的 `/local-relay-proxy/*` 同源转发，以避免 WebView CORS 和流式响应缓冲问题。配置数据保存在本地 SQLite 数据库中。

## 本地开发

### 环境要求

- Go 1.25+
- Node.js 20+
- Wails CLI v2.13+
- Windows：WebView2 开发环境
- macOS：Xcode Command Line Tools

### 启动开发环境

```bash
git clone https://github.com/xshentx/Boundless-Studio.git
cd Boundless-Studio
go install github.com/wailsapp/wails/v2/cmd/wails@v2.13.0
cd frontend
npm ci
cd ..
wails dev
```

### 测试与检查

```bash
cd frontend
npm run typecheck
npm test
npm run build

cd ..
go test ./...
go vet ./...
```

### 构建桌面程序

在目标系统上执行：

```bash
# Windows x64
wails build -platform windows/amd64 -s

# macOS ARM64（需在 Apple Silicon macOS 上运行）
wails build -platform darwin/arm64 -s
```

构建结果位于 `build/bin/`。请勿在已有用户数据的工作目录中使用 `wails build -clean`，因为该命令会清理 `build/bin`。

## 自动发布

仓库的 [`.github/workflows/release.yml`](.github/workflows/release.yml) 会在推送 `v*` 标签时：

1. 在 Windows 与 macOS 原生 GitHub Actions Runner 上执行前端类型检查、生产构建和 Go 测试。
2. 构建 Windows x64 与 macOS ARM64 程序。
3. 打包发行文件并生成 SHA-256 校验和。
4. 创建对应 GitHub Release，并上传双平台产物。

发布新版本前需同步更新 `VERSION`、`main.go`、`wails.json`、`frontend/package.json` 和 `frontend/src/services/desktop-updater.ts` 中的版本号，然后创建并推送标签。

## 项目结构

```text
Boundless-Studio/
├─ app.go / main.go             Wails 客户端生命周期和窗口
├─ tray_windows.go              系统托盘与退出菜单
├─ datastore.go                 SQLite 与本地媒体数据层
├─ relay.go                     本地 API、HTTP/API/WebDAV 中继
├─ updater.go                   GitHub Releases 更新检查
├─ frontend/                    React/Vite 前端
│  ├─ src/app/canvas/           无限画布功能源码
│  ├─ src/compat/               桌面环境兼容层
│  ├─ src/services/             桌面存储与更新服务
│  └─ tests/                    前端测试
├─ docs/                        架构、功能、测试与审查文档
└─ .github/workflows/           自动构建与发布流程
```

## 更多文档

- [架构说明](docs/ARCHITECTURE.md)
- [功能对比](docs/FEATURE_COMPARISON.md)
- [测试报告](docs/TEST_REPORT.md)
- [代码审查报告](docs/REVIEW_REPORT.md)

## 版本

当前版本：**v1.0.2**。详见 [RELEASE_NOTES.md](RELEASE_NOTES.md)。