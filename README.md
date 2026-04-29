# inkb

一个本地优先（local-first）的个人知识库与智能笔记工具：以 Markdown 文件作为长期可迁移的数据载体，提供类 macOS 的沉浸式编辑体验，并集成混合检索（全文 + 语义）与 AI 辅助能力。你可以把笔记目录作为普通 Git 仓库存入 GitHub，通过内置同步按钮或命令行 Git 在多台电脑/多终端之间同步使用，全程无需部署任何线上服务器。

## 使用场景

- 个人日常记录：日志、读书笔记、会议纪要、灵感随记
- 知识沉淀与检索：用搜索快速定位历史笔记，跨主题串联信息
- AI 辅助写作：对当前笔记做整理排版、总结、续写与问答
- 多设备/多终端协作：把笔记目录推送到 GitHub，在不同电脑克隆/拉取即可继续使用

## 功能概览

- 本地笔记：按分类组织，保存为本地 Markdown 文件
- 混合搜索：全文检索 + 语义检索组合，提高召回与准确度
- AI 能力：
  - AI 整理：对当前笔记进行整理与排版
  - AI 对话：纯对话（默认，不附带上下文）
  - 全局检索问答：基于全库检索结果进行问答
  - 当前文档问答：将当前笔记作为上下文附件，专注单文档精读/问答
- Git 同步：内置 Git 状态查看与一键同步（pull/rebase + push）

## 本地数据位置

- 笔记目录：`~/Documents/inkb/notes`
- 本地索引与配置：`~/.inkb/`
  - `index.sqlite`：元数据索引
  - `lancedb/`：向量索引
  - `secrets.json`：AI 配置（如 OpenAI Key 等）
  - `config.json`：Git 远程仓库配置等

## 快速开始

### 依赖

- Node.js（建议 18+）

### 安装

在项目根目录执行：

```bash
cd apps/server && npm install --no-audit --no-fund
cd ../web && npm install --no-audit --no-fund
```

### 开发运行

在项目根目录启动（同时运行本地 API 与 Web UI）：

```bash
npm run dev
```

### 构建与启动

```bash
npm run build
npm start
```

## GitHub 跨终端/跨设备同步（无需部署服务器）

你可以把 `~/Documents/inkb/notes` 当作一个普通 Git 仓库：

1. 在 GitHub 创建一个私有仓库（推荐私有，用于个人笔记）。
2. 在应用的 Git 设置里填写远程仓库地址（SSH 或 HTTPS）。
3. 点击同步按钮完成：
   - 本地变更自动提交
   - 拉取远端更新（rebase）
   - 推送到远端

在另一台设备上：

- 方式 A（推荐）：先克隆同一个 GitHub 仓库到本机的 `~/Documents/inkb/notes`（保持路径一致），再启动应用即可自动读取。
- 方式 B：在该设备启动应用后，在 Git 设置中填写同一个远程仓库地址，点击同步拉取。

提示：

- 如果你使用 HTTPS 远程地址，请使用 Git 凭据管理（系统 Keychain / credential helper），避免把 Token 明文写入仓库。
- 如果出现冲突，需要按提示在 `~/Documents/inkb/notes` 里手动解决后再同步。

## AI 配置

应用使用本地配置文件保存 AI 相关信息（位于 `~/.inkb/secrets.json`）。在设置页面填写 API Key 后即可使用 AI 整理与对话功能。

## 目录结构

- `apps/server`：本地 API 服务（Fastify），负责笔记索引、搜索、同步与 AI 接口
- `apps/web`：前端 Web UI

