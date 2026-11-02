# 公开源码链路对照：第一轮

查阅日期：2026-11-02。

状态：完成本轮有边界的静态阅读，不是完整源码审计或部署验收。此文是 [开源调研记录](OPEN_SOURCE_RESEARCH.md) 的深入补充。

## 1. 研究方法与限制

使用上一轮固定的四个 commit，不将默认分支变化混入结论：

| 代号 | 仓库 | commit |
| --- | --- | --- |
| OH-W | OpenHands/OpenHands | `cdd6a69248ce8f99b41ff4c47bdf68dee95024e5` |
| OH-S | OpenHands/software-agent-sdk | `98849457621881ae2414719b82b8bc1cf535b4ab` |
| OB | CopilotKit/OpenBot | `c396a5f68c817043846f1ca3c2b42061ee73ceb5` |
| OM | CopilotKit/openmuse | `a4944f4c471d3dc93b8bfc060b5da309b5216ab2` |

比较相同产品问题：用户给现有仓库提一个修改要求后，任务如何产生、委派、执行、留下证据、接受干预并展示结果。

**这不是在三个项目中实际跑过同一个任务。** OpenBot/OpenMuse 阅读的部分路径是通用任务、计算机或办公操作，不能当作已验证的研发交付实现。没有安装依赖、运行测试、部署服务、接入账户或发起模型请求。

代码读取使用官方仓库的固定 commit；以下行号均属于该快照。节选阅读会写明范围，目录中存在但未阅读的模块不算证据。

## 2. 关键结论

1. 优先评估 OpenHands SDK 的研发执行能力，不直接套用整个产品。
2. 委派是有上下文、权限与预算的执行动作，不只是把一句话转发给另一个模型。
3. 任务依赖、Agent 父子关系、调用链必须分开表达。
4. 事件、指标、审计和成果各自承担不同职责，不能用一种日志代替全部。
5. 排队、暂停请求、实际中断和外部动作完成是不同事实。
6. 父级指标可能包含子级汇总，不能把两者直接相加。
7. 模型宣称完成不等于测试、评审或用户验收通过。
8. 采用统一研发产品域加执行适配器，不拼接三套任务系统。

这些是基于本次阅读形成的取舍建议，不是用户已批准的选型。

## 3. OpenHands：研发执行候选

### 阅读路径

```text
conversation_router.start_conversation
  -> ConversationService / StoredConversation
  -> EventService / Conversation
  -> Agent / DelegateExecutor / Tools
  -> conversation events / stats
  -> event-service API / 前端事件存储
```

此图表达阅读到的模块关系，不保证覆盖所有 Backend、ACP 或执行分支。

| 证据 | 已读文件与范围 | 观察 |
| --- | --- | --- |
| H1 | OH-S `openhands-agent-server/openhands/agent_server/conversation_service.py`，1773-1823 | 读取暂停、中断、恢复入口；`resume_conversation` 此处是加载服务，不可仅凭名称理解为开始继续执行 |
| H2 | OH-S `openhands-sdk/openhands/sdk/conversation/impl/local_conversation.py`，2807-2865 | `pause` 在步骤间生效；`interrupt` 通过取消令牌与异步任务取消请求中断，不能据此证明所有外部工具都已停止 |
| H3 | OH-S `openhands-tools/openhands/tools/delegate/impl.py`，112-255、315-390 | 读取子会话创建、确认处理、并行与指标归集 |
| H4 | OH-S `openhands-sdk/openhands/sdk/conversation/conversation_stats.py`，全文件 | 按 usage ID 注册指标，提供聚合；存在恢复与快照序列化逻辑 |
| H5 | OH-W `src/api/event-service/event-service.api.ts`，全文件 | 查看前端事件读取 API，而不是把 UI 仅理解为 Token 流 |
| H6 | OH-W `src/hooks/use-handle-ws-events.ts`，全文件 | 查看事件错误的处理分支，不扩大解释为完整重连机制已验证 |

### 委派需要注意的实际语义

在 H3 中：

- 子模型从父模型配置复制后交由 Agent factory 构造，不能据此声称已经实现任务级最优模型路由。
- 子会话默认接收父工作目录；建立子 Agent 不等于建立隔离 worktree。
- 子会话可以有自己的确认策略，未指定时继承父策略。
- `_run_until_finished` 在没有确认处理回调时继续运行等待确认的子会话；集成时必须验证完整调用者如何配置回调，不能把“有确认策略”当作已完成工作台人工审批。
- 子 Agent 累积指标写回父统计时使用替换，而不是不断合并。

这些是集成需要适配的边界，不是对全部配置的安全漏洞定性。

### 对我们的设计影响

- 执行器暴露 `pause`、`interrupt`、`load/resume` 的真实能力，UI 不统一伪装成立即停止。
- 显示每个子 Agent 的工作区引用；没有隔离能力就不允许多写入者。
- 单独记录委派授权与工具动作授权。
- 保存原始计量语义，声明累计值还是本次增量；汇总不重复计算。
- Provider 和模型分工由工作台明确配置与记录，不从角色名推断。

### 尚未证明

工作区的内核/网络隔离、跨进程中断后的工具清理、所有 Backend 的重连与恢复、服务器委派与 SDK 本地委派的映射、完整模型调用日志和工作台审计覆盖。

## 4. OpenBot：委派与策略边界

### 阅读路径

```text
handoffTool -> 授权/隐私检查 -> desk.send -> work queue
           -> handoff runner -> 收件 Bot -> 结果回送

计算机动作 -> gateway.govern -> policy + audit + approval -> 实际执行
```

`desk.send` 的全部实现、实际 Bot 运行器和全局取消链路未在本轮完整审计；箭头不是端到端验收证明。

| 证据 | 已读文件与范围 | 观察 |
| --- | --- | --- |
| B1 | OB `server/src/agents/handoff-tool.ts`，1-258 | 委派输入区分任务、约束和期望；工具可见性受深度、次数和授权约束，委派也可经过审批 |
| B2 | OB `server/src/work/queue.ts`，源码阅读 | 持久工作项、claim/lease/renew 等队列语义，不等于外部副作用 exactly-once |
| B3 | OB `server/src/work/loop.ts`，源码阅读 | 调度循环与工作处理分离；本轮未验证所有处理器的故障恢复 |
| B4 | OB `server/src/agents/handoff-runner.ts`，170-365 | 结果/失败回送、租约续期及重复尝试审计；代码明确记录前次尝试可能已执行 |
| B5 | OB `server/src/computer/gateway.ts`，627-825 | `govern` 组合策略决策、审计、审批与实际动作；允许决策和执行失败分开记录 |
| B6 | OB `server/src/computer/policy.ts`，类型、346-391 的求值逻辑 | 读取拒绝/允许优先级；有 enforce/dry-run 区别，不能只见规则便认为运行中已强制拦截 |
| B7 | OB `server/src/audit.ts`，事件定义与导出函数定位 | 定位递归脱敏与记录入口，未完成字段覆盖或导出权限审计 |
| B8 | OB `app/src/components/approvals/inline-approval.tsx`，全文件 | 同一个审批收件数据可在任务附近展示；这是数据关联观察，不采用其布局或按钮设计 |

### 对我们的设计影响

- 委派包至少含目标、输入引用、约束、输出要求和权限；继承的权限不能高于实际授权。
- 排队和执行需要分别显示；租约过期不自动等于任务从未执行。
- 审计区分“允许执行”“开始执行”“实际结果”，避免允许被误读为成功。
- 审批应关联具体调用，在工作记录与待办中引用同一对象，而不是创建两份批准。
- 有 enforce 与 dry-run 的适配器需公开模式；观察模式不能显示为已经阻止动作。

### 尚未证明

整个产品的取消传播、队列配置与重试上限、完整模型调用归因、审计读取权限、保留期和不可篡改性，以及策略在每个工具路径中是否都得到执行。

## 5. OpenMuse：可见任务与受控恢复

### 阅读路径

```text
createTask -> task record -> AgentWorker claim/lease
           -> service.execute -> executeModelTask 或专项处理
           -> checkpoint / event / action proposal / artifact
           -> task detail -> 用户干预
```

| 证据 | 已读文件与范围 | 观察 |
| --- | --- | --- |
| M1 | OM `apps/server/src/engine/service.ts`，170-335、800-906 | 创建任务、查询关联事件/成果、控制动作与执行分流；普通任务初始计划来自类型模板，不等于模型生成的真实 DAG |
| M2 | OM `apps/server/src/engine/worker.ts`，源码阅读 | claim、lease、心跳、guard、CAS checkpoint 与完成处理分开，防止失去所有权的执行者继续覆盖状态 |
| M3 | OM `apps/server/src/engine/model.ts`，源码阅读 | 真实模型路径和工具注册；未配置模型时等待用户，工具允许输出、等待输入或提交待审动作 |
| M4 | OM `apps/server/src/actions.ts`，35-218 | 审批绑定内容、连接和目标版本，并区分结果未知；读取到的示例主要是邮件/日历，不应直接当作代码发布门禁 |
| M5 | OM `apps/mobile/src/agent-ui.tsx`，268-320、400-616 的相关逻辑 | 任务详情关联事件、成果、文件和浏览器；控件请求控制操作，不证明所有外部动作已同步结束 |

### 对我们的设计影响

- 只把真实执行事件映射为进度；模板步骤或推理计划显示为“计划”，不是已经发生。
- Agent `finish` 和所有计划步骤设为完成，不足以证明研发质量通过，工作台另设验证与验收。
- 租约/CAS 可以防止部分旧状态写入，但不能撤回已发生的外部动作。
- 审批后执行也可能结果未知；后续应核查，不直接重新提交。
- 成果、调用、审批都应能从任务定位，不能仅靠全局消息列表查找。

### 尚未证明

完整多模型路由、Agent DAG、LLM Token/成本追踪、研发仓库安全写入、外部动作的原子取消、OpenBot Backend 适配的全部行为。`packages/backends/src/openbot.ts` 仍未在本轮深入阅读。

## 6. 同一产品问题的对照结论

| 问题 | OpenHands 路径 | OpenBot 路径 | OpenMuse 路径 | 我们应定义什么 |
| --- | --- | --- | --- | --- |
| 工作单元 | 会话与执行 | Bot、handoff、工作项 | task 与阶段状态 | 项目下的 Task / Run |
| 分工 | 子会话与并行工具 | 受授权的 Bot 委派 | 本轮路径未证明通用多 Agent DAG | 步骤依赖、委派与模型绑定分别记录 |
| 安全 | 确认策略及执行层边界需适配 | Gateway 策略/审批/审计 | 动作提案与版本检查 | 工作台授权契约，执行器不得静默降级 |
| 恢复 | 会话加载、暂停、中断有区别 | 任务租约与重复尝试可见 | guard/CAS 与未知动作状态 | 检查点 + 副作用核查 |
| 分析 | usage ID 与父子统计 | 委派尝试和动作审计 | 任务事件与成果关联 | 调用明细、统一归因、缺失标记 |
| 质量 | Agent 输出不是独立验收 | 交接结果不是研发测试 | finish 不等于质量通过 | 真实测试证据与人工验收 |

## 7. 初步选型顺序，不是组件清单

1. 定义自己的研发项目、Task/Run、成果、授权、事件和计量契约。
2. 优先做一个 OpenHands SDK/Agent Server 的兼容性 POC。
3. 若失败，依据契约评估已有本地执行器；不是先接所有运行时。
4. 借鉴 OpenBot 的能力边界和 OpenMuse 的结果可见性原则，不复制 UI。
5. 缺失字段明确为未知，不通过模型描述补造追踪或质量数据。

首版最小范围见 [MVP_SCOPE.md](MVP_SCOPE.md)，原创线框见 [LOW_FIDELITY_V1.md](LOW_FIDELITY_V1.md)。

## 8. 证据地址与后续核验

上述每个文件的固定地址为：对应基地址加文件路径，再使用所列行号定位。

```text
OH-W: https://raw.githubusercontent.com/OpenHands/OpenHands/cdd6a69248ce8f99b41ff4c47bdf68dee95024e5/
OH-S: https://raw.githubusercontent.com/OpenHands/software-agent-sdk/98849457621881ae2414719b82b8bc1cf535b4ab/
OB:   https://raw.githubusercontent.com/CopilotKit/OpenBot/c396a5f68c817043846f1ca3c2b42061ee73ceb5/
OM:   https://raw.githubusercontent.com/CopilotKit/openmuse/a4944f4c471d3dc93b8bfc060b5da309b5216ab2/
```

接下来不继续无限扩展静态阅读。先评审产品范围和线框，再在获准的技术 POC 中用暂停、崩溃、重试、部分写入等固定样例验证这些静态推断。许可证、分发限制与部署成本必须在选型前单独确认。
