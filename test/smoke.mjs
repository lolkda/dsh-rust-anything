#!/usr/bin/env node
// Smoke test: start the bundled MCP server through the launcher and check the handshake.
//
// Runs the same way on Linux, macOS and Windows, so CI can prove each platform rather than
// assume it.
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const launcher = join(root, 'bin', 'launcher.mjs')
const EXPECTED_TOOLS = 22
const TIMEOUT_MS = 120_000

const child = spawn(process.execPath, [launcher, 'mcp'], { stdio: ['pipe', 'pipe', 'pipe'] })

let stdout = ''
let stderr = ''
let settled = false

function finish(code, message) {
  if (settled) return
  settled = true
  clearTimeout(timer)
  if (code === 0) console.log(message)
  else {
    console.error(message)
    if (stdout.trim()) console.error(`--- stdout ---\n${stdout}`)
    if (stderr.trim()) console.error(`--- stderr ---\n${stderr}`)
  }
  child.kill()
  process.exit(code)
}

const timer = setTimeout(
  () => finish(1, `smoke: no complete handshake within ${TIMEOUT_MS / 1000}s`),
  TIMEOUT_MS,
)

child.on('error', (error) => finish(1, `smoke: could not start the launcher: ${error.message}`))
child.stderr.on('data', (chunk) => {
  stderr += chunk
})
child.stdout.on('data', (chunk) => {
  stdout += chunk
  const responses = new Map()
  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue
    try {
      const message = JSON.parse(line)
      if (message.id !== undefined) responses.set(message.id, message)
    } catch {
      // A partial line: wait for more.
    }
  }
  const init = responses.get(1)
  const list = responses.get(2)
  if (!init || !list) return

  const server = init.result?.serverInfo
  if (server?.name !== 'rust-anything') {
    finish(1, `smoke: unexpected serverInfo ${JSON.stringify(server)}`)
    return
  }
  const tools = list.result?.tools ?? []
  if (tools.length !== EXPECTED_TOOLS) {
    finish(1, `smoke: expected ${EXPECTED_TOOLS} tools, got ${tools.length}: ${tools.map((t) => t.name).join(', ')}`)
    return
  }
  for (const required of ['analyze', 'bridge', 'record', 'diff', 'gate']) {
    if (!tools.some((tool) => tool.name === required)) {
      finish(1, `smoke: tool ${required} is missing`)
      return
    }
  }
  finish(
    0,
    `smoke: ${process.platform}-${process.arch} ok — ${server.name} ${server.version}, ${tools.length} tools`,
  )
})

const send = (message) => child.stdin.write(`${JSON.stringify(message)}\n`)
send({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'dsh-rust-anything-smoke', version: '0' },
  },
})
send({ jsonrpc: '2.0', method: 'notifications/initialized' })
send({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
