# Boundless Studio v1.0.3

发布日期：2026-07-28

`v1.0.3` 是无界创作台（Boundless Studio）的模型路由与设置交互维护版本，重点修复 Grok 文本模型被错误归类为视频模型，以及 API 设置弹窗中双击模型选择时误选背景文字的问题，并继续提供 Windows x64 与 macOS ARM64 桌面程序。

## 修复与改进

- 修复仅因模型名包含 `grok` 就被识别为视频模型的问题，`grok-4.5` 等对话模型现在会正确归类到文本能力。
- 带有明确视频标识的 Grok 模型（例如 `grok-imagine-video`）仍会正确归类到视频能力。
- 升级时重新校正旧配置中缓存的 Grok 模型能力分类，将误归类的视频模型迁回文本模型列表。
- 保留供应商显式配置的未知模型能力分类，避免迁移过程覆盖自定义模型配置。
- API 设置弹窗打开时清除已有文本选择并锁定背景页面，关闭时恢复原有交互状态。
- 模型选择触发器与选项菜单禁止文本选择，修复双击模型时选中背景文字的问题。
- 增加 Grok 文本路由、旧配置迁移、显式能力分类和模型选择交互的自动化回归测试。

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
- 从 `v1.0.2` 升级前，建议备份完整的 `data/` 目录。
- 本次更新不涉及数据库结构迁移；旧配置中的 Grok 模型能力分类会在配置加载时自动校正。
- Windows 应用内更新会选择 Release 中的 `BoundlessStudio.exe`；macOS 当前请手动下载新版本。

## 已知限制

- macOS 自动构建包仅支持 Apple Silicon，且未签名、未公证。
- Windows 应用内自动更新暂不支持 macOS。
- AI 生成功能需要用户自行配置兼容的 API 服务与密钥。
