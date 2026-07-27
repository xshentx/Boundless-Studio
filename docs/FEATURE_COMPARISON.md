# 功能提取对比

## 源码完整性

`frontend/scripts/compare-source.mjs` 对原项目与独立客户端执行逐文件 SHA-256 比较；仅排除明确记录的客户端宿主适配文件和本次需求调整文件。

| 比较范围 | 结果 |
|---|---:|
| `src/app/canvas/**`（排除有意调整文件） | 一致 |
| `src/app/canvas-repair/page.tsx` | 一致 |
| `src/app/globals.css` | 一致 |
| `public/recovery/xiaojun-teacher-project.json` | 一致 |
| 精确比较的未改动画布文件 | 76 |
| 缺失文件 | 0 |
| 内容不一致文件 | 0 |
| 原构建字体文件 | 13/13 一致 |
| 字体 CSS、Ant Design Reset、画布 Shell | 一致，无问题 |

## 功能矩阵

| 功能域 | 原项目 | 独立客户端 | 结论 |
|---|---|---|---|
| 项目新建、选择、重命名、删除 | 有 | 有 | 完整 |
| 首页默认列表、列表/卡片切换、视图偏好保存 | 无 | 有 | 客户端增强，项目操作能力完整保留 |
| 紧凑卡片视图 | 无 | 有 | 客户端增强，卡片尺寸已缩小 |
| 批量删除、批量导出 | 有 | 有 | 完整 |
| ZIP 导入/导出、媒体恢复 | 有 | 有 | 完整 |
| 画布修复页面和恢复样例 | 有 | 有 | 完整 |
| 无限平移、滚轮缩放、缩放控件 | 有 | 有 | 完整；选中图片并显示提示词窗口后仍保持滚轮缩放 |
| 框选、多选、拖拽、吸附、快捷键 | 有 | 有 | 完整 |
| 节点连线、连接排序和断开 | 有 | 有 | 完整 |
| 缩略图、工具栏、右键菜单 | 有 | 有 | 完整 |
| 文本节点 | 有 | 有 | 完整 |
| 图片节点与生成历史 | 有 | 有 | 完整；持久化地址恢复后缩略图会自动重试；提示词输入可滚动且边界滚轮回传画布 |
| 视频节点、轮询、失败重试 | 有 | 有 | 完整 |
| 音频节点与生成 | 有 | 有 | 完整 |
| 配置节点和 API 设置 | 有 | 有 | 完整 |
| 图片裁剪、拆分、放大 | 有 | 有 | 完整 |
| 蒙版、图层、角度、对比 | 有 | 有 | 完整 |
| Seedance2 人脸编辑 | 有 | 有 | 完整；默认完整适配图片，滚轮缩放，放大后可用抓手平移，选择框/图层交互保持独立 |
| Seedance2 连贯/切片/批量工作流 | 有 | 有 | 完整 |
| 故事导演分阶段工作流 | 有 | 有 | 完整 |
| 故事 SSE 解析与批量占位 | 有 | 有 | 完整 |
| 资产库、版本选择和下载 | 有 | 有 | 完整 |
| 媒体持久化 | IndexedDB/localforage | `data/media/**` + SQLite 索引 | 完整并改为客户端本地文件；旧数据自动迁移 |
| WebDAV 同步 | 有 | 有 | 完整，改由 Go 代理 |
| OpenAI 兼容中转 API | 有 | 有 | 完整，改由 Go 代理 |
| 平台通道/平台账号池 | 有 | 不提供 | 按客户端需求移除，仅允许中转 API |
| 本地号池 | 有 | 不提供 | 按客户端需求移除 |
| 全局模型路由 | 文本输入 | 分类下拉 | 按文本、图片、视频、音频能力过滤中转模型 |
| 板块模型路由 | 文本输入 | 分类下拉 | 按板块能力类型过滤中转模型 |
| 画布助手输入区 | 有 | 有 | 窄侧栏下控件自动换行，无重叠、裁切或横向滚动条 |

## 本次 API 设置适配

客户端 API 与更新设置已收敛为“中转设置 / 模型路由设置 / 软件更新”三个顶部页签：

- 设置弹窗顶部提供“中转设置 / 模型路由设置 / 软件更新”三个页签；中转地址独立显示，模型路由、板块模型路由与高级选项统一归入模型路由页签，GitHub Releases 更新单独归入软件更新页签。
- 删除“平台通道 / 中转 API”模式切换，仅保留中转地址配置。
- 删除“本地号池”入口和运行时回退。
- 全局与板块模型路由均改为原生下拉菜单，不能再输入任意模型名。
- 下拉选项根据文本、图片、视频、音频能力过滤，只展示相应类型模型。
- 请求解析器只生成本地 Go 中转路由；没有有效中转配置时不会回退平台或号池。
- 旧持久化的 `platform` / `localPool` 路由会迁移为未选择供应商的 `relay` 路由，防止误用旧通道，并要求用户明确选择中转。

## GitHub Releases 客户端更新（2026-07-27）

- 固定从 `xshentx/Boundless-Studio` 的 `/releases/latest` 读取正式 Release，不依赖平台通道。
- SQLite 保存“启动时自动检测更新”开关；开启后每次客户端启动后台检查，检测与下载/安装相互独立。
- 设置页实时显示检查状态、当前/最新版本、Release 说明、资源名、下载百分比、已下载字节和总大小。
- Windows 更新资源支持便携 `BoundlessStudio.exe` 或内含该文件的 ZIP；主动排除 Setup/Installer、Linux、macOS、ARM64 资源。
- 下载仅接受 GitHub/GitHubusercontent HTTPS 地址及其受信任重定向，写入 `data/updates` 后验证 EXE 的 `MZ` 文件头。
- 独立隐藏更新辅助进程等待旧实例退出，备份并替换主程序，失败时恢复旧版并写入 `data/updates/update-error.txt`。
- 更新辅助模式在 Wails、托盘与单实例初始化前处理，不与主客户端争用单实例锁。

## 客户端数据目录与迁移（2026-07-27）

- 程序启动时在 EXE 同级创建 `data`、`data/media/images`、`videos`、`audio`、`files`。
- 对话、画布、设置、模型路由、认证、资产元数据和生成日志统一保存到 `data/canvas.db` 的 `app_state` 表。
- 图片、视频、音频与普通文件保存到 `data/media/**`，`media_files` 表保存索引、MIME、大小、访问时间和保留状态。
- 图片、视频和音频不再以浏览器 IndexedDB/localforage 作为正式客户端主存储；首次读取旧 Blob 时自动写入文件并移除旧副本。
- localStorage 中的画布、设置、主题、视图偏好等旧状态在首次 hydration 时自动迁移到 SQLite。
- `%AppData%\InfiniteCanvas\config.json` 只作为一次性旧中转配置来源，迁移目标为 `desktop:client_config`。
- 媒体 API 支持 Range、HEAD、覆盖、删除、touch/retained 更新和分类索引；视频可从本地文件分段播放。
- 画布修复会同时清理 SQLite 画布状态、本地媒体索引/文件和旧浏览器缓存，但保留桌面中转配置。
- Vite 单独开发且 Go API 不在线时保留浏览器存储回退；正式 Wails 客户端始终以 SQLite 和本地文件为主。
## 有意的客户端宿主适配

以下差异用于从 Next/Python 宿主切换到 Go/React 桌面客户端，或落实客户端专属需求；除列出的文件外，不改变画布业务功能或工作区组件样式：

1. `src/constants/common-env.ts`：共享请求基址改为桌面同源。
2. `src/services/api/ai-routing.ts`：AI 请求只解析到 Go 中转。
3. `src/compat/*`：替代 Next Navigation、Link、Image。
4. `src/App.tsx`：提供独立 SPA 路由入口。
5. `relay.go`：承接原浏览器服务端代理职责。
6. `src/host.css` 与 `public/fonts`：还原原宿主字体，不修改原 `globals.css`。
7. `src/app/canvas/home/page.tsx`：默认列表显示，提供列表/卡片切换并持久化偏好；中转设置、模型路由与软件更新合并到主页的单一“设置”按钮中，工具栏按“新建、导入、设置、维护、删除”顺序排列。
8. `src/app/canvas/components/canvas-project-card.tsx`：新增紧凑列表行，并将卡片改为更小的响应式尺寸；选择、打开、导出、重命名、删除能力全部保留。
9. `src/app/canvas/components/canvas-node.tsx`：修复旧图片地址先失败、持久化地址后恢复时缩略图不再重试的问题；正常图片节点样式不变。
10. `src/components/api-access-settings-dialog.tsx`：仅显示中转 API，移除平台通道和本地号池，使用分类模型下拉菜单，并加入独立的软件更新页签。
11. `src/stores/api-relay-config.ts`：默认及迁移后的模型路由统一为 `relay`，按能力归一化模型。
12. `src/stores/use-config-store.ts`：客户端固定使用本地 Go 中转模式，配置就绪检查要求有效中转。
13. `src/app/canvas/components/canvas-node-seedance2-face-edit-dialog.tsx`：人脸迁移图片默认完整适配编辑视口，提供滚轮缩放，放大后提供抓手平移；不改变原选择框、脸部层、网格及保存合成样式和能力。
14. `src/app/canvas/components/canvas-node-prompt-panel.tsx`：提示词输入框仅在自身仍可纵向滚动时消费滚轮，到达边界或内容无需滚动时将事件交回画布。
15. `src/app/canvas/components/canvas-assistant-panel.tsx`：底部工具控件改为窄侧栏内自动换行，移除横向滚动条；同时移除已迁往主页的手动设置入口。
16. `src/app/canvas/workspace/canvas-client-page.tsx`：节点选中状态不再关闭普通滚轮缩放，修复图片提示词窗口显示后滚轮退化为横向平移；画布顶部不再显示已迁往主页的设置按钮。

## Story Director dynamic text models (2026-07-27)

- The existing Ant Design dropdown dimensions, placement, and canvas panel styles are unchanged.
- Removed the fixed GPT/Gemini/dola option list. Choices now merge the current text route, enabled text relays, and configured text models.
- Model values are trimmed and deduplicated; the inherited model remains the first option.
- A saved model removed from Settings falls back safely to inheritance.
- UI presentation, metadata validation, request resolution, and relay selection use the same dynamic model set.
- The runtime selects the enabled relay that provides a custom story text model, so the requested model matches the dropdown selection.

Intentional adapter files added for this requirement:

- `src/app/canvas/components/canvas-story-director-panel.tsx`
- `src/app/canvas/utils/story-director-text-model.ts`
- `src/app/canvas/utils/story-director-text-model.mjs`
- `src/app/canvas/workspace/canvas-client-page.tsx`


## 图片缩略图恢复修复（2026-07-27）

- 根因：画布节点用旧 `blob:` 或远端地址首次加载失败后，错误占位分支会卸载 `<img>`；随后 IndexedDB/localforage 通过 `storageKey` 恢复并回写有效地址时，缩略图没有图片元素可重新加载，而详情弹窗直接使用恢复后的地址，所以仍能显示原图。
- 修复：有图片来源时始终保留缩略图元素；失败状态仅隐藏无效图像并保留原错误提示，地址恢复后浏览器会自动加载新来源，`onLoad` 再清除过期状态。
- 边界：只有当前来源仍无法加载时才继续显示“图片已过期，需重新上传”；真实缺失数据的提示没有被删除。
- 样式：成功加载时沿用原尺寸、裁切、圆角和节点布局，没有修改前端正常显示样式。
- 对比登记：`src/app/canvas/components/canvas-node.tsx` 作为本次明确修复文件加入比较脚本白名单，其余 76 个未改动画布文件仍逐字节一致。
## Seedance2 人脸迁移视图改进（2026-07-27）

- 打开编辑器后根据图片原始尺寸与当前编辑视口动态计算完整适配比例；初始比例不超过 100%，小图保持正常尺寸，不被强制放大。
- 缩放范围为 5%–160%；支持右侧滑块和鼠标滚轮双向缩放，“重置”恢复当前窗口对应的完整适配比例。
- 滚轮以鼠标所在图片位置作为缩放焦点；在图片外滚轮缩放时以图片中心为焦点，并使用非被动监听阻止外层画布同时滚动。
- 图片放大超出编辑区后可切换“抓手”，在图片区域按住左键拖动视口位置。
- 椭圆选择框、脸部迁移层和网格层继续独立处理拖动与八方向缩放，并阻止事件冒泡，不会误触发抓手平移。
- 缩放时保持当前观察中心，放大后仍可访问四周内容。
- 图片合成、脸部取样、白色源选区填充、网格绘制、撤销及“确认保存并替换原图”链路未改。
- 原有颜色、布局、图层样式和编辑器外观保持不变，仅在左侧原工具栏增加“抓手”按钮。
- 本次定制文件已加入源码比较白名单；其余 76 个未改动画布文件仍逐字节一致。

## 图片提示词滚轮与画布助手布局修复（2026-07-27）

- 根因一：工作区通过 `zoomOnWheel={!selectedNodeIds.size && !selectedConnectionId}` 在任何节点选中后关闭普通滚轮缩放，因此图片节点被点击并显示提示词窗口时，纵向滚轮落入水平平移分支。
- 根因二：提示词浮窗根节点无条件 `stopPropagation()`，即使文本框没有可滚动内容也阻断画布滚轮。
- 修复：节点选中后继续允许滚轮缩放；提示词文本框仅在对应方向仍有内部内容可滚动时拦截事件，顶部、底部和非滚动状态均交回画布。
- 助手布局：工具栏从单行横向滚动改为自动换行，模式按钮增加稳定内边距、禁止文字换行和收缩，保留提示词库、对话/生图、动态模型、图片设置和发送能力。
- 实页验证：图片节点选中且提示词窗口打开时，在提示词输入区执行滚轮，缩放值从 100% 变为 154%；助手工具区在 268px 可用宽度下 `clientWidth=scrollWidth=268px`，无横向溢出，子控件分行且矩形不重叠。
- 源码对比：76 个未改动画布文件逐字节一致，缺失 0、差异 0；13/13 字体及宿主视觉检查通过。

