# 工作进度记录

规则：每个工作项完成后追加一条。这里记录交付和证据，不把计划写成完成事实。

## 2026-11-08

### 工作项：本地 Superagent Harness 抽取

- 领域/模块：`workbench.execution`，本地只读 Harness
- 实现：将 planning → bounded research → synthesis 从 `Engine.execute()` 抽到 `LocalSuperagentHarness`；Store 继续保存 Run/Agent/Call/Artifact/Event；保留同一取消、暂停、预算和错误语义。
- 验证命令：`.venv/bin/python -m pytest -q`
- 结果：142 项通过；保留现有 Starlette/httpx 弃用提醒。
- 未完成/unknown：Agent Work 前端阶段图尚未接入；没有真实 Provider、OpenMausBot fork 或多端运行。
- 下一步：建立 `HarnessPort`/backend 只读适配。

### 工作项：Agent Work 真实可视化

- 领域/模块：`workbench.execution`、真实 Web 工作区
- 实现：Run detail 返回本地 Harness 能力和 Planning/Research/Synthesis 阶段事实；新增 Agent Work 导航、最近 Work 列表、运行阶段图和目标/事实边界面板；仅使用持久 Run/Agent/Call/Artifact/Event，不生成静态任务。
- 验证命令：`node --check web/app.js`；`PLAYWRIGHT_MODULE=/tmp/mybot-design-tools.VtVbIr/node_modules/playwright/index.mjs CHROME_PATH=/usr/bin/google-chrome node tests/verify-live.mjs`
- 结果：浏览器 5 个视口、7 条交互通过；无外部请求；FakeProvider fixture only。
- 未完成/unknown：真实 Provider、OpenMausBot fork、手机真机、Cindy 多端控制和中英文切换尚未接入。
- 下一步：抽 `HarnessPort` 与 `BackendConnection/ConversationRef` 只读合同，再接 OpenMausBot fork。

### 工作项：DDD/设计模式/双语架构决策

- 领域/模块：架构与跨模块边界
- 实现：新增 ADR-0005，确定模块化单体、战术 DDD、六边形端口适配、状态机、ACL、幂等与中英文 code/key 方案。
- 验证命令：`git diff --check`、本地文档链接检查。
- 结果：通过；未引入微服务、事件溯源或额外平台。
- 未完成/unknown：目录迁移、i18n 资源、BackendConnection/ConversationRef 尚未实现。
- 下一步：以 Work/Execution/Conversation 三个边界开始增量迁移，不一次性重构。

### 工作项：swarm-cursors 参考登记

- 领域/模块：Agent Work 可视化参考
- 实现：记录 fork/parent/commit、Chrome 扩展 blueprint/依赖/回放机制和无 LICENSE 风险；未复制代码、动画或素材。
- 验证命令：`git diff --check`、README/元数据只读核对。
- 结果：确定为机制/视觉参考，非 RuntimeAdapter。
- 未完成/unknown：未取得授权发布包，未运行扩展，Chrome 权限和网络行为未知。
- 下一步：只在真实 Agent 事件已有后评估轻量阶段动效。

### 工作项：本地工作台预览

- 领域/模块：真实 `workbench/` + `web/`
- 实现：复用当前本机工作台进程，未启动第二个服务。
- 验证命令：`curl http://127.0.0.1:4180/healthz`
- 结果：HTTP 200，返回 `{"status":"ok"}`；进程为 `.venv/bin/python -m workbench --host 127.0.0.1 --port 4180`。
- 未完成/unknown：当前端口只监听 `127.0.0.1`，手机/其他机器不能直接访问；真实 Provider、真机和远程 HTTPS 未验收。
- 下一步：本地浏览器评审 Agent Work；如需手机访问，再单独配置 HTTPS/私网/令牌。

补充故障记录：旧的 4180 进程曾从 `/home/my/workspace/ainfra/mybot` 启动，因找不到当前仓库的 `web/index.html` 返回 500。已停止旧进程并从 `/home/my/workspace/ainfra/mywork/mybot` 重新启动；`GET /` 返回 200，`GET /healthz` 返回 200。

### 工作项：T3 Code / 本地默认 Harness 规则

- 领域/模块：HarnessAdapter、Provider discovery、凭证边界
- 实现：登记 `gottaBoy/t3code` fork 与 commit；确定显式环境模型与 CLI binary 发现规则，不自动读取 Codex credential store。
- 验证命令：GitHub metadata、README/LICENSE 固定读取；未安装、未启动、未执行 CLI。
- 结果：T3 Code 作为控制面参考，不作为 mybot 事实源；Codex CLI 后续通过显式 adapter 复用登录态。
- 未完成/unknown：CLI adapter、默认模型持久化、模型连接设置 UX、真实 Codex/Provider 验收。
- 实现补充：bootstrap 暴露 `local_harnesses`（仅 binary discovery）和 `default_model_id`；`WORKBENCH_DEFAULT_MODEL_ID` 可显式指定已有模型配置，不读取 credential store。
- 下一步：先做只读本地 Harness discovery，再接 BackendConnection/ConversationRef。

补充实现：`/api/bootstrap` 现在返回显式 `default_model_id` 和本地 CLI binary discovery；模型配置页显示已发现 CLI 但标记“认证未验证”。当前不会自动读取 Codex credential store，也不会因为发现 `codex` 自动发请求。

UI 纠偏：模型设置页已明确区分本地 Harness 与模型连接；Codex CLI 只显示“已发现，认证未验证”，并提示 Codex Adapter 尚未启用。没有自动导入 API key 或调用模型。

默认模型 UX：新增工作区 `default_model_id` 设置和“设为默认”操作；保存默认模型只写 SQLite/事件，不调用 Provider。模型连接与本地 Harness 仍保持两条独立路径。

Codex Adapter：新增 `codex_cli` 模型类型和 `/api/models/enable-codex` 显式启用入口。运行时使用 `codex exec --json --ephemeral --sandbox read-only --skip-git-repo-check`，复用 CLI 登录态但不读取/复制 credential store；启用配置和发现阶段不调用模型。Python 回归 144 项、浏览器 5 视口/8 交互通过。

本地配置已按用户要求启用：模型 ID `ece2522034bb485597b7810a44586af5`，类型 `codex_cli`，endpoint `codex://local`，并设为默认模型。启用/设默认均未发起模型请求；认证状态仍保持 `unverified`，首次真实 Run 需用户明确确认。

Codex Run 故障修复：首次真实 Run `87aae32dfb064612a879a2168577cb9c` 因 Codex CLI 未回传结果而被取消，正确保留 `provider usage may be unknown`；发现旧 Adapter 取消时未回收 CLI 子进程，已增加 subprocess wait/kill/cancel 清理和 fake CLI 输出测试。回归更新为 145 项。

补充根因修复：`codex exec --json` 的最终消息事件可能使用 `agent_message`，也可能只写入 `--output-last-message`；旧解析器只识别 `agentMessage`，导致 Run `21457a3f19ce497e87bcd7e7d54d0abf` 的 `codex_cli_empty_response`。现在优先读取官方输出文件并兼容 snake_case JSONL；未自动重跑失败 Run。Provider/Workbench 定向测试 41 项通过。

预算边界修复：Run `21457a3f19ce497e87bcd7e7d54d0abf` 暴露规划重试耗尽汇总预算的问题；现在 Harness 会为 synthesis 预留一个调用，预算不足时减少研究子任务并写入 `plan.adjusted`。新增重试/恢复测试通过；当前历史 Run 不回写，需新建 Run 验证修复。

Codex 并行边界修复：Run `ab817dee05234e36b19122018ddfc86f` 在两个 Codex CLI 进程并行时一个研究调用超时，导致 Research 阶段失败、Synthesis 未开始。现在检测到 `codex_cli` 时自动将研究并行上限收敛为 1，避免共享 CLI 登录态/工作目录并发冲突；历史 Run 不重写，需新建 Run 验证。

Codex 可靠性优化：Adapter 现在为每次 CLI 调用建立独立进程组，超时/取消时 kill 整组并限时回收；超时可通过 `WORKBENCH_CODEX_TIMEOUT_SECONDS` 调整（10–300 秒，默认 90）。失败 Run 的自动继续最多允许两次失败/中断尝试，超过后要求新建 Run 或切换 Adapter，避免重复消耗。完整回归更新为 146 项。

Codex app-server 方向研究：使用本机 `codex app-server generate-json-schema --experimental` 生成临时协议 schema，确认存在 `initialize`、`thread/start`、`turn/start`、`item/completed` 等长驻会话协议；未启动 app-server、未调用模型、未把临时 schema 纳入仓库。后续若继续优化，优先做每个 Run 一个长驻 Codex session 的隔离实验，替代每次 cold-start `codex exec`。

### 工作项：Codex 单通道调度、恢复预算与超时诊断

- 领域/模块：`workbench.execution`、Codex Provider、调用审计
- 实现：Codex 单通道研究真正顺序调度；首个失败后排队 Agent 保持 pending。连接测试和 Run 共用 CLI 锁。恢复时按未完成步骤计预算、不丢弃已完成研究。CLI 总时限覆盖全部等待、JSONL 有上界且不累计原始事件，所有退出路径回收进程/读取任务/临时文件。记录固定协议标签、事件数、部分正文标记、最后事件时间差和退出/回收状态；合法 `turn.completed.usage` 才计量。调用详情显示安全诊断。
- 验证命令：`.venv/bin/python -m pytest -q`；`PLAYWRIGHT_MODULE=/tmp/mybot-design-tools.VtVbIr/node_modules/playwright/index.mjs CHROME_PATH=/usr/bin/google-chrome TEST_PORT=4182 node tests/verify-live.mjs`；`node --check web/app.js`；`git diff --check`
- 结果：155 项 Python 测试、浏览器 5 视口/9 条交互通过，含超时诊断手机/桌面弹窗；无浏览器外部请求。Python 编译、JavaScript 语法和 diff 检查通过；保留 Starlette/httpx 警告。
- 未完成/unknown：未重跑 `8bd1...`；没有调用真实 Provider；诊断不能证明远端是否已结算。
- 服务验证：确认无活动 Run 后重启 4180；`/healthz` 返回 `ok`。原 Run 仍为 failed、3 次调用、0 成果、19 条事件，最后事件 seq=113，未新增执行记录。
- 下一步：保留 `codex exec` 为默认，完成 app-server 离线协议夹具后，再取得明确授权做一次新的最小真实 Run。

### 工作项：Codex App Server 草稿复核与撤回

- 领域/模块：`workbench.provider`、RuntimeAdapter 边界
- 实现：曾尝试可选会话草稿；最终按本机生成 schema 核对发现 `turn/completed` 嵌套 ID、抢先通知、跨角色隐式历史与工具 ceiling 均需完善。已撤回本轮草稿和生产路由，不提供传输环境开关；现有 exec 路径保留。
- 验证依据：本机生成的 ThreadStart/TurnStart/TurnCompleted/ItemCompleted schema 与既有受控文本 smoke 代码。不是新的 REA 或模型运行证据。
- 结果：原简化 fake server 通过不能代表协议兼容，已撤回“可选适配器完成”的口径；新增 [可靠性复盘与分步门槛](CODEX_RELIABILITY_PLAN.md)。
- 未完成/unknown：长驻适配器、无工具 ceiling、Token 硬上限、预检/能力版本记录、真实 Run 验收与断线恢复。
- 下一步：按文档 A–F 离线验收，再单独取得 G 项真实调用授权；不得静默切换或重放未知结果。

### 工作项：重试与资源分配

- 领域/模块：Work/Execution Recovery、Run/Agent/Artifact lineage、真实 Web
- 实现：新增 `retry_preview` 与 `retry` API。失败、取消、中断、暂停运行可先查看来源快照、历史调用、未知用量、复用/待重试步骤和最低新增预算；创建新的关联 Run。已完成 Agent 输出和 Artifact 以 `source_*_id` 引用复制，不产生新调用；未完成角色可更换模型，配置新增调用预算、研究并行数、单次调用时限和输出上限。提交校验显式 consent、未知结果确认、快照 hash、预算、密钥和活动 Run；同一 request ID 幂等，不自动重试来源 Run。UI 新增“重试与资源”面板、模型/预算/时限编辑、资料位置、确认重置、来源链路和关联 Run。
- 验证命令：`.venv/bin/python -m pytest -q`；`PLAYWRIGHT_MODULE=/tmp/mybot-design-tools.VtVbIr/node_modules/playwright/index.mjs CHROME_PATH=/usr/bin/google-chrome TEST_PORT=4182 node tests/verify-live.mjs`；`node --check web/app.js`；`git diff --check`
- 结果：180 项 Python 测试通过；浏览器 5 视口、11 条交互通过，无外部请求；重试流程验证只新增 1 次调用、复用 3 个步骤、来源 Run 不变、响应式弹窗和刷新链路保留。
- 未完成/unknown：尚未对历史真实 Codex Run 执行重试；Provider 远端未知结果仍可能产生费用；来源 Run 的审查决定会使 snapshot hash 变化并要求重新预览。
- 下一步：先在本地 FakeProvider 继续覆盖断电/多次显式重试，再由用户明确选择模型和资源后决定是否为真实 Run 创建新的重试。

### 工作项：真实重试 Run `bd69b087d85b4531837075eac9cbd2de`

- 领域/模块：真实 Codex Run、Recovery lineage、调用诊断
- 来源：`8bd1d79b7cc94f5d8aa518819a362320`。来源 Run 曾在事件 seq 113 记录 `codex_cli_timeout_outcome_unknown`，之后手动继续在 seq 114 触发 `research_budget_exhausted`（seq 116）；历史事实未改写。
- 实际配置：复用规划；`max_calls=8`、请求并行 `2`（Codex 有效单通道）、`call_timeout_seconds=120`、输出上限 `1800`；来源只包含目标/验收/项目备注，显式文件数为 0。
- 结果：规划 Agent 复用，无新调用；第一个研究调用在 120014 ms 超时，记录 24 个白名单事件、最后类型 `command_execution`、部分正文标记为 true、最后事件距今约 46950 ms、进程已回收；用量未知。第二个研究保持 pending，汇总未执行。Run 状态 `failed`，错误 `codex_cli_timeout_outcome_unknown`，没有成果。
- 判断：预算分配和来源复用工作正常；当前阻塞是 Codex Provider/任务时限，不是恢复预算错误。由于没有显式源码文件，模型没有收到项目源码快照；重复重试同一快照不会增加源码依据。
- 下一步：不要盲目继续该 Run。若要继续同一快照，改用可验证的其他模型 Provider、单研究步骤和 180–240 秒单次时限；若目标是研究本仓库，先新建任务并显式选择允许发送的源码文件，再创建新 Run。

## 2026-11-09

### 工作项：Codex 隐式上下文隔离

- 领域/模块：Codex CLI Adapter、Provider 安全边界
- 实现：Codex 不再以用户仓库作为 cwd；每次调用创建临时空目录，传入 `-C`，并设置 `--ignore-user-config`、`--ignore-rules`、`project_doc_max_bytes=0`、禁用 web search 和 shell 环境继承。仍使用 CLI 自己的认证，不读取或复制 credential store；用户确认的快照通过显式 prompt 发送。诊断中记录隔离状态，但不保存路径、stderr、命令正文或隐式规则内容。
- 验证命令：`.venv/bin/python -m pytest -q`；`PLAYWRIGHT_MODULE=/tmp/mybot-design-tools.VtVbIr/node_modules/playwright/index.mjs CHROME_PATH=/usr/bin/google-chrome TEST_PORT=4182 node tests/verify-live.mjs`；`node --check web/app.js`；`git diff --check`
- 结果：181 项 Python 测试、5 视口/11 条浏览器交互通过；新增 fake CLI 验证仓库 `AGENTS.md` 不在 cwd、用户配置/规则被忽略；无外部浏览器请求。
- 未完成/unknown：尚未对隔离后的参数执行新的真实 Codex Run；`read-only` 与 cwd 隔离不等于完整无工具 capability ceiling；现有真实 Run 记录不重写。
- 下一步：提交本轮隔离修复；随后进入 Phase 3 OpenMausBot 只读 `BackendConnection/ConversationRef` 合同，不启动真实账号或发送接口。

### 工作项：OpenMausBot 只读后端合同骨架

- 领域/模块：Conversation/Backend Domain、Store/API
- 实现：新增稳定的 `BackendConnection`、`ConversationRef`、`MessageRef` 和 `ConversationBackendPort` 合同；新增 `UnconfiguredConversationBackend`，明确未配置时只返回空会话、不提供消息发送路径。SQLite 增加 `backend_connections`/`conversation_refs` 表和只读查询 API：`GET /api/backends`、`GET /api/backends/{id}/conversations`；Bootstrap 暴露持久化 backend 列表。当前没有网络客户端、真实账号发现或发送接口。
- 验证命令：`.venv/bin/python -m pytest -q`；`PLAYWRIGHT_MODULE=/tmp/mybot-design-tools.VtVbIr/node_modules/playwright/index.mjs CHROME_PATH=/usr/bin/google-chrome TEST_PORT=4182 node tests/verify-live.mjs`；`node --check web/app.js`；`git diff --check`
- 结果：184 项 Python 测试、5 视口/11 条浏览器交互通过；只读 backend 持久化/空状态合同通过；无浏览器外部请求。
- 未完成/unknown：OpenMausBot fork 尚未连接；没有分页消息适配、403/断线/schema 变化映射或真实 API；UI 只暴露底层 bootstrap 状态，尚未添加会话工作区。
- 下一步：为固定 fork 实现隔离 MockTransport 的只读 Adapter，先覆盖 Bot/Conversation/Message 分页、游标去重和错误映射，再接 Web 会话列表。

### 工作项：授权真实重试完整收敛

- 领域/模块：Codex CLI、Recovery、研究/汇总与成果
- 授权与配置：用户明确“你自己跑吧”；只创建一个关联重试 `49acc6c258094a2794b153a6b6629800`，来源 `bd69b087d85b4531837075eac9cbd2de`。复用规划；新增预算 3 次、并行 1、单次时限 240 秒、连续执行时限 10 分钟。没有自动再次重试。
- 实际执行：2026-11-09 00:40:55 至 00:46:20（Asia/Singapore），总历时约 325 秒。Research-0 109074 ms、Research-1 126864 ms、Synthesis 88651 ms，全部 succeeded；规划来自 source_agent_id 引用、未产生新调用。
- 用量：三次 CLI 事件报告 input 12919/12918/15623、output 2890/3539/3564；合计 input 41460、output 9993、total 51453。仅本次调用，不叠加来源未知用量；CLI 计量不是结算账单，费用金额未知。
- 结果：2 份研究成果和 1 份《研发调研方案》，均 decision=pending。Run succeeded、error=null；通过本机 Run API 再次读取确认，当前无 active Run。来源 Run 和历史调用未重写。
- 边界：没有附加明确源码文件，成果只能作为分析提案，不是仓库实现审计、测试通过或人工接受证据。模型输出引用了 CLI 自动上下文的 AGENTS.md，说明隐式指令注入仍需治理；未采集原始工具事件，不能根据正文自述证明无工具执行。可见 output tokens 超过配置 1800，进一步确认该字段不构成 CLI token 硬上限。
- 验证方式：只读 `/api/runs/49acc6c258094a2794b153a6b6629800` 与 `/api/bootstrap` 核对阶段、调用、成果、用量和空活动队列；本次没有改业务代码或重跑离线测试。此前 180 项 Python、5 视口/11 条交互证据独立保留。
- 下一步：先人工审查成果；项目研究需另行选择原始源码/研究文档快照并确认发送。继续实现 CLI 能力边界时按 CODEX_RELIABILITY_PLAN，不把这一次成功当作故障率或完整安全验收。

## 维护说明

上游研究证据写入 `docs/OPEN_SOURCE_RESEARCH.md` 和对应 REA 文档；本日志只记录 mybot 的工作项，不能替代上游 Evidence。

## 当前路线引用

完整目标、阶段、验收和停止条件见 [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)。当前主线是 Phase 3：OpenMausBot fork 固定版本的只读 BackendConnection/ConversationRef；Cindy/Headscale/IM/代码执行均为后续阶段。
