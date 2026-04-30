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

### 5.1 数据一致性：文件系统 → SQLite/FTS → LanceDB

inkb 的“事实来源（source of truth）”是文件系统中的 Markdown 文件，其它索引层都是派生数据（derived data）。因此一致性策略的核心是：**允许索引延迟，但最终应可从文件系统完全重建**。

- **三层数据职责**
  - 文件系统：长期存储、可迁移、可 Git 同步（最终真相）
  - SQLite（notes_meta）：记录笔记 id/title/category/filePath/时间戳等元信息，支持列表与排序
  - SQLite FTS（notes_fts）：全文检索倒排索引
  - LanceDB（notes_vectors）：语义检索向量索引
- **一致性触发点（增量更新）**
  - `chokidar` 监听 `NOTES_DIR` 的 `add/change/unlink`，将事件映射为：
    - upsert：更新 meta/fts + 重新切分并写入向量
    - delete：删除 meta/fts + 删除向量（按 noteId 或 chunk id）
- **启动时一致性（补偿/自愈）**
  - 应在启动时执行一次“目录扫描 + 索引补偿”，对比文件系统与数据库中记录的 filePath/id：
    - 文件存在但无索引：补建
    - 索引存在但文件丢失：清理
  - 当 Git checkout/切分支后，应触发一次全量重扫（项目里已有“切换分支后强制重建索引”的行为）
- **设计取舍**
  - SQLite/FTS 适合做“强一致的列表/全文检索”；LanceDB 可以接受短暂不一致（向量更新有成本）
  - 所有索引都应能被安全删除并重建：遇到疑难一致性问题时提供“重建索引”按钮是最有效的工程兜底

### 5.2 Embeddings 策略：chunk / 归一化 / 重建 / 队列

- **chunk 粒度（为什么要切分）**
  - 语义检索不适合整篇笔记直接 embedding：向量会“平均化”导致检索弱
  - 以段落为边界的 chunk 通常更稳，既贴合语义单元，又避免切得太碎
- **chunk 大小（经验值）**
  - 以 token 估算：常见区间 200–800 tokens；你当前实现采用“按段落累积，接近 500 tokens”的思路（见 [index.ts](file:///workspace/apps/server/src/index.ts) 的 `chunkText`）
  - 太小：召回碎片化，回答容易缺上下文
  - 太大：召回不精确，embedding 成本上升
- **归一化与相似度度量**
  - 当前本地 embedding 使用 `normalize: true`（单位向量），适配余弦相似度/内积检索
  - 需要保证：写入 LanceDB 的向量维度固定（bge-small-zh-v1.5 为 512 维）
- **向量更新策略**
  - 朴素方案（你当前接近这个）：笔记变更时删除该 noteId 的所有旧 chunks 向量，再写入新向量
  - 优化方向：基于 chunk 哈希（内容 hash）做增量，避免整篇重算
- **重建索引（何时需要）**
  - embedding 模型变更（模型名、维度、normalize 策略）后必须全量重建
  - chunk 策略变更（maxTokens 等）后建议全量重建
  - LanceDB 损坏/不一致时，允许删除 `~/.inkb/lancedb` 后重建
- **向量更新队列（建议补强）**
  - 目的：避免 chokidar 高频 change 导致重复计算与并发写入
  - 推荐实现：
    - per-note 去抖（debounce 300–800ms）
    - per-note 串行（同一 noteId 永远只允许一个 embedding job 在跑）
    - 全局并发限制（例如同时最多 1–2 个 note 在计算 embedding）
    - 崩溃恢复：队列可重放（最简单是启动时重扫）

### 5.3 RAG 策略：全局检索 vs 当前文档上下文

你现在的产品已经分出了三种对话模式：纯对话（不注入上下文）、全局检索（RAG）、当前文档（全文上下文）。RAG 策略建议明确“检索范围”和“拼接裁剪”。

- **全局检索（RAG）适用场景**
  - 问题面向整个知识库：跨笔记的事实、概念、引用来源
  - 流程：query →（全文/语义混合）→ topK chunks → 拼 context → 调 LLM
- **当前文档上下文适用场景**
  - 精读/改写/总结/问“本文第 N 段在说什么”
  - 流程：直接把当前笔记全文作为上下文（不走向量检索），保证“语境完整”
- **提示词（Prompt）策略**
  - 全局检索：强调“只能基于 context 回答”，并要求引用来源（title/section/chunk）
  - 当前文档：强调“本文范围内回答”，并可要求输出结构化结果（要点/大纲/改写版本）
- **上下文裁剪（建议）**
  - 全局检索：限制 topK（如 3–8），并对每个 chunk 做长度上限（例如 1–2 段）
  - 当前文档：若未来出现超长笔记，再引入：
    - 先做“文档摘要/目录”再二次提问（map-reduce）
    - 或按用户问题对文档做局部检索（先在单文档内做 FTS）

### 5.4 发布策略：npm CLI vs Electron

- **npm CLI（当前路线）**
  - 优点：发布速度快、跨平台、易自动更新（npm install -g）
  - 缺点：用户需要 Node；首次安装会编译原生依赖（better-sqlite3/sharp 等）；对非开发用户不够“产品化”
  - 典型体积：不大，但安装时下载/编译依赖耗时不可忽略
- **Electron**
  - 优点：用户无需 Node；双击安装；体验最像原生应用；可做自动更新与系统集成（托盘、快捷键、文件协议）
  - 缺点：安装包体积大（带 Chromium）；签名/公证与多平台构建更复杂
  - 典型体积：100MB+ 起步（视平台与依赖）
- **推荐策略**
  - 先 npm CLI：快速触达开发者/极客用户，验证产品方向与功能闭环
  - 再 Electron：当功能稳定、面向更广泛用户时再产品化交付
