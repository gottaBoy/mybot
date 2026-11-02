# AI Workbench

面向研发团队的 AI 工作台，先单人试点。让研发人员能够指挥模型和 Agent，完成项目工作，并追踪、控制和分析真实执行过程。

**下次继续先读 [CONTINUE.md](CONTINUE.md)**。这里记录最新要求、证据、待办和禁止误用的旧方案。

**当前视觉正在重做：用户已否定 V1，V2 草稿尚未完成或验证。** 参考对象与下一步见 [最新参考记录](docs/USER_REFERENCES_2026-11-02.md)，不要将旧截图当作当前视觉基线。

```text
目标 -> 计划 -> 按需分工与模型选择 -> 执行与追踪 -> 成果 -> 分析改进
```

## 当前状态

- 已确认：目标用户是研发团队，先单人试点，界面完全原创。
- 已确认：Super-agent/Subagent、模型调用追踪、可视化、审计和分析。
- 当前：V1 已收到负面视觉反馈；正按用户指定的公开参考重设计，V2 尚未完成。
- 尚未完成视觉稿和技术选型，未接入后端、模型、执行器或外部服务。
- 旧 `prototype/` 未采用，不作为新界面或工程起点。
- 已完成部分公开源码与官方文档阅读，未部署或验收上游项目。

## 设计文档

| 文档 | 内容 |
| --- | --- |
| [产品基线](docs/AI_NATIVE_WORKBENCH_DESIGN.md) | 定位、边界和最小架构 |
| [现代研发工作台定义](docs/MODERN_RND_WORKBENCH.md) | 研发定位、能力与体验边界 |
| [开源调研](docs/OPEN_SOURCE_RESEARCH.md) | 上游 commit、源码证据、结论与缺口 |
| [源码链路对照](docs/SOURCE_CHAIN_ANALYSIS.md) | 执行、委派、干预、计量和适配边界 |
| [首版范围](docs/MVP_SCOPE.md) | 最小能力、适配检查、验证与验收 |
| [原创文字线框 V1](docs/LOW_FIDELITY_V1.md) | 任务、调度、调用、成果和接管流程 |
| [图形化低保真评审](docs/GRAPHICAL_LOW_FIDELITY_V1.md) | 18 个画面、截图、浏览器验证与设计边界 |
| [最新公开参考](docs/USER_REFERENCES_2026-11-02.md) | 正确的 Super-agent/Cyrene、视觉反馈与借鉴边界 |
| [能力地图](docs/CAPABILITY_MAP.md) | 核心能力、分期、分析口径 |
| [界面设计](docs/UI_DESIGN.md) | 导航、六条旅程、状态与原创视觉提案 |
| [可视化调度](docs/VISUAL_SCHEDULING.md) | 任务图、委派树、调用与审计 |
| [执行计划](docs/EXECUTION_PLAN.md) | 设计任务、评审门槛和后续 POC |
| [评审清单](docs/DESIGN_REVIEW.md) | 尚待确认的体验、安全及可信度要求 |
| [本地能力评估](docs/REFERENCE_AUDIT.md) | 可选后端能力，不借鉴 UI |
| [方向决策](docs/decisions/ADR-0001-personal-workbench.md) | 已确认方向与撤回旧结论 |
| [研发定位修订](docs/decisions/ADR-0002-rnd-team-single-user-pilot.md) | 面向团队、单人试点的区别 |

## 约束

不借鉴 `/home/my/workspace/ainfra` 下项目的视觉、布局和交互。公开开源项目用于理解能力与架构，不复制主界面。Artifact Keeper、Mattermost 等只作为可选能力，不决定界面，也不是单人试点前提。

当前下一步：按用户指定参考重做并验证 V2 主任务与调用画面。先设计，不继续业务实现。
