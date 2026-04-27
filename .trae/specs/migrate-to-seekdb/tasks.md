# Tasks

- [x] Task 1: Add SeekDB dependencies and remove LanceDB.
  - [x] SubTask 1.1: `npm install seekdb @seekdb/default-embed` in `apps/server`.
  - [x] SubTask 1.2: Remove `vectordb` (LanceDB) dependency from `apps/server/package.json`.
- [x] Task 2: Refactor backend initialization and storage logic in `index.ts`.
  - [x] SubTask 2.1: Import `SeekdbClient` from `seekdb`.
  - [x] SubTask 2.2: Initialize the `SeekdbClient` in embedded mode pointing to a local database file (e.g., `./data/seekdb.db`).
  - [x] SubTask 2.3: Create or ensure a `notes_collection` exists using `client.createCollection` with default embedding function.
  - [x] SubTask 2.4: Update the `handleFileUpdate` function to insert/update documents into the SeekDB collection instead of SQLite FTS and LanceDB. Note: Extract text from markdown before inserting if necessary.
  - [x] SubTask 2.5: Update the `handleFileRemove` function to delete documents from the SeekDB collection by ID.
- [x] Task 3: Refactor search API endpoints in `index.ts`.
  - [x] SubTask 3.1: Update the `/api/search` endpoint to perform a query against the SeekDB collection using `collection.query()`.
  - [x] SubTask 3.2: Update the `/api/search/semantic` endpoint to also query the SeekDB collection (or merge them if SeekDB handles hybrid natively).
- [x] Task 4: Verify frontend RAG integration.
  - [x] SubTask 4.1: Ensure `RagChatPanel.tsx` correctly calls the updated search endpoints and parses the response format correctly (SeekDB query results typically return an object with `ids`, `distances`, `documents`, and `metadatas` arrays).

# Task Dependencies
- [Task 2] depends on [Task 1]
- [Task 3] depends on [Task 2]
- [Task 4] depends on [Task 3]