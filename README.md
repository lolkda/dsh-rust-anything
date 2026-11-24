# dsh-rust-anything

把 [rust-anything](https://github.com/erkamyaman/rust-anything) 接进
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)：把应用一块一块重写成
Rust，每一步都用原程序录制下来的行为校验。

一个 DSH bundle，包含三样东西：

| 部件 | 提供什么 |
|---|---|
| MCP server `rust-anything` | 22 个工具：`analyze`、`bridge`、`record`、`diff`、`gate`、`build`、`bench`、`profile`、`go`、`refresh`、`fuzz`、`shadow`、`map`、`package`、`enable`、`disable`、`report`、`app_record`、`app_replay`、`app_front_door`、`app_wire`、`app_lift` |
| Skill `rust-anything` | 流程纪律：profile → plan → 一次一个单元 bridge → record → 写 `src/port.rs` → diff → gate → enable → report。按需加载，不常驻上下文 |
| 内置 CLI | rust-anything 4.0.0（linux-x64）放在 `vendor/linux-x64/`，由 `bin/launcher.mjs` 启动 |

不装全局命令、不改 `PATH`、不拉 npm 依赖：MCP 行通过 launcher 启动仓库内的二进制。

## 安装

在 DSH 的 **Plugins** 页选「添加插件 / Add plugin」，指向本目录；或者用插件管理器按目录安装。
安装后：

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

## 已知限制

- **仅 linux-x64**。其他平台需要把对应平台的二进制放进 `vendor/<platform>-<arch>/`；launcher
  会回退到 `PATH` 上的 `rust-anything`，都没有就带安装指引退出。
- **`record`、`diff`、`gate`、`app record`、`app replay` 会真的执行原程序**。在项目副本上跑，
  用测试数据库，环境里不要放生产凭据。
- **`enable` 会改你的源文件**（加一个带标记的块，`disable` 逐字节还原）。启用前先问过用户。
- **它只能抓到录制覆盖到的行为**。`diff` 与 `gate` 通过的含义是「与录制的行为一致」，
  不是「任何情况下都和原程序相同」；`fuzz` 用来采样录制没覆盖的输入。
- 没有设置页：版本与平台写在 `package.json` 的 `rustAnything.version` 里。

## 目录结构

```text
package.json            bundle 清单（dsh.bundle.patch、exports、files）
cordis.patch.yml        两行：skill provider + dsh-mcp-client
index.js                Host 插件：向 ctx.skills 注册 rust-anything skill
bin/launcher.mjs        按平台解析内置二进制，回退 PATH，透传 stdio 与退出码
vendor/linux-x64/       rust-anything 4.0.0 预编译二进制
skills/rust-anything/   改写版 SKILL.md 与 whole-app.md
locale/                 en.json / zh.json（插件清单显示用）
docs/DETAIL.md          插件详情页正文
docs/specs/             设计与验收记录（D-001~D-010、AC-001~AC-007）
icon.svg                插件图标
```

## 许可证

本仓库代码为 MIT，见 [LICENSE](LICENSE)。其中内置的二进制与改写自上游的 skill 文本来自
rust-anything（MIT，Copyright (c) 2026 Erkam Yaman），见
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
