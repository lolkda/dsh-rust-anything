#!/usr/bin/env node
// Fetch rust-anything's prebuilt binaries into vendor/ for the platforms this bundle ships.
//
// The binaries are not committed: the repository stays small, and the published tarball gets
// them at build time. Run this once after cloning, and in CI before the smoke test.
import { execSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const { version, platforms } = manifest.rustAnything ?? {}

if (!version || !Array.isArray(platforms) || platforms.length === 0) {
  console.error('vendor-binaries: package.json needs rustAnything.version and rustAnything.platforms')
  process.exit(1)
}

const exeFor = (key) => (key.startsWith('win32') ? 'rust-anything.exe' : 'rust-anything')
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const work = mkdtempSync(join(tmpdir(), 'ra-vendor-'))

try {
  console.log(`vendor-binaries: installing rust-anything@${version} into a temporary folder`)
  execSync(
    `${npm} install --prefix "${work}" --no-save --no-audit --no-fund --loglevel=error rust-anything@${version}`,
    { stdio: 'inherit' },
  )

  const missing = []
  for (const key of platforms) {
    const exe = exeFor(key)
    const source = join(work, 'node_modules', 'rust-anything', 'binaries', key, exe)
    if (!existsSync(source)) {
      missing.push(`${key} (expected ${source})`)
      continue
    }
    const size = statSync(source).size
    if (size < 1024 * 1024) {
      missing.push(`${key} (${size} bytes looks truncated)`)
      continue
    }
    const target = join(root, 'vendor', key, exe)
    mkdirSync(dirname(target), { recursive: true })
    // Replace by rename: a running binary cannot be overwritten in place (ETXTBSY on Linux,
    // a locked file on Windows), but renaming a new file over it works wherever the old one
    // is not held open for writing.
    const staged = `${target}.tmp-${process.pid}`
    copyFileSync(source, staged)
    if (!key.startsWith('win32')) chmodSync(staged, 0o755)
    try {
      renameSync(staged, target)
    } catch (error) {
      rmSync(staged, { force: true })
      if (error.code === 'EPERM' || error.code === 'EBUSY') {
        missing.push(`${key} (vendor/${key}/${exe} is in use — stop the session running it and retry)`)
        continue
      }
      throw error
    }
    console.log(`vendor-binaries: vendor/${key}/${exe} (${(size / 1048576).toFixed(1)} MB)`)
  }

  if (missing.length > 0) {
    console.error(`vendor-binaries: missing or incomplete: ${missing.join(', ')}`)
    process.exit(1)
  }
  console.log(`vendor-binaries: ${platforms.length} platforms ready`)
} finally {
  rmSync(work, { recursive: true, force: true })
}
