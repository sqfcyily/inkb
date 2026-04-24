import Fastify from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import fs from 'fs/promises'
import fsSync from 'fs'
import path from 'path'
import os from 'os'
import { ulid } from 'ulid'
import matter from 'gray-matter'
import Database from 'better-sqlite3'
import chokidar from 'chokidar'
import OpenAI from 'openai'
import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'
import pdfParseMod from 'pdf-parse'
import { simpleGit, SimpleGit } from 'simple-git'
import * as lancedb from '@lancedb/lancedb'

const pdfParse = typeof pdfParseMod === 'function' ? pdfParseMod : (pdfParseMod as any).default;

const server = Fastify({ logger: true })

server.register(cors, {
  origin: (_origin, cb) => cb(null, true),
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  preflight: true,
  optionsSuccessStatus: 204
})

server.register(multipart)

const HOME_DIR = os.homedir()
const NOTES_DIR = path.join(HOME_DIR, 'Documents', 'inkb', 'notes')
const DB_DIR = path.join(HOME_DIR, '.inkb')
const SECRETS_FILE = path.join(DB_DIR, 'secrets.json')
const CONFIG_FILE = path.join(DB_DIR, 'config.json')
const NOTES_GIT_PATH = path.join(NOTES_DIR, '.git')

const hasNotesGitRepo = () => {
  try {
    return fsSync.existsSync(NOTES_GIT_PATH)
  } catch {
    return false
  }
}

let openai: OpenAI
let openaiEmbeddings: OpenAI | null
let secrets: {
  baseURL?: string
  apiKey?: string
  chatModel?: string
  embeddingBaseURL?: string
  embeddingApiKey?: string
  embeddingModel?: string
}
let config: { notesGitRemoteUrl?: string | null, notesGitBranch?: string }
let git: SimpleGit

const LANCE_DB_DIR = path.join(DB_DIR, 'lancedb')
let lanceConnection: lancedb.Connection
let notesTable: lancedb.Table

async function ensureNotesRepo(remoteUrl: string, branch: string) {
  const hasOwnRepo = hasNotesGitRepo()
  if (!hasOwnRepo) {
    await git.init()
  }

  const remotes = await git.getRemotes(true)
  const origin = remotes.find(r => r.name === 'origin')
  if (!origin) {
    await git.addRemote('origin', remoteUrl)
  } else if (origin.refs?.fetch && origin.refs.fetch !== remoteUrl) {
    await git.remote(['set-url', 'origin', remoteUrl])
  }

  await git.fetch('origin')

  const remoteHeads = await git.listRemote(['--heads', 'origin', branch])
  const hasRemoteBranch = remoteHeads.trim().length > 0

  if (!hasOwnRepo) {
    if (hasRemoteBranch) {
      await git.checkout(['-B', branch, `origin/${branch}`])
    } else {
      await git.checkout(['-B', branch])
    }
  } else {
    const status = await git.status()
    if (status.current !== branch) {
      const localBranches = await git.branchLocal()
      const hasLocalBranch = localBranches.all.includes(branch)
      if (hasLocalBranch) {
        await git.checkout(branch)
      } else if (hasRemoteBranch) {
        await git.checkout(['-b', branch, `origin/${branch}`])
      } else {
        await git.checkoutLocalBranch(branch)
      }
    }
  }

  try {
    db.exec(`
      ALTER TABLE notes_meta ADD COLUMN category TEXT DEFAULT 'Default';
    `)
  } catch (e) { }
  try {
    db.exec(`
      ALTER TABLE notes_meta ADD COLUMN filePath TEXT;
    `)
  } catch (e) { }

  // Force re-indexing of all files after checking out branch
  try {
    const files = await scanNotesDir(NOTES_DIR)
    for (const f of files) {
      await handleFileUpdate(f)
    }
  } catch (e) { }

  return { hasRemoteBranch }
}

async function scanNotesDir(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  let files: string[] = []
  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files = files.concat(await scanNotesDir(fullPath))
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(fullPath)
    }
  }
  return files
}

async function setupDependencies() {
  await fs.mkdir(NOTES_DIR, { recursive: true }).catch(() => { })
  await fs.mkdir(DB_DIR, { recursive: true }).catch(() => { })

  try {
    const data = await fs.readFile(SECRETS_FILE, 'utf-8')
    const raw = JSON.parse(data)
    secrets = {
      baseURL: raw?.baseURL,
      apiKey: raw?.apiKey,
      chatModel: raw?.chatModel,
      embeddingBaseURL: raw?.embeddingBaseURL,
      embeddingApiKey: raw?.embeddingApiKey,
      embeddingModel: raw?.embeddingModel
    }
  } catch {
    secrets = {
      baseURL: 'https://api.openai.com/v1',
      apiKey: '',
      chatModel: 'gpt-4o-mini',
      embeddingBaseURL: '',
      embeddingApiKey: '',
      embeddingModel: 'text-embedding-3-small'
    }
    await fs.writeFile(SECRETS_FILE, JSON.stringify(secrets, null, 2))
  }

  try {
    const data = await fs.readFile(CONFIG_FILE, 'utf-8')
    const raw = JSON.parse(data)
    config = {
      notesGitRemoteUrl: raw?.notesGitRemoteUrl ?? null,
      notesGitBranch: raw?.notesGitBranch || 'main'
    }
  } catch {
    config = { notesGitRemoteUrl: null, notesGitBranch: 'main' }
    await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2))
  }

  git = simpleGit(NOTES_DIR)
  if (config.notesGitRemoteUrl) {
    try {
      await ensureNotesRepo(config.notesGitRemoteUrl, config.notesGitBranch || 'main')
    } catch (err) {
      server.log.error(err)
    }
  }

  if (!secrets.chatModel) {
    secrets.chatModel = 'gpt-4o-mini'
  }
  if (!secrets.baseURL) {
    secrets.baseURL = 'https://api.openai.com/v1'
  }
  if (!secrets.embeddingModel) {
    secrets.embeddingModel = 'text-embedding-3-small'
  }

  openai = new OpenAI({
    baseURL: secrets.baseURL,
    apiKey: secrets.apiKey || 'dummy',
  })

  const embeddingApiKey = (secrets.embeddingApiKey || '').trim()
  if (embeddingApiKey) {
    openaiEmbeddings = new OpenAI({
      baseURL: (secrets.embeddingBaseURL || '').trim() || secrets.baseURL,
      apiKey: embeddingApiKey,
    })
  } else {
    openaiEmbeddings = null
  }
}

async function setupLanceDB() {
  await fs.mkdir(LANCE_DB_DIR, { recursive: true }).catch(() => { })
  lanceConnection = await lancedb.connect(LANCE_DB_DIR)
  const tableNames = await lanceConnection.tableNames()
  if (tableNames.includes('notes_vectors')) {
    notesTable = await lanceConnection.openTable('notes_vectors')
  } else {
    const dummyVector = Array(1536).fill(0)
    notesTable = await lanceConnection.createTable('notes_vectors', [
      { id: 'dummy', noteId: 'dummy', text: 'dummy', vector: dummyVector }
    ])
    await notesTable.delete("id = 'dummy'")
  }
}

// Database setup
try {
  fsSync.mkdirSync(NOTES_DIR, { recursive: true })
} catch (e) { }
try {
  fsSync.mkdirSync(DB_DIR, { recursive: true })
} catch (e) { }

const db = new Database(path.join(DB_DIR, 'index.sqlite'))

db.exec(`
  CREATE TABLE IF NOT EXISTS notes_meta (
    id TEXT PRIMARY KEY,
    title TEXT,
    updatedAt TEXT,
    createdAt TEXT
  );
  CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
    id UNINDEXED,
    title,
    content,
    tokenize='unicode61'
  );
`)

try {
  db.exec(`ALTER TABLE notes_meta ADD COLUMN category TEXT DEFAULT 'Default';`)
} catch (e) { }
try {
  db.exec(`ALTER TABLE notes_meta ADD COLUMN filePath TEXT;`)
} catch (e) { }

const insertMeta = db.prepare(`
  INSERT INTO notes_meta (id, title, updatedAt, createdAt, category, filePath)
  VALUES (@id, @title, @updatedAt, @createdAt, @category, @filePath)
  ON CONFLICT(id) DO UPDATE SET
    title = excluded.title,
    updatedAt = excluded.updatedAt,
    createdAt = excluded.createdAt,
    category = excluded.category,
    filePath = excluded.filePath
`)

const insertFts = db.prepare(`
  INSERT INTO notes_fts (id, title, content)
  VALUES (@id, @title, @content)
`)

const deleteFts = db.prepare(`DELETE FROM notes_fts WHERE id = ?`)
const deleteMeta = db.prepare(`DELETE FROM notes_meta WHERE id = ?`)

function chunkText(text: string, maxTokens = 500) {
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim())
  const chunks: string[] = []
  let currentChunk = ''

  for (const p of paragraphs) {
    if ((currentChunk + p).length > maxTokens * 4) {
      if (currentChunk) chunks.push(currentChunk)
      currentChunk = p
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + p
    }
  }
  if (currentChunk) chunks.push(currentChunk)
  return chunks.length > 0 ? chunks : [text.trim()].filter(Boolean)
}

async function getEmbeddings(texts: string[]): Promise<number[][]> {
  if (!openaiEmbeddings) {
    throw new Error('Embeddings not configured')
  }

  const vectors: number[][] = []
  for (let i = 0; i < texts.length; i += 100) {
    const batch = texts.slice(i, i + 100)
    const response = await openaiEmbeddings.embeddings.create({
      model: secrets.embeddingModel || 'text-embedding-3-small',
      input: batch,
    })
    for (const data of response.data) {
      vectors.push(data.embedding)
    }
  }
  return vectors
}

server.get('/api/settings', async () => {
  const embeddingApiKey = (secrets.embeddingApiKey || '').trim()
  const embeddingsEnabled = !!embeddingApiKey
  const embeddingBaseURL = embeddingsEnabled
    ? ((secrets.embeddingBaseURL || '').trim() || secrets.baseURL || '')
    : ''
  const embeddingModel = embeddingsEnabled ? (secrets.embeddingModel || 'text-embedding-3-small') : ''

  return {
    baseURL: secrets.baseURL || '',
    chatModel: secrets.chatModel || 'gpt-4o-mini',
    hasApiKey: !!(secrets.apiKey && secrets.apiKey !== 'dummy'),
    embeddingBaseURL,
    embeddingModel,
    hasEmbeddingApiKey: embeddingsEnabled
  }
})

server.put('/api/settings', async (request, reply) => {
  const body = request.body as {
    baseURL?: string
    apiKey?: string
    chatModel?: string
    embeddingBaseURL?: string
    embeddingApiKey?: string
    embeddingModel?: string
  }

  const next: typeof secrets = {
    baseURL: body.baseURL !== undefined ? body.baseURL : secrets.baseURL,
    chatModel: body.chatModel !== undefined ? body.chatModel : secrets.chatModel,
    apiKey: body.apiKey !== undefined ? body.apiKey : secrets.apiKey,
    embeddingBaseURL: body.embeddingBaseURL !== undefined ? body.embeddingBaseURL : secrets.embeddingBaseURL,
    embeddingModel: body.embeddingModel !== undefined ? body.embeddingModel : secrets.embeddingModel,
    embeddingApiKey: body.embeddingApiKey !== undefined ? body.embeddingApiKey : secrets.embeddingApiKey,
  }

  secrets = next
  if (!secrets.chatModel) {
    secrets.chatModel = 'gpt-4o-mini'
  }
  if (!secrets.baseURL) {
    secrets.baseURL = 'https://api.openai.com/v1'
  }
  if (!secrets.embeddingModel) {
    secrets.embeddingModel = 'text-embedding-3-small'
  }

  await fs.mkdir(DB_DIR, { recursive: true }).catch(() => { })
  await fs.writeFile(SECRETS_FILE, JSON.stringify(secrets, null, 2), 'utf-8')

  openai = new OpenAI({
    baseURL: secrets.baseURL || 'https://api.openai.com/v1',
    apiKey: secrets.apiKey || 'dummy'
  })

  const embeddingApiKey = (secrets.embeddingApiKey || '').trim()
  if (embeddingApiKey) {
    openaiEmbeddings = new OpenAI({
      baseURL: (secrets.embeddingBaseURL || '').trim() || secrets.baseURL || 'https://api.openai.com/v1',
      apiKey: embeddingApiKey
    })
  } else {
    openaiEmbeddings = null
  }

  const embeddingsEnabled = !!embeddingApiKey
  const embeddingBaseURL = embeddingsEnabled
    ? ((secrets.embeddingBaseURL || '').trim() || secrets.baseURL || '')
    : ''
  const embeddingModel = embeddingsEnabled ? (secrets.embeddingModel || 'text-embedding-3-small') : ''

  return reply.send({
    baseURL: secrets.baseURL || '',
    chatModel: secrets.chatModel || 'gpt-4o-mini',
    hasApiKey: !!(secrets.apiKey && secrets.apiKey !== 'dummy'),
    embeddingBaseURL,
    embeddingModel,
    hasEmbeddingApiKey: embeddingsEnabled
  })
})

server.post('/api/settings/test', async (request, reply) => {
  const body = request.body as { baseURL?: string, apiKey?: string, chatModel?: string } | undefined

  const baseURL = body?.baseURL ?? secrets.baseURL ?? 'https://api.openai.com/v1'
  const apiKey = body?.apiKey ?? secrets.apiKey ?? ''
  const chatModel = body?.chatModel ?? secrets.chatModel ?? 'gpt-4o-mini'

  if (!apiKey) {
    return reply.code(400).send({ ok: false, error: 'apiKey 为空' })
  }

  const client = new OpenAI({ baseURL, apiKey })

  try {
    await client.chat.completions.create({
      model: chatModel,
      messages: [{ role: 'user', content: 'hello' }],
      max_tokens: 8,
      temperature: 0
    })
  } catch (err: any) {
    return reply.code(500).send({ ok: false, error: err?.message || 'Chat 测试失败' })
  }

  return { ok: true }
})

server.post('/api/settings/test-embedding', async (request, reply) => {
  const body = request.body as { embeddingBaseURL?: string, embeddingApiKey?: string, embeddingModel?: string } | undefined

  const embeddingBaseURL =
    (body?.embeddingBaseURL ?? secrets.embeddingBaseURL ?? '').trim() ||
    (secrets.baseURL ?? 'https://api.openai.com/v1')
  const embeddingApiKey = (body?.embeddingApiKey ?? secrets.embeddingApiKey ?? '').trim()
  const embeddingModel = (body?.embeddingModel ?? secrets.embeddingModel ?? 'text-embedding-3-small').trim() || 'text-embedding-3-small'

  if (!embeddingApiKey) {
    return reply.code(400).send({ ok: false, error: 'embeddingApiKey 为空' })
  }

  const client = new OpenAI({ baseURL: embeddingBaseURL, apiKey: embeddingApiKey })

  try {
    await client.embeddings.create({
      model: embeddingModel,
      input: ['hello']
    })
  } catch (err: any) {
    return reply.code(500).send({ ok: false, error: err?.message || 'Embedding 测试失败' })
  }

  return { ok: true }
})

server.get('/api/git/config', async () => {
  return {
    notesGitRemoteUrl: config?.notesGitRemoteUrl ?? null,
    notesGitBranch: config?.notesGitBranch || 'main'
  }
})

server.put('/api/git/config', async (request, reply) => {
  const body = request.body as { notesGitRemoteUrl?: string | null, notesGitBranch?: string }

  const remoteUrl = (body.notesGitRemoteUrl ?? null)
  const branch = (body.notesGitBranch || 'main').trim() || 'main'

  config = {
    notesGitRemoteUrl: (typeof remoteUrl === 'string' ? remoteUrl.trim() : null) || null,
    notesGitBranch: branch
  }

  await fs.mkdir(DB_DIR, { recursive: true }).catch(() => { })
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8')

  return reply.send({
    notesGitRemoteUrl: config.notesGitRemoteUrl,
    notesGitBranch: config.notesGitBranch
  })
})

const handleFileUpdate = async (filePath: string) => {
  if (!filePath.endsWith('.md')) return
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    const parsed = matter(content)
    const id = parsed.data.id || path.basename(filePath, '.md')
    const title = parsed.data.title || 'Untitled'

    // Check if meta data already exists, if not use current time
    let updatedAt = parsed.data.updatedAt
    let createdAt = parsed.data.createdAt

    if (!updatedAt || !createdAt) {
      try {
        const stats = await fs.stat(filePath)
        updatedAt = updatedAt || stats.mtime.toISOString()
        createdAt = createdAt || stats.birthtime.toISOString()
      } catch {
        const now = new Date().toISOString()
        updatedAt = updatedAt || now
        createdAt = createdAt || now
      }
    }

    const relPath = path.relative(NOTES_DIR, filePath).replace(/\\/g, '/')
    const dir = path.dirname(relPath)
    const category = dir === '.' ? 'Default' : dir.split('/')[0]

    db.transaction(() => {
      insertMeta.run({ id, title, updatedAt, createdAt, category, filePath: relPath })
      deleteFts.run(id)
      insertFts.run({ id, title, content: parsed.content })
    })()

    if (notesTable && openaiEmbeddings) {
      try {
        await notesTable.delete(`noteId = '${id}'`).catch(() => {})
        
        const chunks = chunkText(parsed.content)
        if (chunks.length > 0) {
          const vectors = await getEmbeddings(chunks)
          const rows = chunks.map((chunk, i) => ({
            id: `${id}_${i}`,
            noteId: id,
            text: chunk,
            vector: vectors[i]
          }))
          await notesTable.add(rows)
        }
      } catch (err) {
        console.error(`Failed to vectorize file ${filePath}:`, err)
      }
    }
  } catch (err) {
    console.error(`Failed to process file ${filePath}:`, err)
  }
}

const handleFileRemove = async (filePath: string) => {
  if (!filePath.endsWith('.md')) return
  const id = path.basename(filePath, '.md')
  db.transaction(() => {
    deleteMeta.run(id)
    deleteFts.run(id)
  })()

  try {
    if (notesTable) {
      await notesTable.delete(`noteId = '${id}'`).catch(() => {})
    }
  } catch (err) {
    console.error(`Failed to delete vectors for file ${filePath}:`, err)
  }
}

server.get('/api/search', async (request, reply) => {
  const query = request.query as { q?: string }
  const q = query.q || ''

  if (!q) {
    return []
  }

  try {
    const searchStmt = db.prepare(`
      SELECT id, title, snippet(notes_fts, -1, '<mark>', '</mark>', '...', 64) as snippet, rank
      FROM notes_fts
      WHERE notes_fts MATCH @q
      ORDER BY rank
      LIMIT 50
    `)
    let matchQuery = q
    if (!matchQuery.includes('"') && !matchQuery.includes('*')) {
      matchQuery = q.split(/\s+/).filter(Boolean).map(term => `"${term}"*`).join(' AND ')
    }
    return searchStmt.all({ q: matchQuery })
  } catch (err) {
    server.log.error(err)
    return []
  }
})

server.get('/api/search/semantic', async (request, reply) => {
  const query = request.query as { q?: string, limit?: string }
  const q = query.q || ''
  const limit = parseInt(query.limit || '5', 10)

  if (!q) {
    return []
  }

  if (!notesTable || !openaiEmbeddings) {
    return reply.code(400).send({ error: 'Vector search not configured' })
  }

  try {
    const vectors = await getEmbeddings([q])
    const queryVector = vectors[0]

    const results = await notesTable
      .search(queryVector)
      .limit(limit)
      .toArray()

    const formattedResults = results.map(r => {
      const meta = db.prepare('SELECT title, filePath FROM notes_meta WHERE id = ?').get(r.noteId) as any
      return {
        id: r.id,
        noteId: r.noteId,
        title: meta ? meta.title : 'Unknown',
        filePath: meta ? meta.filePath : '',
        text: r.text,
        score: r._distance
      }
    })

    return formattedResults
  } catch (err: any) {
    server.log.error(err)
    return reply.code(500).send({ error: err.message || 'Failed to perform semantic search' })
  }
})

server.post('/api/ingest/url', async (request, reply) => {
  const { url } = request.body as { url: string };
  try {
    const res = await fetch(url);
    const html = await res.text();
    const doc = new JSDOM(html, { url });
    const reader = new Readability(doc.window.document);
    const article = reader.parse();

    const title = article?.title || url;
    const textContent = article?.textContent || '';

    const id = ulid();
    const now = new Date().toISOString();
    const data = { id, title, createdAt: now, updatedAt: now, source: url };

    const fileContent = matter.stringify(textContent, data);
    const category = 'Default'
    const relPath = path.join(category === 'Default' ? '' : category, `${id}.md`).replace(/\\/g, '/')
    const filePath = path.join(NOTES_DIR, relPath);

    if (category !== 'Default') {
      await fs.mkdir(path.join(NOTES_DIR, category), { recursive: true }).catch(() => { })
    }

    await fs.writeFile(filePath, fileContent, 'utf-8');
    
    return { id, title };
  } catch (err) {
    return reply.code(500).send({ error: 'Failed to ingest URL' });
  }
});

server.post('/api/ingest/file', async (request, reply) => {
  const data = await request.file();
  if (!data) return reply.code(400).send({ error: 'No file uploaded' });

  try {
    const buffer = await data.toBuffer();
    const filename = data.filename || 'Document';
    const ext = path.extname(filename).toLowerCase();

    let textContent = '';

    if (ext === '.pdf') {
      const parsedPdf = await pdfParse(buffer);
      textContent = parsedPdf.text;
    } else if (ext === '.doc' || ext === '.docx') {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      textContent = result.value;
    } else if (ext === '.txt' || ext === '.md') {
      textContent = buffer.toString('utf-8');
    } else {
      return reply.code(400).send({ error: 'Unsupported file format' });
    }

    const title = filename;

    const id = ulid();
    const now = new Date().toISOString();
    const meta = { id, title, createdAt: now, updatedAt: now, type: 'file', sourceRef: filename };

    const fileContent = matter.stringify(textContent, meta);
    const category = 'Default'
    const relPath = path.join(category === 'Default' ? '' : category, `${id}.md`).replace(/\\/g, '/')
    const filePath = path.join(NOTES_DIR, relPath);

    if (category !== 'Default') {
      await fs.mkdir(path.join(NOTES_DIR, category), { recursive: true }).catch(() => { })
    }

    await fs.writeFile(filePath, fileContent, 'utf-8');
    
    return { id, title };
  } catch (err) {
    console.error(err);
    return reply.code(500).send({ error: 'Failed to ingest file' });
  }
});

server.post('/api/ingest/memo', async (request, reply) => {
  const { content } = request.body as { content: string };
  if (!content) return reply.code(400).send({ error: 'No content provided' });

  const title = content.substring(0, 50).trim() + (content.length > 50 ? '...' : '');
  const id = ulid();
  const now = new Date().toISOString();
  const data = { id, title, createdAt: now, updatedAt: now, type: 'memo' };

  const fileContent = matter.stringify(content, data)
  const category = 'Default'
  const relPath = path.join(category === 'Default' ? '' : category, `${id}.md`).replace(/\\/g, '/')
  const filePath = path.join(NOTES_DIR, relPath)

  if (category !== 'Default') {
    await fs.mkdir(path.join(NOTES_DIR, category), { recursive: true }).catch(() => { })
  }

  await fs.writeFile(filePath, fileContent, 'utf-8');
  
  return { id, title };
});

server.post('/api/ai/summarize', async (request, reply) => {
  const { id } = request.body as { id: string };
  if (!id) return reply.code(400).send({ error: 'No note ID provided' });

  try {
    const row = db.prepare('SELECT filePath FROM notes_meta WHERE id = ?').get(id) as any
    if (!row) return reply.code(404).send({ error: 'Note not found' })
    const filePath = path.join(NOTES_DIR, row.filePath)
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = matter(content);

    if (!secrets.apiKey || secrets.apiKey === 'dummy') {
      return reply.code(400).send({ error: 'API Key not configured' });
    }

    const prompt = `你是一个专业的编辑和知识库助手。请对原文进行重构：修复拼写错误、改善语言清晰度、优化段落排版（保持 Markdown 格式，不要添加任何多余的说明）。
需要处理的原文如下：
${parsed.content.substring(0, 15000)}`;

    const stream = await openai.chat.completions.create({
      model: secrets.chatModel || "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      stream: true,
    });

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    // Explicitly handle CORS for the raw stream response since we are bypassing fastify's normal reply lifecycle
    const origin = request.headers.origin || '*';
    reply.raw.setHeader('Access-Control-Allow-Origin', origin);
    reply.raw.setHeader('Access-Control-Allow-Credentials', 'true');
    reply.raw.flushHeaders();

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        reply.raw.write(`data: ${JSON.stringify({ text: content })}\n\n`);
      }
    }
    reply.raw.write('data: [DONE]\n\n');
    reply.raw.end();
  } catch (err: any) {
    console.error(err);
    if (!reply.raw.headersSent) {
      return reply.code(500).send({ error: err.message || 'Failed to generate AI summary' });
    } else {
      reply.raw.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      reply.raw.end();
    }
  }
});

server.post('/api/ai/completion', async (request, reply) => {
  const { prompt } = request.body as { prompt: string };
  if (!prompt) return reply.code(400).send({ error: 'No prompt provided' });

  if (!secrets.apiKey || secrets.apiKey === 'dummy') {
    return reply.code(400).send({ error: 'API Key not configured' });
  }

  try {
    const stream = await openai.chat.completions.create({
      model: secrets.chatModel || "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are an AI writing assistant. Continue or modify the text as requested by the user." },
        { role: "user", content: prompt }
      ],
      stream: true,
    });

    reply.raw.setHeader('Content-Type', 'text/plain; charset=utf-8');
    reply.raw.setHeader('Transfer-Encoding', 'chunked');
    const origin = request.headers.origin || '*';
    reply.raw.setHeader('Access-Control-Allow-Origin', origin);
    reply.raw.setHeader('Access-Control-Allow-Credentials', 'true');
    reply.raw.flushHeaders();

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        reply.raw.write(content);
      }
    }
    reply.raw.end();
  } catch (err: any) {
    console.error(err);
    if (!reply.raw.headersSent) {
      return reply.code(500).send({ error: err.message || 'Failed to generate AI completion' });
    } else {
      reply.raw.end();
    }
  }
});

server.post('/api/ai/chat', async (request, reply) => {
  const { messages } = request.body as { messages: any[] };
  if (!messages || !Array.isArray(messages)) return reply.code(400).send({ error: 'Invalid messages' });

  if (!secrets.apiKey || secrets.apiKey === 'dummy') {
    return reply.code(400).send({ error: 'API Key not configured' });
  }

  try {
    const stream = await openai.chat.completions.create({
      model: secrets.chatModel || "gpt-4o-mini",
      messages,
      stream: true,
    });

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    const origin = request.headers.origin || '*';
    reply.raw.setHeader('Access-Control-Allow-Origin', origin);
    reply.raw.setHeader('Access-Control-Allow-Credentials', 'true');
    reply.raw.flushHeaders();

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        reply.raw.write(`data: ${JSON.stringify({ text: content })}\n\n`);
      }
    }
    reply.raw.write('data: [DONE]\n\n');
    reply.raw.end();
  } catch (err: any) {
    console.error(err);
    if (!reply.raw.headersSent) {
      return reply.code(500).send({ error: err.message || 'Failed to generate AI response' });
    } else {
      reply.raw.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      reply.raw.end();
    }
  }
});

server.get('/categories', async (request, reply) => {
  try {
    const rows = db.prepare('SELECT DISTINCT category FROM notes_meta WHERE category IS NOT NULL ORDER BY category').all() as any[]
    const categories = rows.map(r => r.category)
    if (!categories.includes('Default')) {
      categories.unshift('Default')
    }
    return categories
  } catch (err) {
    server.log.error(err)
    return ['Default']
  }
})

server.put('/categories/:oldName', async (request, reply) => {
  const { oldName } = request.params as { oldName: string }
  const { newName } = request.body as { newName: string }
  if (!newName || newName === oldName) return { success: true }

  const oldFolder = oldName === 'Default' ? '' : oldName
  const newFolder = newName === 'Default' ? '' : newName

  try {
    if (oldFolder === '') {
      // Move all files from root to newFolder
      const files = await fs.readdir(NOTES_DIR)
      await fs.mkdir(path.join(NOTES_DIR, newFolder), { recursive: true }).catch(() => { })
      for (const f of files) {
        if (f.endsWith('.md')) {
          await fs.rename(path.join(NOTES_DIR, f), path.join(NOTES_DIR, newFolder, f))
        }
      }
    } else if (newFolder === '') {
      // Move all files from oldFolder to root
      const folderPath = path.join(NOTES_DIR, oldFolder)
      const files = await fs.readdir(folderPath).catch(() => [])
      for (const f of files) {
        if (f.endsWith('.md')) {
          await fs.rename(path.join(folderPath, f), path.join(NOTES_DIR, f))
        }
      }
      await fs.rmdir(folderPath).catch(() => { })
    } else {
      // Rename folder
      await fs.rename(path.join(NOTES_DIR, oldFolder), path.join(NOTES_DIR, newFolder))
    }

    // Update DB directly to avoid waiting for chokidar
    db.prepare('UPDATE notes_meta SET category = ?, filePath = replace(filePath, ?, ?) WHERE category = ?').run(
      newName,
      oldFolder ? oldFolder + '/' : '',
      newFolder ? newFolder + '/' : '',
      oldName
    )

    return { success: true }
  } catch (err: any) {
    server.log.error(err)
    return reply.code(500).send({ error: 'Failed to rename category' })
  }
})

server.delete('/categories/:name', async (request, reply) => {
  const { name } = request.params as { name: string }
  if (name === 'Default') {
    return reply.code(400).send({ error: 'Cannot delete Default category' })
  }
  const count = (db.prepare('SELECT COUNT(*) as cnt FROM notes_meta WHERE category = ?').get(name) as any)?.cnt ?? 0
  if (count > 0) {
    return reply.code(409).send({ error: 'Category is not empty' })
  }
  try {
    const folderPath = path.join(NOTES_DIR, name)
    await fs.rmdir(folderPath).catch(() => { })
    return { success: true }
  } catch (err: any) {
    server.log.error(err)
    return reply.code(500).send({ error: 'Failed to delete category' })
  }
})

server.get('/notes', async (request, reply) => {
  try {
    const stmt = db.prepare(`SELECT id, title, updatedAt, createdAt, category FROM notes_meta ORDER BY updatedAt DESC`)
    return stmt.all()
  } catch (err) {
    server.log.error(err)
    return []
  }
})

server.get('/notes/:id', async (request, reply) => {
  const { id } = request.params as { id: string }
  try {
    const row = db.prepare('SELECT filePath FROM notes_meta WHERE id = ?').get(id) as any
    if (!row) return reply.code(404).send({ error: 'Note not found' })

    const filePath = path.join(NOTES_DIR, row.filePath)
    const content = await fs.readFile(filePath, 'utf-8')
    const parsed = matter(content)
    return {
      id: parsed.data.id,
      title: parsed.data.title,
      content: parsed.content,
      updatedAt: parsed.data.updatedAt,
      createdAt: parsed.data.createdAt,
      category: parsed.data.category || row.category
    }
  } catch (err) {
    reply.code(404).send({ error: 'Note not found' })
  }
})

server.post('/notes', async (request, reply) => {
  const body = request.body as { category?: string } || {}
  const id = ulid()
  const title = 'New Note'
  const content = ''
  const now = new Date().toISOString()
  const category = body.category || 'Default'
  const folder = category === 'Default' ? '' : category

  const data = {
    id,
    title,
    createdAt: now,
    updatedAt: now,
    category
  }

  const fileContent = matter.stringify(content, data)
  const relPath = path.join(folder, `${id}.md`).replace(/\\/g, '/')
  const filePath = path.join(NOTES_DIR, relPath)

  if (folder) {
    await fs.mkdir(path.join(NOTES_DIR, folder), { recursive: true }).catch(() => { })
  }
  await fs.writeFile(filePath, fileContent, 'utf-8')
  
  return { id, title, content, createdAt: now, updatedAt: now, category }
})

server.put('/notes/:id', async (request, reply) => {
  const { id } = request.params as { id: string }
  const body = request.body as { title?: string; content?: string; category?: string }

  try {
    const row = db.prepare('SELECT filePath, category FROM notes_meta WHERE id = ?').get(id) as any
    if (!row) return reply.code(404).send({ error: 'Note not found' })

    let filePath = path.join(NOTES_DIR, row.filePath)
    const existingContent = await fs.readFile(filePath, 'utf-8')
    const parsed = matter(existingContent)

    const newContent = body.content !== undefined ? body.content : parsed.content
    const newTitle = body.title !== undefined ? body.title : parsed.data.title
    const newCategory = body.category !== undefined ? body.category : (parsed.data.category || row.category || 'Default')

    if (newTitle === parsed.data.title && newContent === parsed.content && newCategory === (parsed.data.category || row.category || 'Default')) {
      return {
        id: parsed.data.id || id,
        title: parsed.data.title,
        content: parsed.content,
        createdAt: parsed.data.createdAt,
        updatedAt: parsed.data.updatedAt,
        category: newCategory
      }
    }

    const now = new Date().toISOString()

    const data = {
      ...parsed.data,
      title: newTitle,
      updatedAt: now,
      category: newCategory
    }

    const fileContent = matter.stringify(newContent, data)

    // If category changed, we need to move the file
    if (newCategory !== (row.category || 'Default')) {
      const folder = newCategory === 'Default' ? '' : newCategory
      if (folder) {
        await fs.mkdir(path.join(NOTES_DIR, folder), { recursive: true }).catch(() => { })
      }
      const newRelPath = path.join(folder, `${id}.md`).replace(/\\/g, '/')
      const newFilePath = path.join(NOTES_DIR, newRelPath)
      await fs.rename(filePath, newFilePath)
      filePath = newFilePath
    }

    await fs.writeFile(filePath, fileContent, 'utf-8')
    
    return {
      id: parsed.data.id || id,
      title: data.title,
      content: newContent,
      createdAt: parsed.data.createdAt || now,
      updatedAt: now,
      category: newCategory
    }
  } catch (err) {
    reply.code(404).send({ error: 'Note not found' })
  }
})

server.delete('/notes/:id', async (request, reply) => {
  const { id } = request.params as { id: string }
  try {
    const row = db.prepare('SELECT filePath FROM notes_meta WHERE id = ?').get(id) as any
    if (row) {
      const filePath = path.join(NOTES_DIR, row.filePath)
      await fs.unlink(filePath)
    }
    return { success: true }
  } catch (err) {
    reply.code(404).send({ error: 'Note not found' })
  }
})

server.get('/api/git/status', async (request, reply) => {
  try {
    const isRepo = hasNotesGitRepo()
    if (!isRepo) {
      return {
        isRepo: false,
        dirtyCount: 0,
        hasConflicts: false,
        conflicted: [],
        ahead: 0,
        behind: 0,
        current: null,
        tracking: null
      }
    }

    const status = await git.status()
    // Exclude .git directory itself from dirty calculation just in case
    const isDirtyFile = (f: string) => !f.startsWith('.git/') && !f.startsWith('.git\\')

    const dirtyCount =
      status.modified.filter(isDirtyFile).length +
      status.not_added.filter(isDirtyFile).length +
      status.deleted.filter(isDirtyFile).length +
      status.created.filter(isDirtyFile).length +
      status.renamed.filter(f => isDirtyFile(f.to)).length

    const hasConflicts = status.conflicted.length > 0
    return {
      isRepo: true,
      dirtyCount,
      hasConflicts,
      conflicted: status.conflicted,
      ahead: status.ahead,
      behind: status.behind,
      current: status.current,
      tracking: status.tracking
    }
  } catch (err: any) {
    server.log.error(err)
    return reply.code(500).send({ error: 'Failed to get git status' })
  }
})

server.post('/api/git/sync', async (request, reply) => {
  try {
    const remoteUrl = config?.notesGitRemoteUrl
    const branch = config?.notesGitBranch || 'main'

    if (!remoteUrl) {
      return reply.code(412).send({ error: 'GIT_REMOTE_REQUIRED' })
    }

    const { hasRemoteBranch } = await ensureNotesRepo(remoteUrl, branch)

    const status = await git.status()
    const isDirtyFile = (f: string) => !f.startsWith('.git/') && !f.startsWith('.git\\')
    const isDirty =
      status.modified.some(isDirtyFile) ||
      status.not_added.some(isDirtyFile) ||
      status.deleted.some(isDirtyFile) ||
      status.created.some(isDirtyFile) ||
      status.renamed.some(f => isDirtyFile(f.to))

    if (isDirty) {
      await git.add(['-A'])
      await git.commit('Auto sync: ' + new Date().toISOString())
    }

    if (hasRemoteBranch) {
      try {
        await git.pull('origin', branch, { '--rebase': 'true' })
      } catch (pullErr: any) {
        if (pullErr.message && pullErr.message.toLowerCase().includes('conflict')) {
          return reply.code(409).send({ error: 'Conflict detected during pull. Please resolve manually.' })
        }
        if (pullErr.message && pullErr.message.includes('fatal: refusing to merge unrelated histories')) {
          await git.pull('origin', branch, { '--allow-unrelated-histories': null, '--rebase': 'true' })
        } else {
          throw pullErr
        }
      }
    }

    // Force re-indexing of all files after a pull
    const files = await scanNotesDir(NOTES_DIR)
    for (const file of files) {
      await handleFileUpdate(file)
    }

    await git.raw(['push', '-u', 'origin', branch])

    return { success: true, message: 'Synced successfully' }
  } catch (err: any) {
    server.log.error(err)
    return reply.code(500).send({ error: err.message || 'Failed to sync' })
  }
})

let watcher: any

const start = async () => {
  try {
    await setupDependencies()
    await setupLanceDB()

    watcher = chokidar.watch(NOTES_DIR, {
      ignored: [/(^|[\/\\])\../, '**/.git/**', '**/node_modules/**'],
      persistent: true,
      ignoreInitial: false,
    })

    watcher
      .on('add', handleFileUpdate)
      .on('change', handleFileUpdate)
      .on('unlink', handleFileRemove)

    const port = Number(process.env.PORT) || 31777
    await server.listen({ port, host: '0.0.0.0' })
    console.log(`Server is running on http://localhost:${port}`)
  } catch (err) {
    server.log.error(err)
    process.exit(1)
  }
}

start()
