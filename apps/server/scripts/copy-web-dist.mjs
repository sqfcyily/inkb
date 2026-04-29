import fs from 'node:fs/promises'
import path from 'node:path'
import url from 'node:url'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const serverDir = path.resolve(__dirname, '..')
const webDist = path.resolve(serverDir, '..', 'web', 'dist')
const outDir = path.resolve(serverDir, 'public')

const rmSafe = async (p) => {
  try {
    await fs.rm(p, { recursive: true, force: true })
  } catch {}
}

const copyDir = async (src, dest) => {
  await fs.mkdir(dest, { recursive: true })
  const entries = await fs.readdir(src, { withFileTypes: true })
  for (const e of entries) {
    const from = path.join(src, e.name)
    const to = path.join(dest, e.name)
    if (e.isDirectory()) {
      await copyDir(from, to)
    } else if (e.isFile()) {
      await fs.copyFile(from, to)
    }
  }
}

await rmSafe(outDir)
await copyDir(webDist, outDir)

