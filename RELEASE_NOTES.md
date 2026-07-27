# Boundless Studio v1.0.0

发布日期：2026-07-28

`v1.0.0` 是无界创作台（Boundless Studio）的首个公开双平台版本，提供 Windows x64 与 macOS Universal 桌面程序。

## 主要功能

- 完整的无限画布交互：平移、缩放、框选、多选、拖拽、吸附、连线、缩略图、快捷键和右键菜单。
- 文本、图片、视频、音频、配置、故事导演和视频占位等节点。
- 图片裁剪、拆分、放大、蒙版、图层、角度、对比和 Seedance2 人脸编辑。
- 图片、视频、音频生成工作流，支持轮询、失败重试和版本历史。
- SQLite 本地持久化、媒体文件落盘、资产管理、恢复修复、ZIP 导入/导出与 WebDAV 同步。
- OpenAI 兼容 API 中继、模型路由和流式响应。
- 单实例运行、系统托盘与关闭时隐藏。
- Windows 客户端支持通过 GitHub Releases 检查和安装更新。

## 下载

| 平台 | 文件 | 架构 |
| --- | --- | --- |
| Windows | `BoundlessStudio.exe` | x86-64 |
| Windows 压缩包 | `BoundlessStudio-windows-amd64.zip` | x86-64 |
| macOS | `BoundlessStudio-macos-universal.zip` | Intel + Apple Silicon |
| 校验和 | `SHA256SUMS.txt` | SHA-256 |

## 安装说明

### Windows

下载并运行 `BoundlessStudio.exe`。Windows 10/11 通常已包含 Microsoft Edge WebView2 Runtime；如无法启动，请先安装 WebView2 Runtime。

### macOS

解压 ZIP，将 `BoundlessStudio.app` 拖入“应用程序”目录。此版本由 CI 自动构建，暂未使用 Apple Developer ID 签名和公证。若 Gatekeeper 阻止首次启动，请在 Finder 中按住 Control 点击应用并选择“打开”。

## 数据与升级提示

- 项目数据库和媒体资源保存在应用数据目录的 `data/` 中。
- 更新或移动应用前请备份完整的 `data/` 目录。
- Windows 应用内更新会选择 Release 中的 `BoundlessStudio.exe`；macOS 当前请手动下载新版本。

## 已知限制

- macOS 自动构建包未签名、未公证。
- Windows 应用内自动更新暂不支持 macOS。
- AI 生成功能需要用户自行配置兼容的 API 服务与密钥。