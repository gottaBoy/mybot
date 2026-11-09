# 开源借鉴与 REA 迭代台账

记录日期：2026-11-07。版本：v0.1。

本文回答“先跑通什么、每个部分借鉴谁、怎样持续迭代”。它不表示已接入任何上游。四个项目的 REA 工具分解见 [REA_PROJECT_BREAKDOWNS.md](REA_PROJECT_BREAKDOWNS.md)。

2026-11-08 最新补充：OpenMuse/Cindy/OpenClaw/HarnessWorks 的身份、分工与实施顺序见 [AGENT_INTEGRATION_ROADMAP.md](AGENT_INTEGRATION_ROADMAP.md)。先只读适配现有会话并接真实 Web，不等待全部候选跑通；OpenMuse 不带入第二套会话云，OpenClaw 不为首个 IM 引入完整 Gateway，HarnessWorks 不是 DSH。

最新体验优先级见 [DESIGN_CAPABILITY_REVIEW.md](DESIGN_CAPABILITY_REVIEW.md)（本轮环境日期 2026-11-07）：用户未认可现有预览。OpenMausBot P0/P1 是采用其执行器的门槛，不是 mybot 持续会话/多端控制产品增量的前置条件；不再把 Runtime Lab 当成主体验。以下上游采用门槛和 M01–M19 保留。

## 1. 如何使用 REA

REA（`morluto/rea`）是 MIT 许可的逆向分析 CLI/MCP。它的官方技能说明明确：完整源码仓库的普通架构分析应使用常规仓库工具；REA 适合发布包、ASAR/Electron、静态打包产物或需要运行时证据的场景。

本轮已经实际做了一个**只读发布包静态检查**：

- 工具版本：`rea-agents@6.8.0`，npm 完整性值 `sha512-9QDeRnGqEDzABZyr04eLnBXBv/c6I9/TWu/6M0MD4pEfkySI/BIgwTODIbAReX3C1x6hjw9+Jlx4A2yUSPZ9ww==`。
- Node：通过 npm 临时使用 `v24.22.1`，满足 REA 对 Node `^24.22.1` 的要求。
- 目标：`openmausbot@0.1.146` npm 包，包完整性值 `sha512-RKx0WYT/xJMCHjvIcv3jALIz1AF0LiyjSmE3bRERdALXunc6ULPk3nOaor6noTnKgSmeOSVDuB4ycrmEPD6WPA==`。
- 目标摘要：包解压约 69 MB、1666 个文件；REA 只选了 `package.json`、`dist/index.html`、`dist-server/package.json`，3 个文件均为 metadata，未执行 JS。
- 证据输出：临时目录 `/tmp/mybot-cross-device.FXoGm6/rea-evidence/openmausbot.json`，摘要 Evidence ID `ev_86c194d0ee5cc24a4d24419585a7885fa3a7da6b039f8f83aa38c9bbabbb2025`，完整父 Evidence ID `ev_231c5d2bb692d837a4f01a2bed0a84de4f4b2ec71e215e2b64aec78a118195a8`。
- 结果边界：包身份与文件库存被记录；由于只选择 3 个文件，1563 个文件和全部业务关系保持 unknown，不能用该结果证明运行路径、权限执行、事件推送或安全性。

随后对同一包做了第二次**聚焦静态发布包检查**，选择 `shared/approval-mode.js`、`server/bot-api-fence.js`、`server/sse-fanout.js`、`server/host/sse-replay.js`、`server/auto-approve.js` 和 `package.json`：

- 5 个 JavaScript 文件被解析，REA 报告 36 个 findings；其余 1560 个文件仍未选中。
- 证据输出：`/tmp/mybot-cross-device.FXoGm6/rea-evidence/openmausbot-policy.json`，摘要 Evidence ID `ev_7b896bfbce3c598ae3893e90e8db25f973c75d89b59e66274aaffa8cc142ef72`，完整父 Evidence ID `ev_6e2fd168da538715c6406771aaf03de4702fdcad6d7e0e6bb60a92a48a12c274`。
- 该检查支持“默认权限、Bot API fence、SSE fanout/replay 是可定位的静态代码边界”这一判断，但不证明请求可达、权限在所有路径执行、断线实测或业务安全。

因此本台账把 REA 结果记为 **S1 静态发布包证据**，不是 E3 运行证据。后续若要分析 Cindy 的 ASAR、OpenMausBot 的发布包或 nanoMuse/QwenPaw 的桌面产物，必须固定版本、选择必要源路径并保存完整 Evidence；不对完整源码树反复跑 REA。

### Cindy 官方页面复核

2026-11-07 打开官方开源页 `https://cindy.cn/#open-source`。页面把公开范围定位为桌面端、手机端和共享 packages，并说明服务端是独立仓库、不是客户端 monorepo；远程任务在原电脑执行，手机/Pad 主要负责查看、追问和授权。页面还列出飞书、Slack、GitHub、Jira、MCP、本地模型和 VPC Gateway 等能力，但具体可用范围取决于版本、账号和授权。企业自建 Gateway 是企业版/候补路径，不是本轮可部署的开源服务端证据。

这条页面证据修正了“Cindy 客户端开源 = Cindy 全栈可私有化”的推断。Cindy 的设备协议仍可作为 M04/M05 的机制参考，但不能作为 mybot 控制中心、唯一事实源或当前私有 Relay 的实现基础。

## 2. 建议底座顺序

### 结论

**可以先跑通 OpenMausBot，但只应作为“候选执行与多端体验 POC”，不能直接宣布为 mybot 新底座。**

推荐顺序：

1. **P0：OpenMausBot standalone acceptance**：只在隔离目录运行上游，不改 mybot，不连接真实业务账号。
2. **P1：适配边界验证**：用它的 Bot API/外部 runtime/自定义 ACP 或 OpenAI-compatible 入口接入一个测试 Agent；确认权限、事件、断线、恢复、成本和资料边界。
3. **P2：决定是否采用**：仅当它能以可审计、可撤销、可私有化的方式满足目标，才考虑把它作为执行后端；否则保留为参考/旁车。
4. **P3：再吸收 Cindy、nanoMuse、QwenPaw 的单项能力**：先做设备链接、会话同步、渠道和插件宿主的独立适配，不运行四个核心互相套娃。

不建议的顺序是“先把 OpenMausBot 跑起来，再直接加上另外三个项目的 UI、数据库、Relay 和 Agent”。那会产生多个任务事实源、权限模型和重试语义。

### OpenMausBot 的硬门槛

必须全部通过才可能成为执行底座：

- 新 Bot/线程默认权限能被改为安全的 `Ask`，并且控制端、API、外部 runtime 的权限不绕过中心策略。当前固定源码中 `DEFAULT_APPROVAL_MODE` 为 `full`；这是需要先收紧/验证的红线。
- 能以明确的只读模式运行测试任务，不自动获得 Shell、写文件、联网 App 或 GUI 控制。
- Bot API 的限制可接受：固定源码的 Bot API 明确不提供 shell、computer、browser、connected apps、MCP 或数据工具；它更适合通知/对话入口，不是完整执行 RPC。
- 自托管浏览器/手机配对、会话恢复、SSE/事件历史和审计可提取，且能与 mybot 的 Run/Agent/Call/Event 对齐。
- 执行、取消、暂停、恢复、重启后处理和外部副作用未知结果不违反 mybot 的事实口径。
- Apache-2.0 核心与 `enterprise/` 独立 source-available 目录边界可满足分发、生产和品牌化要求。
- 不要求依赖无法私有化的官方身份/云服务，或能把它清晰隔离在可选适配器中。

任一门槛不通过：OpenMausBot 只做参考实现或旁车，不成为 mybot 事实源。

## 3. 模块借鉴矩阵

| 模块 ID | mybot 目标 | 首要参考 | 借鉴机制/文件 | 复用代码？ | 下一步证据 |
| --- | --- | --- | --- | --- | --- |
| M01 | 任务/运行事实源 | 当前 mybot | `workbench/store.py` 的 Run、Agent、Call、Event、request_id | 否，保留自有模型 | 现有测试 + 新迁移契约 |
| M02 | Agent 编排、等待、恢复 | OpenMausBot | `docs/runtime-contract.md`、`server/runtime/` 的 assignment/event/inbox 思路 | 否，先提炼状态机 | 用 FakeProvider 做 crash/重启/重复消息 |
| M03 | 权限/审批 | OpenMausBot | `shared/approval-mode.ts`、`docs/approval-levels.md`、`server/host/delegated-level.ts` | 否；不能复制 Full 默认 | 设计 Ask-first 与 capability grant |
| M04 | 多端设备协议 | Cindy | `packages/device-link/README.md`、`packages/device-link/src/protocol.ts`、`transport.ts` | 否；协议需重新命名/审查 | 记录握手、心跳、重连、版本和 allowlist |
| M05 | 可靠消息/背压 | Cindy | `packages/device-link/README.md` 的 stream/seq/ACK/replay/backpressure 契约 | 否 | 模拟乱序、重复、断线、旧代帧 |
| M06 | 会话同步 | nanoMuse | `nanomuse/sync/engine.py`、`docs/every-device.md` | 否；只借鉴 cursor、tail、owner 边界 | 两端同一 Run，断线补齐，不同步 SQLite |
| M07 | 设备间任务和审批 | nanoMuse | `nanomuse/hub/service.py`、`nanomuse/hub/actions.py` | 否；先只读动作 | 设备授权、撤销、命令回执和未知结果 |
| M08 | Hub/Peer 执行迁移 | kojo（补充） | `docs/multi-device.md`、`internal/server/switch_device_handler.go` | 否 | 目标预检、fencing、迁移失败降级 |
| M09 | 渠道抽象 | nanoMuse | `nanomuse/channels/base.py`、`channels/manager.py` | 否 | Feishu/DingTalk/WeCom fake adapter |
| M10 | 渠道身份/插件隔离 | QwenPaw | `src/qwenpaw/app/channels/access_control.py`、`channels/ingress.py`、`plugins/channel_adapter.py` | 否 | 账号/租户/用户/话题映射与停用 |
| M11 | 多 Agent 协作 | OpenMausBot | `docs/runtime-contract.md` §2/§3/§9、`server/host/delegated-level.ts` | 否 | 父子 assignment、预算、报告一次性投递 |
| M12 | App 连接器 | OpenMausBot + QwenPaw | `docs/composio.md`、QwenPaw plugin API/registry | 否；只用公开 API/MCP 边界 | Yuque read-only、邮件 read-only |
| M13 | 事件/触发 | OpenMausBot | `server/app-events.ts`、`docs/composio.md` 的 cursor/idempotency/不可信事件块 | 否 | 重复事件、提示注入、Outbox 回执 |
| M14 | 本地/远程模型入口 | 当前 mybot + OpenMausBot | 当前 provider adapter；`docs/custom-engines.md` 的 ACP/OpenAI compat | 否 | 统一模型能力声明与失败口径 |
| M15 | 人工 GUI 兜底 | BilldDesk（仅概念） | 客户端 README 的 WebRTC/平台边界 | 否 | 后置；只做人工接管，不进入 Agent 事实源 |
| M16 | 发布包/运行时事实 | REA | `analyze_javascript_application` 的 Evidence/coverage/unknowns | 工具可复用，结果不复用 | Cindy ASAR 或 OMB 新发布包固定快照 |
| M17 | 可替换轻量 Harness | Pi | SDK/RPC 文档的 session/resource/tool 边界与 settled 语义 | 未决定 | 固定产物后做无工具/mock 协议验证 |
| M18 | 插件运行时与生命周期 | DeepSeek Harness | architecture 的 profiles、session/live 事件、工具管线 | 未决定 | developer-preview 风险与卸载/撤销/取消验证 |
| M19 | 多端壳、消息与通知 | HuLa | Tauri manifest 和桌面/移动入口分层 | 否，先研究机制且不复制 UI | Web 原生依赖分离，消息补齐/权限/真机专项 |

### 借鉴规则

- 借鉴“机制”和不变量，不复制视觉、品牌、整套页面或上游数据库。
- 公开仓库源码可读不等于可以复制；许可证、NOTICE、第三方依赖和企业目录单独审查。
- 上游文档/源码观察不是 mybot 集成证据；真实连接、运行、故障测试单独记录。
- 任何上游默认的 Full access、官方云账号或自动发送行为都不能直接迁入。
- 上游允许的能力要映射为 mybot 的 `CapabilityGrant`、`Approval`、`OperationReceipt`，经过本地策略再执行。

## 4. P0 OpenMausBot 验证剧本

### 环境隔离

- 用临时工作目录和独立 `OMB` 数据目录；不读取现有 `~/.openmausbot`、兄弟项目凭证或数据库。
- 首次只用测试模型/本地 OpenAI-compatible mock；不登录 Claude/Codex，不调用付费 Provider，不绑定真实 Gmail/Slack/微信/飞书。
- 允许安装 npm 包到临时缓存；不把上游源码移入 mybot 运行目录，不修改上游文件。
- 运行结束保留版本、命令、配置（脱敏）、日志摘要、数据库/文件路径和测试结果。

### 必测用例

| 用例 | 通过条件 | 淘汰条件 |
| --- | --- | --- |
| T1 安装和启动 | 固定版本可启动，Web/CLI 可访问，数据目录边界清晰 | 必须官方云/无法自托管启动，或秘密写入日志 |
| T2 Ask-first | 新 Bot、API、手机 client 都是 Ask；危险动作显式卡片/拒绝 | 默认 Full 无法通过策略覆盖，或远程端可无审批提权 |
| T3 只读任务 | 研究任务读取指定 fixtures，产生可复现结果和事件 | 任务需要连接真实账号或无法限制工作目录 |
| T4 外部入口 | webhook/Bot API 只能建立受限线程/草稿；不能直接开 Shell/App 工具 | 外部 key 能绕过权限、项目边界或读取其他线程 |
| T5 断线恢复 | 浏览器断开后任务状态可查询；重连不重复执行 | 只能靠重发消息，或状态/结果重复 |
| T6 停止/取消 | Stop/Cancel 的真实语义、已发副作用和未知结果可显示 | 把请求超时说成副作用撤销，或自动盲目重试 |
| T7 迁移/备份 | 自托管数据和恢复路径清楚，企业目录许可不混淆 | 必须不可替代的托管 Relay/身份服务 |
| T8 记录映射 | 能把任务、Agent、调用、审批、成果映射到 mybot 事件 | 只能看聊天文本，无稳定运行/调用 ID |

### 决策结果

- **A 底座候选**：T1-T8 全部通过，且许可/安全评审通过。先作为可替换执行后端，不改 mybot 控制中心。
- **B 执行旁车**：能跑任务和多端，但权限、事件或私有化不完整。用于局部能力，不拥有 mybot 事实源。
- **C 参考资料**：启动、账号或许可边界无法接受。只保留源码/文档借鉴，不接运行时。

## 5. 后续扩展顺序

1. OpenMausBot P0/P1 通过后，先实现 mybot 的多端控制协议（M04/M05），不先接四个 App。
2. 用 nanoMuse 的 cursor/tail/owner 思路完成同一 Run 的会话同步（M06），但 Run/Call/Event 仍由 mybot 保存。
3. 选一个 IM：飞书或钉钉。使用 QwenPaw/nanoMuse 的 Channel/ACL 分层（M09/M10），只做查询、通知、任务草稿。
4. 语雀只读，用官方 API/MCP 映射 Resource，送模型的片段进入 ContextBundle。
5. OpenMausBot/QwenPaw 的连接器与事件思路只在审批、回执、撤销和账号隔离通过后引入。
6. 邮箱先只读检索/摘要/回复草稿；发信与文档写回另立授权阶段。
7. Cindy 的设备协议、OpenMausBot 的权限、nanoMuse 的同步和 QwenPaw 的渠道都先转为 mybot 契约，再考虑 Rust Node。

对应的 REA 执行文档：

- [REA_OPENMAUSBOT.md](REA_OPENMAUSBOT.md)
- [REA_CINDY.md](REA_CINDY.md)
- [REA_NANOMUSE.md](REA_NANOMUSE.md)
- [REA_QWENPAW.md](REA_QWENPAW.md)

## 6. 每轮迭代模板

```text
迭代 ID：
问题/用户旅程：
借鉴模块 ID：
上游仓库 + commit + 路径：
观察类型：源码 / 文档 / REA 发布包 / 运行实测
要复用的机制：
不采用的行为：
mybot 本地设计：
安全与许可影响：
测试夹具：
验收证据：
残留 unknown：
决策：采用 / 局部采用 / 参考 / 淘汰
```

## 7. 当前建议

2026-11-07 已执行隔离的 P0 启动与元数据检查，完整结果见 [OPENMAUSBOT_P0_RESULTS.md](OPENMAUSBOT_P0_RESULTS.md)。REA process capture 已落盘，不再只有静态文件。T1 的启动子集可行；T2 未通过默认 Ask 门槛：首次创建的 Bot 为 Full，service 信任不会自动收紧它。手动降低测试 Bot 为 Ask 后，重启能保留配置，但不等于宿主强制策略已实现。

当前不采用为底座，也不据此永久淘汰；先研究 Ask-first 创建/委派/API 策略，再决定是否实现受限 P1 mock。运行中任务恢复、取消、SSE、配对和外部副作用仍未验收。mybot 当前实现保留。

同日权限 v4 增补：[权限研究](OPENMAUSBOT_PERMISSION_RESEARCH.md) 与 `tests/research/evidence/permissions-v4/` 已确认 Ask 创建模板可被 `settings.approvalMode=full` 覆盖，也可跳过。旧 v3 用顶层字段误判模板强制性，已撤回。已新增 66 项只读 ceiling 合成契约，未接入上游；下一步是独立宿主/执行器隔离和 grant 生命周期，而不是再调一个默认开关。

2026-11-08 增补：[Pi/Harness/HuLa](PI_HARNESS_HULA.md) 纳入 M17-M19。Pi 与 DSH 是执行器候选，HuLa 是客户端/消息能力参考。Codex 的单次连通不构成唯一内核选择；不让多个 Harness 同时控制一个 Run，也不因 HuLa 的 Rust 技术栈重写当前 Web/后端。

2026-11-08 后续实测：[OpenMausBot 会话复用](OPENMAUSBOT_MCP_REUSE_RESULTS.md) 已以固定包 + 合成 ACP 通过 v1 35 项、v2 38 项。Bot/会话/Task/消息/去重/等待/中断/干净重启有运行子集证据，不再只有文档观察。后台自动模型检查是新增边界；保存默认模型的对照可避免启动等额外提示，但不是生产调用门禁。建议优先受控复用 M02/M11，不能因此采用为底座或略过权限/事件/真实接口门槛。
