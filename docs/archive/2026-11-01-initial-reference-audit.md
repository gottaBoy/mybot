# 历史草案：本地项目复用审计

> 已于 2026-11-01 撤回。文中 UI 借鉴和直接接入建议不再适用，当前评估见 `../REFERENCE_AUDIT.md`。

审计范围：

```text
/home/my/workspace/ainfra/aibiz
/home/my/workspace/ainfra/agent-delivery-platform
/home/my/workspace/ainfra/artifact-keeper
/home/my/workspace/ainfra/mattermost
/home/my/workspace/ainfra/my-ai-swarm
```

## 结论

这些项目可以作为能力和工程经验的参考，但不能把它们简单拼成一个前端。

推荐分工：

```text
mybot
  ├── 工作台 UI：完全独立设计和实现
  ├── 领域模型：借鉴 agent-delivery-platform
  ├── UI 组件/主题：不复用现有项目视觉
  ├── 制品、扫描、晋级：接入 artifact-keeper
  ├── 通知/讨论/审批渠道：接入 Mattermost
  └── 本地执行与恢复语义：借鉴 my-ai-swarm
```

## 1. agent-delivery-platform

路径：

```text
/home/my/workspace/ainfra/agent-delivery-platform
```

### 可直接借鉴

- `State` 状态机和人工门禁
- `TaskDAG` 依赖、并行、重试和取消
- `Approval` 的 subject hash、TTL、幂等决策
- `WorkflowRun`、`WorkflowArtifact`、`AgentRun`、`ToolCall`
- `Requirement → Design → Coding → QA` 的编排顺序
- Mattermost、Telegram、飞书渠道适配器
- 本地沙箱和 Git Provider 抽象
- `docs/architecture.json` 的拓扑、数据流和 API 描述方式

### 不能直接当成最终 UI

它的现有架构页面偏工程拓扑和状态审计，适合平台运维和设计评审，不适合作为个人用户的日常工作台。

### 采用策略

将它视为**领域模型和控制平面参考实现**：

- 不重复定义工作流状态和审批语义。
- UI 使用同一套状态、事件和 Artifact 词汇。
- 后续通过 API 或 Python package 复用，不复制粘贴业务逻辑。

## 2. aibiz / plm-web

路径：

```text
/home/my/workspace/ainfra/aibiz/plm-web
/home/my/workspace/ainfra/aibiz/ibiz-app-hub
```

### 可借鉴

- Vue 3 + Vite + TypeScript 工程组织
- iBiz Runtime 的 View Shell、动态视图和模型驱动页面
- `@ibiz-template/vue3-components`
- `@ibiz-template/theme`
- Element Plus、Pinia、Vue Router
- Dashboard、Portlet、Layout、Menu、Theme 的模型化表达
- `ai-agent-*`、`dyna-dashboard-*` 相关实体和页面命名
- 复杂后台系统中的列表、详情、树、标签页和弹窗模式

### 风险

- `plm-web` 与 `ibiz-app-hub` 通过大量本地 `link:` 依赖耦合。
- 页面大多由 iBiz 模型生成，直接搬到 mybot 会引入整套 MDD 运行时。
- `ai-agent-session-debug-view` 等页面本身很薄，真正的 UI 行为由 Runtime 和模型驱动。

### 采用策略

先借鉴以下设计语言和交互模式：

- 左侧导航与应用上下文切换
- 项目/对象/详情的层级关系
- Dashboard 的信息密度和可配置布局
- 表格、筛选、详情、抽屉、模态的企业级交互

首版不直接依赖整个 iBiz Hub。只有当工作台确定需要模型驱动页面和插件生态时，才评估引入 `@ibiz-template` 组件。

## 3. Mattermost

路径：

```text
/home/my/workspace/ainfra/mattermost
```

### 可作为工具

- 个人工作台的消息 Inbox
- Agent 运行通知
- 审批卡片和人工门禁
- 项目讨论线程
- 失败任务告警
- 移动端或桌面端的轻量操作入口

### 不建议的用法

- 不把 Mattermost 编译后的 `client/` 目录当作 mybot 的 UI 组件库。
- 不把频道聊天作为项目状态的唯一来源。
- 不让 Agent 只能通过聊天才能执行任务。

当前目录主要是服务端和编译后的客户端资源，完整 React 开发源码不在这个工作区中。主工作台应使用自己的前端，Mattermost 通过 Webhook、API、Bot 或插件接入。

## 4. my-ai-swarm

路径：

```text
/home/my/workspace/ainfra/my-ai-swarm
```

### 可借鉴

- Planner → Researcher → Builder → Reviewer → Verifier
- dry-run 和显式写入权限
- Git worktree 隔离
- `status / cancel / resume`
- 运行目录和 checkpoint
- patch、未跟踪文件快照和合并门禁

它更适合提供“本地 Agent 执行器”的安全语义，而不是作为最终产品 UI。

## 5. 最终复用决策

| 能力 | 主要来源 | mybot 的处理方式 |
|---|---|---|
| 页面视觉和企业后台交互 | aibiz | 借鉴，不直接复制运行时 |
| 项目/任务/Artifact 领域模型 | agent-delivery-platform | 作为主参考 |
| 状态机、审批、DAG | agent-delivery-platform | 保持语义兼容 |
| 本地执行、安全写入 | my-ai-swarm | 借鉴 worktree、checkpoint、merge gate |
| 讨论、通知、审批入口 | Mattermost | 作为可选渠道 |
| 主工作台 | mybot | 独立设计，个人优先 |

## 6. 个人版界面布局

```text
┌──────────────────────────────────────────────────────────┐
│ Workbench / 当前项目 / 环境 / 搜索 / 通知 / 账户          │
├───────────┬──────────────────────────────┬───────────────┤
│ 主导航    │ 项目目标与 Run 时间线         │ 当前上下文     │
│           │                              │               │
│ Home      │ 任务计划                      │ 待审批         │
│ Projects  │ 当前执行步骤                  │ Agent 状态     │
│ Runs      │ Artifact / Diff / Tests       │ 成本和权限     │
│ Agents    │                                │               │
│ Artifacts │                                │               │
│ Settings  │                                │               │
└───────────┴──────────────────────────────┴───────────────┘
```

Mattermost 的消息入口作为通知和讨论，不放在主导航的第一层。个人用户首先看到的是“我现在要处理什么”和“Agent 当前做到哪一步”。
