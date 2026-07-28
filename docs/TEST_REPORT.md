# 测试报告

测试日期：2026-07-27

## 自动化结果

| 检查 | 结果 |
|---|---|
| 前端 TypeScript `npm run typecheck` | 通过 |
| 前端活动测试 `npm test` | 56/56 通过 |
| 前端生产构建 `npm run build` | 通过 |
| Go 单元测试 `go test ./...` | 26/26 通过 |
| Go 静态检查 `go vet ./...` | 通过 |
| 精确源码比较 | 66 个未改动画布文件，0 缺失，0 差异；有意适配文件已登记 |
| 视觉宿主静态比较 | 13 个字体文件一致，CSS/Shell 无问题 |
| Wails Windows 编译 | 通过（Wails v2.13.0，windows/amd64） |
| EXE 启动与健康检查 | 通过 |
| 图标、托盘常驻与单实例实机检查 | 通过 |

前端构建仅出现原有的动态/静态 import 分块提示，不影响构建成功或运行。

## Go 测试覆盖

- 启动时创建 `data`、真实 `canvas.db` 和四类媒体目录。
- SQLite 状态新增、读取、覆盖和删除。
- 大型画布 JSON 经本地状态 API 完整往返。
- 媒体上传、读取、HEAD、Range、覆盖、元数据 patch、索引和删除。
- 图片/视频/音频/普通文件分类、MIME 嗅探与扩展名映射。
- 媒体相对路径越界拒绝。
- 画布修复清理状态与媒体，同时保留 `desktop:client_config`。
- 旧 `%AppData%\InfiniteCanvas\config.json` 一次性迁移到 SQLite。
- `INFINITE_CANVAS_DATA_DIR` 测试覆盖路径。
- 自定义 Base URL 自动补 `/v1`。
- 已含 `/api/plan/v3` 时不重复追加。
- 非 HTTP/HTTPS Base URL 被拒绝。
- 客户端健康检查。
- SPA 路由回退到嵌入式 `index.html`。
- 静态资源路径不会被 SPA 回退误改。

## 前端测试说明

独立项目迁入了与画布直接相关的测试，并新增独立提取契约、首页列表/卡片视图和仅中转模型路由回归测试。当前 56 个活动测试全部通过，覆盖：

- `desktop_sqlite_storage_contract` 验证结构化状态、媒体、设置、日志和旧数据迁移均接入 Go 本地 API，正式客户端不再以浏览器存储为主。
- 画布节点和项目数据操作。
- 图片旧地址失败后，持久化地址恢复时缩略图元素保持挂载并在成功加载后清除过期状态。
- API 中转、Seedance2、人脸编辑、故事导演及恢复数据。
- 人脸迁移默认完整适配、100% 初始上限、5%–160% 滑块/滚轮缩放、鼠标焦点保持、动态重置比例、抓手平移及选择框事件隔离。
- 首页默认列表、列表/卡片切换和紧凑卡片。
- 四类能力模型过滤：文本、图片、视频、音频。
- 全局及板块路由均使用原生 `<select>`。
- 旧平台/本地号池配置迁移到中转路由。
- 未选择有效中转时配置不可用，不回退平台或本地号池。
- 请求解析器只返回本地 Go 中转路由。
- 图片节点选中后仍保持画布滚轮缩放；提示词输入框只在可继续内部滚动时消费滚轮。
- 画布助手窄侧栏工具区自动换行，无横向滚动条、文字裁切和控件重叠。

另有 16 个旧基线测试保存在 `frontend/tests/legacy-baseline`，不计入独立客户端回归门禁：13 个在原项目基线中已经失败，3 个依赖已移除的旧主站侧栏、路由或宿主，与独立无限画布无关。

## 浏览器运行时验证

已在真实运行的前端页面 `http://127.0.0.1:34115/` 完成检查：

1. 首页默认以列表显示，能够创建并打开测试画布。
2. 设置弹窗顶部显示“中转设置 / 模型路由设置 / 软件更新”三个页签；中转地址、模型路由与更新内容可独立切换，没有“平台通道”和“本地号池”。
3. 添加中转后，中转供应商可在路由中选择。
4. 混合录入文本、图片、视频、音频模型后，各能力下拉菜单只显示对应类型模型。
5. 验证示例分别为：文本 `gpt-5.5`、图片 `gpt-image-2`、视频 `seedance-2.0`、音频 `gpt-4o-mini-tts`。
6. 图片节点选中并显示提示词窗口后，在提示词输入框区域执行真实滚轮，画布缩放从 100% 变为 154%，未退化为水平平移。
7. 画布助手工具区在 268px 可用宽度下测得 `clientWidth=scrollWidth=268px`、`overflowX=visible`；提示词库、模式切换、模型和图片设置分行显示且矩形无重叠。
8. 测试用 Vite 服务已停止，没有后台服务残留。

## 完整性审查

执行 `node scripts/compare-source.mjs` 的结果：

- 66 个未改动画布文件逐字节 SHA-256 一致。
- 缺失文件：0。
- 内容不一致文件：0。
- 原构建字体：13/13 一致。
- 字体 CSS、Ant Design Reset 与画布 Shell 检查通过。
- 所有 API 设置、首页视图、Story Director 动态模型、图片缩略图恢复、人脸迁移视图、提示词滚轮和助手响应式布局调整均已在比较脚本中按文件及原因登记。

## 最终客户端产物

- 编译命令：先执行 `npm run build`，再执行 `wails build -s`；`-s` 复用已经验证通过的 `frontend/dist`。
- EXE：`G:\画布\infinite-canvas-client\build\bin\BoundlessStudio.exe`
- 大小：20,899,840 字节（19.93 MiB）
- SHA-256：`2496D63931E907A7AED2C1D20A150CBAD6CD935A0F0C913F1C3F96AD8067CDAC`
- 构建时间：2026-07-27 23:14:31
- 程序图标：已生成 16/20/24/32/40/48/64/128/256px 九种尺寸的 Windows ICO；已从最终 EXE 提取复核，并在 Windows 文件资源管理器刷新缓存后确认 `BoundlessStudio.exe` 显示蓝青紫无限符号，不再显示 Wails 默认 W。
- 启动冒烟：客户端成功启动，运行时监听 `127.0.0.1:34116`，并在 EXE 同级自动创建 `data`。
- 健康检查：`http://127.0.0.1:34116/client-api/health` 返回 `{"ok":true,"service":"boundless-studio"}`。
- SQLite 文件头为 `SQLite format 3`，`PRAGMA integrity_check` 返回 `ok`，存在 `app_state` 与 `media_files` 两张业务表。
- 状态 API PUT/GET/DELETE，以及媒体 POST/GET/Range/index/DELETE 均已通过真实客户端冒烟；视频文件正确落入 `data/media/videos/*.mp4`，测试记录随后删除。
- 真实旧数据迁移已发生：迁移 6 个状态键和 1 个 PNG 媒体文件（2,125,241 字节）到 SQLite 与 `data/media/images`。
- 冒烟结束后客户端进程为 0，34115/34116 监听为 0；强制结束冒烟进程留下的 WAL/SHM 已通过只读连接确认完整，不做手工删除。

## Story Director dynamic-model verification

The active 56-test suite now verifies settings-driven story text model options, trimming and deduplication, removal fallback, shared UI/runtime validation, and routing a selected model through the enabled relay that provides it. The source comparison allowlist records the four intentional story-director adapter files; 76 unchanged canvas files still match byte-for-byte.


## 图片缩略图恢复专项审查

- 已对比缩略图和“图片详情”两条链路：两者最终读取同一份已恢复 `metadata.content`，差异仅在缩略图错误状态曾卸载图片元素。
- 回归契约确认失败占位不会再卸载 `<img>`，因此旧来源失败后仍可接收异步恢复的新来源。
- 新来源加载成功后会调用 `setImageLoadFailed(false)`，错误提示自动消失。
- 当前来源确实不可用时仍保留“图片已过期，需重新上传”，没有用隐藏提示代替数据修复。
- 正常缩略图的 `object-cover`、宽高、圆角和节点布局未改；仅失败期间使用透明隐藏避免破图闪烁。
## Seedance2 人脸迁移视图专项审查

- 初始显示：先以正常 100% 为基准，再按图片原始尺寸和编辑区可用宽高计算完整适配比例；适配比例最大为 100%。
- 响应窗口：使用 `ResizeObserver` 更新适配比例；“重置”恢复最新适配值。
- 滚轮缩放：编辑区使用 `{ passive: false }` 的原生滚轮监听，阻止外层页面/画布同步滚动；每次滚轮按 5% 调整，并保持鼠标指向的图片位置。
- 放大浏览：抓手拖动使用外层视口的 `scrollLeft` / `scrollTop`，不修改图片、选区和图层坐标。
- 交互隔离：选择框、脸部层、网格和缩放手柄继续调用 `stopPropagation()` 并自行捕获指针，因此拖动这些对象不会触发视口平移。
- 观察中心：缩放前后按工作区中心比例恢复滚动位置，避免放大后视点突然跳到左上角。
- 原功能：椭圆选择、脸部层、圆/椭圆网格、旋转、透明度、撤销、快捷键、实时预览及 PNG 合成保存逻辑保留。
- 自动化：专项源码契约已纳入 56 项活动测试；`npm run typecheck`、`npm test`、`npm run build` 均通过。
- 运行清理：冒烟验证后客户端进程为 0，34115/34116 测试监听为 0。

## 图片提示词滚轮与助手布局专项审查

- 工作区缩放开关不再依赖 `selectedNodeIds.size`，仅保留连接选中时的原有控制，图片节点选中不会把纵向滚轮送入水平平移分支。
- 提示词浮窗取消根节点无条件滚轮拦截；文本框在可滚动方向内保持正常文本滚动，到达边界后恢复画布缩放。
- 助手工具容器移除 `overflow-x-auto` 和横向细滚动条，改用 `flex-wrap`；模式按钮保持 `shrink-0`、`whitespace-nowrap` 与原有圆角配色。
- 新增 `canvas_selected_node_wheel_zoom`、`canvas_prompt_panel_wheel_passthrough`、`canvas_assistant_composer_layout` 三项回归契约。
- 实际页面完成滚轮及几何尺寸验证；生产构建、Go 检查、Wails 编译和健康检查全部通过。
## 程序图标、托盘与单实例专项验证

- **EXE 图标已实际更换**：Wails 打包阶段从 `build/windows/icon.ico` 重新生成资源对象并嵌入最终 EXE；资源管理器实机截图保存在 `build/icon-explorer-verification.png`。
- **图标缓存已刷新**：调用 Windows Shell 关联变更通知及 `ie4uinit.exe -show`，同一路径 `BoundlessStudio.exe` 当前显示新无限符号。
- **托盘常驻**：关闭主窗口后原 PID 保持运行、主窗口转为不可见，进程中存在 `SystrayClass` 托盘消息窗口；托盘实际加载的临时 ICO 与源 ICO 长度和 SHA-256 完全一致。
- **托盘菜单**：包含“打开无界创作台”“隐藏窗口”“退出”；实机发送“退出”菜单命令后客户端在 10 秒内正常退出。
- **单实例**：首实例隐藏到托盘后再次启动同一个 EXE，最终进程数仍为 1、PID 不变，并自动恢复已有主窗口。
- **关闭策略**：窗口关闭按钮只隐藏到托盘；只有托盘“退出”会设置真实退出状态并允许 Wails 关闭。
- **数据保护**：Wails 编译前后当前 `data` 的 3 个持久文件逐文件长度与 SHA-256 完全一致；没有清理 `build/bin/data`。
- **退出清理**：专项实机测试结束后客户端进程 0、34115/34116 监听 0、SQLite WAL/SHM 残留 0。
## GitHub Releases 自动更新专项验证

- 更新源固定为 `https://api.github.com/repos/xshentx/Boundless-Studio/releases/latest`，仓库页为 `https://github.com/xshentx/Boundless-Studio`。
- 当前客户端版本统一为 `v1.0.5`；版本比较兼容 `v1.2.0` 和 `1.2.0` 标签格式。
- 软件设置窗口已实机确认显示“中转设置 / 模型路由设置 / 软件更新”三个顶部页签，未修改画布主体视觉样式。
- “启动时自动检测更新”默认关闭并持久化到 `data/canvas.db`；开启后每次启动后台检查 Latest Release，只检查，不会擅自下载或安装。
- 更新页已实机确认显示当前版本、最新版本、仓库、最后检查时间、Release 说明与资源，并提供“立即检查”“打开 Releases”“下载并安装”。
- 下载过程通过 `boundless:update-state` 实时推送阶段、已下载字节、总字节和百分比；前端进度条同步展示下载、准备、安装与错误状态。
- Windows amd64 资源选择支持独立 `BoundlessStudio.exe`，或包含该 EXE 的 ZIP；排除 Setup/Installer、Linux、macOS、ARM64 资源。
- 下载地址和最终重定向均限制为 GitHub/GitHubusercontent HTTPS；EXE 执行前校验 `MZ`，ZIP 使用安全路径提取。
- 安装由独立辅助进程等待旧客户端退出后执行备份、替换和重启；替换或启动失败会恢复旧版，并写入 `data/updates/update-error.txt`。
- Go 新增更新相关测试覆盖版本比较、受信任下载地址、Windows 资源选择、Latest Release 解析、无 Release 友好错误、ZIP 提取和 SQLite 开关持久化；当前 Go 测试合计 26/26 通过。
- 前端新增更新界面契约测试；当前前端测试合计 56/56 通过。
- 2026-07-27 实机点击“立即检查”时 GitHub 返回 404，界面正确显示：`尚未找到 GitHub Release。请先在 xshentx/Boundless-Studio 仓库发布 Release。`，没有泄露原始 API 错误 JSON。
- 因仓库当前没有可读取的正式 Latest Release，本轮无法执行真实资源下载与自身替换；发布首个正式 Release 后即可走完整下载进度和安装流程。
- 最终 `wails build -s` 编译成功；产物为 `G:\画布\infinite-canvas-client\build\bin\BoundlessStudio.exe`，20,899,840 字节，SHA-256 `2496D63931E907A7AED2C1D20A150CBAD6CD935A0F0C913F1C3F96AD8067CDAC`。
- 最终单实例实机复测：首实例 PID 16200，第二次启动 PID 30812 自动退出，运行实例数保持 1。
- 编译及冒烟后 `build/bin/data` 仍存在；两张媒体图片的长度和 SHA-256 与编译前一致，未执行清理构建。
- 冒烟结束后 `BoundlessStudio` 进程为 0，34115/34116 监听为 0。

## 主页设置入口与工具栏排序专项验证

- 主页将原“中转设置”和“软件更新”两个按钮合并为单一“设置”按钮；打开后仍可在中转设置、模型路由设置、软件更新三个页签间切换。
- 主页工具栏顺序调整为：列表/卡片、新建画布、导入画布、设置、修复加载、选择操作、删除全部；危险删除操作置于末尾。
- 画布工作区顶部设置按钮已移除；画布助手中的手动设置按钮同步移除。生成任务发现配置缺失时的自动引导仍保留，不影响错误恢复。
- 实机确认主页按钮顺序正确，进入画布后顶部仅保留历史、主题、快捷键和助手，画布助手中没有设置按钮。
- TypeScript 类型检查通过；前端测试 56/56 通过；前端生产构建、源码对比、Go 测试、`go vet` 与 `wails build -s` 全部通过。
- 最终产物：`G:\画布\infinite-canvas-client\build\bin\BoundlessStudio.exe`，20,900,352 字节，SHA-256 `3CD9009C455C2D5828BB7471C02A5D9E9897FC5151BF419EDEB54599C27A1EFD`。
- 冒烟检查结束后客户端进程为 0，34115/34116 监听为 0；`build/bin/data` 保持存在。