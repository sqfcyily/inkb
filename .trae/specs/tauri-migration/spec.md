# Tauri Desktop Migration Spec

## Why
当前项目是一个基于 Node.js (Fastify) 和 React 的本地知识库/笔记应用。为了提供更好的桌面端原生体验、更低的资源占用，并摆脱对本地 Node.js 运行时的依赖，需要将项目重构为 Tauri 桌面应用。后端逻辑将使用 Rust 彻底重构，而前端的样式和核心功能保持完全一致。

## What Changes
- **框架迁移**：在 `apps/web` 中集成 Tauri (`src-tauri`)，将其打包为独立的桌面应用程序。
- **后端重构 (Rust)**：
  - 使用 `rusqlite` 替代 `better-sqlite3` 实现本地 SQLite 数据库（FTS5 全文搜索、元数据存储）。
  - 使用 `notify` 替代 `chokidar` 实现本地 Markdown 文件的监听。
  - 使用 `git2` 替代 `simple-git` 实现笔记仓库的 Git 同步。
  - 使用 `async-openai` 实现 AI 摘要与续写功能的流式输出。
  - 使用 Rust 生态的 PDF、DOCX、HTML 解析库（如 `pdf-extract`, `readability`）重构文件和 URL 导入功能。
- **前后端通信**：
  - 将原本基于 HTTP (Fastify) 的 `/api/*` 和 `/notes` 等接口，重构为 Tauri 的 IPC Commands (`#[tauri::command]`)，或者在 Rust 端内嵌一个轻量级 HTTP 服务（如 `axum`）以最大程度保持前端 `fetch` 逻辑不变。
- **移除**：废弃并移除 `apps/server` 目录及相关 Node.js 后端依赖。

## Impact
- Affected specs: 桌面端原生应用打包、本地文件读写权限、系统通知、剪贴板等。
- Affected code:
  - `apps/server/*` (将被废弃)
  - `apps/web/src-tauri/*` (新增)
  - `apps/web/src/api.ts` 或相关网络请求逻辑 (适配 Tauri IPC)
  - `package.json` 及 `pnpm-workspace.yaml` (依赖调整)

## ADDED Requirements
### Requirement: Tauri Desktop Integration
系统必须能作为原生桌面应用启动，独立管理其生命周期，无需终端启动后台服务。

#### Scenario: Application Launch
- **WHEN** 用户双击应用图标
- **THEN** Tauri 启动 Rust 后端进程（初始化数据库、加载配置、启动文件监听），随后加载 React 前端窗口，展示应用界面。

### Requirement: Rust Native Backend
后端必须使用纯 Rust 实现原有的全部业务逻辑，确保性能和内存安全。

## MODIFIED Requirements
### Requirement: API Communication
原有的前端 HTTP 请求需适配为 Tauri 原生通信。
**迁移方案**：前端通过 `@tauri-apps/api/core` 的 `invoke` 方法调用 Rust 侧的 commands，处理笔记的 CRUD、设置修改、文件上传与解析。

## REMOVED Requirements
### Requirement: Node.js Fastify Server
**Reason**: Tauri 采用 Rust 作为后端，不再需要 Node.js 运行时环境。
**Migration**: 删除 `apps/server`，将 `package.json` 中的启动脚本更新为 Tauri 的 `tauri dev` 和 `tauri build`。