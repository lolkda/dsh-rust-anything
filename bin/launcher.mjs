#!/usr/bin/env node
// rust-anything launcher.
//
// Runs the binary bundled for this platform (vendor/<platform>-<arch>/rust-anything).
// When the bundle carries no binary for this platform, falls back to `rust-anything`
// on PATH; when neither exists, prints how to get one and exits non-zero.
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const bundleRoot = dirname(here)
const platformKey = `${process.platform}-${process.arch}`
const exe = process.platform === 'win32' ? 'rust-anything.exe' : 'rust-anything'
const bundled = join(bundleRoot, 'vendor', platformKey, exe)
const argv = process.argv.slice(2)

function run(command) {
  return spawnSync(command, argv, { stdio: 'inherit' })
}

function finish(result) {
  if (result.error) {
    console.error(`rust-anything: ${result.error.message}`)
    process.exit(1)
  }
  if (result.signal) process.kill(process.pid, result.signal)
  process.exit(result.status ?? 1)
}

if (existsSync(bundled)) {
  finish(run(bundled))
}

const fromPath = run('rust-anything')
if (fromPath.error?.code === 'ENOENT') {
  console.error(
    `rust-anything: no binary for ${platformKey}.\n` +
      `  expected: ${bundled}\n` +
      '  fix: copy that platform\'s binary from the npm package\n' +
      '       (npm pack rust-anything, then binaries/<platform>-<arch>/) into vendor/<platform>-<arch>/,\n' +
      '       or install the CLI yourself: npm i -g rust-anything (prebuilt) or cargo install rust-anything.',
  )
  process.exit(1)
}
finish(fromPath)
