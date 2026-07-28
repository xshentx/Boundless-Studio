# Boundless Studio v1.0.7

发布日期：2026-07-29

`v1.0.7` 是无界创作台（Boundless Studio）的 macOS 桌面请求传输修复版本，重点解决 Wails 自定义协议环境下 JSON、FormData、媒体文件及 WebDAV 请求体可能无法正确送达本地服务的问题，并为桌面回环接口增加严格的来源校验和启动失败提示。

## 主要更新

### macOS 请求体传输修复

- macOS 打包应用在 `wails:` 协议下，将桌面 API 请求统一发送到 `http://127.0.0.1:34116` 本地回环服务。
- 修复 AI 中继代理的 JSON 和 multipart 表单请求体在 macOS Wails 自定义协议下丢失或为空的问题。
- 修复登录、管理接口及共享请求客户端的 JSON 请求体传输。
- 修复参考素材、桌面媒体文件及状态数据的上传和写入请求。
- 修复 WebDAV 代理模式下同步请求体无法可靠传输的问题。
- Windows 和 Vite 开发环境继续使用原有相对地址，不改变现有请求流程。

### 桌面回环服务安全

- 本地回环服务仅允许 Wails 桌面来源及受信任的本地开发来源跨域访问。
- 未知浏览器来源访问本地接口时返回拒绝响应，防止网页滥用桌面 API。
- 完整处理桌面请求所需的 CORS 预检、授权头、自定义中继头和 WebDAV 头。
- 支持 Private Network Access 预检响应及媒体范围相关暴露头。
- 增加 JSON 与 multipart 请求体经过回环代理后保持完整的后端测试。

### macOS 网络权限与启动提示

- macOS `Info.plist` 增加 `NSAllowsLocalNetworking`，允许打包应用访问本机回环服务。
- 本地服务端口被占用或监听失败时，不再静默继续运行。
- 启动失败会显示明确错误对话框和端口信息，并安全退出应用，避免进入不可用状态。
- 前端与 Go 后端的回环端口增加一致性回归检查。

### 测试与质量保障

- 新增 macOS 请求体回环传输契约测试。
- 新增 Wails CORS 预检、未知来源拒绝、JSON 请求体及 multipart 请求体测试。
- 扩展本地中继服务测试，覆盖来源响应头和请求体完整性。

## 下载

- Windows x64 可执行文件：`BoundlessStudio.exe`
- Windows x64 压缩包：`BoundlessStudio-windows-amd64.zip`
- macOS Apple Silicon 压缩包：`BoundlessStudio-macos-arm64.zip`
- SHA-256 校验文件：`SHA256SUMS.txt`

## 升级提示

- 从 `v1.0.6` 升级前，建议备份完整的 `data/` 目录。
- macOS 包仅支持 Apple Silicon（ARM64），当前自动构建产物未进行 Apple Developer ID 签名与公证。
