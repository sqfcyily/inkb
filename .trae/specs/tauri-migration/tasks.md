# Tasks

- [x] Task 1: 初始化 Tauri 项目环境
  - [x] SubTask 1.1: 在 `apps/web` 目录下运行 `pnpm tauri init`，生成 `src-tauri` 目录。
  - [x] SubTask 1.2: 配置 `tauri.conf.json`，设置 build 命令、dev 命令，并配置必要的应用权限（文件读写、网络等）。
  - [x] SubTask 1.3: 更新根目录和 web 目录的 `package.json`，添加 tauri 开发和构建脚本。

- [ ] Task 2: 搭建 Rust 后端基础架构与数据库
  - [ ] SubTask 2.1: 在 `Cargo.toml` 中添加依赖：`rusqlite`, `serde`, `tokio`, `tauri`, `gray_matter`, `notify` 等。
  - [ ] SubTask 2.2: 实现配置管理（读取/写入 DB_DIR 下的 `secrets.json` 和 `config.json`）。
  - [ ] SubTask 2.3: 初始化 SQLite 数据库连接，创建 `notes_meta` 表和 `notes_fts` 虚拟表，实现数据库迁移逻辑。

- [x] Task 3: 实现核心笔记 CRUD 与文件系统监听
  - [x] SubTask 3.1: 编写 Rust 侧的 Tauri Commands，用于获取类别、获取笔记列表、获取单条笔记、创建/更新/删除笔记。
  - [x] SubTask 3.2: 集成 `gray_matter` 解析 Markdown 的 Frontmatter。
  - [x] SubTask 3.3: 集成 `notify` 监听本地笔记目录，当文件新增、修改或删除时，同步更新 SQLite 数据库。

- [x] Task 4: 实现 Git 同步与版本控制
  - [x] SubTask 4.1: 引入 `git2` crate。
  - [x] SubTask 4.2: 实现仓库初始化、检测状态、添加 Remote 和 Branch 的功能。
  - [x] SubTask 4.3: 编写 Tauri Commands 处理 `sync` (Pull, Commit, Push) 和 `status` 获取逻辑。

- [x] Task 5: 实现外部文件/URL 导入解析
  - [x] SubTask 5.1: 实现 URL 抓取与 Readability 解析（提取正文）。
  - [x] SubTask 5.2: 实现本地文件上传解析（支持 PDF、Markdown 等文本提取）。
  - [x] SubTask 5.3: 实现便签 (Memo) 的快速保存 Command。

- [x] Task 6: 实现 AI 流式交互
  - [x] SubTask 6.1: 引入 `async-openai` 或使用 reqwest 直接调用 OpenAI API。
  - [x] SubTask 6.2: 实现 `/api/ai/summarize` 和 `/api/ai/completion` 的流式响应逻辑，并通过 Tauri Event 发送数据块到前端。

- [x] Task 7: 前端网络层适配
  - [x] SubTask 7.1: 修改前端的 API 请求工具代码，将原有的 `fetch` 替换为 `@tauri-apps/api/core` 的 `invoke`。
  - [x] SubTask 7.2: 适配流式接口（AI 摘要与续写），监听 Tauri 的事件通道接收流式数据。
  - [x] SubTask 7.3: 确保所有前端功能测试通过，UI 样式保持完全一致。

- [x] Task 8: 清理与最终构建
  - [x] SubTask 8.1: 删除 `apps/server` 目录及根目录下对 server 的引用。
  - [x] SubTask 8.2: 运行 `pnpm tauri build` 进行生产环境构建测试。

# Task Dependencies
- [Task 2] depends on [Task 1]
- [Task 3] depends on [Task 2]
- [Task 4] depends on [Task 2]
- [Task 5] depends on [Task 2]
- [Task 6] depends on [Task 2]
- [Task 7] depends on [Task 3], [Task 4], [Task 5], [Task 6]
- [Task 8] depends on [Task 7]