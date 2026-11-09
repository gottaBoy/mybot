# ADR-0005：模块化单体、战术 DDD 与双语边界

- 日期：2026-11-08
- 状态：建议采纳，分阶段实施
- 范围：mybot 的本地 Superagent Harness、AI Agent Work 工作台、多端与连接器扩展

## 背景

mybot 目前是 FastAPI + SQLite + 单后台 Worker 的单用户研发试点，已有项目、任务、Run、Agent、模型调用、成果、事件和人工审查。后续会增加 OpenMausBot/其他 Harness 适配、多端控制、IM/文档/邮箱连接器和中英文界面。

如果继续把所有逻辑放进 `app.py`、`engine.py`、`store.py`，新增 Harness、设备和渠道会互相污染事实源。直接上微服务、事件溯源或完整企业 DDD 又会扩大当前阶段的复杂度。

## 决策

采用：

**模块化单体 + 战术 DDD + 六边形架构（Ports and Adapters）+ 显式状态机。**

暂不采用：

- 微服务、服务网格、跨服务事务。
- 独立 CQRS 读写数据库。
- 全量事件溯源替换当前 SQLite。
- 通用“万能 Agent/Tool/Repository”抽象。
- 为了 DDD 重写现有前端或一次性迁移 Rust。

DDD 在这里是边界和不变量的工具，不是目录数量竞赛。每个模块可以继续在一个进程和一个 SQLite 数据库中运行。

## 领域边界

### 1. Work Domain：工作与成果

核心对象：

- `Project`
- `Task`
- `WorkDefinition` / `WorkDefinitionVersion`
- `Run`
- `Stage`
- `Artifact`
- `ReviewDecision`

规则：

- 旧 Run 使用创建时的定义和上下文快照。
- 成果版本、验证状态和人工接受是不同事实。
- `Run` 只允许一个执行权威。

当前映射：`workbench/store.py` 的 projects/tasks/runs/artifacts，逐步从 SQL 行模型收敛为领域命令和状态转换。

### 2. Agent Execution Domain：智能体与 Harness

核心对象：

- `AgentProfile`
- `AgentAssignment`
- `HarnessBinding`
- `ModelBinding`
- `Call`
- `ToolRequest`
- `Approval`

规则：

- Agent 角色不等于模型；模型不自动获得权限。
- 一个 Run 只能有一个主 Harness。
- Harness 只能通过宿主声明的能力和预算执行。
- `settled`、完成、测试通过和人工接受不能合并。

当前实现：`LocalSuperagentHarness` 已抽出固定的 planning → bounded research → synthesis 编排；未来 OpenMausBot、OpenAI Agents SDK、Pi、DSH 都实现同一 Harness Port，不同时控制一个 Run。

### 3. Conversation/Backend Domain：持续会话与外部后端

核心对象：

- `BackendConnection`
- `ConversationRef`
- `MessageRef`
- `SyncCursor`

规则：

- 外部 Bot/Thread 的原始会话由被采用后端拥有；mybot 保存稳定引用、游标和安全投影。
- mybot 的项目授权、发送确认、Run 预算和审计仍由 mybot 拥有。
- 读和发是不同能力；撤销连接后缓存/任务不能继续使用。

第一候选：用户指定的 `gottaBoy/OpenMausBot` 固定提交；此前 35/38 项 npm 产物研究证据不等于 fork 源码构建验收。

### 4. Integration Domain：渠道、资料与动作

核心对象：

- `Connection`
- `ChannelBinding`
- `Resource`
- `Action`
- `Trigger`
- `InboxItem`
- `OutboxItem`
- `OperationReceipt`

规则：

- 飞书、钉钉、微信、语雀、邮箱分别声明 scope。
- 外部消息默认是资料，不是系统指令。
- 读、草稿、写入、发信和 GUI 操作分别审批。
- 事件去重不等于跨系统 exactly-once；未知结果必须回执查询。

OpenClaw/QwenPaw 只提供机制参考，不能把插件目录复制成独立连接器。

### 5. Device Domain：多端控制与执行节点

核心对象：

- `Device`
- `DeviceSession`
- `Presence`
- `Command`
- `CommandReceipt`
- `ExecutionLease`

规则：

- 控制端切换、内容同步、执行迁移、人工接管是四种不同能力。
- Headscale 只解决可选私网网络控制，不授予项目或工具权限。
- Cindy 的设备协议可参考；不复制官方云或把在线点当作执行健康。

### 6. Policy/Identity Domain：身份与能力上限

核心对象：

- `Principal`
- `Membership`
- `CapabilityGrant`
- `Approval`
- `Scope`

规则：

- 宿主 capability ceiling 高于任何模型、Prompt、Harness 默认值。
- 保存配置、建立连接、连接测试、真实动作分开记录。
- 共享访问开启前必须有设备/用户/项目绑定；当前共享令牌不等于团队身份。

## 设计模式

### 当前必须使用

- **Aggregate Root：** `Run`、`Task`、`BackendConnection`、`DeviceSession` 分别维护自己的不变量；不做一个全局 Agent 聚合。
- **Value Object：** ID、`ContextHash`、`Locale`、`CapabilityScope`、`Cursor`、`CommandId`。
- **Application Service / Command Handler：** `CreateRun`、`ControlRun`、`ReviewArtifact`、`ReadConversation`；路由只做验证和调用。
- **State Machine：** Run、Stage、Agent、Call、Connection、DeviceSession 的状态转换集中定义。
- **Ports and Adapters：** `HarnessPort`、`ModelPort`、`ConversationBackendPort`、`ChannelPort`、`DeviceTransportPort`。
- **Strategy：** Harness/模型/连接器可替换；每个 Run 在创建时固定选择。
- **Anti-Corruption Layer：** OpenMausBot、OpenClaw、OpenMuse 的字段和状态先映射到 mybot 合同，不直接污染领域对象。
- **Idempotency：** Run `request_id`、外部命令 ID、消息/事件供应商 ID。
- **Append-only domain events：** 继续使用当前 events 表作为审计基础；事件载荷保存来源 ID、版本和未知状态。

### 后置使用

- **Outbox/Inbox：** 第一个真实 IM/邮箱连接器前实现。
- **Repository 接口：** 当领域逻辑不再直接依赖 SQLite 后，再为关键聚合引入，不为每张表机械创建。
- **Unit of Work：** 当前 `Store.transaction()` 已是本地实现；多模块命令需要跨聚合原子更新时再显式封装。

### 明确不做

- 不把自然语言 Prompt 当 Policy。
- 不用 Event Sourcing 替换已有事实表。
- 不用继承层级表达所有 Agent 类型；以能力声明和组合为主。
- 不把 UI 组件当领域对象。

## 中英文方案

### 领域层

- 数据库存储、事件和 API 使用稳定英文 code/ID：`run.succeeded`、`waiting_approval`、`agent.assigned`。
- 不在数据库保存已经翻译好的状态句子。
- 领域错误使用稳定错误码与参数，例如 `context_changed`、`provider_timeout_outcome_unknown`。

### 接口层

- 支持 `zh-CN`、`en-US`，默认使用浏览器语言后回退 `zh-CN`。
- API 返回 code、参数和必要的安全 detail；显示文字由前端 locale 资源生成。
- Provider/上游原文保留原始语言，同时显示经过安全处理的本地化摘要。

### 前端层

建议新增：

```text
web/i18n/zh-CN.json
web/i18n/en-US.json
web/i18n/index.js
```

- 所有按钮、状态、错误、表格列和空状态使用 message key。
- 用户项目名、任务名、Agent 名称和模型名不翻译。
- 语言切换不改变 Run/事件/审计事实。
- 先实现核心工作台和 Agent Work 页面双语，再扩展设置、连接器和移动壳。

### 文档层

- ADR、协议、错误码以英文标识为准，中文解释为主。
- 面向用户的指南提供中英文入口，不复制两套事实；引用稳定 code。

## 目录演进

当前不做一次性大搬迁。后续模块边界稳定后，目标结构为：

```text
workbench/
  domain/
    work/
    execution/
    conversation/
    integration/
    device/
    policy/
  application/
    commands/
    queries/
  ports/
  adapters/
    providers/
    harnesses/
    backends/
    channels/
    devices/
  infrastructure/
    sqlite/
    events/
    config/
  app.py
  engine.py          # 迁移期间的兼容入口
  harness.py        # 迁移期间的本地 Harness 入口
```

迁移顺序：

1. 保留 `Store`，先抽状态机和 `LocalSuperagentHarness`。
2. 抽 `HarnessPort` 与 `ModelPort`，以 FakeProvider 做契约测试。
3. 增加 `BackendConnection/ConversationRef` 只读适配。
4. 连接器前实现 Inbox/Outbox/Receipt。
5. 多端前实现 Device/Command/Presence。

## 完成工作项后的进度记录

每个工作项完成后必须在同一提交/工作阶段记录：

```text
工作项：
日期：
领域/模块：
实现：
验证命令：
结果：
未完成/unknown：
下一步：
```

记录位置：

- `docs/PROGRESS_LOG.md`：按时间追加的交付记录。
- `CONTINUE.md`：只保留当前阶段、最新证据和下一步，不复制全部日志。
- `docs/OPEN_SOURCE_RESEARCH.md`：上游来源、commit、路径、Evidence 和 unknown。
- 代码/测试事件：写入当前 Run 的 events，不把 UI 动画当进度。

## 本 ADR 的验收

- 当前 Harness 抽取后 Python 回归保持通过。
- 领域层不读取环境凭证，不自动调用模型。
- 后续新增 Harness/连接器只依赖 Port/ACL，不直接修改所有 UI/Store。
- 中英文状态 code 稳定，切换语言不改变事实。
- 每个完成工作项有可复现命令和进度记录。
