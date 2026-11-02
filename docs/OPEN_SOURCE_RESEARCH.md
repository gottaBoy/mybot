# OpenHands / OpenBot / OpenMuse 调研记录

查阅日期：2026-11-01；2026-11-02 增补第一轮链路对照。

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
