# rust-anything for DeepSeek Harness

Bring [rust-anything](https://github.com/erkamyaman/rust-anything) into DSH: rewrite an app in
Rust one piece at a time, and prove every piece still behaves the same.

## What it installs

| Part | What it gives you |
|---|---|
| MCP server `rust-anything` | 22 tools: `analyze`, `bridge`, `record`, `diff`, `gate`, `build`, `bench`, `profile`, `go`, `refresh`, `fuzz`, `shadow`, `map`, `package`, `enable`, `disable`, `report`, `app_record`, `app_replay`, `app_front_door`, `app_wire`, `app_lift` |
| Skill `rust-anything` | The workflow: profile → plan → bridge one unit → record → port `src/port.rs` → diff → gate → enable → report. Loaded on demand, not kept in the prompt |
| Bundled CLI | rust-anything 4.0.0 for linux-x64, linux-arm64, win32-x64, darwin-arm64 and darwin-x64, shipped in `vendor/<platform>-<arch>/` and started through `bin/launcher.mjs` |

Nothing is installed globally and nothing is added to `PATH`: the MCP server starts the bundled
binary through the launcher.

## How to use it

Ask for what you want in plain language — "port this Python CLI to Rust", "make this function
faster with Rust", "plan a migration of this repo". The agent loads the `rust-anything` skill and
drives the tools.

With `@lolkda/dsh-mcp-proxy` (or any similar proxy) installed, tools are called through the proxy:

```text
mcp_search({ query: "rust-anything analyze" })
mcp_call({ name: "mcp__rust-anything__analyze", arguments: { root: "/path/to/repo" } })
```

Without a proxy the tools are ordinary `mcp__rust-anything__*` tools and are called directly.

A first unit, end to end:

```text
analyze      { root: "/path/to/repo" }                    → start_here units, waves, risks
bridge       { root: "/path/to/repo", unit: "<unit>" }    → rust/<unit>-rs with src/port.rs
record       { crate: "/path/to/repo/rust/<unit>-rs" }    → cases.jsonl: the behavior to match
# write the Rust in src/port.rs
build / diff / gate                                       { crate: "..." }
report       { crate: "..." }                             → report/REPORT.md and card.svg
```

## Limits

- **Five platforms: linux-x64, linux-arm64, win32-x64, darwin-arm64 and darwin-x64.** Any other
  platform needs its binary under `vendor/<platform>-<arch>/`; the launcher falls back to a
  `rust-anything` on `PATH` and, failing that, exits with instructions. linux-x64 is the platform
  exercised end-to-end (a full port); linux-arm64, win32-x64 and darwin-arm64 are covered by the
  MCP smoke test in CI; darwin-x64 ships but has no free CI runner left, so it is only checked
  statically.
- **`record`, `diff`, `gate`, `app record` and `app replay` execute the original code.** They run
  each case against your program, so use a copy of the project, a test database and no production
  credentials in the environment.
- **`enable` edits your source files.** It adds one marked block per file and `disable` removes it
  byte for byte; ask before enabling.
- **It only catches what the recording covers.** Passing `diff` and `gate` means "matches the
  recorded behavior", not "identical to the original in every situation". `fuzz` samples fresh
  inputs for what the recording missed.
- No settings page: version and platform are fixed in `package.json` (`rustAnything.version`).
