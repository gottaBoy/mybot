# AI Workbench

面向研发团队的 AI 工作台，先单人试点。让研发人员能够指挥模型和 Agent，完成项目工作，并追踪、控制和分析真实执行过程。

**下次继续先读 [CONTINUE.md](CONTINUE.md)**。这里记录最新要求、证据、待办和禁止误用的旧方案。

**当前可运行应用：`workbench/` + `web/`**。2026-11-04 用户授权开始实现，第一条闭环是只读研发调研，不是完整的编码/部署 Agent 平台。实现范围与平台证据见 [IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md)。

**静态设计：[V2 研发工作区](design/review-v2/index.html)**。可以直接打开，数据均为虚构样例，不与真实应用混用。V1 已被用户否定，V2 仍需持续体验评审。

```text
目标 -> 计划 -> 按需分工与模型选择 -> 执行与追踪 -> 成果 -> 分析改进
```

## 当前状态

- 已确认：目标用户是研发团队，先单人试点，界面完全原创。
- 已确认：Super-agent/Subagent、模型调用追踪、可视化、审计和分析。
- 已实现：项目/模型配置、任务、发送快照确认、Super-agent 规划、最多两个研究 Agent 并行、汇总与人工审查。
- 已实现：SQLite 持久运行/事件、模型角色路由、运行内逐调用追踪、暂停/取消/手动续跑、响应式 Web。
- 后端采用 FastAPI + SQLite + 单后台 Worker，不需要前端构建，也不强制 GPU。
- 未实现：Shell、代码写入、真实测试执行、部署、任意 DAG、团队权限、原生 App。
- 验证使用测试 Provider；没有配置或调用真实外部模型，没有部署上游执行器。
- 旧 `prototype/` 未采用，不作为新界面或工程起点。

## 本机启动

执行服务器要求 Python 3.11+、POSIX；本轮验证环境是 Linux/Python 3.12，Mac 服务端未验收，Windows 服务端暂不支持。

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.lock
.venv/bin/python -m workbench --host 127.0.0.1 --port 4180
```

浏览器访问 `http://127.0.0.1:4180`。首次进入为空工作区，不自动发现模型或创建示例任务。

使用顺序：创建项目 → 添加模型配置 → 发起只读工作 → 检查文件快照、模型发送地址和调用上限 → 确认后运行 → 查看调度、调用、审计与成果。

- `WORKBENCH_WORKSPACE`：允许选择的服务器目录上界，默认本仓库；项目路径和任务文件均使用相对路径。
- `WORKBENCH_DATA_DIR`：私有 SQLite/运行快照目录，默认 `.runtime/`，已排除 Git。
- 模型基础地址填到 `/v1` 这一层，例如 `http://127.0.0.1:11434/v1`；程序追加 `/chat/completions`。示例不是已安装的模型服务。
- 需要密钥时，在服务启动前设置 `WORKBENCH_MODEL_<NAME>_KEY`，界面只填变量名。不会加载 `.env`，不接受浏览器上传密钥。
- 配置保存不调用模型；主动测试和开始运行会发起请求，费用由 Provider 决定。接口兼容性需单独验证。

## 桌面与手机

Mac、Linux、Android、iPhone 的客户端目标都是浏览器，无需在手机上运行 Python 或模型。桌面双栏，手机切换工作记录/成果。

已检查 Chrome 下的 1440/1024/768/390/320px 布局；没有完成 macOS Safari、iOS Safari 或 Android 真机验收。不是原生 App，不承诺离线、手机后台常驻或推送。

`127.0.0.1` 只供服务器本机访问。手机连接需要另行配置私网/域名与 HTTPS 反向代理，开启至少 32 字符的 `WORKBENCH_ACCESS_TOKEN`、明确的 `WORKBENCH_ALLOWED_HOSTS`，并设置 `WORKBENCH_SECURE_COOKIE=1`。不要直接把无令牌服务暴露到局域网或公网。本轮没有自动开放监听或部署代理。

## 验证

```bash
.venv/bin/python -m pytest -q
node --check web/app.js
```

浏览器验证步骤见 [tests/README.md](tests/README.md)。测试使用 MockTransport/FakeProvider，验证应用行为，不证明真实模型能力或回答质量。[浏览器结果](tests/evidence/browser.json) 与测试截图独立于静态设计证据。

## 设计文档

| 文档 | 内容 |
| --- | --- |
| [实现阶段决策](docs/decisions/ADR-0004-implementation-slice.md) | 本轮范围、技术选择与授权边界 |
| [实现与平台状态](docs/IMPLEMENTATION_STATUS.md) | 已实现、未实现、安全边界和实际验证 |
| [产品基线](docs/AI_NATIVE_WORKBENCH_DESIGN.md) | 定位、边界和最小架构 |
| [现代研发工作台定义](docs/MODERN_RND_WORKBENCH.md) | 研发定位、能力与体验边界 |
| [开源调研](docs/OPEN_SOURCE_RESEARCH.md) | 上游 commit、源码证据、结论与缺口 |
| [源码链路对照](docs/SOURCE_CHAIN_ANALYSIS.md) | 执行、委派、干预、计量和适配边界 |
| [首版范围](docs/MVP_SCOPE.md) | 最小能力、适配检查、验证与验收 |
| [原创文字线框 V1](docs/LOW_FIDELITY_V1.md) | 任务、调度、调用、成果和接管流程 |
| [图形化低保真评审](docs/GRAPHICAL_LOW_FIDELITY_V1.md) | 18 个画面、截图、浏览器验证与设计边界 |
| [最新公开参考](docs/USER_REFERENCES_2026-11-02.md) | 正确的 Super-agent/Cyrene、视觉反馈与借鉴边界 |
| [UI 迭代日志](docs/UI_ITERATIONS.md) | 用户反馈、本轮改动、检查证据与下一轮优先级 |
| [Super-agent 与 Control Panel](docs/SUPER_AGENT_CONTROL_PANEL.md) | 协调、模型/预算草稿、差异预览与控制边界 |
| [计划修订与模型检查](docs/PLAN_REVISION_FLOW.md) | 从失败证据到新计划、模型连接声明与数据范围 |
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

下一步：先由用户配置一个 Provider 做明确授权的兼容性验收，再验证 Safari/真机与断线体验；代码沙箱、修改/测试闭环另立阶段，不将静态设计中的能力误报为已经实现。
