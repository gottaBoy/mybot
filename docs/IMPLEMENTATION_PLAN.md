# mybot AI Agent Work 分步骤实现计划

日期：2026-11-08。状态：当前执行路线。每一阶段完成后追加到 [PROGRESS_LOG.md](PROGRESS_LOG.md)，不把设计计划写成已实现能力。

## 0. 总目标

构建一个面向研发团队的 **AI Agent Work 可视化工作台**：

```text
用户目标
  -> 可版本化 Workflow
  -> Superagent / Subagent 分工
  -> 可替换 Harness / Model
  -> 工具/连接器/设备执行
  -> 事件、调用、预算、审批、成果
  -> 人工审查与多端接续
```

核心原则：

- mybot 是项目授权、Run、预算、审计、成果和人工决定的事实源。
- 一个 Run 只有一个主执行权威。
- 外部 Harness/Backend/Channel/Device 都通过 Port/Adapter 接入。
- 只显示可核查的运行事实，不采集隐藏思维链，不用动画补造事实。
- 中英文、设备、多 Harness 和连接器都不能绕过权限 ceiling。

## 1. 当前状态

### 已完成

- FastAPI + SQLite + 单 Worker 的只读研发闭环。
- Project/Task/Run/Agent/Call/Artifact/Event 持久化。
- 本地 `LocalSuperagentHarness`：
  - Planning
  - Bounded Research
  - Synthesis
- Agent Work 阶段图、Run/Agent/Call/Artifact 可视化。
- Codex CLI Adapter：
  - 显式启用 `codex_cli` 配置。
  - `codex exec --json --ephemeral --sandbox read-only`。
  - 不读取/复制 Codex credential store。
  - 取消/超时子进程回收。
- P0 隐式上下文隔离：
  - 临时空 cwd，不进入用户仓库。
  - 忽略用户 config/rules。
  - 禁止项目文档自动加载、web search 和 shell 环境继承。
- 本地 Harness binary discovery。
- 工作区默认模型持久化设置。
- DDD/模块化单体决策 ADR-0005。
- 中英文 code/key 方案已确定，完整 i18n 尚未实现。

### 已验证

- Python 回归：181 项通过。
- 浏览器：5 个视口、11 条交互通过。
- 真实 Codex 已有一次关联重试完整完成；仍有历史超时和未知用量，新增隔离参数尚未做真实回归。
- OpenMausBot 已完成固定 npm 包 + 合成 ACP 的 35/38 项隔离研究，但没有接入 mybot。

## 2. 分阶段路线

### Phase 1：本地 Agent Work 基线

状态：已完成。

交付：

- LocalSuperagentHarness。
- Planning/Research/Synthesis 阶段图。
- Agent 分工、调用统计、成果和事实边界。
- 本地 Run 取消/暂停/恢复语义。

验收：

- FakeProvider 闭环。
- 刷新后 Run/Agent/Artifact 仍一致。
- 移动尺寸不溢出。
- 没有外部请求和隐藏样例数据。

### Phase 2：Harness 与模型选择

状态：部分完成。

交付：

- `HarnessPort`：

```text
capabilities()
start(run)
stream_events()
pause()
cancel()
resume()
close()
```

- `ModelPort`：

```text
describe()
complete()
usage()
cancel()
```

- Chat Completions、Codex CLI、未来 Pi/DSH 统一为适配器。
- 本地 CLI 只显示发现/未验证；用户显式启用才可运行。
- 默认模型保存到 Workspace Settings。

验收：

- Adapter 不读取其他项目凭证。
- Run 创建时固定 Harness/Model binding。
- 重复发送不产生第二个调用。
- 取消/超时回收子进程。
- 缺少计量显示未知。

停止条件：

- CLI 无法稳定返回、无法取消或权限无法限制，停在 Mock/只读，不接真实 Run。

当前 Codex 优化：

- 进程组级取消/超时回收。
- Codex 研究任务单通道。
- 失败 Run 最多两次失败/中断重试，之后必须新建 Run 或切换 Adapter。
- `WORKBENCH_CODEX_TIMEOUT_SECONDS` 显式控制 10–300 秒超时。

### Phase 3：OpenMausBot 会话后端

状态：合同骨架已完成，固定 fork 适配器未完成。

已完成：

- `BackendConnection` / `ConversationRef` / `MessageRef` / `ConversationBackendPort` 合同。
- SQLite backend binding/ref 表。
- 只读空适配器和只读查询 API。
- 隔离 MockTransport 只读 Adapter：分页、游标、重复 ID 去重、403/404/5xx/schema/revoked 映射。

待交付：

- `BackendConnection`。
- `ConversationRef`。
- 只读 Bot 列表、会话列表、分页消息、状态和成果引用。
- 指定 `gottaBoy/OpenMausBot` 固定 commit，不自动跟随 upstream。
- OpenMausBot MCP/HTTP 使用 Anti-Corruption Layer。

mybot 权威：

- 项目权限。
- 资料快照。
- Run/预算/审计。
- 人工接受。

OpenMausBot 权威：

- Bot/Profile。
- 原始 Thread/Message。
- 原生执行事件。

验收：

- 只读查询不发模型请求。
- 断线、403、撤销、schema 变化有独立状态。
- 分页消息不重复。
- 外部 transcript 不被 mybot 竞争写入。

停止条件：

- 原生接口不能限制读取范围，或启动产生无法计量的隐式请求。

### Phase 4：持续会话与受控发送

状态：未完成。

交付：

- 会话消息输入。
- 追问形成下一轮 Run。
- 原 Run 快照不可变。
- `CommandId`/`send_id` 幂等。
- 发送前显示：
  - 文件/资料范围
  - Agent/Harness/Model
  - 工具权限
  - 调用上限
  - 可能外发的数据
- `outcome_unknown` 对账，不盲目重发。

验收：

- 重复点击只产生一条命令。
- 失败后不会自动切换模型或重放。
- 追问能定位到同一会话和新 Run。
- 所有内部请求进入预算。

### Phase 5：可视化 Workflow 与多 Agent

状态：未完成。

交付：

- `WorkDefinition` / `WorkDefinitionVersion`。
- 现有固定流程先作为只读版本图：

```text
Planning -> Research x 1..2 -> Synthesis -> Review
```

- 每个 Step 显示：
  - Agent
  - Model/Harness
  - Tool scope
  - 输入/输出
  - 状态
  - 调用数
  - 成果
  - 等待/失败原因
- 暂不做任意 DAG 拖拽编辑器。

参考：

- Melaya：Pipeline/Step/Tool Scope/HITL/Replay。
- AIFlowy：Workflow 定义、版本、测试和运行分离。
- swarm-cursors：依赖/回放表达，不复制动画。

验收：

- 工作定义版本变化不改写旧 Run。
- 运行图只来自真实 Event/Agent/Call。
- `settled` 不显示成“成功”。

### Phase 6：中英文与可视化统计

状态：未完成。

交付：

```text
web/i18n/zh-CN.json
web/i18n/en-US.json
```

- 稳定 code → locale message。
- 多 Agent 调用统计：
  - 按 Agent
  - 按模型
  - 按 Harness
  - 输入/输出 Token
  - 缺失用量
  - 成功/失败/取消
  - 延迟
  - 费用未知
- 统计从持久 Call/Event 聚合，不从动画或文本推断。

验收：

- 切换语言不改变事实 ID/状态/审计。
- 缺失 Token 不显示 0。
- 统计可回到具体 Call。

### Phase 7：Cindy 风格多端接续

状态：后置。

交付顺序：

1. 浏览器/Pad/手机查看同一 Run。
2. 设备会话和撤销。
3. 增量事件游标/SSE。
4. 手机补充要求，形成下一轮草稿。
5. 双端冲突和去重。
6. Cindy-like DeviceSession/Command。
7. 可选 Headscale 私网。

不承诺：

- 活进程跨机器迁移。
- 跨 OS/Harness 原样迁移内部状态。
- 手机上离线继续执行。
- 设备入网自动拥有项目/工具权限。

验收：

- 电脑开始、手机查看/补充、电脑恢复同一会话。
- 断线补齐不重复。
- 撤销设备后无法刷新/发命令。

### Phase 8：IM、文档、邮箱连接器

默认第一组合：飞书 + 语雀只读。

顺序：

1. Channel 入站身份归一化。
2. Inbox 去重。
3. 项目/会话绑定。
4. 查询与脱敏通知。
5. 任务草稿。
6. Web 确认后执行。
7. 语雀只读 Resource。
8. 邮箱只读/回复草稿。
9. 写文档/发邮件单独审批。

不一次性接入微信、钉钉、邮箱、语雀和所有 App。

### Phase 9：研发执行与代码 Agent

状态：独立授权阶段。

交付：

- 隔离 workspace/worktree。
- 宿主 capability ceiling。
- 代码修改审批。
- Shell/浏览器/测试命令独立权限。
- Diff、退出码、测试结果、Artifact、人工接受。

一个 Run 只选择一个：

- Codex CLI Adapter
- OpenMausBot Adapter
- Pi Adapter
- OpenAI Agents SDK Adapter

不将多个主循环叠加在同一 Run。

### Phase 10：Rust Node、原生壳与团队化

后置目标：

- Linux Rust Node。
- Windows Node。
- Tauri/桌面托盘/系统通知。
- Headscale/HTTPS/设备身份。
- Membership/Project ACL/SSO。
- Outbox/Inbox 与多实例 Worker。
- 性能、背压、事件分页和真机验收。

在 Phase 7 以前不建设完整私网控制面；在真实性能瓶颈出现前不重写 FastAPI/SQLite。

## 3. 当前下一项

下一项只做 Phase 3：

1. 固定 `gottaBoy/OpenMausBot` commit 的只读 Adapter。
2. MockTransport 合同测试：Bot/Conversation/Message 分页、游标去重、403/断线/schema 变化。
3. Web Agent/会话只读列表和空状态。
4. 更新 `PROGRESS_LOG.md`。

不同时做：

- Cindy 设备控制。
- Headscale 部署。
- 飞书/微信连接器。
- Shell/代码写入。
- 通用拖拽 Workflow 编辑器。

## 4. 每项完成后记录

```text
工作项：
领域/模块：
实现：
验证命令：
结果：
未完成/unknown：
下一步：
```

记录位置：[PROGRESS_LOG.md](PROGRESS_LOG.md)。
