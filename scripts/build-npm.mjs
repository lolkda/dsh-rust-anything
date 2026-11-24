#!/usr/bin/env node
// Assemble npm-out/: the exact tree that gets published.
//
// The repository has no binaries; this copies the vendored ones in, strips `private` from the
// manifest so npm accepts it, and verifies the packed file list before anything is published.
// With --publish it then runs `npm publish npm-out`.
import { execSync } from 'node:child_process'
import { chmodSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const out = join(root, 'npm-out')
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const platforms = manifest.rustAnything?.platforms ?? []
const exeFor = (key) => (key.startsWith('win32') ? 'rust-anything.exe' : 'rust-anything')

// Runtime files only: no specs, tests, scripts or workflows in the published package.
const FILES = [
  'index.js',
  'cordis.patch.yml',
  'bin',
  'locale',
  'skills',
  'icon.svg',
  'README.md',
  'LICENSE',
  'THIRD_PARTY_NOTICES.md',
  'docs/DETAIL.md',
]

rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

for (const file of FILES) {
  const source = join(root, file)
  if (!existsSync(source)) {
    console.error(`build-npm: missing ${file}`)
    process.exit(1)
  }
  cpSync(source, join(out, file), { recursive: true })
}

const missing = []
for (const key of platforms) {
  const exe = exeFor(key)
  const source = join(root, 'vendor', key, exe)
  if (!existsSync(source) || statSync(source).size < 1024 * 1024) {
    missing.push(`${key} (${source})`)
    continue
  }
  mkdirSync(join(out, 'vendor', key), { recursive: true })
  cpSync(source, join(out, 'vendor', key, exe))
}
if (missing.length > 0) {
  console.error(`build-npm: no usable binary for ${missing.join(', ')}`)
  console.error('build-npm: run `npm run vendor` first')
  process.exit(1)
}

// Normalize modes: the workspace files are 600 here, and a published tarball should carry 644
// for files and 755 for the executables.
const normalize = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      chmodSync(path, 0o755)
      normalize(path)
    } else if (!path.includes(`${sep}vendor${sep}`) || path.endsWith('.exe')) {
      chmodSync(path, 0o644)
    } else {
      chmodSync(path, 0o755)
    }
  }
}
normalize(out)

const published = { ...manifest }
delete published.private
published.files = [...FILES, 'vendor']
writeFileSync(join(out, 'package.json'), `${JSON.stringify(published, null, 2)}\n`)

// Verify what npm would actually pack, not what we think we copied.
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const packed = JSON.parse(execSync(`${npm} pack --dry-run --json`, { cwd: out, encoding: 'utf8' }))[0]
const paths = packed.files.map((f) => f.path)
const expected = [
  ...FILES.filter((f) => !f.startsWith('bin') && !f.startsWith('locale') && !f.startsWith('skills')),
  ...platforms.map((key) => `vendor/${key}/${exeFor(key)}`),
]
const absent = expected.filter((p) => !paths.includes(p))
if (absent.length > 0) {
  console.error(`build-npm: packed tarball is missing ${absent.join(', ')}`)
  process.exit(1)
}

console.log(`build-npm: ${published.name}@${published.version} — ${paths.length} files, ${(packed.size / 1048576).toFixed(1)} MB packed`)
for (const key of platforms) console.log(`  vendor/${key}/${exeFor(key)}`)

if (process.argv.includes('--publish')) {
  console.log('build-npm: publishing npm-out')
  execSync(`${npm} publish npm-out --access public`, { cwd: root, stdio: 'inherit' })
  console.log('build-npm: published')
}
