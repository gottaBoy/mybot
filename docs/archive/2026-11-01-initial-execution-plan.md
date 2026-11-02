# 历史草案：执行计划

> 已于 2026-11-01 撤回。文中的勾选不代表设计已通过评审，当前计划见 `../EXECUTION_PLAN.md`。

## 当前阶段

**阶段 0：产品与技术设计完成，个人优先方案进入评审冻结。暂不进入业务功能开发。**

## 任务拆解

### Milestone 0：设计基线

- [x] 明确产品定位：AI-native 项目交付工作台
- [x] 定义 Workspace / Project / Task / Run / Artifact
- [x] 定义 Agent 角色边界
- [x] 定义 Run 状态机
- [x] 定义核心信息架构
- [x] 设计首个“需求到 Staging”纵向 POC
- [x] 完成无后端 UI 原型

### Milestone 1：可交互工作台基础

- [ ] 评审个人用户端的信息架构
- [ ] 评审设计 Token 和组件约定
- [ ] 确认 Home / Project / Run Console 三个页面
- [ ] 确认本地 Mock 数据层
- [ ] 确认任务状态、审批和事件时间线
- [ ] 确认 Artifact、Agent、Environment 的基础视图
- [ ] 确认键盘操作和响应式布局

### Milestone 2：Control API

- [ ] 建立 FastAPI 服务
- [ ] 建立 PostgreSQL 数据模型
- [ ] 建立 Project、Agent、Task、Run、Artifact API
- [ ] 建立事件表和事件查询 API
- [ ] 建立 Approval API
- [ ] 建立基础权限模型

### Milestone 3：第一个 Agent Run

- [ ] 接入一个模型 Provider
- [ ] 实现 Manager Agent
- [ ] 实现任务计划生成
- [ ] 实现 Developer Agent
- [ ] 接入 OpenHands Workspace
- [ ] 记录工具调用和 Artifact
- [ ] 实现 Run 暂停、恢复、失败和重试

### Milestone 4：多 Agent 交付流程

- [ ] 接入 Architect、Designer、QA、Reviewer
- [ ] 实现并行任务和结果汇聚
- [ ] 实现 Agent handoff
- [ ] 实现质量门禁
- [ ] 实现人类审批
- [ ] 实现 Git diff 和测试报告

### Milestone 5：部署与运维

- [ ] 接入镜像构建
- [ ] 接入 Staging 部署
- [ ] 接入 Smoke Test
- [ ] 接入日志、指标和追踪
- [ ] 实现部署回滚
- [ ] 实现 SRE Agent

### Milestone 6：平台化

- [ ] Skill 和长期记忆
- [ ] 模型路由和成本预算
- [ ] 多项目和团队权限（个人版只预留数据字段）
- [ ] Browser Worker
- [ ] GPU Worker
- [ ] Temporal
- [ ] A2A
- [ ] Kubernetes

## 首批验收标准

1. 用户能在 2 分钟内创建项目并启动 Run。
2. Run 关闭浏览器后仍能继续执行。
3. 用户可以看到当前步骤、下一步和产生的 Artifact。
4. 所有代码变更都能查看 Diff。
5. 未经审批不能执行 Staging 部署。
6. 任何失败都能定位到 Agent、Step 或 Tool。
7. 同一个任务可以暂停、恢复、重试。
8. 页面不依赖聊天记录理解项目状态。

## 当前执行顺序

1. 用原型验证信息架构和视觉方向。
2. 将原型拆为可复用组件。
3. 加入 Mock 数据和前端状态机。
4. 再接入后端 API，避免前后端同时探索产品结构。
