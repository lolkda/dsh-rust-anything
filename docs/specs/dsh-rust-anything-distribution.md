# dsh-rust-anything 分发与发布

## 1. 文档信息

- 文档标识：dsh-rust-anything-distribution
- 规格状态：已确认
- 最后更新：2026-11-24
- 实现状态：未开始
- 验证状态：未执行
- 关联文档：[dsh-rust-anything.md](dsh-rust-anything.md)（主规格，D-001~D-010、R-001~R-007、AC-001~AC-007）。本文档只覆盖分发与发布，不取代主规格；两者冲突时以本文档对"二进制从哪来"的改写为准。编号在本文档内继续递增，避免与主规格冲突。

## 2. 目标与范围

### 背景

主规格按 D-005/D-006 把二进制 vendor 进仓库，且只覆盖 linux-x64。实际需求已变化：

- 需要覆盖 **linux-x64、linux-arm64、win32-x64** 三个平台。
- 二进制**不进 git 仓库**，改为在 npm 发布时装配进 tarball，由 CI 在发布流程中内置。
- 仓库已公开（`lolkda/dsh-rust-anything`），首提交 `eb9e567` 里仍带着 29 MB 的 linux-x64 二进制。
- 本机无法执行 arm64 与 Windows 二进制（无 qemu、无 wine、无 binfmt），因此这两个平台的"可用"只能由 CI 证明。
- npm 规定包必须先存在于 registry 才能配置 Trusted Publisher，因此**首版无法用 OIDC 发布**。

### 目标

- 仓库只含源码：任何被 git 跟踪的文件都不包含二进制，历史中也不存在。
- 发布产物自包含：`@lolkda/dsh-rust-anything` 的 tarball 内含三个平台的 rust-anything 4.0.0 二进制，装完即可用，无需全局安装。
- CI 在三平台各跑一次真实 MCP 冒烟测试，作为"支持该平台"的唯一证据来源。
- 包名改为 `@lolkda/dsh-rust-anything`，profile 重装后工具与 skill 仍可用。

### 非目标

- **不覆盖 macOS**（darwin-arm64 / darwin-x64）。macOS 用户走 launcher 的 PATH 回退。
- 不改 22 个工具的定义、skill 内容或 UI 范围（沿用主规格 D-003、D-004、D-007）。
- 不引入运行时 npm 依赖：发布物不声明 dependencies。
- 不做 GitHub Release 的二进制分发；上游 release 与本仓库 release 都只用于版本对应，不作为下载源。

## 3. 参与深度与委托

- 参与深度：架构与设计（沿用主规格，未重新确认）。
- 局部例外：无。
- 需要用户确认：包名、首版发布路径、历史处理、验证方式、文档落盘方式、后续动作。均已在访谈中确认，见第 5 节。
- 模型自主决定：装配脚本与冒烟测试的实现形态、workflow 结构与触发条件、`vendor/` 的 gitignore 策略、`files` 字段内容、profile 重装步骤、launcher 的 Windows 信号兜底。
- 当前执行授权：用户选择"新建独立草稿并开始开发"，授权在本范围内修改文件、重写 git 历史并 force push、本地装配与 `npm pack` 检查、重装 profile。**发布动作在你完成 `npm login` 之后执行**；不授权把任何 token 写入仓库或对话，不授权配置 npm 侧的 Trusted Publisher（只能你本人操作）。

## 4. 行为要求与约束

### R-008：仓库不含二进制

- 参与者或触发方：每次提交与推送。
- 前置条件与输入：`vendor/` 目录在本地存在（开发用），`.gitignore` 覆盖 `vendor/`。
- 必须满足的行为：`git ls-files vendor` 为空；`git rev-list --objects --all` 中不出现任何 `vendor/` 路径；首提交不再包含二进制。
- 输出或状态变化：仓库 `.git` 体积降到 2 MB 以内。
- 边界与失败行为：若历史清理不彻底（`git rev-list` 仍能查到 vendor 对象），视为未完成，需 `git gc --prune=now` 或重新构造提交。

### R-009：发布物自包含三平台

- 参与者或触发方：`scripts/build-npm.mjs` 装配、`npm publish`。
- 前置条件与输入：本地或 CI 已运行 `scripts/vendor-binaries.mjs`，`vendor/` 下有 `linux-x64`、`linux-arm64`、`win32-x64` 三个目录。
- 必须满足的行为：装配出的 `npm-out/` 里三个平台的二进制齐全、大小与上游包一致、Linux 两个保留可执行位；`package.json` 的 `files` 含 `vendor`。
- 输出或状态变化：`npm pack` 产出的 tarball 里 `package/vendor/**` 三个平台各一个文件。
- 边界与失败行为：任一平台缺失时脚本以非零码退出并指出缺哪个，不发布残缺包。

### R-010：launcher 跨平台解析

- 参与者或触发方：MCP 行启动 `node bin/launcher.mjs mcp`。
- 前置条件与输入：`vendor/<process.platform>-<process.arch>/`，win32 文件名为 `rust-anything.exe`。
- 必须满足的行为：命中内置文件则启动它；否则回退 PATH 上的 `rust-anything`；都没有则打印期望路径与获取方式并以非零码退出。Windows 上信号透传不得抛错。
- 输出或状态变化：子进程继承 stdio，退出码与信号透传。
- 边界与失败行为：沿用主规格 R-001 的失败可见性（`failOnStartupError: true`）。

### R-011：三平台冒烟测试

- 参与者或触发方：CI 在 push 与 PR 时，以及手动触发。
- 前置条件与输入：`ubuntu-latest`、`ubuntu-24.04-arm`、`windows-latest` 三个 runner，Node 22+。
- 必须满足的行为：先取二进制（R-009 的前置），再执行 `node test/smoke.mjs`：拉起 `node bin/launcher.mjs mcp`，写入 `initialize` 与 `tools/list`，断言 `serverInfo.name == rust-anything`、工具数为 22、退出码 0。
- 输出或状态变化：三个 job 全绿；失败时打印收到的原始响应。
- 边界与失败行为：runner 不可用（例如 arm64 runner 排队超时）时记为受阻并如实报告，不降级为"已支持"。

### R-012：发布流程

- 参与者或触发方：推送 `v*` tag（发布）；push / PR（只跑冒烟）。
- 前置条件与输入：`release.yml`，`permissions.id-token: write`，Node 24 + 最新 npm。
- 必须满足的行为：tag 触发时先装配再 `npm publish npm-out`；首版（0.1.0）由本机在你 `npm login` 后发布，因为 npm 要求包已存在才能配置 Trusted Publisher；0.2.0 起改由 OIDC 发布。
- 输出或状态变化：npm 上出现对应版本，内容与 AC-009 一致。
- 边界与失败行为：OIDC 未配置时 workflow 失败并提示需在 npmjs.com 配置 Trusted Publisher（仓库 + workflow 文件名）；不得为了让它通过而改回长期 token 而不告知。

### R-013：包身份与安装复验

- 参与者或触发方：`package.json`、`cordis.patch.yml`、profile 安装。
- 前置条件与输入：包名 `@lolkda/dsh-rust-anything`。
- 必须满足的行为：patch 里 MCP 行的 launcher 路径指向新包名；重装后 `mcp_list` 出现 `rust-anything`，22 个工具可经 `mcp_call` 调用，skill 可加载。
- 输出或状态变化：profile 中旧的 `@local/dsh-rust-anything` 条目被移除，新条目生效。
- 边界与失败行为：重装失败时保留旧安装并如实报告，不留下两套并存。

### 相关约束

- npm Trusted Publishing 要求包已存在于 registry；首版必须走传统方式。
- 公开仓库的 Actions 免费；`ubuntu-24.04-arm` 为原生 arm64 runner，非模拟。
- 本机 npm 未登录（`need auth`），`npm login` 只能由用户本人完成。
- DSH 0.2.2-rc.5；profile `web` 通过 `link:` 安装本地目录。

## 5. 关键决定

### D-011：包名 `@lolkda/dsh-rust-anything`

- 状态：已确认
- 结论：发布到 npm 使用该作用域名。
- 理由：作用域用户已拥有（`@lolkda/dsh-mcp-proxy@0.3.2` 已发布），与其它插件同族。
- 考虑过的备选：无作用域 `dsh-rust-anything`；其它名字。
- 未采用原因：无作用域名现在虽空着，但与既有包不一致，且易被他人占用相似名。
- 影响范围：R-013、`package.json`、`cordis.patch.yml`、安装命令。

### D-012：二进制不进 git，发布时装配

- 状态：已确认
- 结论：`vendor/` 被 gitignore；发布前由脚本取回三个平台二进制装配进 tarball。
- 理由：仓库保持轻量；发布物自包含，用户装完即用。
- 考虑过的备选：直接 vendor 进仓库；Git LFS；首次运行下载缓存。
- 未采用原因：进仓库会让 clone 背上约 82 MB；LFS 要求每个使用者装 git-lfs；下载缓存要新写下载/校验/缓存逻辑且离线不可用。
- 影响范围：R-008、R-009、R-012、主规格 R-001 与 R-004 的实现方式。

### D-013：首版本机发布，0.2.0 起切 OIDC

- 状态：已确认
- 结论：0.1.0 由本机在你 `npm login` 后 `npm publish`；之后在 npmjs.com 配置 Trusted Publisher，发布流程改为 OIDC。
- 理由：npm 要求包先存在才能配置 Trusted Publisher，首版不存在 OIDC 路径。
- 考虑过的备选：首版也用 `NPM_TOKEN` secret；一直用 token。
- 未采用原因：首版用 token 需要你生成并保管长期令牌，且首版最容易出错，本机发布便于先 `npm pack` 检查。
- 影响范围：R-012、Q-006、Q-008。

### D-014：三平台 GitHub Actions 冒烟测试

- 状态：已确认
- 结论：`ci.yml` 在 ubuntu-latest、ubuntu-24.04-arm、windows-latest 各跑一次 MCP 握手与 22 工具断言。
- 理由：本机无 qemu/wine/binfmt，arm64 与 Windows 只能由原生 runner 证明。
- 考虑过的备选：只做静态验证并标注未实测；不验证。
- 未采用原因：静态检查只能证明架构正确，不能证明能跑；而"支持"是对外承诺。
- 影响范围：R-011、AC-010、Q-007。

### D-015：重写历史并 force push

- 状态：已确认
- 结论：把 `vendor/` 从首提交移除，重写 `eb9e567`，`git gc --prune=now` 后 force push。
- 理由：仓库刚建、单提交、无他人工作基于它，是唯一零成本窗口。
- 考虑过的备选：保留历史、新提交删除。
- 未采用原因：clone 仍需拉 29 MB 旧对象，仓库永远不会变小。
- 影响范围：R-008、AC-008。

### D-016：新建独立草稿记录本次变更

- 状态：已确认
- 结论：本文档独立存在，与主规格互相引用，不把主规格标为已取代。
- 理由：分发方式是被整体改写的契约，独立成文便于对照；同时保留主规格的工具面与验收记录。
- 考虑过的备选：更新主规格。
- 未采用原因：用户选择独立草稿。
- 影响范围：文档结构。

## 6. 验收标准

### AC-008：仓库无二进制且历史干净

- 对应规则：R-008、D-015
- 前置条件：重写并 force push 完成。
- 操作或输入：`git ls-files vendor`；`git rev-list --objects --all | grep vendor`；`du -sh .git`。
- 预期结果：第一条为空；第二条无输出；`.git` 小于 2 MB。
- 验证状态：未执行
- 验证证据：尚未执行

### AC-009：装配产物完整

- 对应规则：R-009
- 前置条件：`vendor/` 下已有三个平台。
- 操作或输入：`node scripts/build-npm.mjs`，再 `npm pack npm-out --dry-run`（或 `tar tzf` 检查 tarball）。
- 预期结果：tarball 内含 `package/vendor/linux-x64/rust-anything`、`package/vendor/linux-arm64/rust-anything`、`package/vendor/win32-x64/rust-anything.exe`，大小与上游包一致，Linux 两项权限 755。
- 验证状态：未执行
- 验证证据：尚未执行

### AC-010：三平台冒烟通过

- 对应规则：R-011、D-014
- 前置条件：代码推送到 GitHub，Actions 可用。
- 操作或输入：查看 `ci.yml` 三个 job 的运行结果。
- 预期结果：ubuntu-latest、ubuntu-24.04-arm、windows-latest 三个 job 均成功，各自输出工具数 22。
- 验证状态：未执行
- 验证证据：尚未执行

### AC-011：本地安装复验

- 对应规则：R-013
- 前置条件：包名与 patch 已更新。
- 操作或输入：移除旧 bundle，按新包名重装，然后 `mcp_list`、`mcp_search`、`mcp_call`（analyze）、加载 skill。
- 预期结果：`mcp_list` 出现 `rust-anything`；22 工具可调用；skill 可加载；profile 中不再有 `@local/dsh-rust-anything`。
- 验证状态：未执行
- 验证证据：尚未执行

### AC-012：首版发布成功

- 对应规则：R-012、D-013
- 前置条件：用户完成 `npm login`。
- 操作或输入：`npm publish npm-out`，随后 `npm view @lolkda/dsh-rust-anything version`。
- 预期结果：返回 `0.1.0`；从 registry 拉下的 tarball 内容与 AC-009 一致。
- 验证状态：未执行
- 验证证据：尚未执行

## 7. 未决问题与假设

### Q-006：Trusted Publisher 配置

- 类型：未决问题
- 内容：npmjs.com 上为 `@lolkda/dsh-rust-anything` 配置 Trusted Publisher（仓库 `lolkda/dsh-rust-anything`、workflow `release.yml`）只能由用户完成。
- 影响范围：R-012、0.2.0 起的 CI 发布。
- 是否阻塞：否，不阻塞 0.1.0；阻塞后续版本走 OIDC。
- 决定或验证方式：用户配置后，用下一个版本的实际发布验证；未配置前 `release.yml` 会失败并给出提示。

### Q-007：arm64 与 Windows 的实际可用性

- 类型：暂用假设
- 内容：假设上游 4.0.0 的 arm64 与 win32 二进制行为与 linux-x64 一致。
- 影响范围：AC-010、对外"支持"表述。
- 是否阻塞：否，由 CI 证伪或证实。
- 决定或验证方式：CI 三平台冒烟；若某平台失败，在该平台记为未通过并如实报告，不用其他平台的结果代替。

### Q-008：首版发布时机

- 类型：未决问题
- 内容：发布动作依赖用户在本机执行 `npm login`（凭据只能用户本人输入）。
- 影响范围：AC-012。
- 是否阻塞：是，阻塞 AC-012。
- 决定或验证方式：用户完成登录后由模型执行装配与发布，并复验 registry 上的内容。

## 8. 技术设计

### 模块与职责

| 路径 | 职责 |
|---|---|
| `scripts/vendor-binaries.mjs` | 用 `npm install --prefix <临时目录> rust-anything@4.0.0` 取回上游包，把三个平台的二进制拷到 `vendor/<key>/`，校验存在与大小，Linux 保留 755 |
| `scripts/build-npm.mjs` | 组装 `npm-out/`：复制运行期文件与 `vendor/`，校验三平台齐全后退出 0；`--publish` 时执行 `npm publish` |
| `test/smoke.mjs` | 拉起 `bin/launcher.mjs mcp`，写 `initialize` + `tools/list`，断言 serverInfo 与 22 个工具 |
| `.github/workflows/ci.yml` | matrix：ubuntu-latest、ubuntu-24.04-arm、windows-latest；取二进制 → 冒烟 |
| `.github/workflows/release.yml` | tag `v*` 触发；取二进制 → 装配 → `npm publish`（OIDC，需先配置 Trusted Publisher） |
| `.gitignore` | 增加 `vendor/` |

### 依赖与交互

装配与冒烟都依赖 `scripts/vendor-binaries.mjs` 的结果，所以 CI 的每个 job 都先跑它。`npm-out/` 是发布用的暂存目录，含 `package.json`、`index.js`、`cordis.patch.yml`、`bin/`、`vendor/`、`locale/`、`skills/`、`docs/DETAIL.md`、`icon.svg`、`README.md`、`LICENSE`、`THIRD_PARTY_NOTICES.md`；不含 `docs/specs/`、`test/`、`scripts/`、`.github/`。

### 关键技术选择

- 取二进制用 `npm install --prefix`（跨平台、不需要 tar，且 npm 校验 registry 完整性），不用 GitHub Release 资产。
- 冒烟测试用 Node 脚本而不是 shell，避免 Windows runner 的 pwsh/bash 差异。
- 发布用装配目录而不是 `prepack` 钩子：产物可先检查再发布，且不改动工作区。

### 已知限制与取舍

- 仓库不含二进制，因此**从 git 直接 clone 后必须跑一次 `npm run vendor`** 才能本地运行；否则 launcher 回退 PATH 并报错。
- macOS 未覆盖。
- 0.1.0 之前 `release.yml` 不可用（OIDC 前置未满足），属预期。
