# Migrate to SeekDB Spec

## Why
目前系统使用了 SQLite FTS5 (用于全文检索) 和 LanceDB (用于向量检索) 的组合方案。这种分离的架构增加了系统的复杂性，且在未配置外部 Embedding 模型时，向量检索会失效。
OceanBase SeekDB 是一个 AI 原生搜索数据库，提供了类似 SQLite 的 Node.js 嵌入式体验。它内置了 Embedding 函数，能够将文本自动转换为向量，并且支持在一个引擎内同时进行向量搜索和关系型查询。
迁移到 SeekDB 可以简化架构，实现“开箱即用”的全本地混合检索体验，降低用户的配置门槛和维护成本。

## What Changes
- **BREAKING**: 移除 `vectordb` (LanceDB) 依赖及其相关的向量存储逻辑。
- 引入 `seekdb` 和 `@seekdb/default-embed` 依赖。
- 重构后端的存储和检索模块，使用 SeekDB 的嵌入式客户端 (`SeekdbClient`) 替代现有的 SQLite 和 LanceDB。
- 调整数据的初始化、插入、更新、删除逻辑，以适配 SeekDB 的 Collection API。
- 优化前端 RAG 组件的检索接口调用，使其对接 SeekDB 提供的统一混合检索或单一入口检索。

## Impact
- Affected specs: 本地知识库的存储与检索能力、RAG 对话的上下文获取。
- Affected code:
  - `apps/server/src/index.ts` (后端存储和 API 路由逻辑)
  - `apps/server/package.json` (依赖项)
  - `apps/web/src/RagChatPanel.tsx` (前端 RAG 检索调用逻辑可能需要微调)

## ADDED Requirements
### Requirement: Unified AI Search
The system SHALL use SeekDB as the primary storage and search engine for notes.

#### Scenario: Add Note
- **WHEN** user creates a new note
- **THEN** the system should store the note in a SeekDB collection, and SeekDB's built-in embedding function should automatically generate and store the corresponding vector.

#### Scenario: Search Note
- **WHEN** user performs a semantic search or hybrid search
- **THEN** the system should query the SeekDB collection using the query text, and SeekDB should return the most relevant documents based on its internal vector/hybrid search capabilities.

## REMOVED Requirements
### Requirement: Separate Vector Database (LanceDB)
**Reason**: To unify the storage and simplify the architecture with a single embedded AI database (SeekDB).
**Migration**: Existing LanceDB data will not be automatically migrated in this spec. The system will start fresh with SeekDB, or require a re-index of existing SQLite data into SeekDB upon first startup.