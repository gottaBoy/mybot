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
- 实现：新增稳定的 `BackendConnection`、`ConversationRef`、`MessageRef` 和 `ConversationBackendPort` 合同；新增 `UnconfiguredConversationBackend`，明确未配置时只返回空会话、不提供消息发送路径。SQLite 增加 `backend_connections`/`conversation_refs` 表和只读查询 API：`GET /api/backends`、`GET /api/backends/{id}/conversations`；Bootstrap 暴露持久化 backend 列表。新增 `OpenMausBotReadOnlyAdapter` 隔离 MockTransport 映射：只读 GET、conversation/message 分页、cursor、重复 ID 去重、403/404/5xx/schema/revoked 错误码。
- 验证命令：`.venv/bin/python -m pytest -q`；`PLAYWRIGHT_MODULE=/tmp/mybot-design-tools.VtVbIr/node_modules/playwright/index.mjs CHROME_PATH=/usr/bin/google-chrome TEST_PORT=4182 node tests/verify-live.mjs`；`node --check web/app.js`；`git diff --check`
- 结果：191 项 Python 测试、5 视口/11 条浏览器交互通过；只读 backend 持久化、Adapter 分页/错误合同通过；无浏览器外部请求。
- 未完成/unknown：OpenMausBot fork 尚未连接；默认路径没有真实 HTTP endpoint/认证配置，未验证原生 MCP client、SSE/replay、真实 schema 或账号撤销。
- 下一步：已固定研究 commit 常量；继续核对原生只读端点/协议，优先读取固定 fork 的 MCP/HTTP 路由，之后再把 Adapter 接入 backend service，而不是直接连接用户账号。

补充实现：从固定发布包 `dist-server/scripts/mcp-server.js` 核对出只读路径 `GET /api/bots` 和 `GET /api/threads/{threadId}/messages?limit=N`，新增 `OpenMausBotNativeReadAdapter` MockTransport 映射。Bot `threadId` 映射为 ConversationRef，消息映射为 MessageRef；没有实现发送/任务/审批路径。当前仍无真实 HTTP/MCP 连接，消息接口的 bounded recent semantics 也不等于 cursor/SSE replay。

补充实现：新增 `check_health()` 只读健康合同，对应观察到的 `GET /api/health`；验证 app identity、packaged 标记，以及 401/403/错误服务身份映射。健康检查不修改 BackendConnection、不保存凭证、不触发模型或消息操作。完整回归更新为 195 项。

### 工作项：授权真实重试完整收敛

- 领域/模块：Codex CLI、Recovery、研究/汇总与成果
- 授权与配置：用户明确“你自己跑吧”；只创建一个关联重试 `49acc6c258094a2794b153a6b6629800`，来源 `bd69b087d85b4531837075eac9cbd2de`。复用规划；新增预算 3 次、并行 1、单次时限 240 秒、连续执行时限 10 分钟。没有自动再次重试。
- 实际执行：2026-11-09 00:40:55 至 00:46:20（Asia/Singapore），总历时约 325 秒。Research-0 109074 ms、Research-1 126864 ms、Synthesis 88651 ms，全部 succeeded；规划来自 source_agent_id 引用、未产生新调用。
- 用量：三次 CLI 事件报告 input 12919/12918/15623、output 2890/3539/3564；合计 input 41460、output 9993、total 51453。仅本次调用，不叠加来源未知用量；CLI 计量不是结算账单，费用金额未知。
- 结果：2 份研究成果和 1 份《研发调研方案》，均 decision=pending。Run succeeded、error=null；通过本机 Run API 再次读取确认，当前无 active Run。来源 Run 和历史调用未重写。
- 边界：没有附加明确源码文件，成果只能作为分析提案，不是仓库实现审计、测试通过或人工接受证据。模型输出引用了 CLI 自动上下文的 AGENTS.md，说明隐式指令注入仍需治理；未采集原始工具事件，不能根据正文自述证明无工具执行。可见 output tokens 超过配置 1800，进一步确认该字段不构成 CLI token 硬上限。
- 验证方式：只读 `/api/runs/49acc6c258094a2794b153a6b6629800` 与 `/api/bootstrap` 核对阶段、调用、成果、用量和空活动队列；本次没有改业务代码或重跑离线测试。此前 180 项 Python、5 视口/11 条交互证据独立保留。
- 下一步：先人工审查成果；项目研究需另行选择原始源码/研究文档快照并确认发送。继续实现 CLI 能力边界时按 CODEX_RELIABILITY_PLAN，不把这一次成功当作故障率或完整安全验收。

## 2026-11-10

### 工作项：004 统一工作项及计数

- 领域/模块：产品执行台账与交接
- 实现：建立 `docs/WORK_ITEMS.md`，逐项保留原 001–119 编号，区分完成/部分/待办/授权门槛/暂缓；阶段范围与执行包不重复计数。IMPLEMENTATION_PLAN/STATUS/CONTINUE/README 统一指向台账。
- 结果：119 项中 9 完成、35 部分、58 待办、15 授权门槛、2 暂缓，未完全完成 110 项。未将 mock 适配、健康可达、测试数或 commit 数计为整体业务完成。
- 验证：`tests/test_work_items.py` 检查编号唯一连续及状态统计与摘要一致。
- 下一步：按 B04/B05 执行包推进，完成后更新原编号状态和证据，保留真实接入/真机授权门槛。

### 工作项：执行包 B01–B03 本机连接配置、健康查询与撤销

- 领域/模块：Conversation/Backend Application Service、Store/API、真实 Web
- 实现：新增 BackendService；`POST /api/backends` 保存不联网，字面量回环 HTTP(S) origin 限制，拒绝原始凭证、自定义路径/settings/status；固定服务器侧 adapter/研究 commit。新增 `GET .../health` 查询持久结果，`POST .../check` 须 consent，最多一次 GET `/api/health`，拒绝重定向、64 KiB 响应上限、10 秒绝对期限，不携带凭证、不读取会话、不调用模型。
- 状态：可达仅为 reachable，authentication=unverified、read_access_verified=false；不把公共健康接口当成认证完成。新增 tested_at/test_status；撤销幂等，在途检查返回后也不能覆写 revoked。撤销后拒绝检查和缓存会话读取。
- UI：模型与控制页的会话后端区，添加连接、显式确认检查、撤销及状态/时间；桌面/手机截图均为明确测试夹具。
- 验证命令：`.venv/bin/python -m pytest -q`；`PLAYWRIGHT_MODULE=/tmp/mybot-design-tools.VtVbIr/node_modules/playwright/index.mjs CHROME_PATH=/usr/bin/google-chrome TEST_PORT=4182 node tests/verify-live.mjs`；`node --check web/app.js`；`git diff --check`。
- 结果：本轮先后完成定向测试及完整回归；最终数量以本条后续验证补充和 `tests/evidence/browser.json` 为准。新增后端状态/配置/撤销浏览器场景，无外部浏览器请求。
- 未完成/unknown：未新增生产后端连接，没有接入真实账号、启动上游或调用模型；不包含认证/配对、Bot 读取授权、历史分页、SSE/replay、断线接续和会话产品界面，关联原 008/013/017/118 仍部分完成。
- 下一步：B04 会话工作区 + B05 固定源码认证/读取 scope 离线核对；真实接入继续单独授权。

### 工作项：B04 会话只读工作区与连接页信息架构

- 领域/模块：`web/` 会话后端体验、Conversation Read Model
- 实现：将会话后端从模型设置页拆为独立“会话后端”页面；模型页只保留模型/Harness。后端页支持显式添加、健康检查、读取会话、读取消息缓存、撤销；保存不联网，读取/检查均需 consent。Bootstrap 返回会话引用，消息只读投影可查看，无发送入口。
- 验证命令：`.venv/bin/python -m pytest -q`；`PLAYWRIGHT_MODULE=/tmp/mybot-design-tools.VtVbIr/node_modules/playwright/index.mjs CHROME_PATH=/usr/bin/google-chrome TEST_PORT=4182 node tests/verify-live.mjs`；`node --check web/app.js`；`git diff --check`
- 结果：231 项 Python 测试、5 视口/14 条浏览器交互通过；测试仅使用 FakeProvider/MockTransport，无外部请求。
- 未完成/unknown：当前 UI 数据来自隔离 mock/本地投影，真实 OpenMausBot 认证、会话读取权限、SSE/replay 和跨端恢复未验收。
- 下一步：B05 核对固定 fork 的认证与读取 scope；之后再决定是否为真实后端增加适配器注册/连接状态刷新。

## 2026-11-11

### 工作项：B05 离线读取权限核对与 B04 完整读取回归

- 领域/模块：Conversation/Backend 访问边界、原生 Adapter、近期缓存及 UI
- 来源：本地固定 Git 对象 `gottaBoy/OpenMausBot` commit `1bc4749aa8307d7d6998bf86de4ef6478460dd93`；
  实际阅读 auth/session、thread route、wire、MCP 读取及 SSE replay 代表路径，记录到 OPEN_SOURCE_RESEARCH 第 18 节和 OPENMAUSBOT_READ_SCOPE。未 checkout/安装/执行上游；无新 REA capture。
- 发现：owner/service、admin/client 均不能当作天然只读 scope；Bot 列表必须显式 messages=0；
  消息使用 kind/text/role=user|bot/at 毫秒及 hasMore；历史页用 before/around，SSE 为带进程 epoch 的内存 replay，不是跨重启持久日志。
- 实现：默认生产 transcript 同步 fail closed，仅显式健康检查可联网；离线注入的 Adapter 测试允许合成读取。
  所有同步重验 origin，连接参数来自当前 Store，不依赖进程内上一次列表调用。Bootstrap/缓存读取/同步落库均检查撤销，在途结果不能写回已撤销连接。
- 数据边界：原生列表/消息 GET 拒绝重定向、10 秒总时限、1 MiB 上限；近期窗口 30 条，
  只保存允许的文本字段，去重、时间归一化、更新窗口时清掉已不在窗口内的旧记录；hasMore 与同步时间持久化，不宣称历史完整或 SSE 接入。
- UI：修正同步请求重复 `/api` 前缀；来源、角色、同步时间、近期条数和历史缺口可见；
  生产未通过权限门槛时禁用读取按钮。未将设置页拆分视为完整视觉改版，用户体验仍待评审。
- 验证：`.venv/bin/python -m pytest -q`：244 项通过，保留 Starlette/httpx 弃用提醒；
  `tests/verify-live.mjs`：5 视口/15 条交互通过，无外部浏览器请求；JS 语法、Python 编译、
  diff 检查通过。新增读取确认→消息→刷新缓存→转义/XSS→撤销的完整浏览器流程，补正此前 14 条交互未覆盖读取的证据缺口。
- 截图：tests/evidence/conversation-desktop.png 与 conversation-mobile.png，均为 MockTransport 合成数据，
  已实际查看，不是真实账号或真机认证。
- 未完成：最小权限宿主/代理、真实账号读取、原生历史翻页、SSE/replay、跨设备恢复。
  原台账仍 119 项中完成 9、未完全完成 110，不因新增 fixture 数量减少业务剩余项。
- 下一步：先定义最小权限读取宿主合同，继续打磨会话产品；真实上游/账号/付费调用独立授权。
- 服务：确认无活动 Run 后重载 4180；healthz=ok、backend_sync=false、生产连接数 0，
  没有新增正式会话、模型调用或账号连接。

## 2026-11-13

### 工作项：Astryx 真实业务工作台迁移切片

- 复核：既有后端闭环可复用，React 先前主要是摘要/模板工具；无动作按钮和未接路由
  是业务体验缺口。结论、架构与后续顺序记录到 ASTRYX_WORKBENCH_REASSESSMENT。
- 实现：`frontend/src/workbench/`、项目自有 `components/ui/`；任务/项目列表、筛选
  搜索、保存/快照确认、角色/资源、模型和连接配置、Run 阶段/Agent/调用/成果/审计、
  审查下载、暂停/确认取消。保存后等待刷新，Run 提交保留稳定幂等键；认证失效清除
  页面投影。中文/英文和明暗偏好持久化；未知用量和未执行测试独立呈现。
- 边界：生产仍从旧 `web/` 提供服务，React 在 5173；重试/资源/恢复和会话缓存有明确
  旧版入口。未开放生产 transcript 同步、外部应用、Shell、写入、部署或多用户权限。
  没有写正式运行数据、启用新账号或调用真实模型。
- REA：安装包 0.7.13 的组件类型/代表实现、i18n 与 Token + 本地运行对照；没有
  新 clone/升级/上游部署。来源、固定 commit、复现 clone 命令在 OPEN_SOURCE_RESEARCH
  第 20 节，原 MIT 通知保留。
- 验证：`pnpm typecheck`、`pnpm test`（112 项）、`pnpm build`；
  `.venv/bin/python -m pytest -q`（244 项，保留 Starlette/httpx 弃用提醒）。
  `verify-workbench.mjs` 的稳定生产预览 25 项检查通过，覆盖登录、保存、精确快照/
  consent、FakeProvider 预算/轮询、审查/下载/诊断、MockTransport 检查/撤销、搜索/
  筛选、1440/320/390/768px、明暗/双语、焦点返回/Escape、暂停/取消和退出清缓存。
- 预览回归：`verify-theme.mjs` 的 13 项检查和
  `verify-template-catalog.mjs` 的 58/58 模板通过，未触发业务/外部请求。
- 证据：`frontend/evidence/workbench/` 保存 fixture JSON 与代表截图；完整临时输出
  `/tmp/mybot-workbench-verification`、`/tmp/mybot-astryx-product-theme`、
  `/tmp/mybot-astryx-product-catalog`。复现命令见 frontend/README。
- 修复过程：浏览器揭示创建后短暂旧 Bootstrap 导致重复打开项目表单，已等待刷新再
  关闭；首次开发依赖优化热重载出现 hook 错误，最终生产预览无 pageerror。
- 性能：撤销 Core/全部图标/所有主题的粗粒度共享分组；初始三份 JS 约 0.82 MB、
  gzip 260 KB，不含 Monaco/TS 编译器/模板页；初始 CSS 约 348 KB、gzip 58 KB。
  可选预览/编译器仍有 >500 KB 构建警告。此次自动分块使 PreviewRunner 入口重新
  合并部分可选依赖，旧记录“入口约 16 KB”不再适用于本次构建，不隐瞒剩余体积。
- 未完成：React 原生重试/资源/恢复、会话缓存、生产切换、Safari/真机、完整性能预算；
  可视化当前仅为固定流程投影，非任意 DAG 编辑器。原 119 项整体计数不变，不能以
  本轮测试数宣称业务工作已全部完成。
- 下一步：先迁移重试/资源并验证历史保留与未知结果确认，再接只读缓存和生产等价切换。

## 2026-11-14

### 工作项：多 Agent 深入研究 Zira 并完善根 AGENTS

- 用户最新要求：保持 Astryx；学习 Zira 布局、列表/搜索/操作，并支持 mybot 自有样式
  与 Zira 配色切换；完整结构研究后由多 Agent 分工补充项目规则。
- 结构：只读 AST 索引覆盖 `zira/frontend/src` 的 625 文件、79,264 行、15 feature 域；
  记录 imports/声明/hooks/JSX/hash，顶层显式 path Route 35。0 语法诊断不等于
  类型/运行/安全验收。源码 HEAD `1ce0d0510cb590f3a79ca498f7239ff0852ed0d7`，
  相关工作区前后检查均无变更。
- 分工结果：交互 Agent 写 `ZIRA_STUDY_INTERACTIONS.md`；数据 Agent 写
  `ZIRA_STUDY_DATA.md`；管理 Agent 写 `ZIRA_STUDY_ADMIN.md`。主 Agent 合并
  `ZIRA_FRONTEND_STUDY.md`、根 `AGENTS.md`、交接及进度。
- 根规则：明确 Astryx-only 与单一业务组件树；顶栏搜索；query draft/committed/URL
  分层；选择/激活/分页独立；动作名称到 handler/API/结果的完整链；401/403/Abort
  不吞；身份/capability unknown 拒绝；统计/导出保留 unknown；缓存影响图；草稿/
  revision/hash/影响/consent 绑定；配置与执行事实分离，不复制假历史、无动作控件、
  TODO 播报或未经证明的乐观成功。
- 研究边界：结构扫描与核心源码链路深读分别记录，admin 等全部边角并未逐行审计；
  未启动 Zira、读其 `.env`/凭证/数据库/日志或执行其后端/测试。专题风险均为源码
  观察/推论，不冒称真实联调故障或全站验收。

### 工作项：20 个模板整合、一套 Astryx 多样式与 URL 状态

- 来源：已安装 CLI/Core/主题包 0.7.13；用户指定的 20 个模板生成至
  `frontend/src/app/`，重复 canvas 不覆盖。保留 copyright/MIT。CLI 从示例文字误报
  的 Next/canvas-editor 依赖未安装。采用边界见 ASTRYX_TEMPLATE_INTEGRATION。
- 实现：共享任务/运行投影驱动总览/进度/异常、列表/筛选 Table/看板、待处理双栏、
  项目层级与资料；Run 增加阶段工作图/缩放/检查器、真实 Agent 对话投影及头像组；
  独立 token 登录页明确 SSO 未配置；资料→资源→确认三步 Wizard；全局搜索移至顶栏。
- 主题：八种 style ID（含用户授权的 Zira Token 配色），明暗/密度/语言分开持久化；
  色板使用 Astryx RadioList，控件/表格/弹窗/命令面板/头像/Skeleton 仍通过项目包装，
  不引入 Zira UI 运行时。换肤不改 Run、不调用模型、不复制页面。
- URL：支持普通/hash query 的 jql/mode/view/groupBy/group；刷新/前进后退/视图切换
  保留。只实现 created/summary ORDER BY 白名单，其他 JQL、assignee/currentUser、
  非 none 分组明确拒绝，不伪装团队身份或完整解析器。
- 体验修正：所有任务视图按同一作用域/关键词处理未运行任务；恢复成功后的历史失败
  不作为当前 Inbox 异常；确认返回修改会撤销旧 consent；手机只让结果/画布区域横滚。
- 验证：最终 `pnpm build`（包含 TypeScript）通过；前端 127 项、Python 244 项通过。
  完整生产预览产品脚本 31 项通过，page errors 为 0；八样式×明暗共 16 组计算值，
  包含 Zira 精确主文字/背景、持久化、键盘、无 API 写、URL fail-closed 和手机。
  Theme Editor 13 项、58/58 模板检查通过。
- 测试过程：曾在叠层关闭和 viewport resize 尚未稳定时提前断言；测试改为显式关闭
  主题弹窗并等待布局条件稳定，最终完整重跑通过，不把失败的半程输出当通过证据。
- 证据：`frontend/evidence/integration-2026-11-14/`，完整临时输出在其 README。
  旧证据保留。初始 JS 约 1.02 MB raw / 323 KB gzip；可选/共享 chunk 仍有
  >500 KB 警告，后续需独立性能预算与拆分，不称性能优化已完成。
- 未执行：正式模型/CLI 重跑、企业 SSO、动态 DAG、IM/文档/邮箱连接器、跨设备迁移、
  存储迁移或服务部署。原 119 项台账计数不变，未把模板数/测试数记为业务完成数。

### 工作项：后端语言与 PostgreSQL 候选只读评估

- 建议控制面继续 Python/FastAPI，Rust 作为后续经测量确认的设备节点/系统模块候选，
  不因采用 Astryx 重写后端。
- 用户给的 mattermost-db / sub2api-postgres 仅检查版本、端口、网络、挂载和一次资源
  快照；分别是 PostgreSQL 15.19 / 18.6，均未发布宿主端口。二选一倾向后者但须独立
  数据库/专用角色，更推荐独立实例；这不是迁移已获执行授权。
- 详见 POSTGRES_EVALUATION。没有读取业务表/凭证、建库/改密码/重启；当前仍 SQLite。
- 下一步：按三份研究专题 P0 验收清单推进实际交互与请求合同，优先补 React 原生重试/
  资源和真实查询领域；不要用新的模板/图表掩盖执行、身份或权限缺口。

### 工作项：任务优先工作台，直接回应“排版太乱”

- 日期：2026-11-14。用户否定 `5173/#workbench` 的实际排版；本轮不新增演示页面，
  直接替换默认工作台的结果组织。原模板参考、旧设计和 `web/` 回退保留。
- 排版：标题→单条搜索/项目/状态筛选→结果工具栏→列表；去掉本屏概览指标、
  常驻项目右栏、重复新建按钮和单独草稿卡片。全局查找仍在顶栏。
- 事实：每个任务只占一行，以最近 Run 为当前状态；历史运行按需打开，不把旧失败
  当当前失败。未运行、看板、历史记录使用相同任务来源，任务 ID 在任务/运行查询一致。
- 交互：桌面可选 Inspector/独立历史滚动，手机 Astryx Dialog；展开状态、任务专属
  可访问标题、Escape 与焦点返回。关闭按钮支持关闭冗余 tooltip，避免抢先消费 Escape。
- 分页/排序：Astryx 受控排序后分页，桌面/手机同序；显式 JQL 优先于旧表头排序。
  page/pageSize 进入 URL，非法值拒绝；20/50/100 真正改变容量，刷新/前进后退已检查。
  Task created 排序使用真实 task.created_at，不偷换成最近 Run 创建时间。
- 多 Agent：数据 Agent 负责最新运行/任务搜索投影与测试；交互 Agent 更新真实业务
  浏览器回归及 45 项只读投影；审查 Agent 检查排序/分页并补 URL/Run 查询；主 Agent
  完成布局、包装层、无障碍、整体验证和记录。
- 最终验证：前端单测 167 项通过，`pnpm build --logLevel warn`（含 TypeScript）通过；
  完整生产预览浏览器 36 项、八样式×明暗 16 组计算值通过，page errors 为 0。
  320/390/768px 与 1440px 已检查；45 项合成任务验证完整排序后分页、手机同序、
  页码/容量恢复和纯视图操作无 API 写。既有 >500 KB chunk 警告仍存在。
- 修复过程：r1 测试未等待刷新数据；r2 发现真实的 tooltip/Escape 问题；修复后
  r3 从全新夹具目录完整重跑通过，不将失败的半程结果当作完成证据。
- 证据：`frontend/evidence/focused-workbench-2026-11-14/`；完整临时输出
  `/tmp/mybot-focused-workbench-20261114-r3/`。正式工作区只读预览，未重跑真实模型，
  测试服务 4187/5176 已停止，原 4180/5173 保留。
- 边界：这是待用户评审的新迭代，不宣布视觉已被接受。基本搜索/项目/状态及临时表头
  排序仍是本地状态，不声称所有查询状态可分享；完整 JQL/分组/身份、任意 DAG、
  IM/邮箱、真实执行器仍未新增。本轮无后端业务改动，未重跑 Python 测试；
  历史 244 项结果不冒充本轮新证据。原 119 项业务台账计数不变。

### 工作项：搜索与列表链路重做，复核 Zira 实际源码

- 日期：2026-11-14。用户再次否定 `5173/#workbench` 的“搜索 + 列表”，要求认真看
  Zira。本轮修订上一轮单排下拉方向，不将旧 36 项检查当作新体验被接受。
- 研究：逐段对照 IssueNavigatorPage、JqlBar/JqlInput、IssueTable/Row/Cell/Columns、
  手机列表、Pagination、FilterSidebar、ResultsState、Toolbar 和页头。HEAD 仍为
  `1ce0d0510cb590f3a79ca498f7239ff0852ed0d7`，Zira 源码未改动，未启动/读取账号。
  来源、观察、采用和缺口见 REA_ZIRA_LAYOUT 专项与 OPEN_SOURCE_RESEARCH 第 22 节。
- 查询：页头/查询带/结果区全宽分层；Basic 有独立草稿，搜索/Enter 才提交，IME
  不触发。模式/视图/外观变化保留草稿；显式清除重置 Basic 与 JQL 草稿。
- 结果：可折叠的真实状态/项目范围导航；计数、视图、排序、容量归入结果工具栏。
  编号/摘要/项目/状态/最近运行/历史分列，长摘要及项目单行截断，详情保留全文；
  修正历史数字裁切并新增检测。看板/运行记录不显示不会生效的任务容量选项。
- 状态：`q/filter/project/order/page/pageSize` 与既有 JQL/mode/view/group 参数一起
  进 URL；兼容旧 query 别名并规范为 q，非法枚举/页码拒绝，未知非自有参数保留。
  刷新/返回恢复同一结果，清筛选保留 order/pageSize，不重复制造四条历史。
- 手机：与桌面只挂载一份范围导航，手机从工具栏打开 Astryx Dialog；选择保持弹窗，
  Escape/关闭返回筛选入口。桌面打开详情再缩手机，关闭时回到可见的手机任务按钮，
  不再给隐藏桌面按钮设置焦点。
- 分工：数据 Agent 完成 URL 合同与 76 项定向测试；交互 Agent 更新提交式搜索/
  URL/手机与跨断点回归；审查 Agent 只读复核并指出焦点/残留草稿问题；主 Agent
  实现工作台/共享包装、检查截图、完整回归和记录。
- 最终验证：214 项前端单测、`pnpm build --logLevel warn`（含 TypeScript）通过。
  最终 r4 完整浏览器 38 项、16 组样式/明暗计算值通过，page errors 为 0；
  45 项独立只读投影验证草稿、组合 URL、排序/分页、长标题、计数尺寸和无 API 写。
  320/390/768/1440px 在正式脚本内；另对正式页面只读检查 1024/1280/1920px 及详情，
  没有发现 document 横向溢出。构建仍有既有 >500 KB chunk 警告。
- 过程：初始新单测发现 query→q 漏映射；第一次浏览器在测试的可选默认 filter 参数
  假设处失败，改为显式选择后记录严格组合检查点；中间截图发现计数裁切，
  修复后从全新夹具 r4 完整重跑。没有放宽真实查询/焦点/无写入断言。
- 证据：`frontend/evidence/search-list-2026-11-14/`；完整临时输出
  `/tmp/mybot-search-list-20261114-r4/`。此前版本的截图和历史日志保留。
- 边界：未引入 Zira UI 库、静态补全、假过滤器/假团队字段，仍是 Astryx 同一业务树。
  完整 JQL、负责人模型、保存过滤器、服务端搜索、任意 DAG/新执行权限未新增；
  没有真实模型调用或后端业务改动，本轮未重跑 Python 测试。原 119 项台账不变。
  用户尚未评审新版本，不能宣布视觉已达到要求；本轮未 commit/push。

### 工作项：全局功能与页面审计

- 日期：2026-11-14。用户要求整体分析 mybot 的功能与页面，而不是继续只修工作台。
- 审计范围：总览、工作台、待处理、项目、资料、模型与资源、会话后端、Run 工作区、
  表单/配置、移动端、主题和实验室。矩阵与 P0/P1/P2 路线见
  `docs/PRODUCT_UI_AUDIT.md`。
- 发现：页面骨架覆盖面较广，但壳层、页头/工具栏、状态 unknown、任务/Run/项目
  计数、移动详情和配置事实还未完全统一；高级 Astryx 控件应在真实字段合同成立后
  逐步引入，不能用组件替代缺失能力。
- 已改：总览“最近运行”使用 `taskItems` 的每任务最近 Run 投影，展示历史次数而非
  重复旧 Run，标题明确为“最近任务动态”；历史明细仍从工作台进入。
- 搜索补充：按用户截图与澄清，顶部 Quick find 和列表搜索保持独立；列表输入、
  Basic/JQL、搜索提交为同一行，桌面项目/状态共用 scope，手机使用已有 Filters
  Dialog 而非将下拉控件堆成多行。没有改变 API、模型请求或权限。
- 具体整改：三名 Agent 源码/交互/运行合同审计后记为 WUI-01–13；01–12 待实施，
  13 为本轮总览修正。包括项目页重复查询树、文档正文被目录过滤替换、Ctrl+K 叠层、
  模型测试未知重放、快照409恢复、React重试迁移、调用弹窗旧对象、手机待处理、
  树展开、快速查找缺任务源、字段/dirty保护和全局密度不完整。源观察与浏览器证据
  分开，不把审计结论写成全部复现或全部修好。
- 最终验证：214 项前端单测、含 TypeScript 的生产构建、39 项浏览器检查通过，
  page errors 为 0。新增 10 路由 × 1440/1024/390px 的 30 份测量/截图，以及
  3 种配置表单仅开合不提交；该审计段不产生 API 写。原有16组样式/明暗、320/390/
  768px、查询/历史/预算确认/焦点/取消回归保留。总览两次Run仅一行有浏览器断言。
- 证据：`frontend/evidence/product-ui-audit-2026-11-14/`；完整临时输出
  `/tmp/mybot-product-ui-audit-20261114-r2/`。首轮在表单“关闭”同名选择器处停止，
  修为明确页头控制后新夹具完整重跑，不放宽业务断言。独立测试服务已停止，
  原4180/5173保留。
- 边界：真实工作区仅只读预览，无正式模型请求、无后端业务改动或权限变更；本轮未
  重跑Python，仍有既有 >500KB构建警告。没有完成WUI-01–12、没有用户视觉接受、
  没有commit/push，原119项业务台账计数不变。

### 工作项：自顶向下排版蓝图（仅方案）

- 日期：2026-11-14。用户给出Columns/Sort截图后明确要求先整体排版分析，
  不继续按单个截图直接叠加菜单。最新方案见 `docs/LAYOUT_BLUEPRINT.md`。
- 关键判断：当前工作台页头/查询跨过Filters区域，导致空间职责不够清晰；
  新提案把全局导航、上下文和主内容分开，Filters与主内容页头同层。
- 主内容按页头→单行查询/条件/模式/视图→结果→单一分页；运行/文档/配置采用对应
  页面类型，而不是全部套表格。顶部通用搜索保持独立，未实现语义不伪装为控件。
- 补齐响应式宽度预算、详情收纳、列显隐/顺序/多排序合同、Astryx映射、实施门槛。
  尺寸为待验证设计约束，不称当前已使用新断点/所有高级组件已接入。
- 本轮仅改文档，无业务代码/模型请求/服务重启/新测试/commit/push。
  旧证据/设计/`web/`保留；不拿前一轮214/39结果证明新布局。

### 工作项：全部待办索引与多Agent第一执行包

- 日期：2026-11-14。用户授权“继续”布局，并要求“列出所有待办、多agent完成”。
  新总入口 `docs/TODO_INDEX.md` 完整保留原110条未完成ID/状态/标题，程序逐行核对
  顺序和唯一性一致：37部分/56待办/15授权门槛/2暂缓。原119项仍9完成，不和UI/BP相加。
- 主Agent BP-01：全局导航收紧208px；工作台根区域为范围栏/主内容，页头顶部对齐；
  搜索、项目/状态、模式与视图同排；容量/页码只保留底部。列表独立滚动，不滚出页脚。
  1280px起可停靠范围，1600px以下打开桌面详情时临时收范围，关闭后恢复记忆选择。
  手机模式保持核心查询一行，视图使用Astryx隐藏文字图标模式，条件仍从同份Dialog编辑。
  现有单字段排序保留为页头图标/Dialog；列配置/多排序未实现。
- 数据Agent WUI-02：ProjectDocuments的完整项目任务/目录匹配/正文选择分离；
  初始空项目后数据到达自动选有效项目，显式切项目清选择与查询；删除/跨项目任务
  显示不可用，不偷换项目背景；13项定向单测。
- 管理Agent WUI-07：调用详情只存callId，从最新detail.calls派生；缺失时明确不可用，
  不保留旧对象；3项定向单测。没有新增模型请求/重试或权限。
- 交互Agent：更新完整浏览器脚本，增加布局几何/同排控制、折叠扩宽、排序Dialog、
  Inspector空间、列表滚动/页脚；独立只读context验证资料选择与正常2500ms轮询中
  同一调用Dialog的running→succeeded→failed→missing。所有写入均拦截，新增场景不发模型。
- 最终：230项前端单测、含TypeScript的生产构建、44项完整浏览器检查通过，无pageerror；
  原10路由×3视口、3表单、16组样式/明暗与手机/键盘/确认/历史回归保留。
  证据 `frontend/evidence/blueprint-multiagent-2026-11-14/`；
  完整临时输出 `/tmp/mybot-blueprint-multiagent-20261114-r3/`。
- 修正过程：r1测试误匹配Astryx隐藏播报区，改精确领域计数；r2截图发现页头通用
  `> div`样式暴露关闭Tooltip，改项目自有heading-content选择器并加回归，r3全新
  夹具完整重跑。未放宽几何、URL、预算或无写入检查。
- 状态：BP-01本地完成，WUI-02/07/13本地完成，其余10个UI项及BP-02–05待办。
  不把旧业务条目因一次UI切片整体关掉；授权/付费/设备/部署门槛仍分别确认。
  生产入口4180与预览5173保留，测试4187/5176停止。无真实模型/后端业务/数据库/
  权限变化，本轮未重跑Python；仍有>500KB警告，未commit/push或宣布视觉最终接受。

## 2026-11-14：第二批多Agent整改与Issues深读

- 最新用户请求为按新截图“深度学习Zira中Issues”并继续。三Agent分别研究壳层/
  几何/主题、查询/过滤器/缓存、表格/排序/分页/详情/键盘；主Agent对照截图与真实
  路由，形成`REA_ZIRA_ISSUES.md`及三份专题。78个报告内本地链接/行号检查通过。
- 来源：本地授权Zira HEAD `1ce0d0510cb590f3a79ca498f7239ff0852ed0d7`；
  所读路径工作区干净。用户1853×963截图有独立SHA256记录，与此HEAD实际结构不同；
  没有运行/修改Zira、读其凭证或DB，也不以图中Basic/ZQL/Columns/20与50证明能力。
- 分层结论：学习全局/Filters/页头/主查询/结果/分页的空间责任；草稿、已提交查询、
  展示设置和对象选择分开。字段目录、条件、多排序、详情、保存视图、规模化与验收
  拆为IZ-01–08交叉切片，不与119项原台账相加，不表示截图版页面已实现。
- 同时收尾前批已授权代码：项目共用任务工作台、任务Quick find、子弹层快捷键、
  手机待处理、受控树展开、快照409显式重取、共享表单错误/dirty保护、原生恢复。
  列设置使用Astryx DropdownMenu，单排序收在右上；筛选折叠归筛选标题；
  全局舒适/紧凑/触控和独立强调色由同一包装层/Token实现。
- WUI-04新增持久模型测试回执与稳定request_id/consent、GET状态/Bootstrap latest_test、
  超时/重启unknown，不自动重复Provider调用。客户端有界等待、未知费用重新授权、
  跨刷新读取；修复ready内存草稿遮蔽服务器新回执，并在退出/认证失效清私有缓存。
- 安全复核保留缺口：WUI-06恢复unknown锁只在当前Run页面内持有，导航/刷新会丢失；
  需服务端持久操作意图与精确回执，不能标完整完成。继续原Run的接口尚无原子快照/
  幂等键；未固定的单次调用时限现显示执行器默认未知，不再称原值120秒。
  WUI-11已发生的history导航可能被规范化，尚非完整路由事务。
- 最终验证：367项前端单测、265项Python离线回归、含TypeScript的生产构建、
  57项完整生产浏览器检查通过，60份截图，无pageerror。查询控件外框紧凑/舒适/
  触控为28/32/40px，任务行37/45/53px；不把内部文字行高20px误当控件外框。
  保留>500KB构建警告及Starlette/httpx弃用warning。
- 真实修复：浏览器发现capture仅恢复地址但路由仍卸载表单。新增共享navigation-guard，
  路由/查询监听复用同一Event判定；6项单测和程序导航Keep/Discard场景通过。
  模型测试ready遮蔽回执问题也已补测。原Run未固定超时显示未知，不伪造120秒。
- 验收过程：旧disabled断言改验证字段错误且零POST；菜单名称匹配、NumberInput明确
  blur提交、外框尺寸测量、布局/异步回执等待均按实际合同修正；没有删检查来宣称通过。
  r1–r9为中途记录，不当成功；最终全新夹具r10完整通过。新增forms-only全mock调试入口，
  错误会保留失败URL/正文/截图；专项通过不能替代完整回归。
- 最终证据`frontend/evidence/issues-rea-2026-11-14/`，完整临时输出
  `/tmp/mybot-issues-ui-20261114-r10/`。UI 13项10项本地完成、WUI-01/06/11仍部分；
  原119项仍9完成/110未完全完成。临时4187/5176停止，正式4180/5173保留。
- 本轮没有真实模型/账号接入、部署、权限放开、正式业务数据写入、commit或push；
  正式4180/5173未重启。新模型测试合同仅在新建隔离后端验证，需后续前后端同步启用。

## 2026-11-15：多Agent收尾WUI-01/06/11

- 待办与分工先写入TODO_INDEX；数据Agent负责项目查询，交互Agent负责history事务，
  管理Agent负责恢复后端及独立只读复核，主Agent负责恢复客户端、真实API丢响应和综合验收。
- WUI-01：补5项项目合同单测和16项生产专项，固定项目范围、任务/Run计数、冲突参数、
  两项目/空项目、查询/状态/排序/容量/页、视图/刷新/BackForward、手机详情与焦点通过。
  原业务组件已满足此合同，本项未为测试额外重写组件；全API本地拦截，不外推后端ACL。
- WUI-06后端：新增RecoveryIntent持久表及prepare/list/exact/execute/abandon接口；
  prepared不排队不调用模型，显式consent后原子应用控制与applied回执。模型/来源指纹
  变化拒绝，单来源未决锁、同ID幂等、重启applying→unknown、旧入口门禁均有离线测试。
  41项新增Python测试；本机单Worker/SQLite不是分布式恰好一次。
- WUI-06客户端：稳定请求ID、注册资源候选、只读GET对账、路由/刷新恢复、显式弃用prepared；
  unknown不允许换ID绕过。applied是控制应用，不等于模型成功/费用结清。原执行事实及既有
  事件保留，新增恢复审计追加。已恢复来源有只读回执入口，后续合法恢复可准备新候选。
- 独立复核并修复：替换候选B丢响应却查询旧A；旧applied挡住后续暂停恢复；
  onComplete异常误称执行未知；mode数组被接受；ledger空计数矛盾及50条截断下同ID
  跨状态矛盾。35项回执单测及真实API响应丢失专项覆盖，不以只测happy path关闭待办。
- WUI-11：shared controller/canonical event统一路由和query，push前保护，Back后真实遍历
  恢复且不覆盖目的entry；busy/save/401与pending只决策一次。生产插队Back发现相对go偏移，
  改用支持时的Native Navigation绝对key；其state仅同步自有stamp，不复制classic业务state。
  20项导航单测和9个生产场景通过，含连续Back/Forward/go(-2)、插队、刷新、busy和未知entry。
- 最终验证：`pnpm exec vitest run --reporter=json --outputFile=...` 418项通过；
  `.venv/bin/python -m pytest -q --junitxml=...` 306项通过（40.98秒，既有弃用warning一条）；
  `pnpm build`通过（既有>500KB警告）。最终同一production build上四份浏览器报告
  57/16/9/9项、78截图、无pageerror，路径
  `frontend/evidence/ui-closeout-2026-11-15/`，复现与JUnit/JSON均已保留。
- 综合脚本仍完整57项，不以forms/recovery-only调试入口代替；真实本地API/FakeProvider
  专项另验新B登记丢响应、提交后丢响应、整页刷新、同ID重复不多建子Run/调用、
  unspecified timeout和暂停后新候选。样式/语言/密度/焦点和10路由多视口回归仍保留。
- 原UI13项在已测本地合同范围内完成，原119项仍9完成/110未完全完成；后续IZ字段/条件、
  多排序/列顺序、保存视图、规模化、持续会话/连接器/设备仍待办。不宣称视觉已接受。
  无Navigation API的并发压力、Safari/实体设备、跨文档取消、远端费用与正式账号仍未验。
- 正式4180/5173未重启；4180尚未加载新模型测试/恢复接口，需要后续匹配版本同步启用。
  验收临时4187/5176停止，未发真实模型/读取账号凭证/写正式数据/部署/commit/push。
  规则、ADR-0007/0008、模板采用图、实现状态、审计及CONTINUE同步更新。

## 2026-11-15：IZ-02/03查询草稿第一切片

- 用户继续后，沿已记录顺序实现现有Basic文本/项目/状态分类候选，不新增字段多选、
  完整JQL/保存视图、模型调用或后端权限。任务与状态先写入TODO_INDEX，原119项不变。
- 分工：主Agent负责候选helper/FocusedWorkbench/Workbench与综合验收；交互Agent负责
  canonical事件原因及单测/生产导航；数据Agent负责全API拦截专项；管理Agent只读复核。
- 主查询行三字段编辑仅更新内存，Search/非IME Enter一次patch并回第1页；规范省略默认all。
  固定项目优先路由，空格原始编辑也标未应用，Search trim后消失，不把候选写入偏好/history。
- 左侧是即时范围push，只rebase改变字段；点击已激活范围不偷提交或清候选。模式/视图/
  排序/页码push及外观保留草稿，原生Back/Forward通过canonical traverse恢复整份Basic/JQL。
  清除是原查询行内X，draft-only也可用；无可清内容时禁用，不增第二行搜索。
- 管理Agent实际复现三项缺陷：共享effect覆盖另一字段草稿、history只恢复变化字段而混合
  后续条件、draft-only无清除入口；已修复并由其独立浏览器复测和116项定向测试确认。
- 交互Agent仅给既有控制器增加安全`detail.kind=push/replace/traverse`，仍先校验admission，
  不改变history事务算法/原目的entry，不让外部伪事件靠detail取得导航许可。兼容无参port。
- 验证：新增18项候选与16项导航原因单测，完整452项前端、TypeScript、生产构建通过；
  最终同一构建上综合58项/60截图、草稿15项/9截图、项目16项/6截图、导航9项/9截图、
  真实本地API/FakeProvider恢复9项/3截图通过，无pageerror，共87实际PNG。
  后端代码未改，本批未重跑Python；306项为上批保留基线，不冒充本批结果。
- 验收过程：综合r1发现旧断言把`filter=all`当必要literal，新候选允许省略默认值；
  保留r1失败，将此断言改为规范默认合同，并用全新空夹具r2完整重跑。未删结果/scope检查。
  草稿prod-r1有重复截图名造成JSON10条但文件9张，数据Agent删冗余shot后prod-r2复跑，
  最终9条/9PNG一致。旧失败与中途记录保留，不冒充通过。
- 证据：`frontend/evidence/query-drafts-2026-11-15/`，含四种回归之外的独立草稿报告、
  452项JSON与复现步骤。完整临时输出分别在`/tmp/mybot-query-workbench-20261115-prod-r2/`、
  `/tmp/mybot-query-drafts-20261115-prod-r2/`、`/tmp/mybot-query-projects-20261115-prod-r1/`、
  `/tmp/mybot-query-navigation-20261115-prod-r1/`、`/tmp/mybot-query-durable-20261115-prod-r1/`。
- 限制：手机沿用Filters即时范围，主行项目/状态隐藏；resize验候选保留不代表隐藏控件可触。
  合成IME不是真实输入法，Chrome尺寸不等于Safari/实体设备。完整目录/条件多选、多排序/
  列顺序、私有保存视图及服务端分页仍待办；UI技术通过不是视觉最终接受。
- 本批无新依赖、真实Provider/账号读取、正式数据写入、部署、commit/push。正式4180/5173
  保留，临时4187/5176结束后停止；新恢复API仍未加载进既有4180。已有大包及httpx警告保留。
  CONTINUE、TODO、采用图、ADR、查询研究适配与实现状态同步。

## 2026-11-15：多选条件、列顺序与多排序

- 用户要求按建议多Agent完成剩余待办。本批完成现有字段范围的IZ-02/03、任务表IZ-04，
  不是110项全部完成；无账号/部署依赖的UI先行，外部权限与验收门槛保留。
- 分工：数据Agent完成query-conditions纯合同和高级URL独立测试；交互Agent完成
  AppMultiSelect与高级/导航生产专项；管理Agent完成列配置/TaskTableSettings、独立复核；
  主Agent整合ListLocation/Workbench/FocusedWorkbench/Board并跑全量回归、记录与收尾。
- 真实字段目录仅Project记录/五状态分类；同字段OR、字段间AND。Task用最新Run分类，
  Run历史逐条分类，无Run才pending；未知/canceled保留other，不捏造负责人或伪当前失败。
  固定route项目优先，多选不能越界；非法JSON/不可用项目明确拒绝而非返回全部结果。
- 主行仍一行，Astryx MultiSelector支持搜索/多选/清除；hasSearch时trigger为button，
  combobox在popup中，既有浏览器脚本按真实可访问语义更新。手机Filters有实际可见
  候选及Search，原即时范围保留；侧栏只rebase改变字段，traverse整份恢复。
- 兼容旧project/filter/order，新增严格JSON projects/states/sorts；条件单项兼容值
  回旧参数，pending/other或多项保留JSON。Settings排序即使1条也写sorts，旧快捷排序
  写order；sorts优先旧order，JQL ORDER BY仍为有效排序权威。task-sort最多3条唯一键。
- 7列顺序/显隐是独立本机非敏感偏好，Title必显示；上下箭头可键盘移动。隐藏列排序
  不丢规则，真实排序走Astryx hook，已有多层及平局稳定性直接测试。Task排序不外推
  Run历史或Board；后两者仅共享过滤来源，保留自己的展示语义。
- 实际修复：Settings busy门禁曾拦自己的同步URL Apply，已修并独立验URL仅写1次、
  异常回调恢复dirty；末轮源码复核又修表头Clear sort只取第一条丢余层，两项真实右键
  证明3→2保留优先级、2→1正确回单排序。修后重建并重跑全部生产报告，不用前批冒充。
- 新增/扩展182项前端用例，最终634/634、typecheck/build通过，既有>500KB警告保留。
  后端代码未改，Python未重跑；306为上批基线。最终同一构建综合58/草稿15/项目16/
  高级30/导航9/真实API恢复9项通过，111生产截图，无pageerror；独立设置6类/2截图补充。
- 中途记录保留：dev动态import失败不当成功；高级prod-r1 Keep editing过宽locator、
  r2单排序writer过强假设、项目r2误匹配Project info均收紧到实际合同，并保留结果/scope
  断言。最终高级prod-r4/项目prod-r4通过；表头补测前28项与109截图不是最终证据。
- 最终证据`frontend/evidence/advanced-workbench-2026-11-15/`。临时输出包括
  `/tmp/mybot-advanced-full-20261115-prod-r2/`、`/tmp/mybot-advanced-drafts-20261115-prod-r2/`、
  `/tmp/mybot-advanced-projects-20261115-prod-r4/`、`/tmp/mybot-workbench-advanced-20261115-prod-r4/`、
  `/tmp/mybot-advanced-navigation-20261115-prod-r2/`、`/tmp/mybot-advanced-durable-20261115-prod-r2/`；
  634项JSON及复现说明留在仓库证据目录。
- 仍待办：IZ-01用户视觉评审，IZ-05列表/详情位置连续性，IZ-06私有保存视图，
  IZ-07服务端过滤/分页及性能，IZ-08更广兼容；长期会话、连接器、设备与执行权限仍单列。
  原119项仍9完成/110未完全完成。Chrome/合成IME/尺寸不等于Safari/真机或视觉最终接受。
- 正式4180/5173保持，临时4187/5176停止；未发真实模型、读取凭证、写正式数据、部署、
  commit/push。新恢复API仍未加载原4180。ADR-0009/规则/采用图/待办/CONTINUE同步更新。

## 2026-11-15：连续性/保存视图进行中，因体验反馈暂停扩展

- 用户要求继续后，分工实现IZ-05内存history连续性与IZ-06单用户保存视图。后端新增
  workbench/saved_views.py及CRUD/CAS/稳定创建ID/删除tombstone，100新增测试，
  完整Python406通过；未重启正式4180，主环境没有启用新API。
- 主Agent新增严格前端定义/快照capture/URL投影及39测试，整合Focus与auth缓存清理；
  连续性47纯测试、client57+ActionMenu4，初次前端781通过。后续Agent的滚动时序/
  StrictMode及两处UI小改发生在该检查之后，未最终重测，不把781称最终验收。
- 连续性dev-r1实际发现横向位置被布局重置；修复后dev-r2已启动的浏览器测试完成，
  10项/6截图、无pageerror/真实API写入，证据/tmp/mybot-list-continuity-20261115-dev-r2/。
  未执行新的生产构建/完整回归。保存视图专项脚本已写但浏览器及实际API未跑。
- 用户最新问“到底改了什么，感觉页面没有变化”。已明确最近是底层交互/配置合同，
  不是整页视觉改版；保存视图5173/4180 API实际404，不能表述为主工作区已可用。
  未新增Cindy接力、可执行Workflow或编程执行权限，未得到用户视觉接受。
- 本轮暂停继续扩展，所有Agent冻结源码/无运行exec或浏览器会话；不回滚已实现代码，
  不擅自重启正式服务。UI错误code映射、最后改动复测及实际API验收仍待办。
  下一步先确认用户当前页面的可见验收/前后对照，再决定恢复哪一批，不自动扩后台范围。
- 原119/110计数不变。无真实模型/账号读取、正式数据写入、部署、commit/push；
  当前只有原4180/5173运行，未开新的fixture服务。

## 2026-11-15：工作台可见排版整改

- 用户批准在“页面没有变化”的反馈后先做实际可见整改。本轮只改FocusedWorkbench及
  共享项目任务页，未继续扩后台、升级依赖、换掉Astryx或重启原4180/5173。
- 页头拆出标题和范围/计数；一行查询只保留编辑/提交。独立结果工具带左侧切换视图、
  右侧列/排序，Inspector打开时仍对齐表格右边；不是跨到详情上方。
- 手机查询模式改用已有Astryx adaptive Selector，释放搜索宽度；键盘/草稿保持已验。
  状态导航加图标；任务详情重排项目/编号、状态/入口、目标、验收、文件、历史。
  触控英文桌面分页增宽。全局查找、原查询/导航合同和单业务树的独立偏好均保留。
- 同数据/视口/偏好实测搜索宽度：1440为135.3→484.3px，1024为143.3→284.3px，
  390为114.3→202px。舒适顶部比旧版多约80px，用空间换明确层级；没有假指标或装饰卡。
- 最终35文件781项前端、TypeScript/生产构建通过，原>500KB警告保留。生产新布局/
  综合/高级/草稿/项目/连续性26/58/30/15/16/10项通过，123PNG，修改前另6PNG，
  无pageerror；5173另以全API拦截复测26通过。Python本轮未跑，406仍是前批基线。
- 证据：`frontend/evidence/visible-workbench-2026-11-15/README.md`。中途热更新import、
  fixture令牌/目录、旧控件区域定位失败已记录，修正测试位置后保留全部行为断言重跑。
  前后截图是合成只读投影，综合用全新/tmp fixture/FakeProvider/MockTransport。
- IZ-05内存连续性修复现在通过最终unit/build/生产10项；不承诺刷新持久化。
  IZ-06菜单/实际API专项及错误码映射未完成，原后端保存视图仍未启用，不能说已可用。
  Cindy接力、可执行Workflow、IM/邮箱和代码执行没有新增。
- 原119项仍9完成/110未完全完成；视觉等待用户评审，Chrome尺寸不等于Safari/真机。
  临时4187/5176验收后停止，无真实模型/账号读取、正式数据写入、部署、commit/push。

## 2026-11-16：保存视图闭环验收与主服务启用门槛

- 用户要求继续按计划实施目标。本批收尾IZ-06，保持Astryx与一套业务树；不自动重启
  主服务、读账号、发真实模型或写正式数据。工作从11月15日跨日继续，历史日期保留。
- 已验：workspace/project目录及分页，已提交查询/已应用表格快照，加载/更新/另存/删除，
  CAS、稳定ID、tombstone、dirty/native Back、竞态与中英文320/390px手机。
  unknown不自动重写，关闭重开保持原ID；GET当前资源不冒充原请求精确回执或持久日志。
- 修复project_unavailable精确映射；认证优先于资源文案，401清理提前到JSON解析之前，
  非JSON代理401也清除私有投影。增加11项反馈和2项API测试，前端共794通过。
- 用订阅前URL变化精确复现初始化缺口（旧查询不更新），在原canonical监听建立后补初始
  URL读取；保留无显式URL视图时的本机偏好，不新加原生监听器。保存专项与历史导航重跑。
- 真实截图发现320px长反馈把Tasks挤断，修为同主题树页头下反馈区域；窄屏分页固定两行、
  容量136px、模式96px。补标题行高/反馈位置/页容量/两行几何断言并重建重跑，不只验overflow。
- 最终36文件794前端、406Python、typecheck/build通过。生产模拟专项32/实际API8/
  整站58/布局26/导航9项通过，116生产PNG无pageerror。保留>500KB与Starlette/httpx警告。
  证据：`frontend/evidence/saved-views-2026-11-16/README.md`；新增ADR-0010及启用检查。
- 实际API专项与整站只用全新/tmp目录、FakeProvider/MockTransport；保存视图专项前后Run
  数量不变，不发送模型测试/Run/重试/控制请求。其他专项全API拦截，变更仅脚本内存。
- 中途修正测试的Required名称、空JQL、另存标题/copy、busy alertdialog与手机button形态。
  原busy角色误判曾让gate到15秒；新测试显式验证忙态并在超时前释放。dev空body未算通过。
  初始化失败基线、手机反馈之前图和最终报告分开保存，没有删结果/URL/权限断言。
- 原4180/5173保留，结束实际核对主保存视图路由404。后续先明确确认活跃/排队任务、
  一致备份和原配置，再优雅更新4180；不可把本地代码/fixture验收当启用回执。
  之后IZ-07服务端查询/分页，再持续会话/Harness/工作定义等原路线。
- 原119项仍9完成/110未完全完成；无团队ACL、任意DAG、Cindy接力或连接器新能力，
  无部署/commit/push。临时4187/5176验收后停止，Chrome尺寸不是Safari/真机认证或视觉接受。

## 2026-11-16：4180主服务保存视图受控启用

- 用户在“检查任务、一致备份、受控重启”的明确询问后回复“继续”。核对原进程1826917
  的命令/cwd/回环监听/默认.runtime工作区，原环境只在内存中保留，不导出密钥。
- 实际API和只读SQLite显示1项目/1任务/6Run/1模型，Run为1成功3失败2取消；无排队、
  运行中Call/模型测试/恢复应用或子执行进程，才进入备份/停止流程。
- SQLite Backup API做在线一致备份；私有副本运行当前Store初始化后，按全部原表原列
  逐行摘要比较不变。再次验证空闲/身份后SIGTERM优雅退出，确认Worker锁可独占，
  停服一致备份与原行比对完成后，按原命令/cwd/env启动当前源码，无并行Worker或强杀。
- 新PID2064113，健康200、工作区和仅本机认证模式不变，原记录启动后及浏览器后全部不变。
  4180及5173代理保存视图目录200，5173原PID608518未重启，两个用户服务保留。
- 新增verify-local-activation.mjs，显式本机只读opt-in、非GET/非允许API一律拦截。
  真实桌面/手机5项通过：目录/启用入口/dirty禁用/URL不变/全部业务投影不变，
  无写尝试/意外API/pageerror；不采集真实截图/DOM/正文。首轮手机弹层时序定位失败，
  按关闭/候选/禁用渲染状态等待后重跑，未删disabled或无写入断言，未改产品逻辑。
- 私有备份`.runtime/backups/before-saved-views-20261116T004900170654Z/`700，库/日志600，
  Git忽略，含live/stopped一致库、迁移副本、阶段回执和新服务日志。不是旧运行代码归档，
  不能承诺热覆盖DB或一条命令恢复旧进程版本。恢复需单独确认。
- 公开证据`frontend/evidence/local-activation-2026-11-16/`仅有脱敏回执和说明。
  没有自动创建视图/任务/项目、调用模型/Run/重试/控制、读取凭证、远程部署、commit/push。
  未改产品源码或重跑794/406，它们仍是上一批基线，本轮脚本语法检查和5项实际验收单列。
- IZ-06的主环境启用已完成，不再称原API404。用户真实保存/刷新/加载未代做，故障注入
  仍只在fixture。下一实施包IZ-07服务端查询/排序/计数/分页，再按持续工作和设备路线。
  原119项仍9完成/110未完全完成；本机手机视口不是远程设备接力或实体设备认证。

## 2026-11-16：完成项提交检查与后续逐项交付

- 用户授权“完成每一项，提交push”。检查当前main和origin/main同步，无需重写或强推历史。
  准备先保存此前已完成、尚未提交的工作台迁移/查询/恢复/保存视图及研究记录。
- 本轮实际复跑794项前端、406项Python、TypeScript/Vite构建通过；保留既有大包/
  Starlette-httpx警告。运行未调用真实模型或写正式数据。
- 检查新增文件和潜在密钥特征，无匹配；.runtime私有备份/库/日志依然被Git忽略。
  历史隔离证据和许可证保留，不把用户工作区快照加入提交。
- 此条只记录提交前检查，不提前写push成功。实际提交与推送结果在后续条目记录。
  下一批IZ-07先做受限服务端查询合同、稳定排序、真实计数/分页，前端接通另验。
  所有账号/付费/执行/部署/设备门槛仍按原台账单列，不将110项全部标完成。

## 2026-11-16：基线推送与IZ-07.1服务端查询API

- 上条提交前检查已完成实际提交push：`f9e5484`已推送origin/main，包含此前已验收的
  工作台/恢复/模型测试/保存视图与记录。未强推或提交.runtime私有库/备份/日志。
- 按用户逐项要求实现IZ-07.1，新增task_query.py、GET /api/tasks/query及两个查询索引。
  复用SavedView严格有限定义；文本与Project/State OR/AND、固定scope、最多3层排序、
  有限JQL排序、Task最新Run分类、20/50/100分页及真实总数，非法参数/项目明确拒绝。
- 查询使用mode=ro/query_only和单次读取事务，不复用Store写锁。验证并发写未提交时读旧
  状态，以及COUNT执行后另一个连接提交仍保持本响应总数/页一致；连接成功/错误均关闭。
  请求不访问Provider、模型凭证、文件上下文或添加审计/运行记录。
- 首轮68专项通过；增加关闭/Unicode等检查后全量出现1项测试线程归属失败：
  测试主线程操作Worker创建的连接先触发thread检查。改在同Worker真实close后验证，
  未改生产check_same_thread；最终477/477（71新增+原406）通过，保留httpx提醒。
- 全新临时合成库2k任务/4.8kRun与20k任务/48kRun各3次。默认首页中位数15.80/172.45ms，
  页面20项、约8–9KB。文字和排序仍有扫描，不声称生产HTTP/浏览器SLO或常数时间。
  证据`docs/evidence/task-query-2026-11-16/`含JUnit和两个测量JSON，合同ADR-0011。
- API显式unicode-natural-v1，不冒充当前Astryx Intl.Collator；没有静默接到UI或复制页面。
  目前Bootstrap/Task/Run仍全量读，前端client/排序一致性/接入与减量是IZ-07.2–04。
  794前端及build已在本轮基线提交前复跑，新API未改前端，不算新增界面验收。
- 正式4180/5173不再次重启，查询路由实际仍404，原保存视图接口保持可用。
  本项完成后独立提交push；原119/110计数不变，不把子项、测量和测试数量当全部完成。
  无正式数据写入、真实模型/账号/外部写入、部署或设备权限扩张，授权门槛继续保留。

## 2026-11-17

### 工作项：IZ-07.2 多Agent接入服务端任务查询本地验收完成

- 分工：根Agent整合页面/Table与综合回归；合同Agent复核严格client与Unicode边界；
  浏览器Agent补异常/权限场景；文档Agent记录ADR、采用映射与待办。均沿既有工作树实施，
  未生成第二套页面或升级Astryx。
- 实现：明确capability=true才使用bounded任务页，缺能力保留legacy；声明后404/503或
  异常2xx明确失败。严格校验DTO/页算术/请求绑定/身份与分类关系；草稿不请求，query-key/
  Abort丢弃旧读；不同query不显示旧行，同key刷新保留并busy；失败显式GET重试。
- 表格与导航：server页保序、不二次sort/slice，Astryx表头控制保持；总行数和页起点用于
  ARIA坐标。server clamped页只作显示，不覆盖请求URL/history，修复旧页响应重置新页问题。
- 复核又发现6s Bootstrap poll的数据对象变化会取消慢query并后台重试403/404。已将
  explicit刷新成功的refreshRevision与poll分开，请求不再依赖data identity；poll只使
  ready页失效，不打断loading或重放error/unavailable。最终35项专项已验8s查询跨6s poll仅
  1GET、403后6.5s真实poll无重试、显式Retry恰好1GET，以及HTML401清理与桌面/手机。
- 复核取舍：JS/Python Unicode数据版本可能不同，browser重新计算文本命中/顺序会误拒
  合法server页，故server为权威，client不重新判断文字或排序。15共享例是有限回归，
  不是全Unicode等价/计数正确性证明，算法标识不冻结跨运行时所有映射。
- 后端最终499项通过（bootstrap能力声明、Python特殊白空格/BOM共7项补测），70.27s，
  保留1条既有warning；JUnit为`/tmp/mybot-server-pagination-python-20261117.xml`。
  前端最终870项/38文件、typecheck/build通过。稳定生产构建专项35项/6PNG、真实API6项/
  2PNG、高级30项/24PNG通过，无pageerror；最终报告分别来自final-r2/final-r2/final。
  综合最终首轮fresh guard发现fixture已有1项目/3任务/3Run，认证后即停止且保留失败；
  新fixture.OaPiOM已只读确认projects/tasks/runs/models全0，最终综合final-r2为58项/
  60PNG通过，errors为空；四份最终报告共92PNG，无pageerror。
  证据`frontend/evidence/server-pagination-2026-11-17/`已归档，早期2项检查只保留为预检。
- 记录：[ADR-0012](decisions/ADR-0012-task-query-client-admission.md)解释准入/保序/异步/
  history合同；ADR-0011保留原slice内容并加follow-up。基线`608b8bd`已push，
  本批所列本地合同验收完成并按独立提交交付，实际commit/push回执以git log及origin/main为准。
- 边界：Bootstrap、Quick find/侧栏计数与Inspector历史仍全量，IZ-07.3/04未关闭，
  无整链规模改进结论。原4180/5173未重启，新task_query能力未主环境启用，继续legacy；
  保存视图仍已启用。临时4187/5176已停止，无真实Provider/凭证读取/正式DB写入/
  执行权限提升或部署。原119项仍9完成/110未完全完成，下一项IZ-07.3，07.4不关闭。
  已有大包/httpx警告、用户视觉接受/真机未验继续保留。

### 工作项：IZ-07.3a 按需任务详情与分页历史本地验收完成

- 核对现状：起始工作树干净，`f917608`已在main/origin/main，未重复补交旧批。
  根Agent负责Inspector/证据/整合，后端Agent实现只读API及seed，客户端Agent实现严格合同，
  验证Agent负责中英桌面/手机与键盘专项。无新依赖、第二业务树或主服务重启。
- 新GET `/api/tasks/{id}/detail`和明确task_detail能力；只有选中后才读。
  同一ro/query_only事务返回任务、最小项目、最新Run/次数和20/50/100历史页，
  scope不匹配/任务或项目缺失统一404，不返回Run配置、上下文、错误详情或成果。
  复用严格Task投影；校验历史页算术/身份/首项latest/次数与发送时请求快照。
- TaskInspector由原内联实现抽出，保持Astryx与原分层。历史页独立于列表URL；
  同key保留有效内容并busy，异步旧结果丢弃，poll不取消loading或重试error；
  声明能力后不拿Bootstrap旧历史兜底，缺能力保留旧路径，401清私有投影。
- 复核发现A页2→B→A恢复旧页，改为按workspace/scope/task身份挂载；换任务/关闭重开回1。
  跨桌面/手机容器切换也回历史1页而保留任务选择，没有宣称跨断点历史页恢复。
- 实际键盘首次失败：只排除`:disabled`把Astryx的aria-disabled Next误认作可用。
  阅读发布包Button渲染后同时排除ARIA禁用；焦点只在body或原触发器时恢复，末页选可用邻项、
  错误选Retry，主动移到搜索框不抢回。保留失败截图/报告与原断言，修复后完整40项通过。
- 最终943项前端（39文件）、562项Python、typecheck/build通过；后端63新增、client73新增。
  后端首轮2处测试工具使用不正确已修，没有改生产事务行为来迁就断言。
  最终生产报告：详情40项/9PNG、真实API6项/2PNG、原查询35项/6PNG、综合58项/60PNG，
  共77最终PNG、无pageerror。综合旧reload断言曾在服务端列表pending时数行失败；
  保留失败，改为等精确任务后保持原count断言，用全新fixture重跑通过。
- 真实详情fixture.PV7p9d：安全seed仅允许精确marker、无symlink、15表全空的临时目录，
  原子植入2任务/45终态Run，不加模型；实际第1/2/3页及390手机与SQL一致，
  前后tasks/runs不变，仅public测试登录写入。综合fixture.qFmVX9使用FakeProvider/MockTransport，
  是隔离测试调用，不是实际模型/费用证据。新证据`frontend/evidence/task-detail-2026-11-17/`，
  ADR-0013及REA第29节记录合同和Astryx行为。
- 原4180保持PID2064113，未读取凭证或写正式DB；只读确认task_query/task_detail均未advertise。
  发现5173已停，已启动开发入口且HTTP200，因旧backend仍走legacy。临时4187/5176已停。
  既有大包与Starlette/httpx警告保留；Safari/真机、用户视觉接受未扩张。
- IZ-07.3a所列本地合同关闭，整体IZ-07.3/04未关；下一项全局计数/查找/引用，再迁移其他视图、
  Bootstrap协商减量及失效/传输测量。原119/9/110不变。按独立提交交付，commit/push以git记录为准。

## 2026-11-18

### 工作项：IZ-07.3b1全局计数与bounded Quick find本地验收完成

- 始于11月17日，基线366ca3e已push且起始工作树干净。中途T3重启取消UIAgent、client遇并发错误，
  保留落盘代码并恢复后端/client/UI三条分工，root整合计数/证据；未将中断的半成品当验收。
- 两只读API：workspace/counts区分Task最新态与Run全历史，项目OR/固定scope；workspace/search
  支持项目/任务/全历史RunID，有限20/50、total/has_more和最小tagged引用，不返回上下文/配置。
  同响应单次mode=ro/query_only快照，连接关闭/并发snapshot/认证/参数边界实际测试。
- strict client新增104项，按发送时快照绑定；Python空白/Unicode/codepoint canonical、
  精确字段/算术/scope/重复/项目名/Task引用冲突。旧查询和详情合同保留，server为匹配/排序权威。
- Shell Workbench活跃Run数、Inbox pending+attention任务数及状态范围计数接新聚合。
  刷新保留已验数并busy；失败unknown/显式GET重试，未知active不当0停止后台检查。
  15项专项实际等6.5s观察Bootstrap poll，已失败计数无自动重放；历史view切分母45而非任务16。
- AppCommands沿Astryx SearchSource和Context接同条件重试；稳定source/ref避免重挂查询输入，
  generation/cancel/capture防旧optimistic结果click/Enter关闭或导航。loading/error不显示默认
  No results，域读取失败仍只提供本地导航+明确错误。32项中英手机/桌面专项覆盖20/35截断、
  同名导航busy/settled、真实旧项click、错误重试1GET、关闭迟到、合成IME、legacy与HTML401。
- 初轮前端1失败来自structuredClone仍保留fixture共享引用，改为只替换一个引用以真正构造冲突。
  综合只等bootstrap同名option就Enter，安全guard正确阻断；脚本等待当前query aria-busy结束，
  保留原键盘/目标路由断言。计数初脚本还未等scope请求就数GET，手机导航重复/闭合Filters/
  固定项目标题亦按真实界面校正；未删除核心范围、数学、未知或重试断言。
- 最终1054前端（41文件）、639Python、typecheck/build通过，保留Starlette/httpx及>500KB警告。
  生产报告搜索32/4PNG、计数15/6PNG、实际API6/2PNG、综合58/60PNG、详情40/9PNG，
  共81最终PNG、无pageerror。证据`frontend/evidence/workspace-reads-2026-11-18/`保留失败报告，
  ADR-0014/REA第30节/模板采用映射同步，模拟与真实HTTP/SQLite分别记录。
- 实际fixture.tDjiFK沿安全seed两任务45终态Run，无模型；验证Task2/Run45、真实20/48引用、
  oldRun000可搜、exact任务导航和390px。检查后tasks/runs不变，只写public测试登录。
  综合fresh fixture.QEwiAZ使用FakeProvider/MockTransport；没有真实Provider调用/费用或正式DB写。
- 原4180保持PID2064113且两新cap仍未advertise；已恢复5173开发入口并核验200，
  继续legacy。临时4187/5176已停；未读凭证、部署、升级依赖或扩执行权限。
- 本切片本地合同完成但07.3b2项目引用目录/逐项目计数、07.3c/d其他消费者/Bootstrap协商减量/
  失效和传输测量继续待办。原119/9/110不变。按独立提交交付，commit/push以git实际回执为准。

### 工作项：IZ-07.3b2项目引用目录本地验收完成

- 起始b83e5d9已在origin/main且工作树干净；先立ADR-0015，不重复b1。
  用户明确多Agent：后端/client/UI各负责不重叠文件，root整合/浏览器/证据。
- 新GET project-references仅显式capability=true采用；20/50/100分页、文字搜索、selected独立
  补齐与missing分区；逐项目Task和全历史Run数及workspace totals同一次SQLite ro快照。
  不返回goal/notes/path/上下文，孤儿记录排除、关闭连接、认证及并发snapshot实测。
- 严格client128新增，codepoint canonical IDs、精确DTO/分页/绑定/重叠一致性和去重总数校验；
  不在browser重算文字匹配/排序，不把offpage当missing、不把单页相加当全局。
- UI17新增，侧栏/范围共用ProjectReferenceDirectory，既有单行查询/顶栏查找/右上列工具保留；
  目录搜索与任务query隔离，分页、offpage选中项、固定项目静态行、真实空/错误/重试明确。
  请求key/15s abort/迟到丢弃/ready-only poll；same-key保留值并busy、禁止旧项激活。
- 首轮浏览器发现手机CSS隐藏的desktop导航仍挂载第二份目录，现按901px边界只挂可见导航；
  两处旧测试依赖关闭后的hidden badge/自动目录GET，改为先开当前呈现再保留原401/精确重试断言。
  截图复核补用Astryx Button.endContent，使计数右对齐，不定位vendor内部DOM；实际边沿误差<=1px。
- 最终1199前端（43文件）/710Python/typecheck/build通过；目录37/真实API8/综合58/计数15项，
  82最终PNG、无pageerror。三style双mode、手机中英/IME/焦点/慢读跨真实poll/错误不重试、
  malformed2xx/缺cap/401和迟到响应已验。证据`frontend/evidence/project-references-2026-11-18/`。
  Python首轮3失败是Store.list(events)/canonical顺序测试假设，修后71专项及710全量通过。
- 实际fixture.kDEXR5含45项目45任务88终态Run，项目000为2任务/45历史Run、001为0/0；
  页面切Runs后总数88而非45，原项目/任务/Run/模型数组前后不变，只POST公开fixture登录。
  综合使用全新fixture.2lUIpj及FakeProvider/MockTransport；失败及中间结果与最终证据分开。
- 既有Starlette/httpx及大包警告保留；app147.13kB/gzip48.70、CSS37.86/gzip7.21，
  lazy FocusedWorkbench67.74/gzip22.23、CSS12.12/gzip2.62；非初始整链传输结论。
- 主4180仍PID2064113，未重启、未加载新cap；5173开发入口恢复后继续legacy。
  临时4187/5176已停，无真实Provider、凭证、正式DB、兄弟项目修改、依赖升级或部署。
- IZ-07.3b2所列消费者关闭，Bootstrap与Project选择器/路由/列表/表单仍全量，下一项07.3c1，
  再其他视图/协商减量/失效测量；不关闭07.3/07.4或调整119/9/110。commit/push以Git回执为准。

## 2026-11-19

### 工作项：IZ-07.3c1a项目条件多选与引用准入

- 起始2a3bbdc已push/工作区干净；ADR-0016先记录，用户多Agent分为picker、准入/视图加载、
  浏览器三条，root整合/证据。复用project_references合同，没有另加相同用途的后端。
- ProjectQueryPicker使用Astryx项目wrapper，open目录20项页/独立Search；selected独立hydration，
  勾选不刷新目录，不提交主查询；跨页候选、trueempty、确认missing移除、100上限和IME/焦点齐备。
  enabled停读时取消/清投影，能力标识独立；手机不挂隐藏的inline picker。
- 工作台committed项目先取引用，首次未知时隐藏结果、不发task query；失败只GET retry、
  不读Bootstrap名/可用性；samekey保留值+busy，未把每次poll当成取消/重放在途query的理由。
- SavedView先fresh GET确认项目，等待期间无URL/列/草稿变化，baseline变更使校验失效；
  新校验阶段锁防重复/导航，失败清queued intent；sync apply先取URL导航准入再改变本地状态。
  不把引用读取锁扩大为写幂等/真实模型策略，legacy detail继续可离开并取消旧scope读。
- 发现修复初版busy锁覆盖legacy detail造成项目切换失败；保留失败后32项视图回归通过。
  请求事件早于路由日志的29/28测试改为exact selected005只1GET；字段消息与Astryx live-region
  重复改验aria-describedby；实际UI双呈现8/4、2/1改验可见4/1，核心断言保留。
  早期typecheck的active影子变量改为live，最终typecheck/build通过。
- 最终1245前端（45文件）/build通过；生产picker44/8PNG、SavedViews32/26PNG、综合58/60PNG、
  真实API5/2PNG，合计96最终PNG/无pageerror。三style双mode、mode变更保留候选、长名、
  390中文nested Dialog/Escape焦点/403/2xx/late/401/缺cap均验。
  `frontend/evidence/project-query-selection-2026-11-19/README.md`区分中间结果/失败/最终报告。
- 实际fixture.3eAI8M含45项目45任务88终态Run/无模型；三项目候选返回4可见任务、手机单选1，
  原projects/tasks/runs/models数组前后不变，只有公开fixture登录POST。
  综合fresh fixture.TnytgE使用FakeProvider/MockTransport，无真实Provider/费用或正式数据写入。
- 未改Python，710是11月18日前批证据未本轮复跑；现有Starlette/httpx/大包警告保留。
  app147.20kB/gzip48.71，CSS37.86/gzip7.21；lazy FocusedWorkbench78.53/gzip25.16，
  CSS14.03/gzip2.91，非全初始传输或整体性能证明。
- 原4180保持PID2064113/未加载新cap；5173恢复200继续legacy，临时4187/5176已停止。
  无凭证、部署、兄弟项目修改或依赖升级；原119/9/110不变。下一项c1b完整Project路由/列表/
  表单，再c2其他投影及c3/d协商减量/失效/测量，不关闭07.3/07.4。commit/push以Git回执为准。

## 2026-11-20

### 工作项：IZ-07.3c1b完整项目资源与创建任务选择

- 用户继续，起始7bb2140已push且工作树干净。ADR-0017先记录，三Agent分别后端/client与列表/
  表单；root负责Workbench route/共用AppRadioList、浏览器/最终记录，不碰兄弟项目或账号。
- 新只读project_detail/query能力，各自显式准入；详情5字段+Task/历史Run数，列表4字段摘要/
  20/50/100真页/目标/目录/no notes；复用reference parser/order/CTE，一次SQLite ro/query_only快照。
  77新增含snapshot/关闭连接/认证/未知参数/Unicode编码ID/orphan/noProvider/无行事件写入。
- strict client及列表59专项；detail按workspace/id取消/晚到丢弃，初错不回退Bootstrap；
  transient同ID错误保留已验内容+stale notice/原querydraft，missing/forbidden隐藏、401清。
  空routeID由strict client失败而非永久loading。ProjectResourceList lazy、URL query/page/capacity，
  Search/IME/Back/刷新、真实总数和错误重试；容量控件独立收宽以保持桌面分页同列。
- Task form refs能力路径移除Bootstrap首项默认，固定routeID仅为待确认候选；ProjectTaskPicker
  用AppRadioList/Astryx单选，分页/refhydrate/unknown/missing/empty不同；确认无项目才提供Create，
  dirty任务通过Discard guard。POST前fresh GET+15s abort+mounted/fingerprint验证+duplicate锁，
  读失败0POST保留字段，显式重试读不自动POST；原taskmutation仍不声称新增幂等或租约。
- 新7picker+3form测试，AppRadioList沿UI密度映射sm/md；真实Space选择、只有1checked、双层
  Dialog、中文390px和server422输入保留已验。共1314前端（48文件）/787Python/typecheck/build通过。
- 最终生产资源37/10PNG、原projectquery44/8PNG、综合58/60PNG、actual4/3PNG，
  共81最终PNG/无pageerror；三style双mode/reducedmotion/长文/超时边界的实际覆盖见
  `frontend/evidence/project-resources-2026-11-20/README.md`，不把unit超时配置当15s浏览器故障实测。
- 早期script legacy同名link、手机背景Newtask、Keepediting头部/操作重名三个失败归档后改定位；
  综合隐式默认项目已被新合同取消，脚本显式选真实fixture项目，模型/预算/审查/恢复原断言保留。
  concurrent typecheckuseRef未初始化及SSR期望resolvedeffects的测试假设均修正，最终完整复跑。
- actual fixture.9HjicZ从45项目45任务88终态Run/0model开始，新增1属于044任务+context preview；
  全部原tasks/projects/runs/models逐条比对不变，只POST公开fixture登录/tasks/该preview，没有Run/
  model测试/真实Provider。早期jhH0B0已过但在加原tasks比对前，最终report只用新空fixture。
  综合使用fresh fixture.sgdukI及FakeProvider/MockTransport，不写正式DB、不产生模型费用。
- 现有Starlette/httpx和chunk>500kB警告保留：app163.10/gzip53.89kB、CSS38.91/7.35，
  lazy ProjectResourceList5.87/2.53、CSS1.38/0.49；Focused78.08/25.01、CSS14.03/2.91。
  这是individualchunks，非实际总初始transfer或整体提速。
- 原4180保持PID2064113未加载新cap，5173恢复200/legacy，临时4187/5176停止。
  无凭证/正式DB/部署/依赖升级/兄弟修改；原119/9/110不变。下一项c2a全Run查询，再其他投影、
  协商Bootstrap减量/失效/测量，不关闭07.3/07.4。独立commit/push以Git回执为准。

### 工作项：IZ-07.3c2a全历史Run查询与分页

- 起始5710f3d已push/工作树干净；先记录ADR-0018。backend/client/table三Agent分工，
  root负责主页面/焦点/偏好生命周期、隔离回归和记录，用户多Agent授权保持。
- 明确run_query能力、只读GET /api/runs/query：minimal Run/Task/Project引用、Run自身
  status分类、所有历史分母、20/50/100、固定scope/有限JQL/单字段Run排序，复用严格输入
  和unicode-natural-v1，单次SQLite ro/query_only快照，不返回上下文/配置/错误/输出。
  后端119新增，含关闭连接/认证/孤儿排除/全局顺序/并发snapshot/失败历史与pending0。
- strict客户端62、Run sort25、URL4新增；校验DTO/安全分页/发送快照/重复和关联身份，
  不重新排序/文字过滤/切页；runOrder与Task order/sorts独立，SavedView仍只存Task快照。
  hook15s取消/迟到丢弃、samekey保留busy，ready-only poll不取消loading或重放error。
- Astryx既有AppDataTable serverSorted/rowStart/totalRows使用服务端行，唯一分页栏与真实容量；
  10表格新增，旧路径保持。busy阻断链接/排序/翻页，旧cap缺失保持Bootstrap，不把失败伪0。
  root父视图保存列/紧凑偏好跨page remount，focus遇末页选可用Previous，失败选Retry，
  native与ARIA禁用同时排除、用户移焦不抢回。偏好没有新增reload持久化。
- 最终1415前端（51文件）/906Python/typecheck/build通过；生产专项48/14PNG、实际API9/6PNG、
  综合58/60PNG，共80最终PNG、无pageerror。三style双mode/手机390中英/reducedmotion、
  8s慢GET跨真实6spoll只1请求、403跨poll不重放、nonJSON401及malformed2xx已验。
- 保留脚本JQL原始候选/有效排序混淆、锁定header无sortbutton、重复candidate不触发请求的失败；
  综合原同步排序断言改等待同一ascending结果，模型/预算/恢复断言未删。
  初始综合缺PLAYWRIGHT_MODULE在浏览器前停止，修参数无新依赖。证据
  `frontend/evidence/run-query-2026-11-20/README.md`分别记录最终与失败。
- 最终实际fixture.cYS5vD从45项目45任务88终态Run/0model开始；项目000的45历史/15失败
  与Task最新成功分别验证，原projects/tasks/runs/models数组前后不变，仅公开fixture登录。
  综合fresh fixture.qExepv使用FakeProvider/MockTransport，无真实Provider/费用/正式写入。
- 现有Starlette/httpx、>500kB警告保留；app164.00/gzip54.13kB、CSS38.91/7.35，
  lazy Focused85.14/26.97、CSS14.03/2.91；RunViews7.45/3.23、CSS1.01/0.45。
  仅individual chunks，不是实际总初始transfer或整体性能证明。
- 主4180保持PID2064113未加载新cap；5173恢复200/legacy、临时4187/5176已停。
  无凭证/正式DB/部署/兄弟修改/升级，原119/9/110不变。下一项c2b剩余投影，再
  c3/d协商Bootstrap/失效/传输规模测量，不关闭07.3/07.4。commit/push以Git回执为准。

### 工作项：IZ-07.3c2b1看板按列有界查询

- 起始3ab8c69已push/工作树干净；先记录ADR-0019。backend/client/TaskBoard三Agent，
  root整合、固定项目意图与分页focus、实际API/综合和证据，继续用户多Agent授权。
- 明确task_board能力与GET /api/tasks/board；五列各固定20项/最多100卡、总数同一次ro/
  query_only快照。复用Task查询CTE与序列化，保留最新Run的rowid tie、文本/项目/状态合同；
  空JQL/固定Task创建顺序，未扩JQL/排序/拖动。Task DTO完整保留目标和原Review所需字段，
  不用最小对象或Bootstrap补acceptance/files。90新增含快照并发/关闭连接/认证/严格页码。
- 客户端113新增：exact DTO/五列/算术/total和/跨列身份/请求绑定、boardPages独立URL；
  query一次提交重置，presentation保留，非法仅阻断remote board；不重排/再filter/slice。
  15s/cancel/迟到/ready-only poll，声明cap后错误不回退旧卡片，401清私有，重试只GET。
- TaskBoard10新增沿同一Astryx业务树，列总数和唯一局部footer、列内滚动/画布横滚，
  exactTask/Run动作、busy当前与保留handler都阻断。root父层捕获origin/请求key/scrollLeft，
  末页排除native及ARIA禁用、失败选Retry、用户移焦不抢回。
- 只读复核发现固定Project路由会给view/mode等patch注入项目字段，writer误清boardPages；
  root按原始命令意图先保留raw页码再加scope，2新增unit及desktop/mobile跨Tasks/Board、
  emptyJQL/Basic、排序/容量的页码/卡片保持均验，不靠URL差异猜导航理由。
- 最终1540前端（54文件）/996Python/typecheck/build；生产专项50/12PNG、真实API8/4PNG、
  综合58/60PNG，共76最终PNG无pageerror。三style双mode/390中英/reducedmotion/焦点、
  8sGET跨6spoll、403不自动重试、迟到/404/invalid2xx/401均见独立报告。
- 失败保留：script中文403文案不符、直接fetch fixture登录后UI仍未重新读取session；
  初期测试服务/浏览器SIGTERM中断（原因未确认，未归因产品），已重新启动隔离服务。
  actual initScript强制en使早期mobile仍英文，现仅初始化缺省locale并断言中文heading，
  最终新fixture重跑，早期英文图不当中文证据。无新增依赖/真实Provider。
- 最终actual fixture.gKDKl0为45Projects/45Tasks/88终态Run/0model，43attention/1pending/
  1completed；项目000历史15失败而最新成功、看板attention0。原projects/tasks/runs/models
  数组前后不变，只有公开fixture登录POST。综合fresh rEJTRT用FakeProvider/MockTransport。
- 既有Starlette/httpx和>500kB警告保留；app165.20/gzip54.45kB、CSS38.91/7.35，
  lazyFocused91.94/28.45、CSS14.03/2.91，RunViews9.45/3.72、CSS2.17/0.66。
  单快照仍重复执行共享CTE六次，不宣称服务器CPU提速/整体Bootstrap或初始传输已减。
- 主4180仍PID2064113未加载新cap；5173恢复200/legacy、临时4187/5176停止。
  无凭证/正式DB/兄弟修改/升级/部署，原119/9/110不变。下一项Inbox，继而总览/层级/
  文档等，Bootstrap协商/失效/测量仍开放。独立commit/push以Git回执为准。

## 2026-11-21

### 工作项：Inbox收尾与产品目标重排

- 起始dd6b34c已push/工作树干净；始于11月20日，验收完成于21日Asia/Singapore，
  用户日期仍11月20日America/New_York。先记录ADR-0020，再client/UI/browser分工；
  root负责入口、真实API/综合和产品目标记录。client中断后原Agent恢复，无重复实现。
- 无新增Python/接口/依赖；复用明确task_query和独立task_detail。Inbox只取最新态
  pending/attention，完整Task DTO及20/50/100有界页；query草稿Search/IME与即时类型
  scope分开，inboxType独立URL。不支持JQL/项目/状态/group条件明确失败，不静默取全部。
- 仅当前呈现选中项读detail，手机一份Dialog；缺detailcap用已验list快照，声明后失败
  不回退。远程summary用goal/status，不补Bootstrap error；fresh detail不符合当前Inbox
  不开放动作，Review仍为原资料/资源确认。21UI/44client新增覆盖精确Task/Run与busy旧handler。
- 请求key/15s取消/迟到丢弃、ready-only poll不取消loading或重试error、401清私有；
  显式选中ID移出结果保持unavailable，不自动选另一任务，分页和Dialogfocus均验。
- 最终1605前端（56文件）/typecheck/build通过；156既有Python query/detail合同回归，
  无Python变化，完整996属前批未本轮复跑。生产专项59/14PNG、实际API8/4PNG、综合58/60PNG，
  共78最终PNG无pageerror，三style双mode/390中英/reducedmotion/8s跨6spoll等见独立报告。
  稳定生产构建后仅client格式化/补44测试，final build执行JS/CSS指纹相同，source map大小
  变化；不宣称对source-map差异重跑浏览器。证据`frontend/evidence/inbox-2026-11-21/`。
- 首轮mockcap变更未reload就导航，旧cap请求被脚本误算；手机无可见global Refresh，
  改用真实poll验移除。失败保留，最终59通过。既有综合脚本未改、原模型/预算/恢复检查保留。
- 实际fixture.OTbdY6为45项目45Task88终态Run/0model；Inbox44=43attention+1pending，
  恢复成功Task排除，20/20/4分页及full acceptance/精确Run链接已验。原业务数组前后不变，
  仅公开fixture登录POST，无preview/Run/模型调用。综合fresh MkX2k7用FakeProvider/MockTransport。
- 用户反馈“看着没什么变化，目标呢，任务呢”。已承认近期数据工程切片与可见产品目标
  的偏差，新增PRODUCT_GOALS_CURRENT并回链CONTINUE/TODO/IMPLEMENTATION_PLAN/AGENTS。
  下一批先T0本机版本对齐及T1–T6目标/任务/执行安排/Agent/成果路径；再持续会话、
  固定Workflow版本、多端和连接器。其余投影按实际阻塞推进，不自动接着迁移下一列表。
  新目标工作区仍待实现，不把本轮Inbox/文档或测试数当产品完成率，119/9/110不变。
- Starlette/httpx和大包警告保留；app166.28/gzip54.74kB、CSS38.91/7.35，
  lazyWorkspacePages21.12/7.38、CSS1.53/0.57；不是实际总初始transfer/整体提速。
  主4180仍PID2064113未advertise task_query/task_detail，5173为200/legacy；
  临时4187/5176停止，无凭证/正式DB写入/兄弟修改/升级/部署。提交push以Git回执为准。

### 产品工作项：T0–T6目标与任务工作区初版

- 起始344d7ba已push/工作树干净。先记录ADR-0021与T0–T6；用户明确要求列待办、多Agent
  实现，client/UI/browser三条，root整合路由/所有入口/Forms/RunWorkspace/主服务启用。
- 新#task/encodedID，创建保存、列表箭头、Inspector、Inbox、Quickfind进入同一Task。
  Project目标与Task目标/验收/文件分开，真实latest与20项历史页；goal/work/review受管URL，
  noRun/noModel/forbidden/missing/loading/busy明确，模型缺失提供Configure真实入口。
- Agent与成果lazy复用原RunWorkspace（图/调用/transcript/usage/恢复/审查），expectedTaskId
  同Run.id/task.id/project.id绑定；abort检查先于state写，refresh401/403/404清旧私有和动作。
  不复制执行权威、不伪造进度/模型能力，主题/语言不丢Task视图。
- Arrange显式沿原preview/角色模型/预算/consent，Task启动Run后留在同Task Agent视图。
  browser抓到保存Task后navigation被已完成表单operationBusy阻断；guard只对未saved操作busy，
  真实submit锁仍保持至unmount。最终新建无preview、Task内执行与成果审查通过。
- 1683前端（58文件）/996Python/typecheck/build通过，78新增（client53/UI24/route1）。
  生产workspace37/12PNG、综合58/61PNG；主入口只读6项，共101浏览器检查、73最终PNG，
  无最终pageerror。三style双mode/中英390/长标题和files/目标首屏、403与迟到等已验。
  全链路真接口fixture.0h505H使用FakeProvider/MockTransport，不是真实Provider或费用；
  手机合成走goal/work/review+preview，未声称physicalphone完整执行认证。
- 失败保存Project hash呈现不重读的脚本假设、Required标签定位、创建导航真缺陷、旧Quickfind
  仍期望过滤列表；综合已改验Task精确路由/goal及Task启动新Run，所有原模型/预算/恢复断言保留。
  初轮unit同旧路由假设已修。证据`frontend/evidence/task-workspace-2026-11-21/README.md`。
- T0主服务原PID2064113核实cwd/命令/原环境（内存继承，不输出secret），仅回环4180；
  无active/queued Run/Call/modeltest/applying恢复/check/子执行进程。原1Project/1Task/6终态Run/
  1model/18Agent/17call/6artifact/157event。一致在线backup、私有副本Store迁移原行对比，
  再确认空闲后SIGTERM、锁释放、停服backup，同命令/cwd/环境启动新PID3356362。
- 原workspace/auth不变，近期read capabilities已true；原表原列digest启动后及浏览器后不变。
  私有`.runtime/backups/before-task-workspace-20261121T031726Z/`700、DB/log600，Git忽略，
  不保存到公开目录。回退不得热覆盖，备份非旧内存代码。身份绑定activation脚本不重复执行。
- 5173初查停止已恢复200；桌面/手机GET-only6项读真实Task目标/历史/Agent/成果，无写请求、
  外部HTTP/pageerror，不导出真实截图/DOM/正文。临时4187/5176停止；用户服务保持运行。
- 既有Starlette/httpx及chunk>500kB警告保留；chunk数据见buildlog，非整体transfer/提速证明。
  无新Python/依赖/凭证/兄弟修改/远程部署/执行权限提升。119/9/110不变，T0–T6仅本初版范围。
  下一批持续会话/补充要求/下一轮Task Run，再固定Workflow版本；设备接力与连接器仍待办。
  本批独立commit/push以Git回执为准，不再自动迁移下一列表或重复Task页。

### 产品工作项：C1–C6任务会话与下一轮Run

- 起始391603c已push且工作树干净。用户要求继续、多Agent实现和清晰任务进展；
  backend/client/UI三Agent分工，root整合Forms/Workbench、实际API、原功能回归、
  本机启用和记录。C1–C6与下一批W1–W5已列PRODUCT_GOALS_CURRENT/TODO_INDEX。
- 新Task“任务会话”页签、不可变补充消息及固定20项页，saved/prepared/applied与真实Run
  链接分别展示。只发原Task资料和所选消息，无旧消息/输出自动重发或假assistant回复。
  保存不读文件/开始Run；Task及旧Run快照不变。仍为原固定只读Harness。
- 新task_conversation明确cap和精确save/request/read/preview/prepare/execute合同；
  prepare持久冻结上下文与7字段资源，execute原子创建唯一Run并关联applied。
  一Task最多1prepared，页外独立同快照补取最多21DTO；普通Run/重试/恢复不能绕过。
- strict DTO/URL、15s mutation deadline、取消/迟到/401清私有，未知结果GET-only核对。
  direct/GET回执绑定immutable Task/turn/request/content/time、完整candidate及发送配置/hash；
  prepare恢复不自动执行，重开仍新consent。reload404无原文保留taskSend锁；
  有原文仅同ID同文显式重试，不能以404推断在途POST终止。
- 修复草稿guard被新表单覆盖、同Task不同消息旧Form state复用、回执candidate身份缺口。
  手机四tab沿Astryx iconOnly保留完整ARIA名，输入单Unicode计数、超8000禁保存。
  没有shared组件替代、依赖升级或执行权限变化。
- 最终1813前端（60文件）/1055Python/typecheck/build通过；59新增后端、
  112client定向及42Task/Conversation定向通过，定向数属于总数不相加。
  生产专项24/26PNG、实际SQLite/FakeProvider5/4PNG、综合58/61PNG、
  主入口只读6，共93最终浏览器检查/91fixturePNG，无最终pageerror。
  三style双mode/390中英、六组overflow0及中文手机完整名称已验。
- 实际fresh fixture.8k8JKc两消息两Run，各4次FakeProvider；故意丢prepare/execute响应，
  GET核对后重新同意/打开原Run，重复exact execute没有第三Run，第二条不带第一条补充。
  综合另一fresh fixture为FakeProvider/MockTransport，无真实Provider/费用。
  首轮unmanaged hash导致保存未POST，后两轮async wait错误导致提前断言；
  改fresh deep link与有界GET轮询后通过，三份失败报告/PNG保留。
- 本机原PID3356362核对命令/cwd/原环境，空闲且无未决恢复/子执行器。
  在线一致backup、副本Store迁移原行比对、再核查、SIGTERM/锁释放/停服backup，
  同命令/cwd/原环境内存继承启动PID234937，cap=true。原表原列摘要启动后及主browser后不变：
  1Project/1Task/6Run/1model/18Agent/17Call/6Artifact/157Event；新task_turns为空。
- 私有备份`.runtime/backups/before-task-conversation-20261121T102836Z/`700、DB/log600；
  不导出正式正文/截图/环境/凭证，activation脚本绑定旧PID不可重跑，不热覆盖回退。
  主5173桌面/手机GET-only6项通过，无写请求/外部HTTP/pageerror，主4180/5173保持运行。
  临时4187/5176已停止；最终证据`frontend/evidence/task-conversation-2026-11-21/`。
- Starlette/httpx及大chunk警告保留，app JS179.53/gzip58.12kB、CSS38.91/7.35；
  lazy TaskWorkspace JS30.37/10.15、CSS5.62/1.26；非初始transfer或整体性能结论，
  Bootstrap仍全量。原119/9/110不变，不关闭026–034等全部长期范围。
- prepared暂无撤销/改资源；reload后无原文且持续404仍待核对，无伪造终止/解锁。
  自动会话记忆、Workflow版本、真机/真实Provider、多端控制与连接器未完成。
  下一批W1定义/W2版本/W3可见配置/W4冲突确认/W5验收，不自动回到下个列表投影。
  本批独立commit/push以Git回执为准。

## 2026-11-22

### 产品工作项：固定 Workflow W1-W5 实现与隔离浏览器验收（进行中）

- 本轮沿ADR-0023实现一个固定的`local-research`流程：Planning/coordinator、
  Research/researcher、Synthesis/reviewer，人工审查保持独立；未引入任意DAG、插件、
  Shell、部署或新Provider。
- 后端新增严格定义校验、workspace draft、不可变版本、CAS保存、impact校验、发布确认、
  固定20项版本历史和精确mutation receipt；Run与TaskTurn记录完整Workflow snapshot，
  恢复保留原snapshot，Harness实际使用阶段指令和research task上限。
- 前端新增`#workflows`页面、固定阶段图、资源/模型配置、保存与发布确认、历史查看，
  并在Run向导中选择已发布版本；工作区继续使用单一Astryx业务树。
- 主线代码、前端/后端测试与生产构建已通过；本条不重复计算旧119/9/110台账。
  具体测试命令和数量以主线回归输出及新增测试文件为准。
- 隔离浏览器报告见
  `frontend/evidence/workflow-versions-2026-11-22/README.md`和`verification.json`：
  一次性`tests/browser_server.py`、FakeProvider、临时 Vite dev server，八项检查通过，包含
  `save→impact→publish`、桌面历史、UI发布确认、发布v2后显式Run仍绑定v1 snapshot、
  CAS冲突、未知写入GET核对、dirty navigation guard、390px英文Gothic无横向溢出；
  无外部请求、无pageerror、无正式DB写入。
- 本轮未启用主4180/5173 Workflow，也未提交或push。真实Provider、物理手机/IME、
  更完整的三style双mode浏览器矩阵仍需要单独验收，不能由本轮截图推断完成。

### 2026-11-23 产品工作项：W1–W5固定Workflow交付与重启恢复

- 从0cf2c99已push/干净工作树恢复；11月22日的实现已提交，不把旧“尚未提交”当现状。
  T3重启后主4180/5173均停止，取消的前端启动已恢复。先读CONTINUE/ADR-0023与实际代码，
  backend/client/UI三个Agent完成各自修复和测试，root负责整合/浏览器/主服务/记录。
- 固定定义、CAS草稿、impact/发布确认、不可变版本、operation ledger与Run/TaskTurn绑定
  在前批已有，本轮补完成W1–W5产品闭环；模型Synthesis与人工Review独立，指令和
  research_tasks进真实Harness。仍是单个local-research，不是任意DAG或新工具权限。
- backend修复workflow:null逃逸，新增损坏快照零调用、legacy不回填和恢复新资源保旧定义；
  client补分页/旧选项与迟到阻断、实际pubdefinition hash、cap丢失不能降builtin。
  UI修save确认后历史请求永久busy；root补Run版本展示/strict元数据、Forms分页与缺cap提示、
  新建Task/Project共享dirty/busy准入，避免覆盖未知写入guard。
- 手机长hash挤压名称真实缺陷在截图中发现：overflow0但名称0px、行高819px。
  修为有界两列、hash可缩小；最终手机名称171px/最大行高84px，六布局均无document overflow。
  这不是新主题分支，仍Astryx wrapper与同一业务树，没有新依赖或源复制。
- 最终1958前端（65文件）/1132Python/typecheck/build通过，保留既有httpx弃用与大chunk警告。
  最后CSS修正后生产再验：Workflow21/9PNG、综合58/61PNG、主GET-only6，共85项/70最终PNG，
  无最终pageerror/外部HTTP；Neutral/Zira/Y2K双mode、中英390、另Gothic手机及实际计算值。
- 专项fixture.AvwQtP从空业务库开始发布23版本；验证页外v1、普通UI与TaskTurnUI
  prepare/execute均冻结v1，即使latest已22。3个Run用FakeProvider，原Task/旧Run不改。
  save/publish响应故意在真实写后丢失；pub reload后精确GETledger，只新增1版本、无重发POST。
  独立综合fixture.VKfj6t使用FakeProvider/MockTransport，无真实费用/账号。
- 保留脚本dialog忙时变alertdialog导致过早断言、旧mock继承新cap却未提供GET的失败；
  分别改等待真实form卸载、独立legacyfixture明确false。生产advertised失败仍阻断，
  没有降低产品校验或删旧模型/预算/恢复断言。视觉反例单独归档。
- 主恢复前验证当前Settings workspace/data/auth模式匹配原记录、无queued/active Run/Call/
  modeltest/未决恢复/preparedturn，取得worker lock；一致停服backup→副本Store迁移→
  原表原列逐行摘要比对→复核空闲后启动4180 PID3459239，5173已200。
  原1Project/1Task/6Run/1model/18Agent/17Call/6Artifact/157Event及其他原行不变；
  新workflow_drafts1（未绑定默认草稿）/versions0/operations0，不自动发布或调用已有模型。
- 桌面/中文手机主入口6项GET-only读取默认Workflow与原Run未记录版本状态，浏览器后再比对原行
  相同。无正式写入/截图/正文导出；私有`.runtime/backups/before-workflow-20261123T020755Z/`
  700、DB/log600，不进Git。原进程环境已消失，使用验证过的当前Settings而非声称继承；
  不读凭证库/兄弟数据、不热覆盖回退。临时4187/4188/5176/5177已停，主4180/5173保留。
- 证据`frontend/evidence/workflow-versions-2026-11-23/`；构建app JS194.95/gzip62.28kB、
  CSS39.15/7.39，lazyWorkflow JS25.02/8.66、CSS6.07/1.32。不是初始transfer或整站提速，
  Bootstrap仍全量；真实Provider、物理手机/IME、Safari和长期能力未认证。
- 原119/9/110不变，W1–W5只关闭固定初版。下一批D1–D5设备身份/配对/控制权/断线接续，
  再飞书/语雀/邮箱等；prepared撤销、自动记忆、任意DAG等仍独立未完。本批commit/push以Git回执为准。

### 2026-11-23 产品工作项：单Task设备配对与接续初版

- 基线5ca3cc3已push/干净。用户继续；先冻结ADR-0024与最小授权，backend/client/UI三Agent
  分工，root接App/导航/Task入口、fixture schema、双browser/综合/主启用和记录。
  D1/D2及D3权限边界/D4有界读取/D5浏览器部分落代码，不将设备配对当执行控制完成。
- 4新表device_pairings/devices/device_operations/device_messages；32字节secret哈希，
  10min一次邀请、30day设备会话、HttpOnly/SameSiteStrict、精确pair/revoke回执/CAS。
  原TaskTurn save抽同事务helper，设备active/revoke/expiry检查与消息写原子。
  cookie存在包括invalid/revoked也不回退loopbackowner；设备仅task_read/message_save，
  ownerBootstrap/配置/文件/Run与恢复/审查API拒绝，secret验证错误不回显Pydantic input。
- Task入口#devices?task=ID，freshTask后明确scope/consent；配对码掩码/显式copy/close，
  不进入URL/偏好/事件/回执/日志/证据，GETreceipt无法恢复已丢失的secret。
  独立#pair无ownerBootstrap，只有授权Task/最新Run/报告/20消息及Unicode补充输入。
  网络失败stale、显式Refresh只GET；scope50事件按Task SQL过滤且不出payload/伪online。
- 创建/claim/save/revoke丢响应均原ID/GET核对，无自动POST。reload无原文继续unknown，
  不能凭404编造终止或换新ID。补跨tabcookie更换的X-Workbench-Device-Id意图绑定：
  消息POST/receipt在同事务/read校验，不把旧草稿写到新Task；identity变更清私有并重读。
  修初始session失败当未配对、invalidDTO保留旧context、Refresh被自身busy取消等边界。
- 新增46后端、94前端（50client/17portal/27管理），属于总数不相加。最终2052前端
  （68文件）/1178Python/typecheck/build通过；13专项/15PNG、58综合/61PNG、6主只读，
  共77最终浏览器/76fixturePNG。owner+paired两surface、三style双mode共12组geometry0overflow，
  中英390/长名称与实际报告截图已看，无最终pageerror/外部HTTP。
- 专项fresh fixture.kZEYWU为2Task/1邀请/1device撤销/3消息/1ownerFakeProviderRun，
  两独立context（desktop/mobile），paired只见授权Task，其他API403，撤销scope读写401。
  实际写后故意丢响应再核对，未重复POST；报告来自FakeProvider，断线期间owner新增消息后
  Refresh GET补齐。综合独立fresh.AFZ9gC为FakeProvider/MockTransport，无真实Provider或费用。
- 保留required标签exactlocator失败、脚本sending期间提前unroute的routehandled错误文本
  （该进程未生成JSON，不伪造）。旧commandcount两项更新新设备合法目的地后全过。
  没有降低产品权限/校验、删旧预算恢复检查或保存secret截图来消除失败。
- 主4180原PID3459239空闲，identity/cwd/env内存核对、在线一致backup/私有副本迁移/
  原表原列摘要比较；再检查、SIGTERM/锁释放/停服backup后同命令/cwd/env启动PID1104938。
  原1Project/1Task/6Run/1model/18Agent/17Call/6Artifact/157Event和Workflow等原行不变；
  新4设备表均0行。主5173桌面/中文手机GET-only6项通过，浏览器后原行仍相同。
  无正式配对/消息/模型、凭证库/兄弟读取/外网部署；私有备份
  `.runtime/backups/before-devices-20261123T143812Z/`700、DB/log600，不进Git，不热覆盖回退。
- 主4180/5173保持运行；临时4187/4188/5176/5177停止。证据`frontend/evidence/devices-2026-11-23/`。
  保留httpx/chunk警告，appJS195.89/gzip62.68kB、CSS39.15/7.39，
  lazyDevices JS21.82/7.80 CSS3.74/0.89、PairPortalJS20.30/7.14 CSS2.10/0.65；
  非实际transfer或整站性能，Bootstrap仍全量，无依赖升级，原119/9/110不变。
- local no-token仍信任localhost，人工清cookie后适用原owner规则，不是多用户ACL；
  未改监听/TLS/私网/隧道，127.0.0.1不是手机网络地址。D3b委托执行、D4b工作位置/
  更广回执、D5b HTTPS与物理设备/Safari/IME仍待；Rust节点/进程迁移/连接器未交付。
  下一步按产品任务限定范围推进，不自动给paired模型执行权限。本批commit/push以Git回执为准。

## 2026-11-24

### 产品工作项：D4b历史Run与显式阅读位置接续

- 起始55fd4d9已push/干净，按CONTINUE/PRODUCT_GOALS选择设备接续剩余中的有界阅读位置；
  root实现和验收，无新增Agent委托。ADR-0025冻结范围，沿用ADR-0024授权边界。
- 后端新增GET `/api/device/runs`和`/{id}`：query-only快照检查cookie/Device header，
  固定20项/真实总数、精确Task/Run、有界20000-codepoint报告，跨Task404、
  撤销/过期401、身份变更409。明确cap，不返回配置/文件/模型/Agent操作。
  固定task_read/message_save，无新表、schema或执行grant。
- Task新增“复制设备接续链接”，只复制Task/视图/选中Run；另一设备仍需有效独立配对。
  配对端五视图/历史分页/精确报告，页外选择与刷新/BackForward独立；
  缺失/错误不换latest，错误Task链接隐藏私有内容并显式回授权概览。
  同Task视图切换保留composer内存，unknown锁导航/原ID GET，stamp保留阅读位置。
- 继续React19/Astryx0.7.13/项目wrapper/共享tokens，无依赖升级或vendor副本。
  新47前端/13后端包含在最终2099前端（70文件）/1191Python/typecheck/build中。
  保留httpx弃用和大chunk警告；appJS195.96/gzip62.73kB、CSS39.15/7.39，
  lazyPairPortalJS27.52/9.24、CSS2.70/0.80，非初始transfer或整站提速。
- 专项10/6PNG、综合58/61PNG、主只读6，共74最终浏览器检查/67fixturePNG通过；
  最终pageerrors0，专项与主external空，综合阻止外部HTTP。
  Neutral/Zira/Y2K双mode、1440英文/390中文、页外报告优先、历史局部滚动已截图检查。
  物理手机、平板、Safari、真实IME/Provider没有认证。
- 专项.KHoKCc用空库guard seed45Project/45Task/88终态Run/0model与2合成报告。
  两浏览器验证旧000报告与latest044不同、分页/刷新、草稿、unknown只1messagePOST、
  原ID GET/BackForward、错误Task/缺Run/503GETretry、scope/撤销。
  尝试执行API403，没有创建Run。独立综合.ezv2Ye用FakeProvider/MockTransport，无真实费用。
- 保留radio/button定位、fixture收到SIGTERM后空JSON、route覆盖导致写计数漏报三个失败。
  修正脚本定位/计数并新fixture完整重跑，未降低产品权限或用fallback掩盖错误。
  locale初始化只在未设置时生效，最终明确断言中文radio，旧英文截图不当中文证据。
- 主4180空闲PID1104938经身份/cwd/env内存核验、一致backup、副本Store演练/
  原表原列摘要、SIGTERM/锁释放/停服backup，同命令/cwd/env启动PID1303596。
  主5173恢复。1440英文/390中文6GET-only通过、无写/外部/pageerror，浏览器后原行再次相同。
  仍1Project/1Task/6Run/1model/18Agent/17Call/6Artifact/157Event，4设备表0；
  Workflow草稿1/versions0/operations0。无正式配对/消息/模型执行或schema变更。
- 私有备份`.runtime/backups/before-devices-20261124T170717Z/`700、DB/log600，不进Git；
  公开summary不含环境/hash/正式正文截图，旧PID绑定脚本不可重跑，不热覆盖回退。
  主4180/5173保留且HTTP200，临时4187/5176已确认停止。证据
  `frontend/evidence/device-history-2026-11-24/README.md`；本批尚未提交/push。
- D4b仅关闭显式URL历史阅读位置；不是服务端bookmark、跨设备草稿/candidate同步或执行迁移。
  D3b委托执行、D4b更广未决接续、D5b可信HTTPS/真机仍待；再按飞书/语雀/邮箱推进。
  原119/9/110与Bootstrap全量事实保持，不把本批当设备全部完成。

## 2026-11-25

### 产品工作项：D3b精确下一轮的一次执行委托

- 在55fd4d9与前批未提交D4b修改上继续，不覆盖dirty树；先读CONTINUE/ADR-0025和产品优先级，
  root实现/验收本批，无新增Agent委托。ADR-0026限定一次prepared候选启动，不做通用控制租约。
- TaskTurn资源向导增加最后一步“仅准备”；改变方式清consent，确认后冻结资料/资源但不执行。
  Task prepared入口通向设备页；真实设备可打开一次执行委托，owner确认精确摘要后授权最多10min。
  paired概览/运行视图再确认，grant消费/TaskTurn应用/唯一Run入队在同事务完成。
- 新增2张表device_execution_grants/device_execution_operations，原TaskTurn/Run schema不变；
  抽同事务execute helper保留原模型/冲突检查，device actor审计。pair scope仍task_read/message_save，
  额外grant绑定Device/Task/Turn/hash/revision/到期；没有通用模型/文件/配置/恢复/审查权限。
  摘要只含真实模型标识、限制、消息、资料数量/bytes/hash，不含正文/路径/endpoint/key_env。
- 稳定owneroperation与devicegrant ID入受管URL，未知写入/reload/404只GET原记录；
  无效execute回执也保留锁，不用latestRun伪回执。owner先执行unusedgrant显示superseded，
  owner/device并发只1Run、撤销/execute只一合法结果；新候选需新授权/consent。
- 新48前端/17后端；最终2147前端72文件、1208Python/typecheck/build通过；
  保留Starlette/httpx与大chunk警告。保持React19/Astryx0.7.13/wrapper/共享tokens，
  无依赖升级或vendor源复制。Codex摘要明确有效单通道与输出Token非CLI硬上限。
- 最终生产专项9/12PNG、综合58/61PNG、主GET-only8，共75检查/73fixturePNG；
  owner/paired三style双mode、1440英文/390中文12组合、无document overflow/最终pageerror/外部HTTP。
  手机modal内部滚动/摘要/确认已截图检查；不是物理手机/Safari/IME/HTTPS或真实Provider认证。
- 专项fresh.IMaATi实际UI仅prepare先验0Run，再ownergrant与deviceexecute各真实提交后故意丢响应，
  reload原operation/grant GET恢复，分别只有1POST；1个FakeProviderRun完成report。
  owner同candidateexecute回同Run；第二消息/grant仅用于UIrevoke，staleconfirm409且没有第二Run；
  最后device撤销清私有。综合独立fresh.GhrLUg为FakeProvider/MockTransport，无真实费用。
- 保留dialog忙时换alertdialog导致过早GET的prepare-role、preview停止connectionrefused两失败；
  用真实form卸载条件/新fixture修脚本，未放松产品校验或用正式服务fallback。
  初始TaskDTO字段断言补显式新cap，不宽松接unknown。
- 主4180空闲原PID1303596，经身份/cwd/env内存核验、一致backup/私有副本Store演练/
  原表原列摘要、SIGTERM/锁释放/停服backup，同command/cwd/env启动PID425660。
  主5173保持运行，8只读后原行再次相同，旧1Project/1Task/6Run/1model/18Agent/17Call/
  6Artifact/157Event不变，4设备表/2授权表0行，Workflow草稿1/versions0/operations0。
  无正式配对/消息/grant/模型请求，无正文截图/环境/hash导出，未改监听/TLS/外网。
- 私有备份`.runtime/backups/before-devices-20261125T121621Z/`700/DBlog600，
  旧PID脚本不可重复，不热覆盖回退。主4180/5173保留且HTTP200，临时4187/4188/5176/5177已确认停止。
  证据`frontend/evidence/device-execution-2026-11-25/README.md`，本批及前批尚未提交/push。
- 一次grant不是通用控制/执行迁移。下一步D4b草稿/更广未决candidate、D5b HTTPS/物理设备，
  再连接器飞书/语雀/邮箱等；原119/9/110、Bootstrap全量事实保持。

### 2026-11-25 产品工作项：核心研发实现与真实测试首版

- 用户接受隔离修改/明确测试/Diff交付后，按ADR-0027优先核心闭环，保留前批dirty树。
  Task新入口核对显式资料、writable/不变tests、模型/预算，prepare冻结后execute唯一入队；
  coding_jobs新表，复用Run/Agent/Call/Artifact/Event，原业务schema不改。
- 模型只提交strict JSON替换，可信父进程写临时副本；实际Python unittest测试、
  失败证据回传最多3模型调用。10文件/64KiB，测试只读、原项目不写、不安装/提交/部署。
  Codex沿原文本adapter，底层tool ceiling缺口不因此宣称认证。
- bwrap namespace实测不可用，Landlock ABI7/libseccomp2 2.5.5限制读/写/网络/进程/IPC，
  no_new_privs与CPU/内存/FD/输出/墙钟上限、进程组回收。真实负向probe/共享内存/
  超时/大输出/零测试/全skip均验；受限Linux进程不是VM或完整安全审计。
- 精确candidate/request、同Task准备锁、未知原GET、prepared显式discard、pristine关闭；
  不能借研究恢复或设备grant执行。UI显示真实阶段/成员、测试轴、Diff与argv/日志，
  导出patch/JSON，人审不意味着应用代码。历史研究仍未执行测试，不补造事实。
- 最终2197前端75文件/1229Python/21核心定向/typecheck/build通过，新50前端/21后端；
  保留httpx/chunk警告，无依赖升级/vendor副本。保持React19/Astryx0.7.13/同一业务树/tokens。
- 生产10专项/15PNG、综合58/61PNG、主GET-only8，共76检查/76最终fixturePNG通过，
  三style双mode、候选/结果12布局、1440英文/390中文，最终pageerror/外部HTTP0。
  3成果截图归一window/header后只读重拍，保留sticky反例；不是真机/IME/视觉接受证据。
- 专项fresh.a12TAs复制mybot真实schemas/savedviews/init，4不变测试验证控制字符路径需求，
  baseline2失败→第一次1失败→第二次4通过，只有1Run/2注入模型响应。
  source/tests字节不变，下载与artifact一致，patch经git apply --check但未应用。
  prepare/execute丢响应reload只GET原记录，consent重新确认，无重复POST。
  模型是coding-fixture，修改/测试/隔离真实；无真实Codex/付费验收。综合fresh.ipcPhj用Fake/Mock。
- 首轮artifact顺序断言改按round；CodingError保留明确code；手机隐藏成果pane定位脚本
  修正时发现并实修旧3阶段index标签。合成旧fixture未实现coding GET，明确false cap，
  未放松生产校验或覆盖正式数据。失败JSON/PNG完整保留。
- 主空闲425660经identity/cwd/env内存核验、一致backup/私有Store建表演练/原行摘要、
  SIGTERM/锁释放/停服backup，同command/cwd/env启动859094，随后以同一流程对齐940971；
  最后明确模块名支持不依赖test前缀，并默认识别tests目录输入。5173新入口已加载。
  8只读后原行再比对相同，coding_jobs0；原1Project/1Task/6Run/1model/18Agent/17Call/
  6Artifact/157Event及其他旧行不变，无正式代码任务/测试/模型调用。
- 私有备份`before-devices-20261125T150027Z`与最终`before-devices-20261125T152945Z`
  位于`.runtime/backups/`、700/DBlog600，无正式正文/
  截图/环境/原hash导出；旧PID脚本不可重跑，不热覆盖回退。主4180/5173保留，
  临时4187/4188/5176/5177已确认停止，主4180/5173均HTTP200。
  证据`frontend/evidence/coding-core-2026-11-25/README.md`。
- appJS197.45/gzip63.19kB、lazyCodingDialog9.24/4.06、RunWorkspace22.68/8.69、
  TaskWorkspace34.20/11.36，非实际transfer提速；Bootstrap全量、119/9/110不变。
  本批和前批未提交/push；后续优先更多runtime/测试profile、任务分解与显式前轮成果引用。

## 2026-11-26

### 工作项：明确引用前轮真实成果

- 领域：TaskTurn上下文与确认、Run来源、设备精确候选摘要，ADR-0028。
- 复用原下一轮向导与持久candidate；新增同Task terminal成果元数据20项目录，
  显式3项/单32KiB/总64KiB、正文/来源/digest预览，prepare重验并冻结。
  候选与已核对输入分离，未核对阻止前进；未知原ID/GET，不重放POST。
  Run保留原来源与正文，设备摘要仅数量，未开放正文或新scope。
- 前端全量2217/76文件，Python全量1245、追加17专项（含后补1项）通过；
  191项前端相关合同再验、typecheck/build通过，httpx/chunk警告仍保留。
  最终app206.35/gzip65.68kB、CSS39.89/7.50；Bootstrap未减少。
- 最终coding10/15PNG、refs7/9PNG、综合58/61PNG、主GET-only10，
  共85浏览器/85最终fixturePNG，最终pageerror/外部HTTP0。
  fresh.XhArHf真实编码基线失败→部分修复失败→4测试通过，
  再显式引用Diff2/test2继续研究，1prepare/1execute与4Fake调用，
  原文件不变，patch只git apply --check。生成是注入fixture，不是付费模型效果证据。
- 保留tab、重复入口定位、偏好init和pending-route脚本失败；最终从新fixture完整重跑。
  截图发现turn notice的正文被flex挤列，已改专用纵向布局并在最终三style/双mode复查。
- 原主PID940971空闲、一致backup、私有Store演练、原列原行比对、SIGTERM/锁释放后，
  同command/cwd/env启动2393603；cap已启用。主5173十项GET-only后原行再次相同，
  TaskTurns/coding_jobs/设备/执行授权0，原1Project/1Task/6Run/1model/
  18Agent/17Call/6Artifact/157Event与Workflow不变。
  私有备份`.runtime/backups/before-devices-20261126T012355Z/`700/DBlog600，
  无正式正文/截图/环境/原摘要导出。临时4187/4188/5176/5177已停止，主4180/5173保留。
- 本批与之前未提交的ADR-0025/0026/0027一起提交push，以Git实际回执为准。
  [证据与失败](../frontend/evidence/core-continuation-2026-11-26/README.md)。
  仍缺更多测试profile、任务分解/依赖与旧patch应用到新coding副本；不是自动历史/长期记忆。
  原119/9/110保持。

### 工作项：跨Run的隔离代码检查点接续

- 2026-11-26，ADR-0029。Task原实现Dialog新增明确代码起点、同Task终态checkpoint目录/
  分页、本轮要求；核对继承Diff/原始基线/实际文件后冻结。原代码/测试/依赖漂移拒绝，
  不fuzzy apply/rebase。每次合法修改由Harness存checkpoint，源失败也保留代码状态；
  新Run实际重跑基线，累计diff/本轮incremental_diff/结构化代码JSON/测试分开，
  Run记录立即来源，三Run接续保留根基线。原项目不写，旧Run不反推checkpoint。
- prepare/execute丢响应同ID GET，冻结后不读新的正文替换；cap缺失阻止执行但保留显式discard。
  配对设备新目录/preview仍403。无新表/依赖/Provider工具或权限扩张。
- Python全量1267通过后补device/NUL用例，最终44核心定向；前端2250/77文件，
  78相关合同最后再验/typecheck/生产build通过。httpx/chunk警告、Bootstrap全量保持。
- 最终专项8/12PNG、综合58/61PNG、主GET-only8，共74浏览器/73最终fixturePNG；
  final fresh.wghbIa真实4不变测试：源基线失败2→部分实现失败1，第二Run继承失败1→修复通过4，
  2Run/各1注入Call、原文件不变，累计patch只git apply --check，结果与下载字节一致。
  模型是fixture，不把实际本地执行冒称付费/Codex效果验证。
- 保留起始模型错选/option focus两次脚本失败与原7项成功画面；最终新fixture完整重跑，
  补“继承代码基线”标签与可见原项目指纹，三style双mode中英390复查。
- 主2393603空闲、一致backup/私有Store演练/原行比对、SIGTERM/锁释放后同command/cwd/env
  启动3844765，cap已启用，主5173八项只读后原行再次相同。
  原1Project/1Task/6Run/1model/18Agent/17Call/6Artifact/157Event与Workflow不变，
  coding_jobs/TaskTurns/设备/授权0。私有备份`before-devices-20261126T112433Z`
  700/DBlog600，无正式正文/截图/环境/原摘要导出或实际模型/测试。
  临时4187/4188/5176/5177已停止，主4180/5173保留。
- app206.35/gzip65.68kB、CSS39.89/7.50、lazyCodingDialog14.62/5.70，
  RunWorkspace24.73/9.15。证据
  [代码接续交付](../frontend/evidence/coding-continuation-2026-11-26/README.md)。
  本批继续提交push，以Git实际回执为准；更多runtime、任务分解/依赖、基线冲突处理仍待。
  原119/9/110不变。

## 维护说明

上游研究证据写入 `docs/OPEN_SOURCE_RESEARCH.md` 和对应 REA 文档；本日志只记录 mybot 的工作项，不能替代上游 Evidence。

## 当前路线引用

当前交付顺序以 [PRODUCT_GOALS_CURRENT.md](PRODUCT_GOALS_CURRENT.md) 为准：
Task工作区、选定消息、固定Workflow及Task范围设备接续初版已交付，
显式历史位置、D3b一次研究委托和隔离研发实现/真实测试首版也已交付。
明确前轮成果引用已按ADR-0028交付；当前优先更多runtime/测试profile、任务分解/
依赖与基线变化的显式冲突处理；同基线coding检查点接续已按ADR-0029交付，
设备D4b/D5b与连接器保留待办，
不再默认作为下一批。通用控制租约仍独立待办。
[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)保留阶段架构与能力边界；
OpenMausBot执行采用、Cindy/Headscale/IM和更广代码执行仍有独立未完范围，不覆盖当前优先级。
