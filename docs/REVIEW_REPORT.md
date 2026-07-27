# 代码审查报告

审查日期：2026-07-27

## 审查范围

- Go/Wails 生命周期、资产嵌入、本地 SQLite/媒体数据层、HTTP 中继和配置迁移。
- React/Vite 独立入口、Next 兼容适配层与浏览器旧数据迁移。
- 原画布源码、共享依赖、字体和样式的提取完整性。
- 本地状态/媒体 API、SSE/流式响应、WebDAV 方法转发。
- 构建复现性、测试隔离、生产 SPA 路由与 EXE 冒烟。

## 已发现并修复的问题

### 1. 生产直达路由可能返回 404

**风险：高。** 原组件多处使用 `/canvas/home`、`/canvas/workspace` 和 `/canvas-repair` 直接跳转。嵌入式资产服务若按路径查找静态文件，会找不到对应文件。

**修复：** `RelayServer.Middleware` 对三条 SPA 页面路由回退到 `/`，同时保留 `/assets/*` 等真实资源路径，并增加 Go 测试。

### 2. 客户端宿主字体与 Ant Design 基线可能偏差

**风险：中。** Next Font 和根布局的 `antd/dist/reset.css` 在初始 Vite 入口中不存在，会导致字体宽度、换行和控件基线出现细微差异。

**修复：** 复制原构建 13 个 WOFF2 文件，复用原 `@font-face` 声明，恢复 Ant Reset 加载顺序和原画布 Shell 类。未改变既有画布视觉样式。

### 3. 残留 Next.js 运行时依赖

**风险：中。** 兼容层已经替代运行时 import，但保留 `next` 依赖会使项目不能被视为纯 React/Vite 客户端，并增加安装体积。

**修复：** 在 Vite 与 TypeScript 中同时映射 `next/navigation`、`next/link`、`next/image` 到 `src/compat/*`，从依赖与锁文件中移除 Next.js 运行时。

### 4. WebView 直接访问中转的跨域与流式缓冲

**风险：高。** WebView 直接请求第三方服务会受到 CORS 限制，流式响应也可能被缓冲。

**修复：** Go 使用 `httputil.ReverseProxy` 同源转发，删除不适合上游的浏览器来源和控制请求头，并设置 `FlushInterval=-1`。

### 5. 浏览器存储不满足客户端数据目录要求

**风险：高。** localStorage 和 IndexedDB/localforage 的实际位置由 WebView 管理，不能保证对话、设置和生成媒体随客户端位于程序目录，也不便备份和迁移。

**修复：** 新增 `datastore.go` 和 `desktop-storage.ts`。正式客户端把结构化状态写入 EXE 同级 `data/canvas.db`，媒体写入 `data/media/**`；旧浏览器数据与旧 `%AppData%\InfiniteCanvas\config.json` 仅作为自动迁移来源。

### 6. 媒体文件一致性、越界与视频分段读取

**风险：高。** 直接按请求键拼接文件路径可能造成目录越界；写入中断可能留下半文件；视频若不支持 Range 会影响播放与拖动。

**修复：** 媒体文件名使用摘要生成，相对路径进行根目录边界检查，采用临时文件后原子重命名；API 支持 HEAD/Range、覆盖、删除、索引以及 touch/retained 更新，并由 SQLite 事务维护文件索引。

### 7. Windows EXE 仍显示 Wails 默认图标

**风险：中。** 同一路径重建后，Windows Shell 可能继续显示旧 Wails W 图标；只检查源 ICO 或从 EXE 提取图标不足以证明资源管理器已经更新。

**修复：** 由 Wails 重新编译 `build/windows/icon.ico` 到最终 PE 资源，刷新 Shell 图标缓存，并保存资源管理器实机截图；当前 `BoundlessStudio.exe` 已显示蓝青紫无限符号。

### 8. 多实例与窗口关闭会中断后台任务

**风险：高。** 未限制实例会让多个客户端同时打开同一 SQLite 和本地中继；关闭窗口直接退出也会中断生成、轮询或保存。

**修复：** 使用 Wails `SingleInstanceLock` 和稳定 UUID；第二次启动唤醒首实例。系统托盘使用嵌入 ICO，关闭按钮只隐藏，托盘菜单负责显示、隐藏和显式退出；托盘消息循环固定在独立 OS 线程。

## 数据完整性审查

- SQLite 使用 WAL、`busy_timeout=5000`、单连接和 `synchronous=NORMAL`，降低 WebView 并发写入锁冲突。
- 状态值限制为 128 MiB，单媒体限制为 20 GiB；本地配置请求仍限制为 1 MiB。
- `canvas.db` 创建后设置为 `0600`；Windows 最终访问控制由 NTFS 和当前用户权限解释。
- `PRAGMA integrity_check` 在真实构建冒烟后返回 `ok`。
- 媒体文件写入、索引和删除均有测试；路径越界被拒绝。
- 清理画布数据时保留 `desktop:client_config`，避免修复操作清除客户端中转配置。
- `canvas.db-wal` 和 `canvas.db-shm` 是 SQLite WAL 的正常组成，不应在客户端运行或异常退出后手工删除。

## 安全审查

- 客户端中转地址只接受 `http` 或 `https`。
- 代理不会把 `x-local-relay-base-url` 或 `x-webdav-*` 控制头继续泄露给目标服务。
- Go HTTP 客户端设置 10 分钟超时，适配长耗时生成任务。
- WebDAV 目标由用户配置，属于明确的客户端外连能力。
- 媒体 API 只绑定客户端本地服务，存储键校验长度与控制字符，落盘路径不直接采用用户输入。

## 兼容性与剩余约束

1. 设置界面只提供中转与模型路由；Go 保留的平台路径转发仅用于兼容旧调用，不是可选的“平台账号池”模式。
2. Windows 客户端依赖系统 WebView2 Runtime。
3. 便携目录必须具有写权限，否则无法创建 `data`；部署到只读的系统目录时应使用 `INFINITE_CANVAS_DATA_DIR` 指向可写位置。
4. 前端独立 Vite 开发且 Go API 不在线时会回退浏览器存储，这是开发兜底；正式 Wails 客户端以 SQLite/文件为唯一主存储。
5. 禁止使用 `wails build -clean`，因为它会清理 `build/bin` 并可能删除用户 `data`；编译必须使用 `wails build -s` 并校验数据哈希。
6. 一个极小的用户 scope 值保留在 localStorage，用于异步 SQLite hydration 前同步确定数据作用域；对话、画布、设置和认证正文均存入 SQLite。

## 复核结论

- Go 测试 18/18、前端活动测试 54/54、TypeScript、前端生产构建和 `go vet` 全部通过。
- 76 个未改动画布文件逐字节一致，缺失 0、差异 0；13/13 字体一致，宿主视觉检查无问题。
- Wails Windows 客户端编译成功；真实启动、健康检查、SQLite 完整性、状态 API、媒体 API、Range 和旧数据迁移均通过。
- EXE 新图标、关闭隐藏到托盘、托盘显式退出和第二次启动唤醒首实例均已完成 Windows 实机验证。
- 未发现阻断发布的问题。客户端已满足 EXE 同级 `data`、SQLite 结构化数据、本地媒体文件以及旧数据自动迁移要求。
