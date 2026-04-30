# 技术栈与实现要点（inkb）

本文用于整理 inkb 项目使用的主要技术与各模块的实现方式，便于沉淀为知识库文档与后续迭代参考。

## 1. 项目形态与架构

- Monorepo：根目录通过脚本同时管理前端与本地服务端（见 [package.json](file:///workspace/package.json)）
- 运行形态：本地 API 服务 + Web UI（由本地服务端托管静态文件，生产环境单进程启动）
- 发布形态（当前）：npm CLI 包 `@sqfcy/inkb`，全局安装后 `inkb` 命令启动本地服务（见 [server/package.json](file:///workspace/apps/server/package.json)）

## 2. 前端（apps/web）

### 2.1 技术栈

- React 19：UI 组件与状态管理（见 [web/package.json](file:///workspace/apps/web/package.json)）
- Vite 8：开发服务器与生产构建
- TypeScript：类型系统与构建（project references，见 [tsconfig.app.json](file:///workspace/apps/web/tsconfig.app.json)）
- Tailwind CSS 4：样式与主题（含 `@tailwindcss/typography`）
- lucide-react：图标库
- date-fns：日期处理

### 2.2 编辑器与内容能力

- BlockNote：富文本/块编辑器（`@blocknote/*`）
- CodeMirror：Markdown / 代码编辑相关能力（`@uiw/react-codemirror` + `@codemirror/*`）
- Mermaid：图表渲染（`mermaid`）
- Markdown 渲染：`react-markdown` + `remark-gfm`，用于 AI 输出等 Markdown 内容展示

### 2.3 国际化（i18n）

- 自定义 I18nProvider 与字典表：用于 UI 文案多语言切换（见 [i18n.ts](file:///workspace/apps/web/src/i18n.ts) 与 [I18nProvider.tsx](file:///workspace/apps/web/src/I18nProvider.tsx)）

## 3. 服务端（apps/server）

### 3.1 技术栈

- Node.js + TypeScript：服务端语言与构建（tsc 输出到 `dist/`，见 [server/tsconfig.json](file:///workspace/apps/server/tsconfig.json)）
- Fastify 5：HTTP API 框架（见 [index.ts](file:///workspace/apps/server/src/index.ts)）
- @fastify/cors：跨域（开发阶段前后端分离时需要）
- @fastify/multipart：上传处理
- @fastify/static：静态资源托管（托管前端构建产物 `public/`）

### 3.2 本地数据与存储

- 文件系统：笔记以 Markdown 文件形式存储在 `~/Documents/inkb/notes`
- SQLite：元数据索引与全文检索（FTS5）
  - 依赖：`better-sqlite3`
  - 用途：notes_meta（元信息）+ notes_fts（全文索引）
- 目录约定：`~/.inkb/` 存放索引与配置
  - `index.sqlite`：SQLite 数据库
  - `lancedb/`：向量索引目录
  - `secrets.json`：AI 配置（baseURL/apiKey/chatModel）
  - `config.json`：Git 远程仓库配置等

### 3.3 混合搜索（全文 + 语义）

- 全文检索：SQLite FTS5（适合精确关键字检索、冷启动快）
- 语义检索：LanceDB（`@lancedb/lancedb`）存储向量与相似度检索
  - 依赖：`apache-arrow`（列式数据/Arrow 生态）
- 文本切分：按段落 chunk，降低 embedding 成本并提升召回质量（见 [index.ts](file:///workspace/apps/server/src/index.ts) 的 chunk 逻辑）

### 3.4 AI 与向量生成（Embeddings）

- OpenAI SDK：对话/补全能力（`openai`）
- 本地 Embeddings：`@xenova/transformers`
  - 使用 `pipeline('feature-extraction', 'Xenova/bge-small-zh-v1.5', { quantized: true })`
  - 生成向量后写入 LanceDB

### 3.5 文档解析与导入

- gray-matter：解析 Markdown Front Matter
- pdf-parse：PDF 文本抽取
- mammoth：docx 转文本
- jsdom + @mozilla/readability：网页正文抽取（适合“剪藏/导入网页”场景）

### 3.6 文件监听与增量索引

- chokidar：监听笔记目录变动（新增/修改/删除）
- 用途：自动更新 SQLite 元数据/FTS 与 LanceDB 向量索引

### 3.7 Git 同步

- simple-git：封装 Git 操作
- 用途：初始化仓库、设置 remote、fetch/pull/rebase/push、跨设备同步

## 4. 构建、打包与发布

### 4.1 开发阶段

- 根目录一键启动：`npm run dev`（concurrently 同时启动 server + web）
- 服务端热重载：`tsx watch`
- 前端开发服务器：Vite dev server

### 4.2 生产构建（单进程托管）

- `apps/web`：`vite build` 输出 `apps/web/dist`
- `apps/server`：构建前将 web dist 复制到 `apps/server/public`，再 `tsc` 输出 `apps/server/dist`
  - 复制脚本：Node 跨平台脚本（见 [copy-web-dist.mjs](file:///workspace/apps/server/scripts/copy-web-dist.mjs)）

### 4.3 npm CLI 发布形态

- npm 包名：`@sqfcy/inkb`
- bin 命令：`inkb`
- CLI 参数：`--host/--port/--open/--help`（见 [index.ts](file:///workspace/apps/server/src/index.ts)）
- 发布内容：`dist/`（服务端编译产物）+ `public/`（前端静态文件）

## 5. 可进一步补充到知识库的主题建议

- 数据一致性：文件系统 → SQLite/FTS → LanceDB 的索引一致性策略
- Embeddings 策略：chunk 大小、归一化、重建索引、向量更新队列
- RAG 策略：全局检索 vs 当前文档上下文模式的提示词与裁剪
- 发布策略：npm CLI vs Electron 打包的权衡（体积、依赖、用户体验）

