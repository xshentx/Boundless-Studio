# Boundless Studio v1.0.2

发布日期：2026-07-28

`v1.0.2` 是无界创作台（Boundless Studio）的模型选择兼容性维护版本，重点修复 API 中转模型 ID 使用点号或连字符时无法正确回显、选择和路由的问题，并继续提供 Windows x64 与 macOS ARM64 桌面程序。

## 修复与改进

- 支持将已保存的点号模型 ID 与中转服务实际返回的连字符模型 ID 正确匹配，例如 `gpt-5.5` 可匹配 `gpt-5-5`，`gemini-3.1-pro` 可匹配 `gemini-3-1-pro`。
- 当精确模型 ID 与别名同时存在时，优先使用精确匹配，避免选择到错误的中转模型。
- 模型别名成功解析后自动写回当前配置，使后续请求持续使用中转服务实际配置的模型 ID。
- 画布助手的文本与图片模型选择改为同时校验已配置模型和允许的模型别名，避免有效模型被清空。
- 已移除或未配置的模型仍保持空选状态，不会因别名匹配被重新引入。
- 提高中转设置与板块路由模型菜单的显示层级，修复下拉菜单被设置对话框遮挡的问题。
- 增加模型别名解析、精确匹配优先级、画布助手选择及菜单层级的自动化回归测试。

## 下载

| 平台 | 文件 | 架构 |
| --- | --- | --- |
| Windows | `BoundlessStudio.exe` | x86-64 |
| Windows 压缩包 | `BoundlessStudio-windows-amd64.zip` | x86-64 |
| macOS | `BoundlessStudio-macos-arm64.zip` | Apple Silicon（M1 或更新） |
| 校验和 | `SHA256SUMS.txt` | SHA-256 |

## 安装说明

### Windows

下载并运行 `BoundlessStudio.exe`。Windows 10/11 通常已包含 Microsoft Edge WebView2 Runtime；如无法启动，请先安装 WebView2 Runtime。

### macOS

解压 ZIP，将应用拖入“应用程序”目录。此版本由 CI 自动构建，暂未使用 Apple Developer ID 签名和公证。若 Gatekeeper 阻止首次启动，请在 Finder 中按住 Control 点击应用并选择“打开”。

## 数据与升级提示

- 项目数据库和媒体资源保存在应用数据目录的 `data/` 中。
- 从 `v1.0.1` 升级前，建议备份完整的 `data/` 目录。
- 本次更新不涉及数据库结构迁移；已保存的模型别名会在界面解析后自动更新为当前配置的模型 ID。
- Windows 应用内更新会选择 Release 中的 `BoundlessStudio.exe`；macOS 当前请手动下载新版本。

## 已知限制

- macOS 自动构建包仅支持 Apple Silicon，且未签名、未公证。
- Windows 应用内自动更新暂不支持 macOS。
- AI 生成功能需要用户自行配置兼容的 API 服务与密钥。
