# Boundless Studio v1.0.1

发布日期：2026-07-28

`v1.0.1` 是无界创作台（Boundless Studio）的首个维护版本，重点改善图片生成、画布助手、故事导演和画布交互的稳定性，并继续提供 Windows x64 与 macOS ARM64 桌面程序。

## 修复与改进

- 拒绝写入或复用 `0B` 图片缓存，避免参考图为空时产生 `Request body is empty` 请求错误。
- 图片生成请求支持在本地缓存失效时回退到有效远端图片资源。
- 过滤文本接口返回的 502/503 网关 HTML 页面，显示可理解的错误信息，避免将异常网页当作模型内容或故事导演 JSON 继续处理。
- 修复故事导演重新生成失败后节点持续处于加载状态的问题，并保留上一次有效分析结果。
- 修复在视频预览或可编辑控件上按 Delete/Backspace 时误触发页面导航的问题。
- 视频节点内容高度变化后重新测量节点内部布局，修复生成完成后连线锚点偏移。
- 画布助手移除“未开发”标识，恢复文本/图片模型选择，并按能力路由到正确的 API 中转配置。
- 图片尺寸统一为 `1k`、`2k`、`4k`，默认使用 `1k`；默认画布图片生成数量调整为 1。
- 图片设置中的尺寸和数量选择逻辑统一，兼容旧版质量配置迁移。
- 主页增加“下载画布”入口，改善项目导出操作。
- 增加上述问题的自动化回归测试和排查记录。

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
- 从 `v1.0.0` 升级前，建议备份完整的 `data/` 目录。
- 旧版图片质量值会自动迁移为 `1k`、`2k` 或 `4k`。
- Windows 应用内更新会选择 Release 中的 `BoundlessStudio.exe`；macOS 当前请手动下载新版本。

## 已知限制

- macOS 自动构建包仅支持 Apple Silicon，且未签名、未公证。
- Windows 应用内自动更新暂不支持 macOS。
- AI 生成功能需要用户自行配置兼容的 API 服务与密钥。