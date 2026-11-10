# AI Workbench

面向研发团队的 AI 工作台，先单人试点。让研发人员能够指挥模型和 Agent，完成项目工作，并追踪、控制和分析真实执行过程。

**下次继续先读 [CONTINUE.md](CONTINUE.md)**。这里记录最新要求、证据、待办和禁止误用的旧方案。

**工作项台账：[WORK_ITEMS.md](docs/WORK_ITEMS.md)**。保留 119 个原编号，当前 9 项完成、
110 项未完全完成；按执行包推进，不用 commit 或测试数量代替产品完成度。

**当前可运行应用：`workbench/` + `web/`**。2026-11-04 用户授权开始实现，第一条闭环是只读研发调研，不是完整的编码/部署 Agent 平台。实现范围与平台证据见 [IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md)。

**静态设计：[V2 研发工作区](design/review-v2/index.html)**。可以直接打开，数据均为虚构样例，不与真实应用混用。V1 已被用户否定，V2 仍需持续体验评审。

**最新评审：[多版本设计与组合能力](docs/DESIGN_CAPABILITY_REVIEW.md)**。用户认为未达到效果；当前各版本尚未形成长期 Agent、持续会话和多端接续。建议在真实工作台里补齐这一闭环，不再增加独立技术演示页；新信息架构仍待确认。

**逐步实施：[多项目取舍与路线](docs/AGENT_INTEGRATION_ROADMAP.md)**。OpenMausBot 会话复用优先；OpenMuse/Cindy/OpenClaw/HarnessWorks 分层借鉴，先只读接入现有工作区，再受控发送、多端与应用连接。名称假设、逐步验收和未实现边界都已记录。

**分阶段实现计划：[IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md)**。按 Local Harness → OpenMausBot 会话 → 受控发送 → Workflow/统计 → Cindy 多端 → 连接器 → 研发执行 → Rust Node 分阶段交付。

**最新目标：[AI Agent Work 可视化智能体](docs/AI_AGENT_WORK.md)**。用户确认实施方向，新增白龙马/Cindy 的公开参考评审；建议工作优先、过程可核查、成果可检查，不复制界面或默认后台调用。尚未形成获认可的新视觉稿。

最新参考已分层记录：OpenAI Agents SDK（执行库候选）、AIFlowy（流程管理）、Headscale（可选私网）。用户指定 `gottaBoy/OpenMausBot`，当前固定源码与原研究快照相同；尚未因此接入 fork 或部署网络层。

**新增工作流参考：Melaya Agentic Framework**。它更接近“步骤/工具/子智能体/审批/回放/审计”的可视化目标；mybot 只借鉴契约，不引入其专有 Runtime、Device/Browser Control 或远程平台。[研究分解](docs/REA_MELAYA.md)

**新增本地 Harness 参考：T3 Code**。它控制本机已登录的 CLI Harness；mybot 只借鉴控制面，不读取 Codex credential store，默认模型只能来自显式环境配置或用户选择。[研究分解](docs/REA_T3CODE.md)

本地默认模型可通过 `WORKBENCH_DEFAULT_MODEL_ID=<已保存模型配置 ID>` 显式指定；工作台只检测 `codex`/`claude`/`opencode`/`t3` 是否存在，不读取登录凭证，也不会因为发现 CLI 自动发起模型请求。

**架构决策：[模块化单体与战术 DDD](docs/decisions/ADR-0005-modular-domain-architecture.md)**。当前采用领域边界、端口适配器、状态机和稳定双语 code；完整工作项进度见 [PROGRESS_LOG.md](docs/PROGRESS_LOG.md)。

**开发研究预览：[Runtime Lab 执行器对比](design/runtime-lab/index.html)**。Codex/Pi/DeepSeek Harness 五场景本地 mock，可查看事件、取消与导出；不连接账号或模型，不是已接入执行器，也不作为推荐产品首页。验证与截图见 [预览记录](docs/RUNTIME_LAB_PREVIEW.md)。

```text
目标 -> 计划 -> 按需分工与模型选择 -> 执行与追踪 -> 成果 -> 分析改进
```

## 当前状态

- 已确认：目标用户是研发团队，先单人试点，界面完全原创。
- 已确认：Super-agent/Subagent、模型调用追踪、可视化、审计和分析。
- 已实现：项目/模型配置、任务、发送快照确认、Super-agent 规划、最多两个研究 Agent 并行、汇总与人工审查。
- 已实现：SQLite 持久运行/事件、模型角色路由、运行内逐调用追踪、暂停/取消/手动续跑、响应式 Web。
- 后端采用 FastAPI + SQLite + 单后台 Worker，不需要前端构建，也不强制 GPU。
- 已建立只读 Backend/Conversation 合同和本机连接配置页；保存不联网，健康检查需显式确认，撤销后禁止使用。公共 health 可达不代表认证/会话读取。OpenMausBot 固定 fork 尚未完成真实会话接入。
- 未实现：Shell、代码写入、真实测试执行、部署、任意 DAG、团队权限、原生 App。
- 工作台已接入显式启用的 Codex CLI；2026-11-09 一个获授权的关联重试已完成 2 项研究与汇总，3 次新增调用、3 份待审查成果。仍有历史超时/未知用量，且尚未完成源码研究及工具边界验收。自动回归使用测试 Provider；凭证由 CLI 保管，OpenMausBot 尚未接入。
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
- Codex 当前使用 `codex exec`；每次调用在临时空工作目录启动，并忽略用户配置/规则和项目文档自动加载，只把用户确认的快照放入 prompt。`WORKBENCH_CODEX_TIMEOUT_SECONDS` 设置默认单次时限（10–300 秒，Run 可覆盖）。超时不自动重试。长驻 App Server 仍是待验收方案，见 [可靠性方案](docs/CODEX_RELIABILITY_PLAN.md)。
- 失败/中断运行提供“重试与资源”：先预览复用步骤和最低新增调用数，再选择未完成角色模型、预算、并行数、单次时限和输出上限。提交后创建关联 Run，不修改来源 Run，不自动重试。
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
| [多端与能力扩展方案](docs/MULTI_DEVICE_AGENT_PLAN.md) | 七方案对比、Rust/TS 分工、手机/桌面/Pad、IM/文档/邮箱与 App 扩展；待评审、未接入 |
| [开源借鉴与迭代台账](docs/OPEN_SOURCE_ADOPTION_MAP.md) | OpenMausBot 先行 POC 门槛、REA 证据边界、逐模块借鉴来源与淘汰条件 |
| [REA 项目分解索引](docs/REA_PROJECT_BREAKDOWNS.md) | 原四项目及 Pi、DeepSeek Harness、HuLa 的 REA 工具链、证据边界和实现映射 |
| [Pi、Harness 与 HuLa](docs/PI_HARNESS_HULA.md) | 执行内核与客户端分层、固定快照、适配器建议及三个独立 REA 分解入口 |
| [Runtime Lab 交互预览](docs/RUNTIME_LAB_PREVIEW.md) | 三执行器本地夹具、五场景、桌面/手机检查、浏览器与 REA 证据 |
| [OpenMausBot REA 分解](docs/REA_OPENMAUSBOT.md) | 权限、Bot API、SSE、连接器和 P0/P1 运行证据 |
| [OpenMausBot P0 结果](docs/OPENMAUSBOT_P0_RESULTS.md) | REA 受控启动、权限默认和配置重启实测；未通过底座门槛 |
| [OpenMausBot 会话复用实测](docs/OPENMAUSBOT_MCP_REUSE_RESULTS.md) | 固定包 + 合成 ACP 的 35/38 项 MCP/会话检查、隐式请求对照；未接业务/UI |
| [OpenMausBot 权限研究](docs/OPENMAUSBOT_PERMISSION_RESEARCH.md) | 创建模板、委派、Ask grants、Bot API fence 与 mybot ceiling 结论 |
| [本机 Codex 单次验证](docs/CODEX_ACCOUNT_SMOKE.md) | 用户明确授权的一次真实文本请求；未导出凭证、不代表 OpenMausBot 已接入 |
| [Cindy REA 分解](docs/REA_CINDY.md) | Device Link、Electron/Android 包、重连和能力协商 |
| [nanoMuse REA 分解](docs/REA_NANOMUSE.md) | Web bundle、Hub、同步、渠道和 Android/桌面产物 |
| [QwenPaw REA 分解](docs/REA_QWENPAW.md) | Tauri、Ingress、ACL、插件治理和渠道运行证据 |
| [源码链路对照](docs/SOURCE_CHAIN_ANALYSIS.md) | 执行、委派、干预、计量和适配边界 |
| [首版范围](docs/MVP_SCOPE.md) | 最小能力、适配检查、验证与验收 |
| [原创文字线框 V1](docs/LOW_FIDELITY_V1.md) | 任务、调度、调用、成果和接管流程 |
| [图形化低保真评审](docs/GRAPHICAL_LOW_FIDELITY_V1.md) | 18 个画面、截图、浏览器验证与设计边界 |
| [最新公开参考](docs/USER_REFERENCES_2026-11-02.md) | 正确的 Super-agent/Cyrene、视觉反馈与借鉴边界 |
| [UI 迭代日志](docs/UI_ITERATIONS.md) | 用户反馈、本轮改动、检查证据与下一轮优先级 |
| [多版本设计与组合能力评审](docs/DESIGN_CAPABILITY_REVIEW.md) | V1/V2/Lab/真实应用对照，Cindy + OpenMausBot/nanoMuse 能力缺口，持续会话与多端往返验收 |
| [多项目取舍与逐步实施](docs/AGENT_INTEGRATION_ROADMAP.md) | OpenMuse/Cindy/OpenClaw/HarnessWorks 分工、事实归属、六步交付和停止条件 |
| [OpenMuse REA](docs/REA_OPENMUSE.md) | Intelligence 依赖、任务/成果/回执与租约故障研究 |
| [OpenClaw REA](docs/REA_OPENCLAW.md) | 暂定身份、Gateway/Node/渠道/飞书宿主边界 |
| [HarnessWorks REA](docs/REA_HARNESSWORKS.md) | 两候选身份、工程治理与运行时 Harness 的区别 |
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

下一步建议：优先长期 Agent、持续会话与追问新 Run，再验收同一人多端控制。真实 Provider、TLS 远程入口、Safari/真机仍需逐项明确授权；代码沙箱、修改/测试闭环另立阶段，不将静态设计中的能力误报为已经实现。
