# dsh-rust-anything

把 [rust-anything](https://github.com/erkamyaman/rust-anything) 接进
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)：把应用一块一块重写成
Rust，每一步都用原程序录制下来的行为校验。

一个 DSH bundle，包含三样东西：

| 部件 | 提供什么 |
|---|---|
| MCP server `rust-anything` | 22 个工具：`analyze`、`bridge`、`record`、`diff`、`gate`、`build`、`bench`、`profile`、`go`、`refresh`、`fuzz`、`shadow`、`map`、`package`、`enable`、`disable`、`report`、`app_record`、`app_replay`、`app_front_door`、`app_wire`、`app_lift` |
| Skill `rust-anything` | 流程纪律：profile → plan → 一次一个单元 bridge → record → 写 `src/port.rs` → diff → gate → enable → report。按需加载，不常驻上下文 |
| 内置 CLI | rust-anything 4.0.0 预编译二进制，随发布物提供 |

不装全局命令、不改 `PATH`、无运行时 npm 依赖：MCP 行通过 `bin/launcher.mjs` 启动包内二进制。

## 支持平台

| 平台 | 状态 |
|---|---|
| linux-x64 | ✅ 实测跑通（22 工具 + go-fuzzy 闭环 440/440 + gate 12/12）+ CI 冒烟 |
| linux-arm64 | ✅ CI 冒烟（原生 arm64 runner） |
| win32-x64 | ✅ CI 冒烟（windows-latest） |
| darwin-arm64 | ✅ CI 冒烟（macos-latest，Apple Silicon） |
| darwin-x64 | ⚠️ 随包提供，未经 CI 执行（GitHub 已无免费 Intel macOS runner）；`file` 确认为 Mach-O x86_64 |
| 其它 | ❌ 未覆盖；launcher 回退到 `PATH` 上的 `rust-anything`，没有则带指引退出 |

二进制**不进仓库**：仓库只放源码，发布时由脚本装配进 tarball。所以 clone 下来后要跑一次
`npm run vendor` 才有二进制可用。

## 安装

在 DSH 的 **Plugins** 页添加包名（可钉版本）：

```text
@lolkda/dsh-rust-anything
@lolkda/dsh-rust-anything@0.1.1
```

插件管理器会从 registry 装上包，二进制随包一起下来，不需要全局安装。

从仓库安装（开发用，改动即时生效）：

```sh
git clone https://github.com/lolkda/dsh-rust-anything
cd dsh-rust-anything
npm run vendor        # 取回五个平台的二进制到 vendor/（不进 git）
```

然后在 **Plugins** 页添加该目录。安装后：

- `mcp_list` 里出现 `rust-anything`；
- 会话技能目录里出现 `rust-anything`。

## 使用

直接说需求就行——「把这个 Python CLI 迁到 Rust」「让这个函数用 Rust 跑快点」「规划一下这个仓库的迁移」。
模型会加载 `rust-anything` skill 并驱动这些工具。

如果装了 `@lolkda/dsh-mcp-proxy` 之类的 MCP 代理，工具经代理调用：

```text
mcp_search({ query: "rust-anything analyze" })
mcp_call({ name: "mcp__rust-anything__analyze", arguments: { root: "/path/to/repo" } })
```

没装代理时工具就是普通的 `mcp__rust-anything__*`，直接调用。

一个单元走完是这样：

```text
analyze  { root: "/path/to/repo" }                    → start_here 单元、波次、风险
bridge   { root: "/path/to/repo", unit: "<unit>" }    → rust/<unit>-rs，含 src/port.rs
record   { crate: "/path/to/repo/rust/<unit>-rs" }    → cases.jsonl：必须匹配的行为
# 在 src/port.rs 里写 Rust
build / diff / gate                                    { crate: "..." }
report   { crate: "..." }                             → report/REPORT.md 与 card.svg
```

## 开发

```sh
npm run vendor        # 取回五个平台的二进制（约 134 MB）到 vendor/，vendor/ 不进 git
npm test              # 拉起 launcher 做 MCP 握手，断言 22 个工具
npm run build:npm     # 装配 npm-out/ 并用 npm pack --dry-run 校验产物清单
npm run build:npm -- --publish   # 装配后发布（需要先 npm login --registry=https://registry.npmjs.org）
```

发布到 npmjs 时，账号若开了 2FA（auth-and-writes），`npm publish` 会要求一次性密码，必须在一个**交互式终端**里完成浏览器认证。CI 用 OIDC trusted publishing 就不需要这一步，所以首版手动发、之后交给 `release.yml`。

```sh
# 首版（或任何手动发布）在交互式终端里跑：
cd npm-out && npm publish --access public
```

CI 在 `ubuntu-latest`、`ubuntu-24.04-arm`、`windows-latest`、`macos-latest` 四个 runner 上各跑一次
`npm run vendor` + `npm test`。

发布走 tag：`git tag v0.1.2 && git push origin v0.1.2` 触发 `release.yml`，由 npm **trusted publishing（OIDC）**
发布并生成 provenance（0.1.0 是唯一一次手动发布，因为 npm 要求包先存在才能配 Trusted Publisher）。

## 已知限制

- **darwin-x64 没有执行证据**：GitHub 的免费 Intel macOS runner 已退役（`macos-13` 2025-12 退役、`macos-14` 2026-11-02 退役），只剩付费 larger runner，因此这一平台只做静态检查。
- **`record`、`diff`、`gate`、`app record`、`app replay` 会真的执行原程序**。在项目副本上跑，
  用测试数据库，环境里不要放生产凭据。
- **`enable` 会改你的源文件**（加一个带标记的块，`disable` 逐字节还原）。启用前先问过用户。
- **它只能抓到录制覆盖到的行为**。`diff` 与 `gate` 通过的含义是「与录制的行为一致」，
  不是「任何情况下都和原程序相同」；`fuzz` 用来采样录制没覆盖的输入。
- 没有设置页：版本与平台写在 `package.json` 的 `rustAnything` 字段里。

## 目录结构

```text
package.json            bundle 清单（dsh.bundle.patch、exports、files、rustAnything）
cordis.patch.yml        两行：skill provider + dsh-mcp-client
index.js                Host 插件：向 ctx.skills 注册 rust-anything skill
bin/launcher.mjs        按平台解析包内二进制，回退 PATH，透传 stdio 与退出码
vendor/                 二进制（不进 git，由 npm run vendor 生成）
skills/rust-anything/   改写版 SKILL.md 与 whole-app.md
locale/                 en.json / zh.json（插件清单显示用）
docs/DETAIL.md          插件详情页正文
docs/specs/             设计与验收记录（主规格 + 分发规格）
scripts/                vendor-binaries.mjs、build-npm.mjs
test/smoke.mjs          三平台通用的 MCP 冒烟测试
.github/workflows/      ci.yml（三平台冒烟）、release.yml（tag 发布）
icon.svg                插件图标
```

## 许可证

本仓库代码为 MIT，见 [LICENSE](LICENSE)。其中内置的二进制与改写自上游的 skill 文本来自
rust-anything（MIT，Copyright (c) 2026 Erkam Yaman），见
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
