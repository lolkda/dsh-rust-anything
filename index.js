import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

/**
 * Skill provider for the bundled `rust-anything` skill.
 *
 * The MCP server ships the same guidance as MCP prompts, which DeepSeek Harness does not
 * surface, so the skill is registered here and loaded on demand instead of living in the
 * system prompt.
 */
const PROVIDER_NAME = 'rust-anything'
const SKILL_DIR = new URL('./skills/rust-anything/', import.meta.url)
const SKILL_BODY_URL = new URL('SKILL.md', SKILL_DIR)
const RESOURCE_BASE = { kind: 'directory', path: fileURLToPath(SKILL_DIR) }

const CANDIDATE = {
  name: 'rust-anything',
  description:
    'Port TypeScript/JavaScript, Python, C, Go, Ruby, Java, Kotlin, PHP, C# or PowerShell to Rust with the rust-anything MCP tools, from one hot function up to a whole app rewritten as pure Rust: profile, plan, bridge one unit at a time, record the original behavior, port, diff, bench, shadow and gate. Use when asked to rewrite, port or migrate code or an app to Rust, to plan such a migration, or to make slow code faster with Rust.',
  invocation: { modelInvocable: true, userInvocable: true },
  provider: PROVIDER_NAME,
  source: 'bundled',
  resourceBase: RESOURCE_BASE,
  rank: 600,
  locator: SKILL_BODY_URL,
}

const provider = {
  name: PROVIDER_NAME,
  list: () => Promise.resolve([CANDIDATE]),
  async get() {
    return {
      name: CANDIDATE.name,
      description: CANDIDATE.description,
      invocation: CANDIDATE.invocation,
      provider: CANDIDATE.provider,
      source: CANDIDATE.source,
      resourceBase: RESOURCE_BASE,
      content: await readFile(SKILL_BODY_URL, 'utf8'),
    }
  },
}

/** Cordis plugin name. */
export const name = 'rust-anything-skill'

/** Service required by the bundled provider. */
export const inject = ['skills']

/** Register the bundled `rust-anything` skill provider on `ctx.skills`. */
export function apply(ctx) {
  ctx.skills.registerProvider(() => provider)
}
