# 历史草案：团队项目交付工作台

> 已于 2026-11-01 撤回，不是当前产品、技术或视觉基线。保留作决策对照，当前方案见 `../AI_NATIVE_WORKBENCH_DESIGN.md`。

## 1. 产品定义

这是一个面向团队的 AI-native Project Delivery Platform。用户提供项目目标、约束和审批规则，系统负责组织不同角色的 Agent 和工具，持续产出可审查的项目结果。

当前产品策略采用**个人优先、团队可扩展**：

- 首版面向个人研发者，单用户、单工作区、少量本地或远程模型。
- 数据模型预留 Workspace、Member、Role、Policy、Budget 等字段。
- 不在首版实现复杂的组织管理、SSO、计费和多租户。
- 个人用户的体验必须完整，不依赖团队协作才能成立。

本地复用策略见 `docs/REFERENCE_AUDIT.md`：

- `agent-delivery-platform` 提供领域模型、状态机、审批和 DAG 参考。
- `aibiz` 提供企业级 Vue/iBiz 页面、主题、布局和组件参考。
- `mattermost` 提供讨论、通知和审批渠道。
- `my-ai-swarm` 提供本地执行、checkpoint、worktree 和合并门禁参考。
- 主工作台保持独立，避免把多个项目的运行时强耦合到一起。

核心闭环：

```text
目标 → 计划 → 设计 → 实现 → 验证 → 发布 → 观察 → 复盘
```

产品的最小抽象不是 Chat，而是：

```text
Workspace
  └── Project
        ├── Task
        │     └── Run
        │           ├── Step
        │           ├── Tool call
        │           ├── Approval
        │           └── Artifact
        ├── Agents
        ├── Environments
        └── Deployments
```

## 2. 产品原则

1. **任务优先**：用户管理目标和结果，不管理模型对话。
2. **Artifact 优先**：设计、代码、测试报告、部署记录是一级对象。
3. **角色有边界**：Agent 有明确职责、工具、数据范围和预算。
4. **可恢复**：浏览器关闭、服务重启、模型失败后，Run 可以继续。
5. **默认可审查**：计划、工具调用、变更、证据和风险都可查看。
6. **高风险必审批**：合并代码、部署生产、外发消息、删除数据必须停住。
7. **渐进式自治**：先建议，再代办，最后才允许受限自动执行。
8. **结果可复现**：记录模型、Prompt、代码、数据、环境和工具版本。

## 3. 用户角色

### 项目负责人

输入目标、约束、优先级和验收标准，审批关键动作。

### 专业成员

查看任务、修改 Artifact、补充知识、接管失败步骤。

### 平台管理员

管理模型、工具、凭证、环境、权限、预算和审计。

### Agent

不是“虚拟用户”，而是带有角色、工具和权限边界的执行单元。

## 4. Agent 角色模型

第一版只实现以下角色：

| 角色 | 主要职责 | 默认产物 |
|---|---|---|
| Project Manager | 澄清目标、拆解任务、维护计划 | Project brief、任务计划 |
| Architect | 方案、边界、依赖、风险 | Architecture decision、API contract |
| Designer | 信息架构、交互流程、视觉规范 | Wireframe、design spec |
| Developer | 修改代码、实现功能、提交变更 | Commit、PR、构建产物 |
| QA | 测试设计、执行、回归、质量门禁 | Test report、failure case |
| Release Engineer | 构建、部署、回滚 | Deployment record |
| SRE | 监控、告警、事故、运行分析 | Incident report、runbook |

Agent 和工具要分开：

- Agent：负责分析、判断和计划。
- Tool：负责 Git、Shell、浏览器、数据库、CI、部署 API。
- Worker：负责在沙箱中实际运行代码、测试或浏览器。

## 5. 编排策略

采用“显式工作流 + 动态 Agent”的混合模式。

### 固定流程

适合设计、开发、测试、发布等可重复流程：

```text
Plan → Design → Implement → Test → Review → Build → Deploy → Smoke test
```

### 动态委派

适合需求不完整、需要研究或中途发现新问题的任务：

```text
Manager
  ├── Researcher
  ├── Architect
  ├── Developer
  └── Reviewer
```

### 并行与汇聚

可以并行执行：

- 多个资料研究
- 单测、集成测试、安全扫描
- 多个设计方案
- 多个模型评测

所有并行结果必须进入明确的汇聚步骤，由 Reviewer 或 Manager 做结论。

### 不采用的方式

- 不把所有 Agent 放进无限群聊。
- 不让 Agent 无限创建新的 Agent。
- 不让工具调用绕过统一 Gateway。
- 不把模型内部思维过程直接暴露给用户。

## 6. 运行状态机

```text
draft
  → planned
  → running
  → waiting_input
  → waiting_approval
  → succeeded

running → failed
running → canceled
succeeded → rolled_back
```

每个 Run 记录：

```text
run_id
project_id
plan_version
agent_profile
model
workspace
tool_permissions
budget
input_refs
output_refs
status
started_at
ended_at
```

建议事件类型：

```text
run.started
step.started
step.completed
tool.requested
tool.completed
artifact.created
approval.requested
run.paused
run.resumed
run.failed
```

## 7. 技术架构

```text
Web / Desktop / Slack / Teams
              │
       AG-UI event stream
              │
       Workbench Control API
       ┌──────┼─────────┐
       │      │         │
  Projects  Runs     Policies
       │      │         │
       └── Workflow Engine ──┐
                             │
                       Agent Runtime
                 ┌───────────┼───────────┐
                 │           │           │
              MCP Tools   Memory      Model Gateway
                 │           │           │
          Browser/Code   Postgres     vLLM/API
              Workers
```

### 推荐实现

```text
Frontend:       Next.js + AG-UI
Control API:    FastAPI
Agent Runtime:  LangGraph
Durability:     PostgreSQL checkpointer，生产接入 Temporal
Coding Agent:   OpenHands SDK / Agent Server
Tools:          MCP
Agent-to-Agent: A2A（后期）
Browser:        Playwright + CDP
Sandbox:        Docker，生产使用 gVisor/VM/Kubernetes
Metadata:       PostgreSQL
Artifacts:      MinIO/S3
Queue:          Redis
Memory:         PostgreSQL + pgvector + Git-backed Skills
Observability:  OpenTelemetry + Prometheus + Grafana + Loki
```

分层原则：

- LangGraph 管 Agent 内部的思考和状态。
- Temporal 管业务任务的可靠运行、重试、定时和恢复。
- OpenHands 管代码和终端执行。
- MCP 管工具接入。
- Control API 管权限、项目、任务和审计。

## 7.1 模型提供商策略

模型提供商必须通过统一的 `ModelProvider` 接口接入，不能让业务页面直接绑定某一家模型。

个人版至少支持：

```text
Local Provider：Ollama / vLLM / llama.cpp
Remote Provider：Mistral API
Fallback：用户配置的 OpenAI-compatible Endpoint
```

Mistral 不能简单定义为“完全免费”：

- Le Chat 和 Studio 有 Free 计划，但有功能、消息和使用量限制。
- API 与 Vibe 的免费额度用尽后，继续使用需要预付 Credits 或启用 pay-as-you-go。
- 开源模型多数使用 Apache 2.0，但不同模型可能使用修改版 MIT、MNPL、CC BY-NC 等许可，必须以具体模型卡为准。
- 即使模型权重可以自托管，GPU、存储和运行成本仍然存在。

因此，首版策略是：

1. 默认允许本地模型，避免个人用户被 API 费用阻塞。
2. Mistral 作为远程高质量 Provider 和低成本开发入口。
3. 所有请求记录 provider、model、token、耗时和估算成本。
4. 当额度不足时，显示明确提示并允许切换到本地模型或其他 Endpoint。
5. 商业发布前再次核对具体模型许可证和服务条款。

## 8. 信息架构

一级导航：

```text
Home
Projects
Tasks
Agents
Artifacts
Environments
Deployments
Evaluations
Operations
Settings
```

### Home

只展示高价值信息：

- 继续处理的项目
- 等待审批的任务
- 正在运行的 Run
- 最近产物
- 失败和需要人工处理的问题

### Project

项目页包含：

- 项目目标和验收标准
- 当前计划
- 任务时间线
- Agent 参与情况
- Artifact 列表
- 环境和部署
- 最近评测结果

### Run Console

核心页面采用三栏结构：

```text
左：步骤和状态
中：实时事件、结果和 Artifact
右：上下文、权限、预算、审批
```

页面标签：

```text
Overview | Live | Files | Diff | Tests | Deploy | Audit
```

### Agent

Agent 页面展示：

- 角色和目标
- 模型策略
- 可用工具
- 数据访问范围
- 成本和时间预算
- 审批要求
- Skill 版本
- 历史运行质量

## 9. 视觉和交互设计

### 视觉方向

- 浅色工作台为主，深色代码/日志区域为辅。
- 背景使用中性灰白，主色使用蓝色，成功使用绿色，警告使用琥珀色，失败使用红色。
- 卡片只用于 Artifact、Approval、Agent 等独立对象。
- 页面主体使用全宽带状区域和稳定网格，避免卡片套卡片。
- 圆角不超过 8px。
- 操作按钮使用图标和简短动词，复杂说明放入侧栏或详情。

### 交互原则

- 默认显示结论，详细工具日志按需展开。
- 用户总能看到“正在做什么、为什么做、下一步是什么”。
- 所有高风险操作展示影响范围、变更内容、凭证和回滚方式。
- 断线后重新打开页面，Run 状态和事件继续可见。
- 移动端只优先支持审批、状态、告警和结果查看。

## 10. 首个纵向 POC

目标：完成一条真实的“需求到 Staging”链路。

```text
提交需求
  → Manager 拆解
  → Architect 输出方案
  → Designer 输出页面设计
  → Developer 修改代码
  → QA 运行测试
  → Reviewer 检查 Diff
  → 人工审批
  → Build
  → Deploy Staging
  → Smoke Test
  → SRE 观察指标
```

POC 必须支持：

- 一个项目
- 一个代码仓库
- 5 个以上 Agent 角色
- 至少一个并行阶段
- Docker 隔离 Workspace
- Git 变更和 Diff
- 测试报告
- 审批
- Staging 部署
- Run 暂停和恢复
- 完整审计
