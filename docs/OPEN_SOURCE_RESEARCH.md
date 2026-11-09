# OpenHands / OpenBot / OpenMuse 调研记录

查阅日期：2026-11-01；2026-11-02 增补第一轮链路对照。

2026-11-02 用户新指定 `gottaBoy/dsh-superagent-prototype` 和 `Playa-Cyrene/Cyrene-Agent`，身份与资料阅读见 [USER_REFERENCES_2026-11-02.md](USER_REFERENCES_2026-11-02.md)。不要将后者与曾查看架构图的 `Yongchu-Yitao/Cyrene` 混用。

目的：分析公开源码与官方文档中的产品结构、执行与交互机制，服务于原创研发工作台设计。不是复制界面，也不是逆向私有服务。

## 1. 证据等级与范围

- E1：已阅读官方文档中的能力说明。
- E2：已阅读特定源码中的代表性实现。
- E3：本地部署和场景验证。本次没有开展。

目录中存在某模块不等于本次已审计该模块。阅读实现不等于验证它在故障、并发或真实服务中可靠。

本次完成仓库身份、README/架构阅读与少量代表源码阅读。不是“所有开源项目全面调研完成”，也不是完整安全审计。

2026-11-02 已完成本轮有边界的执行、委派、干预、计量和展示对照，新增证据与精确范围见 [SOURCE_CHAIN_ANALYSIS.md](SOURCE_CHAIN_ANALYSIS.md)。下列“待深入”保留为第一轮调研记录，已覆盖项和剩余缺口以新增报告为准；尚无 E3 部署验证。

## 2. 仓库与快照

以下 HEAD 使用公开 `git ls-remote` 读取，是查阅时快照，不是稳定版本推荐或发布标签。

| 仓库 | 本次观察到的 HEAD |
| --- | --- |
| OpenHands/OpenHands | `cdd6a69248ce8f99b41ff4c47bdf68dee95024e5` |
| OpenHands/software-agent-sdk | `98849457621881ae2414719b82b8bc1cf535b4ab` |
| CopilotKit/OpenBot | `c396a5f68c817043846f1ca3c2b42061ee73ceb5` |
| CopilotKit/openmuse | `a4944f4c471d3dc93b8bfc060b5da309b5216ab2` |

OpenBot 是同名较多的项目，本记录专指 CopilotKit/OpenBot，不是机器人硬件项目或其他同名仓库。

未克隆到工作区、未安装依赖、未运行上游测试、未访问真实账户、未调用模型。许可证和分发条款尚未逐项评估。

## 3. OpenHands

### 已阅读证据

E1：

- OpenHands/OpenHands 的 README 和 `docs/architecture.md`。
- OpenHands/software-agent-sdk 的 README。
- 主项目和 SDK 分开考察，不能将产品 UI 与执行库混为一谈。

E2，SDK 固定快照：

- `openhands-sdk/openhands/sdk/conversation/event_store.py`：事件存储实现。
- `openhands-sdk/openhands/sdk/event/llm_completion_log.py`：模型完成日志事件。

另已查询 SDK 源码目录，存在 conversation、agent、llm、security 相关模块；目录存在不代表这些模块均已阅读或验证。

### 初步结论

适合作为代码与终端执行后端的优先候选，尤其应考察会话、事件、工作区与远程 Agent Server 的边界。

值得采用的原则：UI 与执行后端分离；以事件组织执行过程；模型调用关联到会话/Agent，而不是只有全局用量。

不能据此声称已经覆盖完整的研发项目管理、团队授权或业务审计，也不能把完成日志默认全部采集为用户可见内容。

### 待深入

- 从 Agent Server 的创建运行到客户端事件显示的完整链路。
- 暂停、取消、恢复与副作用核查的真实语义。
- 子 Agent 委派及其事件、Token、成本归属。
- Workspace 的路径、网络、凭证与进程隔离。
- 多 Backend 的事件差异及统一映射成本。

本轮尝试直接读取固定快照的 `docs/backends/overview.md` 未成功，不能把该路径作为已经验证的文档依据。下一轮先核对目录再阅读。

## 4. OpenBot

### 已阅读证据

E1：README、`docs/README.md`、`docs/architecture.md`。

E2，固定快照：

- `server/src/computer/gateway.ts`
- `server/src/work/queue.ts`
- `server/src/agents/handoff-runner.ts`

已查询到策略、审计、工作循环、Routine 和 UI 路由的目录，尚未完整逐项阅读。

### 初步结论

它以持久 Bot、能力连接、权限边界和任务协作为重要产品对象。Gateway 与 handoff 是研究“Agent 不能直接绕过系统能力边界”的代表入口。

值得研究 Bot 身份、工具授权、委派与审计如何结合；不能仅因为存在队列或策略模块就认定隔离和恢复已经安全。

对研发工作台，不建议把所有研发任务强行变成 Bot 频道，或复制其 Bot 管理信息架构。研发项目、代码版本和验证证据仍需独立定义。

### 待深入

- `server/src/work/loop.ts` 的状态推进与持久化。
- `server/src/agents/handoff-tool.ts` 的委派授权。
- `server/src/computer/policy.ts` 与 `server/src/audit.ts` 的权限和审计契约。
- Agent/模型调用是否具备可完整归因的父子链。
- UI 在审批、失败和恢复时实际展示什么。

## 5. OpenMuse

### 已阅读证据

E1：

- README。
- `docs/FEATURES.md`、`docs/EXPERIENCE.md`。
- `docs/TELEMETRY.md`、`docs/VERIFICATION.md`。

E2，固定快照：

- `apps/server/src/engine/worker.ts`。

目录确认包含 `apps/server`、`apps/worker`、`apps/mobile` 和若干 domain/backend 包，不应凭名称猜测 `apps/api` 等不存在的路径。

### 初步结论

它重点呈现任务线程、可见执行、计算机/浏览器与文件结果的关联，适合研究任务进行中如何让用户检查和干预。

应区分真实模型执行、计算机后端、演示夹具与测试路径；无模型演示不能证明真实 Agent 可用。

其遥测与验证文档不应被扩大解释为已经具备研发团队所需的完整 LLM 追踪、成本分析和审计平台。

值得研究的是“执行与成果在同一任务体验中可见”的原则，不复制其页面和具体视觉。

### 待深入

- `apps/server/src/engine/model.ts`、`service.ts`、`routes.ts` 的真实模型链路。
- Worker 的重启、取消与未完成任务恢复。
- `apps/server/src/computer-tools.ts` 的授权与外部副作用。
- `packages/backends/src/openbot.ts` 与 `docs/OPENBOT-INTEGRATION.md` 的接入边界。
- UI 中浏览器预览、文件、终端和任务状态的一致性。

## 6. 对我们的取舍

| 项目 | 优先研究价值 | 不直接采用 |
| --- | --- | --- |
| OpenHands + SDK | 研发执行、事件、工作区和 Agent Server | 不直接用其主界面代替原创研发工作台 |
| OpenBot | Bot 能力边界、handoff、权限与审计 | 不将 Bot/频道等同于所有研发工作 |
| OpenMuse | 可见执行、结果预览、任务内干预 | 不将演示或基础遥测等同完整运行分析 |

建议：一个自定义研发产品域与原创 UI，优先验证一种执行后端，从其他项目吸收边界和体验原则；不将三个完整平台直接拼成一个系统。

## 7. 下一轮阅读方法

本轮已按此方法完成第一轮静态对照。后续先评审 [首版范围](MVP_SCOPE.md) 和 [原创低保真](LOW_FIDELITY_V1.md)，不要在没有明确问题的情况下无限延长源码阅读。

对每个项目使用同一场景：

```text
输入需求 -> 建立任务 -> 分配 Agent/模型 -> 执行工具
        -> 记录事件 -> 审批/失败/取消/恢复 -> 保存成果 -> UI 展示
```

逐项记录入口文件、对象 ID、持久化位置、状态转换、事件、权限检查、用户操作和未证实内容。之后才决定是否开展本地技术 POC。

## 8. 官方来源索引

下次先用上述 commit 固定源码，避免默认分支变化；文档内容与固定快照不一致时需重新核对。

```text
https://github.com/OpenHands/OpenHands
https://github.com/OpenHands/software-agent-sdk
https://github.com/CopilotKit/OpenBot
https://github.com/CopilotKit/openmuse

https://raw.githubusercontent.com/OpenHands/OpenHands/main/docs/architecture.md
https://raw.githubusercontent.com/CopilotKit/OpenBot/main/docs/architecture.md
https://raw.githubusercontent.com/CopilotKit/openmuse/main/docs/FEATURES.md
https://raw.githubusercontent.com/CopilotKit/openmuse/main/docs/EXPERIENCE.md
https://raw.githubusercontent.com/CopilotKit/openmuse/main/docs/TELEMETRY.md
https://raw.githubusercontent.com/CopilotKit/openmuse/main/docs/VERIFICATION.md

https://raw.githubusercontent.com/OpenHands/software-agent-sdk/98849457621881ae2414719b82b8bc1cf535b4ab/openhands-sdk/openhands/sdk/conversation/event_store.py
https://raw.githubusercontent.com/OpenHands/software-agent-sdk/98849457621881ae2414719b82b8bc1cf535b4ab/openhands-sdk/openhands/sdk/event/llm_completion_log.py
https://raw.githubusercontent.com/CopilotKit/OpenBot/c396a5f68c817043846f1ca3c2b42061ee73ceb5/server/src/computer/gateway.ts
https://raw.githubusercontent.com/CopilotKit/OpenBot/c396a5f68c817043846f1ca3c2b42061ee73ceb5/server/src/work/queue.ts
https://raw.githubusercontent.com/CopilotKit/OpenBot/c396a5f68c817043846f1ca3c2b42061ee73ceb5/server/src/agents/handoff-runner.ts
https://raw.githubusercontent.com/CopilotKit/openmuse/a4944f4c471d3dc93b8bfc060b5da309b5216ab2/apps/server/src/engine/worker.ts
```

## 9. 多端方案与 REA 专项（2026-11-07）

用户要求通过 REA 进一步搞清楚 OpenMausBot、Cindy、nanoMuse、QwenPaw，并比较是否先跑通 OpenMausBot。完整方案和逐模块借鉴关系见 [MULTI_DEVICE_AGENT_PLAN.md](MULTI_DEVICE_AGENT_PLAN.md) 与 [OPEN_SOURCE_ADOPTION_MAP.md](OPEN_SOURCE_ADOPTION_MAP.md)。

逐项目 REA 工具分解见 [REA_PROJECT_BREAKDOWNS.md](REA_PROJECT_BREAKDOWNS.md)、[REA_OPENMAUSBOT.md](REA_OPENMAUSBOT.md)、[REA_CINDY.md](REA_CINDY.md)、[REA_NANOMUSE.md](REA_NANOMUSE.md) 和 [REA_QWENPAW.md](REA_QWENPAW.md)。

### 9.1 REA 的适用边界

本轮核对了 `morluto/rea` 固定 commit `c5301e6145a9c8e06719f27e83da55af8e5480fc`、npm `rea-agents@6.8.0`。REA 官方技能明确：完整源码仓库的普通架构分析使用常规源码工具；REA 适合发布包、ASAR/Electron、静态打包产物和运行时证据。

实际执行了一次只读发布包分析：

- 目标：`openmausbot@0.1.146` npm 包，完整性 `sha512-RKx0WYT/xJMCHjvIcv3jALIz1AF0LiyjSmE3bRERdALXunc6ULPk3nOaor6noTnKgSmeOSVDuB4ycrmEPD6WPA==`。
- REA 选定 `package.json`、`dist/index.html`、`dist-server/package.json` 三个文件，未执行 JavaScript。
- REA 摘要 Evidence：`ev_86c194d0ee5cc24a4d24419585a7885fa3a7da6b039f8f83aa38c9bbabbb2025`；完整父 Evidence：`ev_231c5d2bb692d837a4f01a2bed0a84de4f4b2ec71e215e2b64aec78a118195a8`。
- 结果只证明包身份、库存和明确的 coverage/unknown；1563 个未选文件和业务运行关系保持 unknown，不能证明 OpenMausBot 权限、事件、恢复或性能。

随后对同一包聚焦 `shared/approval-mode.js`、`server/bot-api-fence.js`、`server/sse-fanout.js`、`server/host/sse-replay.js`、`server/auto-approve.js` 和 `package.json`：5 个 JavaScript 文件被静态解析，REA 报告 36 个 findings；摘要 Evidence 为 `ev_7b896bfbce3c598ae3893e90e8db25f973c75d89b59e66274aaffa8cc142ef72`，完整父 Evidence 为 `ev_6e2fd168da538715c6406771aaf03de4702fdcad6d7e0e6bb60a92a48a12c274`。这支持对默认权限、Bot API fence、SSE fanout/replay 进行源码定位，但不证明请求可达、所有路径都执行该策略、断线行为或业务安全。

证据文件保存在本次临时目录 `/tmp/mybot-cross-device.FXoGm6/rea-evidence/openmausbot.json`，没有写入生产运行目录。Cindy 当前仓库没有随源码提交的桌面 ASAR/完整发布包；nanoMuse/QwenPaw 当前所读主要是源码和静态 Web 文件，直接运行 REA 不会替代源码分析，因此没有把 REA 的缺席伪装成运行证据。

### 9.2 OpenMausBot

- 固定仓库：`milind-soni/OpenMausBot`，commit `1bc4749aa8307d7d6998bf86de4ef6478460dd93`；npm 发布包另见上面 REA 记录。
- 读取：`README.md`、`LICENSING.md`、`docs/self-hosting.md`、`docs/bot-api.md`、`docs/approval-levels.md`、`docs/runtime-contract.md`、`docs/custom-engines.md`、`docs/composio.md`、`server/app-events.ts`、`server/host/delegated-level.ts`、`shared/approval-mode.ts`。
- 重要观察：本地优先、多 Bot、手机配对、自托管、SSE/事件、连接应用和 ACP/OpenAI-compatible 引擎范围较丰富；但核心 Apache-2.0 与 `enterprise/` 独立 source-available 许可需分开审查。固定源码的默认审批级别 `DEFAULT_APPROVAL_MODE` 是 `full`。Bot API 明确限制为受限线程，不能使用 shell、computer、browser、connected apps、MCP 或其他工具。
- 取舍：先做隔离 P0/P1 体验与安全验收，不能因为安装成功或聊天可用就替换 mybot；若接入，先作为可替换执行后端。
- 缺口：未执行 npm 包业务运行、未连接真实引擎/应用、未做断线/重启/副作用 E3；REA 选定文件范围不足以补齐这些缺口。

### 9.3 Cindy

- 固定仓库：`makecindy/cindy`，commit `f89971ffb1eab1af21d73b3826f7a99dd4db5e1c`；读取 `README.zh-CN.md`、`packages/device-link/README.md`、`packages/device-link/src/protocol.ts`、`transport.ts`、`apps/desktop/src/main/device-link/remoteControlAccess.ts`、`sessionPatchStage.ts`、`remoteBotSessionBoundary.ts`。
- 官方页面补充证据：`https://cindy.cn/#open-source`（2026-11-07）。页面把开源范围描述为桌面端、手机端和共享 packages；服务端独立于客户端 monorepo；远程任务在原电脑执行，手机/Pad 主要查看、追问和授权；页面列出飞书、Slack、GitHub、Jira、MCP、本地模型和 VPC Gateway。企业自建 Gateway 是企业版/候补路径，不等于当前公开可部署服务端。
- 重要观察：设备链接协议把控制端和被控端分开；有握手、版本、心跳、presence、重连、allowlist、可靠序列/ACK/重传/背压及设备撤销代际。项目文件仍留在原电脑，跨 Harness 以上下文交接/重建为主。
- 取舍：借鉴 M04/M05 设备协议机制，不把 Cindy 官方云或未公开服务端当作 mybot 底座。
- 缺口：未获取可运行的 Cindy ASAR，未执行 REA 发布包分析、真实手机配对、官方云替代和跨网故障测试。

### 9.4 nanoMuse

- 固定仓库：`nano-muse/nanoMuse`，commit `a7b31d0ab6eb9a7db33d30fd234b462713bdd274`；读取 `README.md`、`docs/self-hosting.md`、`nanomuse/channels/base.py`、`nanomuse/channels/manager.py`、`nanomuse/hub/service.py`、`nanomuse/hub/actions.py`、`nanomuse/sync/engine.py`。
- 重要观察：GPL-3.0-or-later；手机/桌面/Web/Relay 的设备模型和自托管路径公开。同步有 cursor、tail、owner、working presence 和按主聊天/side chats 的范围；Hub 将远程 task、approval、stop 和设备动作分开。渠道基类把 SDK 可用性、配置、状态、入站/出站和 Bus 分层。
- 取舍：借鉴 M06/M07/M09 的同步、设备动作和渠道接口；不复制 GPL 代码或把其 Relay 直接作为 mybot 控制中心。
- 缺口：未部署/执行 Relay，未验证 proot、移动端 OS 限制、真实同步冲突、真实渠道和私有化故障。

### 9.5 QwenPaw

- 固定仓库：`agentscope-ai/QwenPaw`，commit `2cf28d14a20c9f9c769cce2a9c0568ccf84e459c`；读取 `README.md`、`src/qwenpaw/app/channels/ingress.py`、`src/qwenpaw/app/channels/access_control.py`、`src/qwenpaw/app/channels/manager.py`、`src/qwenpaw/app/channels/isolated_proxy.py`、`src/qwenpaw/plugins/api.py`、`src/qwenpaw/plugins/channel_adapter.py`、`src/qwenpaw/channel_protocol/normalization.py`。
- 重要观察：Apache-2.0；渠道/插件/MCP/多 Agent 范围较广。入站归一化要求 sender/ACL/session 标识；入口有 host-owned 路由、超时、并发、载荷限制；渠道启动、状态和 SDK 缺失被统一管理；插件工具有所有权冲突与治理注册。
- 取舍：借鉴 M09/M10 的渠道身份、生命周期、插件所有权和受限代理，不搬其整个平台或默认宣称 Coding/安全已验收。
- 缺口：未部署、未连飞书/钉钉/微信/企业微信、未做多租户越权、真实插件安装和性能故障验证。

### 9.6 当前决策

可以先跑通 OpenMausBot，但定义为隔离 P0/P1 候选执行与多端体验验证；mybot 的控制中心和事实源保留。只有权限默认、外部入口边界、事件/审计、断线恢复、自托管和许可门槛均通过，才进入适配器接入评审。随后按模块借鉴 Cindy 的设备链接、nanoMuse 的同步/渠道、QwenPaw 的渠道/插件，不直接运行四个平台互相套娃。

### 9.7 P0 受控实测增补（2026-11-07）

针对同一 `openmausbot@0.1.146` npm 包执行 P0，详见 [结果与复现](OPENMAUSBOT_P0_RESULTS.md)：

- npm sha512 通过；1666 个解包文件与 tarball 对照一致。Node `24.22.1`、REA `6.8.0`、Linux/aarch64。
- 因 Bubblewrap namespace 不可用，测试先自验 Landlock ABI 7 + libseccomp 的文件与出站网络限制，再运行包；未以普通 HOME 隔离代替。
- 三次空服务启动/停止通过；`edition=oss`、健康、静态 HTML、service 管理请求拒绝和未配对浏览器头拒绝有 HTTP 探针证据。
- 默认自动创建的 Bot 仍为 Full；仅切换 service 信任不能收紧它。owner API 对该测试 Bot 降为 Ask，重启后保留。尚未建立无法绕过的创建/委派策略。
- REA `capture-process` Evidence ID：`ev_6e1d70a83bab7db53f9f18705708942600eec16d8dc3c45693f99c49271b9795`，完整文件保存在 `tests/research/evidence/rea-omb-p0.json`，探针报告另存 `omb-p0.json`。
- E3 仅限空环境启动/元数据/配置持久化。没有模型提示、工具调用、SSE 重放、配对、真实账号或运行中任务恢复。REA 的两项进程归属 unknown 原样保留，不能改写为完整清理认证。

新增阅读路径：npm 包内 `dist-server/server/config.js`、`server-launcher.js`、`server/cli.js`、`server/request-auth.js`、`server/index.js` 的启动/HTTP gate/退出路径、`server/routes/bot-patch.js`。这些与 git 源码快照独立，不以 npm 版本号相同推断构建 commit 完全一致。

决策：保留候选，尚不采用为底座。下一步先分析和记录 Ask-first 宿主策略，再做限定本地 mock 的 P1。

### 9.8 权限路径增补

固定发布包的纯函数夹具 `tests/research/omb_permission_functions.mjs` 共 31 项通过，输出见 `tests/research/evidence/omb-permission-functions.json`，也在权限 v4 的 guard 下重复并由 REA 留存。它确认：

- 全局未设置默认是 Full；Ask 需要宿主显式配置。
- Ask 仍可因 saved command、saved tool、own-file read 获得批准，不能被 mybot 当成只读模式。
- Chief 的 person/routine lineage 可提升接收方级别；outside 不继承，但接收方自己的 Full 仍有效。
- Bot API 只有 hooks 工具和三个内部路径，适合受限消息入口，不是完整执行器。

随后通过空环境 HTTP + REA capture 比较 Ask 模板下四种创建方式：普通请求为 Ask；顶层 `approvalMode=full` 被忽略；实际的 `settings.approvalMode=full` 为 Full；`useDefaults=false` 也为 Full。v3 曾把顶层字段当成实际权限字段，得出“模板覆盖 Full”的错误结论，已撤回且保留原 Evidence。v4 修正后确认模板可覆盖/跳过，不是不可绕过的 ceiling。完整分析见 [OPENMAUSBOT_PERMISSION_RESEARCH.md](OPENMAUSBOT_PERMISSION_RESEARCH.md)，最新 Evidence 在 `tests/research/evidence/permissions-v4/`。

本地只读 ceiling 合同新增于 `tests/research/`：66 项合成测试通过，只读内存 fixture、不调用上游/模型/工具；它不是生产门禁或已集成执行器。后续先设计宿主与执行器的权限/网络隔离，再做本地 mock P1。

### 9.9 用户授权的本机 CLI 认证验证

用户明确同意后，以现有 Codex CLI 认证和模型配置提交一次文本 turn，返回 `MYBOT_ACCOUNT_OK`。此前官方命令状态为 API Key 模式；没有导出或复制密钥，也没有将账号交给 OpenMausBot。

实际证据与限制见 [CODEX_ACCOUNT_SMOKE.md](CODEX_ACCOUNT_SMOKE.md)。这证明所测本机 CLI 路径可用，不证明模型/供应商身份、收费金额、工作台 Provider 兼容或 OpenMausBot 接入。一次授权已使用完；后续离线契约测试、源码阅读和 REA 分析不得自动再次调用模型。

## 10. Pi、Harness 与 HuLa 增补（2026-11-08）

用户要求将 Pi、Harness 和 Gitee `HuLaSpark/HuLa` 纳入考虑。分层与完整入口见 [PI_HARNESS_HULA.md](PI_HARNESS_HULA.md)。

| 对象 | 仓库与固定 HEAD | 已读路径与证据等级 | 初步取舍/缺口 |
| --- | --- | --- | --- |
| Pi Coding Agent（上下文假设） | `earendil-works/pi`，`085c84e98e7f4c950f2be606466fff4f75d8fe7c`；`badlogic/pi-mono` 此时 HEAD 相同 | 根 README/LICENSE；`packages/coding-agent/README.md`、`packages/coding-agent/docs/sdk.md`、`packages/coding-agent/docs/rpc.md`，E1 | Pi 本身是 Harness；SDK/RPC 与会话/资源/工具控制值得对比。默认重试、资源/凭证发现及 settled 语义需专测，未运行 |
| DeepSeek Harness（此前指定对象） | `deepseek-ai/deepseek-harness`，`fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159` | README、SAFETY、`docs/architecture.md` 前 180 行，E1 | 全插件机制、会话事件和 profile 候选；developer preview/未安全审计，不能靠审批或插件做唯一隔离。未运行 |
| HuLa | Gitee/GitHub `HuLaSpark/HuLa`，此时 HEAD 均为 `16871546d8f42252ed8b475540b0f74f1ea44fd6` | README 技术/平台/许可段、根 LICENSE，E1；`src-tauri/Cargo.toml`、`src-tauri/src/lib.rs` 前 130 行，节选 E2 | 多端 IM/桌面壳、Tauri/Rust/Vue/TS 机制参考；README 将 Web 标为暂不支持。没有服务端、消息可靠性、权限或真机验收 |

只做匿名远端身份识别和固定 raw 文本读取；未安装、启动、运行 REA、接账号或模型。根许可观察：Pi MIT；DSH README/SAFETY 声明 MIT；HuLa 根 LICENSE 为 Apache-2.0，全部依赖/第三方资源许可未审计。

修订建议：mybot 不锁定 Codex；先定义可替换 RuntimeAdapter，再对同一无工具/mock 合同比较 Codex/Pi/DSH。每个 Run 只有一个主执行循环。HuLa 位于客户端/消息专项，不当 Agent 内核，不复制 UI，不把其 IM 协议当飞书/微信官方连接器。

分别补充 [REA_PI.md](REA_PI.md)、[REA_DEEPSEEK_HARNESS.md](REA_DEEPSEEK_HARNESS.md)、[REA_HULA.md](REA_HULA.md)。没有相应发布物或运行目标时，工具分解是待执行方法，不是 S1/E3。

## 11. 设计能力与“上游已有”复核（2026-11-07）

日期以本轮环境为准，前文历史日期保留。用户先要求分析多个设计能否形成 Cindy + OpenMausBot/nanoMuse 能力，随后追问“OpenMausBot 能力已经有了吗”。

### 固定来源与本轮阅读

| 仓库 | commit | 本轮复核路径 | 来源类别 |
| --- | --- | --- | --- |
| `makecindy/cindy` | `f89971ffb1eab1af21d73b3826f7a99dd4db5e1c` | `README.zh-CN.md`、`packages/device-link/README.md` | 官方固定源码文档；不视为运行证据 |
| `milind-soni/OpenMausBot` | `1bc4749aa8307d7d6998bf86de4ef6478460dd93` | `README.md`、`docs/phone-web-app.md`、`docs/bot-api.md`、`docs/composio.md`、`docs/mcp-server.md` | 固定仓库 `git show` 与官方文档；非本地集成 |
| `nano-muse/nanoMuse` | `a7b31d0ab6eb9a7db33d30fd234b462713bdd274` | `docs/every-device.md`，结合第 9 节已有同步/Hub 阅读 | 固定文档设计与能力说明，不能将混合 roadmap 当作全平台实测 |

### 发现

1. OpenMausBot 上游已有长期 Bot、会话/Channels、团队工作、手机共享工作区、执行与连接应用机制。mybot 未接入，不等于上游没有；也不意味着所有这些都应重写。
2. `docs/phone-web-app.md` 明确手机 Web 使用同一工作区、会话和配对；服务需在线可达。此 Web 方式不增加离线聊天、推送或原生手机控制，不能把 Web 限制外推为其他原生客户端的全貌。
3. Bot API 的受限线程不是唯一接入路径。`docs/mcp-server.md` 公开查询/创建 Bot 与任务、分页读会话、发工作、等待 job 和中断等控制工具；文档还指向 headless CLI，本轮未继续读该 CLI 文档或实现。
4. MCP 的控制能力与安全边界必须分别评价：不提供审批授权、grant、凭证或电脑生命周期；`send_id` 去重和 `wait_for_conversation` 的 job/state 值是文档合同，尚无本地运行证据。
5. Composio 提供 Gmail/Slack 等连接、多账号选择和 per-bot grants；不等于飞书/微信/钉钉/语雀已经逐项可用或完全自托管。应用事件使用托管服务与自带 key 的范围不同，不能混用。
6. nanoMuse 文档区分文本同步、设备委派和设备本地资料：会话接续并不自动搬运文件、活进程或凭证。Cindy 的公开客户端与设备协议也不能补出未公开服务端。

### 对 mybot 的影响与缺口

- 完整评审见 [DESIGN_CAPABILITY_REVIEW.md](DESIGN_CAPABILITY_REVIEW.md)：Runtime Lab 回到开发诊断定位，V2 保留可复用结构但未获定版认可。
- 优先验证 OpenMausBot 的既有能力复用；Bot/会话/工作控制可先走 MCP 与 HTTP+SSE 的隔离比较，不默认从零自研，也不直接读写上游私有数据库。
- 不同数据对象明确一个权威写入方；mybot 保留任务授权/审计职责，执行能力采用仍待门槛验收。
- 未读完 MCP 的实现/调用链，未核对 npm 产物与 git 文档的全部对应关系，未运行 MCP、会话任务、手机配对、连接器、断线恢复或工具。
- 本轮无新 REA、安装、上游启动、模型调用或账号连接。后续步骤已补入 [REA_OPENMAUSBOT.md](REA_OPENMAUSBOT.md)；clone/固定版本方法沿用 [UPSTREAM_CLONE_AND_IMPLEMENTATION.md](UPSTREAM_CLONE_AND_IMPLEMENTATION.md)。

### 11.1 MCP/会话复用 P1 探针增补

2026-11-08 继续验证后，固定 `openmausbot@0.1.146` 发布包的隔离 MCP/会话探针通过 35 项检查。证据目录为 `tests/research/evidence/omb-mcp-v1/`，REA process-capture Evidence ID 为 `ev_d1b5bc9e9a6dfa5ee1cf5ac96aee5b21df7233659c84607dbe2634c75b8ac35c`。

本次确认的是上游真实服务和发布包 handler 使用合成 ACP，不是 mybot 集成：

- MCP 原生 stdio 入口能初始化并列出工作控制工具；固定包内工具包括 Bot/Task 创建、消息发送、会话读取、等待、模型设置和中断。
- 未配对写入拒绝；一次性 pairing code、session scope、logout/revocation 的边界可观察。
- 同一会话的连续消息、`send_id` 幂等、跨 Bot Task 归属检查、等待超时、取消、失败、新一轮继续和干净重启持久化均通过。
- 无真实模型、外部账号、工具动作或网络出站；mock 计数为 0/0。所有运行结果均标注 `fixture_only`。

应保留的未知与风险：

- HTTP handler 使用研究 bridge 注入，原生 MCP client 的网络调用和 SSE/replay 仍未知。
- 未测多 Agent delegation、实时 approval answer、手机/浏览器配对、真实连接器和崩溃恢复。
- 全流程出现 4 个无标记 ACP prompt：3 次连接检查和 1 次显式失败后的上下文恢复；不能把后者归因于干净重启。它们是本地 mock，不是模型费用证据，但提示真实接入必须区分用户任务重放与内部/探测请求。
- 因此决策仍是“受控适配候选”，不是“已接入底座”。下一步应先做 ExecutionAdapter 的状态/权限映射设计和原生 MCP client 小范围实测，不能跳过审批/费用/恢复门槛。

### 11.2 保存默认模型与隐式请求对照（2026-11-08）

本轮补读固定源码 `scripts/mcp-server.ts` 及发布包 `dist-server/mcp-server.js`、`dist-server/scripts/mcp-server.js`、`server/drivers/acp/{core,custom,host}.js`、`server/{sessions,request-auth,tested-ai,engine-check,index}.js`、`server/routes/config.js`。代表实现与测试文档分开；`server/testing/fake-acp-cli.ts` 和 `server/custom-acp-models.e2e.test.ts` 仅作为上游测试参考，没有执行整套上游测试。

`tested-ai.js` 的普通环境后台检查默认开启，可用 `OMB_AI_CHECKS=0` 禁用（仅源码核对）。`fixed()` 检查已保存模型，存在时不做后台 sweep。`engine-check.js` 通过 `generateText/generateMemoryText` 发送实际检查提示，不能只看健康状态就声称无模型请求。

对固定公开包执行 v2 合成对照：保存默认模型并延长夹具记忆整理等待，**38 项检查通过**，包括启动、模型实例读取和干净重启无额外 ACP prompt。Evidence `ev_71d9d64e20f3121276dd4bfc704956e548138c75e194232c562f2c71aaae7c76`，目录 `tests/research/evidence/omb-mcp-v2-fixed-default/`，报告 hash `b3213bc7774e7bdf60088f1323514b78b4fbba637a436946240999236d62010d`。

边界：v2 全程仍有 8 次 mock prompt，含失败后的内部上下文恢复；6 个不同用户工作标记不等于 6 次调用。不将其写成生产预算门禁，也没有独立运行 `OMB_AI_CHECKS=0`。两轮均保留 REA 未观测网络和进程归属 unknown。完整结果、复现、停止条件见 [OPENMAUSBOT_MCP_REUSE_RESULTS.md](OPENMAUSBOT_MCP_REUSE_RESULTS.md)。

## 12. OpenMuse / Cindy / OpenClaw / HarnessWorks（2026-11-08）

用户要求继续分析并给出逐步实现路线。本轮无业务修改/运行；形成 [实施路线](AGENT_INTEGRATION_ROADMAP.md) 与三份新增独立研究分解。

### 12.1 名称与固定身份

| 名称 | 仓库/commit | 已读路径与范围 | 本地证据 |
| --- | --- | --- | --- |
| OpenMuse | `CopilotKit/openmuse` @ `a4944f4c471d3dc93b8bfc060b5da309b5216ab2`，本轮远端 HEAD 与既有快照相同 | README、LICENSE、`docs/RICH-THREADS.md`；`apps/server/src/engine/worker.ts` 1–185、`packages/backends/src/openbot.ts` 1–195 | E1/E2，未运行 |
| Cindy | `makecindy/cindy` @ `f89971ffb1eab1af21d73b3826f7a99dd4db5e1c`，沿用固定快照 | `README.zh-CN.md` 1–180、`packages/device-link/README.md` 1–180 | E1；本轮不声称新实现审计 |
| OpenClaw（暂定） | `openclaw/openclaw` @ `9b8aa392679f35f75674ba6bb01993ced16f1bd1` | README 前部、LICENSE、`docs/concepts/architecture.md`、`docs/gateway/security/trust-model.md`、`docs/plugins/architecture-internals/channel-surfaces.md`、`docs/channels/feishu.md`；`extensions/feishu/{channel-entry,index}.ts`、`src/channel.ts` 1–145 | E1/E2，未启动 |
| HarnessWorks 候选 A | `harnessworks/harness-starter-kit` @ `62437bec264b2deed83353e8209660d645e86828` | README、LICENSE、`docs/evaluation.md` 1–165、`docs/checklists/external-api-work.md` 1–155 | E1 文档，不执行 adoption/技能 |
| HarnessWorks 候选 B | `jarvisbot19/harnessworks` @ `94fcef5386630056ad5c065c98c2818a7304c3fe` | README；MIT 仅 README 声明，未读根许可 | E1，不安装 |

`openclawe` 暂按 OpenClaw，不认为用户已确认。`harness works` 至少两个候选，用户未给链接；不能与 DeepSeek Harness 互换。用户重复 openmuse 只分析一次，不混成 nanoMuse。其余 Pi/DSH/HuLa 仍以第 10 节既有范围为准，本轮不声称重新验收。

新增仓库只做匿名 shallow/no-checkout clone，位于 `/tmp/mybot-expansion-20261108/`。OpenClaw/HarnessWorks 的 blob 以固定提交 `git show` 按需读取，无依赖、二进制、安装器或上游测试执行。

### 12.2 发现与采用影响

**OpenMuse：** Alpha 的任务、浏览器、文件成果和回执链是机制参考。Rich Threads 所有模式依赖独立 Intelligence 服务；服务不包含在应用 MIT 中，追问队列在 App 而非持久 Inbox。Worker 有 lease/guard/CAS，但不能阻止已发副作用。OpenBot adapter 是默认关闭的扩展点，不能把“兼容 Harness”的宣传理解成任意后端零成本接通。mybot 借鉴 task/artifact/action receipt，不引入第二套会话云、PGlite 与 Worker。

**Cindy：** 文档说明手机是控制端，desktop 可控制/被控；远程受在线、同账号和授权约束，文件仍留原电脑。公开的是客户端与 packages，不含完整服务端。可靠 ACK/重传/背压不是任意动作恰好一次，超时也不等于取消。mybot 先用中心 API 做换屏控制，原生设备执行与 Relay 后置。

**OpenClaw：** 单 Gateway 拥有渠道连接；operator 与 Node 连接同一 WS，但 role/caps/身份不同。文档明确事件不重放、缺口需刷新，不能直接作为 mybot 的持久审计。安全文档的单信任域不是敌对多租户，operator scope/node pairing 不能代替 mybot 项目 ACL。飞书插件拥有消息/文档等能力，但其入口与 channel 实现依赖宿主 SDK/runtime，不能复制目录就独立运行。优先比较官方 SDK 窄适配与可控服务桥，不能默认为一个渠道引入整个 Gateway/Agent。

**HarnessWorks：** A 是 prompt-first 的仓库工程治理，区分 health 与效果，测试/Doctor 分数不证明真实返工下降；B 是文档知识库技能。无论哪一个，都不解决设备连接/任务持久化，不要新增与现有 CONTINUE/ADR/tests 重复的“框架”。只吸收已有缺陷的回归、来源/失败记忆和效果指标；身份确认前不装插件、不运行技能。

### 12.3 缺口和下一步

- OpenClaw 全链路、设备/飞书真实授权、插件可独立抽取程度和安全覆盖未知；OpenMuse Intelligence/浏览器/lease 故障没有运行证据。
- 本轮根许可节选不覆盖全部依赖、商标、第三方服务或分发要求。
- 未运行 REA：这轮是完整源码/文档分析。后续官方产物/隔离场景才按 [OpenMuse](REA_OPENMUSE.md)、[OpenClaw](REA_OPENCLAW.md)、[HarnessWorks](REA_HARNESSWORKS.md) 分解取证。
- 保留已有 OpenMausBot 35/38 项运行证据，不外推到以上项目。
- 近期主线：只读后端适配 + 真实会话 UI → 受控发送/预算 → 同一人多端 → 一个 IM/资料源 → 另授权研发执行 → Rust Node/迁移；不是先把所有候选全跑通。

官方固定源码入口（仅资料，不执行其中安装命令）：

```text
https://github.com/CopilotKit/openmuse/tree/a4944f4c471d3dc93b8bfc060b5da309b5216ab2
https://github.com/makecindy/cindy/tree/f89971ffb1eab1af21d73b3826f7a99dd4db5e1c
https://github.com/openclaw/openclaw/tree/9b8aa392679f35f75674ba6bb01993ced16f1bd1
https://github.com/harnessworks/harness-starter-kit/tree/62437bec264b2deed83353e8209660d645e86828
https://github.com/jarvisbot19/harnessworks/tree/94fcef5386630056ad5c065c98c2818a7304c3fe
```

## 13. 白龙马与工作可视化参考（2026-11-08）

用户新增白龙马官方 `#interface` 链接。目标记录见 [AI_AGENT_WORK.md](AI_AGENT_WORK.md)，不是新增底座选择或接入证据。

| 来源 | 本轮读取 | 来源强度/缺口 |
| --- | --- | --- |
| `bailongma.top` | 官方页面 interface/heartbeat 描述、`site-assets/bailongma-agent-interface.png` | 公开产品展示；未定位/审阅仓库、commit、许可或发布包，不能推断可 fork/私有化 |
| `cindy.app` | 官方桌面/手机 showcase 与功能描述；Cindy 固定 README 复核 | 官网图为产品展示，不是 mybot 实测；`cindy.cn` 抓取超时，不能作为本轮成功阅读 |
| CopilotKit/openmuse | 第 12 节相同 commit 的 README | 同一固定文档，非新增部署 |
| Langfuse | 官方 observability overview 与官方 trace 图 | 文档/图片，未 clone、未读 runtime、未部署、未上传任何追踪数据 |

判断：Cindy 优先参考日常持续工作和多端原则；白龙马局部参考活动可见性；OpenMuse 参考成果/接管；Langfuse 参考次级调用下钻。保持原创视觉，不复制品牌、角色、CSS 或整套布局。

白龙马官网的后台唤醒/持续行动描述涉及执行策略，不是单纯视觉。mybot 不据此默认开启模型请求、采集隐藏思维或展示无来源的“正在思考”。Langfuse 仅作公开追踪表达参考，不新增遥测依赖。上述均为评估建议，未获新视觉定版认可。

## 14. SDK / 工作流 / 自动化示例 / Multi-harness（2026-11-08）

用户新增四链接；分析及取舍补入 [AI_AGENT_WORK.md](AI_AGENT_WORK.md) 第 7 节。

| 对象 | 身份/本轮已读 | 证据边界 |
| --- | --- | --- |
| OpenAI Agents SDK | `openai/openai-agents-python` 远端 HEAD `27c75c5f9c5fd957d28c04fb7e9eeacaad4630a9`；官方 zh 首页、visualization、tracing，官方 orchestration 指南 | E1 在线文档；未读该 commit 实现、未安装/运行 |
| AIFlowy | 官方文档引用 `gitee.com/aiflowy/aiflowy`，远端 HEAD `b0868a356d96b28ce5d9fc5878a01cb17f28e921`；what-is、specification、workflow introduction/quickstart | E1；未读固定提交/许可，不认定各版本都开源 |
| 白龙马 WebP | 用户指定 `site-assets/bailongma-daily-hotspot-monitor.webp`，已下载/实际看图 | 公开图片；主要是心跳调整、语音和工具日志，没有足够热点成果/投递验收证据 |
| Cindy multi-harness | 中国站独立抓取超时；读取国际站相关描述与既有固定 README | 不伪称中国站成功；不同 Harness 的状态仍需交接/重建，不是活进程迁移 |

SDK 文档的 Agent/Runner、tool/handoff/session 是成熟机制候选；可用来评估以后替换自有固定编排，但不默认再套在 OpenMausBot 外。Graphviz 配置图与实际执行关系/调用 trace 分开，tracing 默认开启，接入前需要审核/禁用策略和敏感数据范围。

AIFlowy 官方介绍/技术文档说明它是一套应用平台，支持知识库、工作流、Chatbot、工具等；工作流文档包含节点配置/测试/版本等概念。mybot 借鉴流程定义与运行分离，首期不引入 Java 平台或通用可视化编辑器，根许可/商业版边界未审前不声称可全部复用。

图片 SHA-256 `f51c663edf4904f28a178a21c2064779e1a49ff2dbfca8b6edaf4f5fe4ae533f`。仅 `/tmp` 研究，不进入产品素材。若做周期任务，触发/授权/调用预算/运行回执另建明确合同，不因“心跳”文案获得执行权限。

本轮无新 REA/安装/服务/模型/API 调用。SDK 与 AIFlowy 分别有独立 [REA SDK](REA_OPENAI_AGENTS_SDK.md)、[REA AIFlowy](REA_AIFLOWY.md)；远端 HEAD 与在线文档是否完全同版仍未知。

## 15. Headscale 与 gottaBoy/OpenMausBot（2026-11-08）

用户明确给出两个仓库链接。

| 对象 | 固定身份/观察 | 本轮证据 |
| --- | --- | --- |
| Headscale | `juanfont/headscale` 远端 HEAD `48416ce0894ef7bef0ef9c064609b4aa76a0d9b6` | Git 身份、官方 README/stable 首页、客户端/DERP 资料；E1，未读固定源码实现 |
| 用户指定 fork | `gottaBoy/OpenMausBot` 远端 HEAD `1bc4749aa8307d7d6998bf86de4ef6478460dd93` | GitHub API `fork=true`，parent/source 均为 `milind-soni/OpenMausBot`；与既有固定源码提交完全相同 |
| 上游当前观察值 | `milind-soni/OpenMausBot` HEAD `86fd0ee19c0deae6c4f7304a2e5bfe047b9065b7` | 仅 HEAD 核对，未读新提交变化/未计算 ahead/behind，不自动采用 |

Headscale 是自托管 Tailscale 控制服务器候选，官方目标偏单 tailnet/个人或小组织。控制面不是应用事实源、应用会话或数据同步；客户端直连与 DERP 中继、身份、DNS/TLS 都需独立核对。应用仍需要自己的授权，设备入网不能自动获得目录/工具/项目权限。当前不安装、不注册 tailnet、不改路由/DNS/防火墙、不开放服务。详见 [REA_HEADSCALE.md](REA_HEADSCALE.md)。

fork 的同 commit 允许沿用历史 E1/E2 源码观察，但不是“所有分支/未来版本相同”。原 npm `openmausbot@0.1.146` 的 REA/P0/P1 证据继续独立，不能推断它就是该 fork 构建；需要以后 pin 源码构建与产物对照。

决策建议：用户指定 fork 作为后续固定研究入口；是否采用后端仍受权限、预算、原生接口与故障合同约束。Headscale 只在多端私网阶段按需采用，不阻塞现有 Web 的只读会话增量。

## 15.2 T3 Code（2026-11-08）

用户指定 `https://t3.codes/` 与 `gottaBoy/t3code`。固定 fork HEAD 为 `09a54f01bc0ae83865347a965ced50f8c8ec2953`，parent/source 为 `pingdotgg/t3code`，GitHub metadata 标记 MIT fork；README 将其定义为 agent harness control surface，控制 Codex、Claude、Cursor、OpenCode 等本机 CLI/订阅，并提供 Web/手机/Electron 入口。

本轮只读 README、LICENSE、官方官网和元数据；未安装、未运行 CLI、未读取 credential store、未做 REA。定位是控制面/本地 Harness 参考，不是 mybot 项目事实源。

对 mybot 的重要影响：显式环境变量配置可以发现并作为默认模型候选；CLI Harness 只能显示“可执行文件存在/认证未验证”，用户显式启用后才复用 CLI 登录态；不导出 Codex API key、OAuth 或 keyring。远程/手机控制后置到 DeviceSession/Command；Headscale/Cindy 不替代项目 ACL/审计。后续固定发布物再做 REA，重点验证 CLI 子进程权限、工作目录、环境传播、撤销、停止和日志脱敏。

完整分解见 [REA_T3CODE.md](REA_T3CODE.md)。本轮无安装、模型、账号或网络配置改动。

## 15.1 swarm-cursors 补充

`gottaBoy/swarm-cursors` fork 的 HEAD 为 `3d49e0ac96172eb6af7ae8229b2152121bed2092`，parent/source 为 `DhvanilPatel/swarm-cursors`。README 将其定位为 Chrome MV3 页面重建扩展：DOM blueprint、任务依赖、多游标、回放和 Go live。

它能启发 Agent Work 的阶段依赖和事件回放表达，但 README 明确暂无许可证，且本轮未运行扩展、未取得授权发布包。结论：仅机制/视觉参考，不能复制代码、动画、声音或素材，不进入 RuntimeAdapter。详见 [REA_SWARM_CURSORS.md](REA_SWARM_CURSORS.md)。

## 16. Melaya Agentic Framework（2026-11-08）

用户提供官方页面 `https://melaya.org/zh/product/agentic-framework`。本轮读取产品页与其链接的 `melaya-labs/melaya` GitHub README；未安装 SDK、连接远程 MCP、创建账号、运行模型或设备。

产品页将构建器描述为可视化步骤/工具/子智能体/连边，支持按步骤模型、工具作用域、记忆、触发、HITL、运行回放、监控、成本和审计。citeturn966253search0

对 mybot 的取舍：

- 采用产品语义：Pipeline/Step/Tool Scope/HITL/Replay/Evaluation。
- 先把现有固定“planning→bounded research→synthesis”投影为可核查运行图，不立即做任意拖拽工作流编辑器。
- 不将 Melaya 的工具数量、运行数、成功率或远程 MCP 当作 mybot 证据；不引入其专有平台/设备/浏览器服务。
- Melaya 的治理方向与已有 mybot 边界一致，但不能代替 mybot 的项目 ACL、权限 ceiling、预算、结果未知和人工接受事实轴。

独立分解见 [REA_MELAYA.md](REA_MELAYA.md)。本轮 REA 未运行：没有固定可供逆向的官方 SDK 发布物/运行目标，先以产品页和仓库 README 为 E1 资料。

## 17. Codex App Server 本机协议复核（2026-11-08）

- 项目身份：Codex CLI，来源项目 `openai/codex`；本机 `codex --version` 实际输出 `codex-cli 0.154.0`。该安装物对应的源码 commit 未认证，不虚填 commit。
- 已读：CLI help、本机 CLI 生成的 `/tmp/codex-app-schema/v2/{ThreadStartParams,TurnStartParams,TurnCompletedNotification,ItemCompletedNotification}.json`，以及本仓库 `tests/research/codex_text_smoke.py`。临时 schema 不作为可持久检索的源码 clone；复现可重新执行 `codex app-server generate-json-schema --experimental --out <新临时目录>`，不发模型 turn。
- 发现：完成通知的 ID 是 `params.turn.id`；读取通知与 RPC 响应必须关联；只读/never 不是无工具保证；单 thread 跨角色复用会扩大隐式上下文。
- 决策：本轮可选 app-server 草稿撤回生产入口。先实施已验收的 exec 调度、清理与诊断，再按 [CODEX_RELIABILITY_PLAN.md](CODEX_RELIABILITY_PLAN.md) 冻结会话与权限合同。
- 缺口：未取得源码 commit 对照、未验证长驻真实 Run、跨版本兼容和能力 ceiling。本轮无新真实模型调用、凭证导出或 REA capture，不能把简化 fake server 当成上游接入验收。
