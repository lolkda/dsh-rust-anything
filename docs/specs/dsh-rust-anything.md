# dsh-rust-anything 插件

## 1. 文档信息

- 文档标识：dsh-rust-anything
- 规格状态：已确认
- 最后更新：2026-11-24
- 实现状态：已实现
- 验证状态：通过
- 关联文档：无

## 2. 目标与范围

### 背景

上游项目 [rust-anything](https://github.com/erkamyaman/rust-anything)（MIT，v4.0.0）用"录制原程序行为 → 写 Rust → 回放对比 → gate 通过才允许打开"的方式，把 TypeScript/JavaScript、Python、C、Go、Ruby、Java/Kotlin、PHP、C# 应用逐单元重写成 Rust。

它已经提供了三种接入形态：CLI、MCP server（`rust-anything mcp`，stdio JSON-RPC，22 个工具加 2 个 prompt）、以及 Claude Code / Codex 插件（`plugin/` 目录，含 `SKILL.md` 与 `whole-app.md`）。它的 `rust-anything setup` 只识别 Claude Code、Codex、Cursor、Gemini、OpenCode，**不识别 DeepSeek Harness**，因此 DSH 侧没有现成接入。

本机事实：DSH 0.2.2-rc.5；profile `web` 安装了 `@lolkda/dsh-mcp-proxy`，它在 agent 作用域隐藏全部 `mcp__*` 工具，只保留 `mcp_list` / `mcp_search` / `mcp_describe` / `mcp_call`；DSH 的 `@deepseek-ai/dsh-mcp-client` 明确不支持 MCP prompt 模板；本机未安装 `rust-anything`，但 rustc 1.98.1、Python 3.13、Node 24 齐全；npm 上 `rust-anything@4.0.0` 解包约 140MB，内含五个平台的预编译二进制。

### 目标

- 提供一个 DSH bundle，使 DSH 中的模型能调用 rust-anything 的 22 个能力，并知道 `record → bridge → port → diff → gate` 的执行纪律。
- CLI 二进制随插件分发，不要求用户全局安装，也不修改用户 PATH。
- 用上游自带的 `tests/fixtures/go-fuzzy` 跑通一次最小真实闭环，证明接入可用而非仅连上。

### 非目标

- 不做设置页、Chat 行、slash 命令等会话内界面（D-007）。
- 不做发布级打包检查、多平台覆盖、双语之外的语言（D-002）。
- 不重写上游 22 个工具的定义与描述（D-003）。
- 不修改 rust-anything 上游仓库，不向其提交改动。
- 不把 rust-anything 包装成 DSH 原生工具；原生工具化列为后续增量（D-003、Q-004）。

## 3. 参与深度与委托

- 参与深度：架构与设计。
- 局部例外：无；未对某个模块单独加深到接口与详细设计层级。
- 需要用户确认：交付范围、工具面形态、流程知识载体、CLI 内置方式、界面范围、验证深度、文档处理方式与后续动作。以上均已在访谈中确认，记录于第 5 节。
- 模型自主决定：bundle 名、`serverName`、skill 名、`failOnStartupError` 取值、版本钉定方式、skill 目录结构、launcher 实现、locale 与 icon 的具体文案与图形、文档章节内的技术设计细节。
- 当前执行授权：用户选择"新建文档并开始开发"，授权在本文档已确认范围内创建 bundle 文件、取回二进制、安装到 profile `web`、执行验证。不授权 Git 提交或推送（当前目录不是 git 仓库），不授权修改 rust-anything 上游仓库，不授权全局安装 rust-anything。

## 4. 行为要求与约束

### R-001：内置 CLI 可执行

- 参与者或触发方：插件使用者（模型经 MCP 调用），由 MCP 行启动。
- 前置条件与输入：bundle 内存在 `vendor/linux-x64/rust-anything`；launcher 收到 `mcp` 等 argv。
- 必须满足的行为：launcher 按 `process.platform`-`process.arch` 解析 `vendor/<platform>-<arch>/rust-anything` 并以其启动子进程；找不到内置文件时回退到 PATH 上的 `rust-anything`；两者都没有时以非零码退出并在 stderr 打印安装指引。
- 输出或状态变化：子进程继承 stdio，MCP 的 stdin/stdout 直通；退出码与信号透传给父进程。
- 边界与失败行为：内置二进制缺失且 PATH 也没有时，MCP 行因 `failOnStartupError: true` 激活失败，失败在插件状态中可见，而不是静默少一批工具。

### R-002：MCP 接入

- 参与者或触发方：DSH profile 加载 bundle 时。
- 前置条件与输入：bundle 的 `cordis.patch.yml` 含 `@deepseek-ai/dsh-mcp-client` 行，`transport: stdio`，`command` 为 Node 可执行文件，`args` 为 launcher 路径加 `mcp`。
- 必须满足的行为：以 `serverName: rust-anything` 注册；工具以 `mcp__rust-anything__<tool>` 命名；在装有 mcp-proxy 的 profile 中，模型经 `mcp_search` 发现、经 `mcp_call` 调用。
- 输出或状态变化：MCP 服务器初始化成功时提供 22 个工具。
- 边界与失败行为：MCP 服务器启动失败时按 R-001 的失败行为处理；不额外实现工具过滤或重命名。

### R-003：流程知识按需加载

- 参与者或触发方：模型判断任务涉及"把代码迁移到 Rust"或"用 Rust 加速慢代码"时。
- 前置条件与输入：bundle 的 Host 插件在 `ctx.skills` 注册名为 `rust-anything` 的 skill provider，正文读取 `skills/rust-anything/SKILL.md`。
- 必须满足的行为：skill 保留上游纪律（一次只搬一个单元、`gate` 不过不算完成、`record` 是约束来源）；把工具调用方式改写为 DSH 的 `mcp__rust-anything__*` / `mcp_call` 形式；删除 Claude Code 与 Codex 专属内容（`--agent claude`、`.mcp.json`、`rust-anything setup`、`cargo install` 提示）。
- 输出或状态变化：skill 出现在会话 skill 目录，可按名加载；`whole-app.md` 作为资源随 skill 目录提供，供加载后按需读取。
- 边界与失败行为：skill 正文缺失时 provider 的 `get()` 抛出错误，加载失败并可见；不把正文内联进系统提示常驻上下文。

### R-004：版本钉定

- 参与者或触发方：取回与升级二进制时。
- 前置条件与输入：`package.json` 记录 `rustAnything.version: 4.0.0`。
- 必须满足的行为：`vendor/` 内二进制的实际版本与记录一致；不一致时视为缺陷修复，不静默继续。
- 输出或状态变化：`rust-anything --version` 输出 4.0.0。
- 边界与失败行为：上游发布新版时不自动跟随；升级需更新记录并重跑验收项。

### R-005：显示元数据

- 参与者或触发方：插件管理器渲染插件清单与详情页时。
- 前置条件与输入：`locale/en.json`、`locale/zh.json` 提供 `meta.title`、`meta.description`、`meta.detail`；`icon.svg` 存在。
- 必须满足的行为：标题与描述反映实际交付的能力；描述中只写已实现并验证的行为；图标为有效 SVG 且在 256 KiB 内。
- 输出或状态变化：插件在 Plugins 列表中显示名称、描述与图标，详情页渲染 `docs/DETAIL.md`。
- 边界与失败行为：`meta.detail` 指向的文件缺失或超限时详情区显示错误而非回退 README；元数据缺失时回退 `package.json` 的 `name` 与 `description`。

### R-006：详情页说明

- 参与者或触发方：用户打开插件详情时。
- 前置条件与输入：`docs/DETAIL.md`。
- 必须满足的行为：说明插件做什么、22 个工具如何经 `mcp_call` 调用、二进制位置与版本、以及已知限制（仅 linux-x64、依赖 mcp-proxy 的调用方式、`record` 会执行原程序）。
- 输出或状态变化：详情页可见上述内容。
- 边界与失败行为：文档中的相对链接按纯文本渲染，因此不依赖链接跳转表达关键信息。

### R-007：不越界

- 参与者或触发方：实现与验证过程。
- 前置条件与输入：本机环境与上游仓库。
- 必须满足的行为：不写入 PATH、不做全局 npm/cargo 安装、不修改上游仓库、不修改 profile 的 `package.json` 或 `cordis.patch.yml`（安装走 `plugin_manager`）。
- 输出或状态变化：所有新增文件位于 `/app/project/dsh-rust-anything` 内；profile 变化仅来自 `install_bundle`。
- 边界与失败行为：`install_bundle` 不可用或被拒绝时，保留 bundle 于工作区，交付安装说明，不绕过 DSH 的安装流程。

### 相关约束

- DSH 版本：0.2.2-rc.5；`@deepseek-ai/dsh-mcp-client` 不支持 MCP prompt 模板，因此上游的 `port_unit`、`port_whole_app` 两个 prompt 不参与接入。
- profile `web` 安装 `@lolkda/dsh-mcp-proxy`，`mcp__*` 工具默认对模型不可见，必须经 `mcp_call` 调用。
- 上游 `rust-anything@4.0.0` 的 npm 包内含 `binaries/<platform>-<arch>/rust-anything`，launcher 形态参考 profile 内 `@lolkda/dsh-dexsql-mcp`。
- 目标平台仅 linux-x64；其他平台不在本次验收范围。

## 5. 关键决定

### D-001：参与深度为架构与设计

- 状态：已确认
- 结论：用户参与结构层决策，字段级与实现细节由模型收敛。
- 理由：功能目标单一（把 rust-anything 接进 DSH），分歧集中在接入形态、skill 载体、依赖处理。
- 考虑过的备选：功能与体验；接口与详细设计。
- 未采用原因：前者无法覆盖接入形态这类结构性取舍；后者对本次范围过细。
- 影响范围：第 3 节委托边界。

### D-002：先自用跑通，不按发布标准

- 状态：已确认
- 结论：只装进当前 profile `web`，完成端到端验证；locale、icon、DETAIL 按最低要求补齐，不做打包检查、多平台、版本策略。
- 理由：瓶颈是本机没有 CLI、也没有现成可迁移项目；bundle 形态本身可分发，后续补发布检查是增量。
- 考虑过的备选：按可分发标准做。
- 未采用原因：当前风险在端到端可用性，不在分发质量。
- 影响范围：R-005、R-007、非目标。

### D-003：纯 MCP 配置包加 skill 注册插件

- 状态：已确认
- 结论：22 个能力全部经 MCP 提供，模型通过 `mcp_call` 调用；bundle 只额外带一个用于注册 skill 的 Host 插件。
- 理由：工具 schema 与描述由上游维护，重写等于长期跟版；mcp-proxy 隐藏工具造成的发现成本由 skill 抵消。
- 考虑过的备选：混合（MCP 加 2–3 个原生工具）；全原生工具。
- 未采用原因：混合与全原生都要复制上游工具定义，收益只在输出裁剪与常驻可见，当前不构成必要。
- 影响范围：R-002、R-003、Q-004。

### D-004：自带改写版 skill

- 状态：已确认
- 结论：bundle 注册名为 `rust-anything` 的 skill，正文由上游 `SKILL.md` 改写，`whole-app.md` 作为同目录资源提供。
- 理由：DSH 不支持 MCP prompt；原样搬会保留 `rust-anything setup`、`.mcp.json` 等在 DSH 中错误的指引。
- 考虑过的备选：原样搬上游 skill；不设 skill、约束压进工具描述。
- 未采用原因：前者在 DSH 中指错路；后者无法承载 490 行的流程纪律。
- 影响范围：R-003。

### D-005：内置 CLI，不依赖全局安装

- 状态：已确认
- 结论：二进制随插件分发，launcher 负责解析与启动。
- 理由：用户明确要求内置；同时避免改用户环境。
- 考虑过的备选：检测并引导安装；自动全局安装。
- 未采用原因：前者仍要求用户装 CLI；后者要改全局环境且需处理下载、权限与回滚。
- 影响范围：R-001、R-004、R-007。

### D-006：vendor 当前平台二进制加通用 launcher

- 状态：已确认
- 结论：仓库内放 `vendor/linux-x64/rust-anything`，launcher 按平台解析，找不到回退 PATH。
- 理由：与 DSH 本地目录安装（link checkout）兼容，不依赖 npm 依赖解析；离线可用。
- 考虑过的备选：npm 依赖；首次运行按平台下载缓存。
- 未采用原因：npm 依赖要拉 140MB 且本地 link 安装时依赖是否安装不确定；下载缓存要多写校验与缓存逻辑且离线不可用。
- 影响范围：R-001、R-004、Q-001。

### D-007：只做插件详情页，不写 UI

- 状态：已确认
- 结论：不提供设置页、Chat 行或 slash 命令。
- 理由：当前风险在二进制与工具链是否可用，界面不解决该风险；无持久化状态时设置页能显示的仅版本号。
- 考虑过的备选：加设置页；加会话内入口。
- 未采用原因：投入与当前收益不匹配。
- 影响范围：非目标、R-005、R-006。

### D-008：最小真实闭环验证

- 状态：已确认
- 结论：用 `tests/fixtures/go-fuzzy` 跑 `analyze → bridge → record → diff → gate`。
- 理由：只验链路无法证明 `gate` 能约束实现，而该 fixture 很小（20 行 Python）。
- 考虑过的备选：只验链路；只验安装。
- 未采用原因：两者都无法暴露编译、录制、比对环节的真实失败。
- 影响范围：第 6 节验收标准。

### D-009：文档落盘与执行授权

- 状态：已确认
- 结论：新建本文档；用户选择"保存并开始开发"。
- 理由：带编号的决定与验收标准在实现期需要反复引用。
- 考虑过的备选：换路径；仅聊天草稿；仅保存；继续讨论；本次结束不保存。
- 未采用原因：不适用或未选择；"先 Git 保存当前状态"因目录非 git 仓库不适用。
- 影响范围：第 3 节执行授权。

### D-010：委托范围内决定的命名与取值

- 状态：委托范围内决定
- 结论：bundle 名 `@local/dsh-rust-anything`；`serverName: rust-anything`；skill 名 `rust-anything`；`failOnStartupError: true`；二进制版本钉 `4.0.0`；MCP 行 `command: !!js process.execPath`，`args` 首项为用 `baseUrl` 解析出的 launcher 路径。
- 理由：与 profile 内既有 MCP bundle 的写法一致；失败可见优于静默降级。
- 考虑过的备选：`serverName` 加前缀；`failOnStartupError: false`。
- 未采用原因：无重名冲突需要前缀；静默缺工具会让验证结论失真。
- 影响范围：R-002、R-004、R-005。

## 6. 验收标准

### AC-001：launcher 能起 MCP 并列出工具

- 对应规则：R-001、R-002
- 前置条件：bundle 已含 `vendor/linux-x64/rust-anything` 与 `bin/launcher.mjs`。
- 操作或输入：向 `node bin/launcher.mjs mcp` 的 stdin 写入 `initialize` 与 `tools/list` 两行 JSON-RPC。
- 预期结果：收到 `serverInfo.name` 为 `rust-anything` 的响应；`tools/list` 返回 22 个工具名。
- 验证状态：通过
- 验证证据：2026-11-24 用上述两行 JSON-RPC 驱动 `node bin/launcher.mjs mcp`，返回 `serverInfo {name: "rust-anything", version: "4.0.0"}` 与 22 个工具（analyze、bridge、refresh、record、build、diff、profile、go、enable、disable、report、bench、fuzz、shadow、map、package、gate、app_record、app_replay、app_front_door、app_wire、app_lift）。

### AC-002：插件装进 profile 后工具可发现可调用

- 对应规则：R-002、R-005
- 前置条件：`install_bundle` 成功且插件行处于启用状态。
- 操作或输入：`mcp_list` 出现 `rust-anything`；`mcp_search` 查询 `rust-anything analyze`；`mcp_call` 调用 `mcp__rust-anything__analyze`。
- 预期结果：server 可见；搜索能命中工具；调用返回结构化的分析结果而非连接错误。
- 验证状态：通过
- 验证证据：`install_bundle` 返回 `application: applied`、`enabled: true`、`warnings: []`；`mcp_list` 出现 `rust-anything`（共 5 个 server）；`mcp_search` 命中 `mcp__rust-anything__analyze`；`mcp_call` 调用 analyze 返回 `language: python` 的结构化结果。`list_bundles` 显示 `@local/dsh-rust-anything@0.1.0`（source `link:/app/project/dsh-rust-anything`，两行：`rust-anything-skill`、`rust-anything-mcp`）。清单的渲染显示未在浏览器核验，见 Q-005。

### AC-003：skill 可加载且不含错误指引

- 对应规则：R-003
- 前置条件：bundle 已安装。
- 操作或输入：会话 skill 目录中出现 `rust-anything`；加载其正文；检索 `rust-anything setup`、`.mcp.json`、`--agent claude`。
- 预期结果：skill 可按名加载；正文不含上述三项 Claude Code / Codex 专属指引；含 `record`、`gate`、`mcp__rust-anything__` 的说明。
- 验证状态：通过
- 验证证据：安装后会话 skill 目录即出现 `rust-anything`；`skill` 工具加载成功，资源基准目录解析为 `/app/project/dsh-rust-anything/skills/rust-anything/`；对 `SKILL.md` 与 `whole-app.md` 检索 `rust-anything setup`、`.mcp.json`、`--agent claude`、`cargo install` 均无命中；含 `mcp__rust-anything__` 17 处、`mcp_call` 与 `record`、`gate` 说明。

### AC-004：analyze 在真实项目上给出可读计划

- 对应规则：R-002
- 前置条件：`tests/fixtures/go-fuzzy` 副本就位。
- 操作或输入：`mcp_call` 调用 `analyze`，参数为副本路径。
- 预期结果：返回包含 `start_here` 单元的分析结果，语言识别为 Python。
- 验证状态：通过
- 验证证据：`analyze` 于 `/tmp/ra-verify`（上游 `tests/fixtures/go-fuzzy` 副本）返回 `language: "python"`、2 个单元（`app.py`、`fuzzy.py`）、`start_here: ["fuzzy.py"]`，并列出 string-offsets 与 division-semantics 风险及其 `file:line`。

### AC-005：bridge 与 record 产出可编译单元与用例

- 对应规则：R-002、R-004
- 前置条件：AC-004 通过并选定一个单元。
- 操作或输入：依次调用 `bridge` 与 `record`。
- 预期结果：生成 `rust/<unit>` crate 与 `cases.jsonl`；crate 能通过 `build`。
- 验证状态：通过
- 验证证据：`bridge` 生成 `/tmp/ra-verify/rust/fuzzy-rs`（12 个文件，exports `levenshtein`、`dedupe`）；`record` 录制 440 例（dedupe 206、levenshtein 234，errors 0、traps 40）；`build` 产出 `python/fuzzy_rs`。

### AC-006：最小闭环的 diff 与 gate

- 对应规则：R-002
- 前置条件：AC-005 通过，且在 `src/port.rs` 写入实现。
- 操作或输入：调用 `diff` 与 `gate`。
- 预期结果：`diff` 报告全部录制用例匹配；`gate` 通过并允许 `enable`。
- 验证状态：通过
- 验证证据：在 `src/port.rs` 实现 `levenshtein` 与 `dedupe` 后，`diff` 返回 `total 440 / passed 440 / failed 0`、`trend.stalled: false`；`gate` 返回 `passed: true`，12 项检查全过（fmt、clippy 无警告、cargo test、0 unsafe、lockfile、无 unimplemented、size 1.7x、error cases、panics、build、api、behavior 440/440）。

### AC-007：失败可见

- 对应规则：R-001
- 前置条件：临时将 `vendor/linux-x64/rust-anything` 移走且 PATH 上没有 rust-anything。
- 操作或输入：启动 launcher 的 `mcp` 模式。
- 预期结果：非零退出并在 stderr 输出安装指引；恢复文件后 AC-001 仍通过。
- 验证状态：通过
- 验证证据：把 `vendor/linux-x64/rust-anything` 移走后，launcher 退出码 1，stderr 打印期望路径与两条获取方式；移回后 AC-001 复测仍返回 22 个工具。

## 7. 未决问题与假设

### Q-001：本地 link 安装下的路径解析

- 类型：已解决（原未决问题）
- 内容：`install_bundle` 以本地目录安装时 link checkout，patch 中 `baseUrl` 解析出的 launcher 绝对路径是否指向 profile 根；以及 `vendor/` 二进制的可执行位是否保留。
- 影响范围：AC-001、AC-002、R-001。
- 是否阻塞：否，已解决。
- 决定或验证方式：安装后读取激活结果与 MCP 连接状态。
- 结论：写入即生效。profile 把 checkout 链到 `node_modules/@local/dsh-rust-anything`，patch 中的 `./node_modules/@local/dsh-rust-anything/bin/launcher.mjs` 按 `baseUrl` 解析成功，MCP 服务器随即连上；`vendor/` 二进制的可执行位保留（`chmod +x` 后由 git/文件系统承载）。无需改为 launcher 内自解析。

### Q-002：record 环节的编译成本

- 类型：已解决（原暂用假设）
- 内容：假设 Python fixture 的 `record` 能完成 PyO3 编译并联网拉取依赖。
- 影响范围：AC-005、AC-006。
- 是否阻塞：否。
- 决定或验证方式：实际执行。
- 结论：`record` 只运行原程序，不编译；`build` 在本机成功产出 `python/fuzzy_rs`（PyO3 0.30 依赖可用），AC-005、AC-006 均未受阻。

### Q-003：大输出经 mcp_call 的可用性

- 类型：已解决（原未决问题）
- 内容：`analyze` 等大输出经 `mcp_call` 返回时是否被截断，是否需要改为写文件再读取。
- 影响范围：AC-004、R-003 中关于参数与输出的说明。
- 是否阻塞：否。
- 决定或验证方式：AC-004 执行时观察返回体。
- 结论：未截断，但同一份结果以 `content[0].text` 与 `structuredContent` 各返回一次，体积约翻倍。已在 skill 的"如何调用工具"一节注明读 `structuredContent`，无需改为写文件。

### Q-004：是否追加原生工具

- 类型：未决问题
- 内容：是否在后续版本把 `go`、状态汇总、`report` 包成 DSH 原生工具，以获得常驻可见与输出裁剪。
- 影响范围：D-003 的后续增量、R-002。
- 是否阻塞：否。
- 决定或验证方式：本次跑通后按实际使用体验决定。

### Q-005：插件清单的渲染显示未核验

- 类型：未决问题
- 内容：`locale/en.json`、`locale/zh.json` 的标题与描述、`icon.svg` 与 `docs/DETAIL.md` 已在文件层验证（JSON 可解析、SVG 为 36×36 且 321 字节、`install_bundle` 无 warnings），但 Plugins 列表与详情页的实际渲染没有在浏览器中查看。
- 影响范围：R-005、R-006、AC-002。
- 是否阻塞：否。
- 决定或验证方式：打开 Plugins 页确认标题、描述、图标与详情页正文；若出现元数据诊断或回退到默认图标，按 R-005 修正。

## 8. 技术设计

### 模块与职责

| 路径 | 职责 |
|---|---|
| `package.json` | bundle 清单：`dsh.bundle.patch`、`exports` 暴露 `./locale/*.json` 与 `./icon`、`files` 覆盖运行期文件 |
| `cordis.patch.yml` | 插入两行：skill provider Host 行、`@deepseek-ai/dsh-mcp-client` 行 |
| `index.js` | Host 插件：`inject: ['skills']`，`apply` 内 `ctx.skills.registerProvider()` 注册 `rust-anything` |
| `bin/launcher.mjs` | 按 `platform-arch` 解析内置二进制，回退 PATH，透传 stdio 与退出码 |
| `vendor/linux-x64/rust-anything` | 上游 4.0.0 预编译二进制 |
| `skills/rust-anything/SKILL.md` | 改写后的流程正文，作为 skill 的 locator |
| `skills/rust-anything/whole-app.md` | 整应用迁移的补充流程，作为 skill 资源 |
| `locale/en.json`、`locale/zh.json` | 显示元数据 |
| `docs/DETAIL.md` | 插件详情页正文 |
| `icon.svg` | 插件图标 |

### 依赖与交互

DSH 加载 bundle 后插入两行：Host 行只依赖 `ctx.skills`；MCP 行由 `@deepseek-ai/dsh-mcp-client` 以 stdio 启动 `node <launcher> mcp`，后者再 spawn 内置二进制。模型侧链路为：skill 提供纪律与工具名 → `mcp_search` / `mcp_call` 调用 `mcp__rust-anything__*` → MCP server 执行 CLI 逻辑。bundle 不声明 npm 依赖，避免本地 link 安装下的依赖解析不确定性。

### 关键技术选择

- 不引入 npm 依赖，二进制直接 vendor（D-006）。
- `command` 使用 `!!js process.execPath`，`args` 用 `baseUrl` 解析 launcher 路径，沿用 profile 内既有 MCP bundle 的写法（D-010）。
- skill 正文按需读取，不内联进系统提示（R-003）。

### 已知限制与取舍

- 仅 linux-x64；其他平台需补 `vendor/<platform>-<arch>/`。
- 依赖 profile 的 `mcp-proxy` 调用方式；未安装该代理的 profile 中工具会直接以 `mcp__*` 出现，skill 中两种调用方式都需说明。
- `record`、`diff`、`gate` 会执行原程序，须在项目副本上运行。
