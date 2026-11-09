# 下次从这里继续

更新日期：2026-11-09（Asia/Singapore；历史条目原日期保留）。仓库：`/home/my/workspace/ainfra/mywork/mybot`。

**最新真实执行成功（2026-11-09）：** 用户明确“你自己跑吧”后，仅创建一个关联重试 `49acc6c258094a2794b153a6b6629800`，来源 `bd69...`。规划复用，新增调用预算 3、Codex 单通道、单次时限 240 秒。两项研究与汇总均成功，耗时分别 109074/126864/88651 ms，总历时约 5 分 25 秒，3 份成果均待审查。CLI 报告 input 41460/output 9993 tokens；金额未知，不包含来源失败调用。没有再次重试、切换 Provider 或修改来源记录。仍未附加源码快照，输出为分析提案；正文引用了 CLI 自动上下文中的 AGENTS.md，因此不能声称输入严格只有 mybot 可见快照。CLI 无工具 ceiling、隐式上下文、输出 Token 硬上限仍是未验收边界。进度记录已更新，当前无活动 Run；后续不要重复消费这次真实执行授权。

**最新 P0 隔离修复（2026-11-09）：** 针对上述真实 Run 暴露的隐式 `AGENTS.md` 上下文问题，Codex Adapter 现在在临时空 cwd 启动，不进入用户仓库；显式忽略用户配置和规则，禁用项目文档加载、web search 和 shell 环境继承。用户确认的快照仍通过 prompt 发送。181 项 Python 测试、5 视口/11 条浏览器交互通过；没有新的真实模型调用。该隔离降低隐式上下文风险，但不等于完整工具权限 ceiling；下一步进入 OpenMausBot 只读适配前，继续冻结工具/权限合同。

**最新 Phase 3 只读 Adapter（2026-11-09）：** 已新增 `BackendConnection`、`ConversationRef`、`MessageRef`、`ConversationBackendPort`，SQLite 表和只读 API；`OpenMausBotReadOnlyAdapter` 已通过隔离 MockTransport 合同测试，覆盖 GET-only、会话/消息分页、游标、重复 ID 去重、403/404/5xx/schema/revoked 映射。未连接真实账号，不提供发送接口。189 项 Python 测试、5 视口/11 条浏览器交互通过。下一步是固定 fork commit、核对原生只读协议，再接 adapter service。

**最新恢复能力（本轮）：** 已实现“重试与资源”而非直接复用旧 Run。失败/中断/暂停运行可打开重试预览，看到复用步骤、待重试步骤、历史调用和最低新增预算；可重新分配未完成角色模型、预算、并行、单次时限和输出上限。提交会创建 `source_run_id` 关联的新 Run，复制已完成 Agent/Artifact 引用但不计新调用，来源 Run/调用/成果不改写；未知结果需确认，快照变化、密钥缺失、预算不足和活动运行会拒绝。180 项 Python 测试、5 视口/11 条浏览器交互通过。尚未对真实历史 Codex Run 发起重试。

**真实重试观察：** 用户随后创建了 `bd69b087d85b4531837075eac9cbd2de`，来源为 `8bd1...`。规划成功复用，Codex 研究单次 120 秒超时，事件 24、最后白名单类型 `command_execution`、部分正文存在、进程已回收、用量未知；另一个研究保持 pending，汇总未执行。预算和 lineage 正常，不能把它归因于 `max_calls`。该来源快照仍没有显式文件，重复运行不会自动获得项目源码。下一步先补明确文件或切换已验证 Provider，不自动重试未知结果。

**最新 Codex 可靠性优化（本轮最终状态）：** Run `8bd1d79b7cc94f5d8aa518819a362320` 已核对：Planning 约 16 秒成功，首个 Research 在 90 秒超时，第二个 Research 被旧 `TaskGroup` 连带取消，Synthesis 未执行。未重跑该 Run、未改写历史。现已真正顺序调度 Codex 研究，连接测试共用同一 CLI 锁；排队 Agent 不再连带启动/取消。恢复时复用完整研究成果、按未完成步骤计预算。CLI 全路径清理进程/读取任务/临时文件，限制输出、解析合法用量、记录白名单诊断；调用详情可查看。155 项 Python 回归、5 视口/9 条浏览器交互、语法和 diff 检查通过，无新真实模型调用。App Server 草稿最终复核发现协议/能力边界缺口，已撤回生产入口；没有 `WORKBENCH_CODEX_TRANSPORT` 可用配置。下一步门槛见 [CODEX_RELIABILITY_PLAN.md](docs/CODEX_RELIABILITY_PLAN.md)，不可把旧简化夹具当接入验收。

**最新参考：Melaya Agentic Framework：** 用户提供 `melaya.org/zh/product/agentic-framework`。已记录 [REA_MELAYA.md](docs/REA_MELAYA.md) 与 AI_AGENT_WORK 第 9 节。结论：Melaya 的 Pipeline/Step/Tool Scope/HITL/Replay/Evaluation 更贴近可视化智能体目标；公开 SDK/文档与专有 Runtime/Device/Browser Control 分开，不能直接当开源底座。下一步仍是把 mybot 现有固定流程投影为可核查工作图，再做只读会话 UI；本轮无安装、远程 MCP、账号、模型或业务代码改动。

**最新本地 Harness 参考：** 用户给 `https://t3.codes/` 与 `gottaBoy/t3code`。已登记 [REA_T3CODE.md](docs/REA_T3CODE.md) 和调研第 15.2 节：T3 复用本机 CLI 登录态，但 mybot 不读取/复制 Codex credential store；先做只读 binary discovery，显式选择后再考虑 CLI adapter。未安装/运行 T3、未调用模型。

**模型设置 UI 纠偏：** 用户指出 Codex CLI 已发现但模型连接为空。现已记录并调整文案：Harness 与模型连接是两条路径；Codex CLI 显示“已发现，认证未验证”，不伪装成已配置模型；Codex Adapter 需要用户显式启用，不读取本机凭证。

**Codex Adapter 已启用（最小安全版本）：** 模型设置页可显式“启用 Codex Adapter”，保存 `codex_cli` 配置但不调用模型；Run 明确启动时执行 `codex exec --json --ephemeral --sandbox read-only --skip-git-repo-check`，复用 CLI 登录态但不读取/复制 credential store。Python 回归 144 项、浏览器 5 视口/8 交互通过。真实 Codex Run 尚未自动执行，需用户显式选择/确认。

**DDD/设计模式/双语决策：** 用户要求评估 DDD、设计模式、中英文和完成工作项后记录进度。已新增 [ADR-0005](docs/decisions/ADR-0005-modular-domain-architecture.md) 与 [PROGRESS_LOG.md](docs/PROGRESS_LOG.md)：采用模块化单体 + 战术 DDD + 六边形端口适配 + 显式状态机；不做微服务/事件溯源；领域状态使用稳定 code，UI 使用 zh-CN/en-US message keys；每个完成项记录实现、验证、unknown 和下一步。当前本地 Harness 抽取后的 Python 回归 142 项通过。

**swarm-cursors 参考已登记：** `gottaBoy/swarm-cursors` @ `3d49e0ac96172eb6af7ae8229b2152121bed2092`，README 无 LICENSE；只借鉴阶段依赖/回放表达，不复制游标、动画、声音或代码。见 [REA_SWARM_CURSORS.md](docs/REA_SWARM_CURSORS.md) 和进度日志。本轮没有运行扩展。

**最新指定 fork 与网络候选：** 用户给 `juanfont/headscale`、`gottaBoy/OpenMausBot`。fork HEAD `1bc4749aa8307d7d6998bf86de4ef6478460dd93` 与既有研究固定源码相同，parent/source 是 milind-soni；原上游 HEAD 已变为 `86fd0ee…`，不自动升级。后续优先按用户 fork 固定版本研究；npm 35/38 项探针仍是独立产物，不称该 fork 源码运行验收。Headscale 是可选自托管网络控制面，不是同步/Agent/应用权限；新增 REA_HEADSCALE.md 与调研第 15 节。未安装 VPN、注册设备、改路由/DNS/防火墙或启动服务；先只读会话 UI 的实施顺序不变。

**完整分阶段计划：** 用户要求总结目标、方案、拆解任务和 Superagent Harness 本地实现。已新增 [IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md)：Phase 1 本地 Harness/Agent Work 已完成，Phase 2 Harness/Model 正在收敛，下一项是 Phase 3 OpenMausBot fork 只读会话适配；Cindy/Headscale/连接器/代码执行按后置阶段推进。

**随后新增 SDK/工作流参考：** 用户给 OpenAI Agents SDK 中文文档、AIFlowy 介绍、白龙马 daily-hotspot WebP、Cindy multi-harness。已补 AI_AGENT_WORK 第 7 节、调研第 14 节与 SDK/AIFlowy 独立 REA。SDK 是执行库候选，Graphviz 是配置拓扑，不等于真实运行图，tracing 默认启用需另评数据边界；不叠加控制 OMB 同一 Run。AIFlowy 参考流程/版本/测试，不全量引入 Java 产品。已实际下载并查看白龙马图，内容主要心跳/语音/活动日志，不能当热点监控全闭环已验收。Cindy 中国站本轮超时，用国际站与固定 README；未新增业务/API/模型/REA 运行，第一步实现顺序不变。

**最新目标确认与视觉参考：** 用户明确“记录下来，实现 ai agent work 可视化智能体”，随后补白龙马 `bailongma.top/#interface`，询问是否借鉴/Cindy 等更好参考。已记录 [AI_AGENT_WORK.md](docs/AI_AGENT_WORK.md)：接受工作可视化目标，视觉方案仍待评审；建议 Cindy 作日常工作/多端原则参考、白龙马局部活动可见性、OpenMuse 成果/接管、Langfuse 调用下钻。只借鉴原则、不复制 UI；不采隐藏思维链、不默认心跳触发模型。因新参考本轮先评估/记录，没有新增 backend/UI 或启动 Provider。下一步实施授权保留，先现有 Web 的只读 Agent/会话/成果闭环，不新建演示站点。

**最新研究与实施路线：** 用户要求分析 OpenMuse/Cindy/`openclawe`/`harness works` 并说明逐步实现。本轮形成 [AGENT_INTEGRATION_ROADMAP.md](docs/AGENT_INTEGRATION_ROADMAP.md)，新增 OpenMuse/OpenClaw/HarnessWorks 独立 REA 文档与调研第 12 节。OpenMuse 按 CopilotKit/openmuse，openclawe 暂按 OpenClaw；HarnessWorks 有 starter-kit 与文档技能两候选，待用户链接，不混成 DSH。核心建议：OpenMausBot 优先受控复用会话；OpenMuse 借鉴成果/回执，Cindy 借鉴控制连续性，OpenClaw 借鉴渠道/设备，HarnessWorks 用于精简工程验证。下一轮先读适配 + 原创真实会话 UI，再安全发送、多端、一个 IM/资料源、独立授权研发执行、Rust Node。未安装/启动这些新项目、未执行技能或 REA、未改业务或界面；142 项回归是上一轮，不声称本轮重跑。

**最新用户反馈与方向评审：** 用户认为“没有达到效果”，要求分析 design 多版本能否形成 Cindy + OpenMausBot/nanoMuse 能力。已形成 [多版本设计与组合能力评审](docs/DESIGN_CAPABILITY_REVIEW.md)。结论：能演进，但现在没有做到；V1 偏后台，V2 有可复用的工作记录/成果结构但缺长期 Agent 与持续会话，Runtime Lab 是开发诊断，不是应继续强化的产品首页。下一轮建议优先在真实 `web/` + `workbench/` 做“长期 Agent、持续会话、追问新 Run”，再验收同一人多端控制；应用连接器、Rust Node/执行迁移分期。用户尚未确认新视觉/信息架构，不宣布 V2 定版，不新增独立演示站点。本轮为文档/源码/已有截图评审，无模型、账号、上游运行或新浏览器测试。

**随后能力澄清：** 用户问“OpenMausBot 能力已经有了吗”。上游已有 Bot/会话/手机共享工作区与执行/应用机制，mybot 尚未接入。应优先验证复用，不默认全部重写。固定快照 `docs/mcp-server.md` 还提供 Bot/任务、会话读取、发送、等待/中断等团队控制接口，不能把受限 Bot API 当成唯一接入路径；MCP 不提供审批授权，仍需宿主 ceiling、身份、事件与恢复验收。本轮只复核文档，未运行 MCP/CLI 任务。见调研第 11 节和更新后的 REA_OPENMAUSBOT.md。

**MCP/会话复用探针已完成（2026-11-08）：** 固定发布包 + 原有 deny-all guard + 合成 ACP，v1 35 项、v2 保存默认模型对照 38 项通过。[完整结果与复现](docs/OPENMAUSBOT_MCP_REUSE_RESULTS.md)。确认原生 stdio 工具清单、真实上游 handler 的 Bot/Task/持续消息、去重/等待/中断/失败/持久化与合成配对/撤销。handler HTTP 由研究 bridge 注入，非原生网络端到端；无真实模型/工具/账号。v1 观察到自动连接检查，v2 保存模型后在启动/实例读取/干净重启均无额外 prompt，但任务失败恢复仍有内部上下文/辅助请求。所有调用需计量，`settled` 不等于成功。REA 两份 evidence 和 unknown 保留；仍不采用为底座、未接业务/UI。

**此前可预览交付（已收到负面反馈）：** 用户要求继续并能预览，已新增独立 [Runtime Lab](design/runtime-lab/index.html)：Codex/Pi/DSH 三组协议形状夹具、五种 mock 场景、取消/事件检查/导出、能力与证据视图。纯本地文件可打开，不需要新服务，不连接模型/账号或生产 API；DSH 为示意 envelope，不声称上游兼容。历史记录为 6 视口/13 浏览器交互、24 项 Node 状态机测试通过，REA process capture 已保存；Python 回归 115 项通过。本轮没有重跑。说明与截图见 [RUNTIME_LAB_PREVIEW.md](docs/RUNTIME_LAB_PREVIEW.md)。这不是 RuntimeAdapter 上线，更不是用户已接受的产品方向，V1/V2/真实 `web/` 都保留。

**最新参考补充（2026-11-08）：** 用户要求考虑 Pi、Harness、`https://gitee.com/HuLaSpark/HuLa`。已核对固定快照并补 [PI_HARNESS_HULA.md](docs/PI_HARNESS_HULA.md)、三个独立 REA 分解和调研第 10 节。Pi 按 Pi Coding Agent 理解，本身就是 Harness；此前 DeepSeek Harness 作为另一候选，非必需叠加层。HuLa 是多端 IM/Tauri/Rust/Vue/TS 参考，README 的 Web 暂不支持；不当 Agent 内核，不复制 UI。P1 建议先定义可替换 RuntimeAdapter，同合同比较 Codex/Pi/DSH；Codex 连通不等于唯一底座。仅静态研究，无新安装、运行/REA 或模型调用。

**最新账号验证：** 用户明确同意沿用本机已登录 Codex 做 1 次最小文本测试。官方状态命令显示 API Key 登录，不是 ChatGPT 订阅。已完成单个 `turn/start`，返回 `MYBOT_ACCOUNT_OK`，无工具事件，CLI 可见 input 2707/output 8，客户端已退出；无凭证导出、无项目文件附加、无 OpenMausBot 真实账号接入。见 [CODEX_ACCOUNT_SMOKE.md](docs/CODEX_ACCOUNT_SMOKE.md) 与脱敏报告。本次“一次”授权已用完，后续真实调用须重新明确确认；不把本机配置名或 tokens 当供应商/模型身份或账单认证。

最新回归：142 项 Python 测试通过（此前 115 + 新增 MCP 探针离线测试 27），另 24 项 Node 夹具测试通过；原 Starlette/httpx 弃用提醒保留。pytest 不启动上游或重跑真实模型，35/38 项上游运行探针另经 REA 留证，不混算。

**最新阶段：用户已说“好的，开始实现吧”，不要恢复成仅设计阶段。** 只读研发调研应用已实现于 `workbench/`、`web/`，具体边界见 [ADR-0004](docs/decisions/ADR-0004-implementation-slice.md) 和 [实现状态](docs/IMPLEMENTATION_STATUS.md)。静态设计继续保留，不是业务数据源。

**2026-11-07 最新方向：** 用户要求先用 REA 搞清楚 OpenMausBot、Cindy、nanoMuse、QwenPaw，再决定能力借鉴和迭代。已新增 [多端 Agent 与应用能力方案](docs/MULTI_DEVICE_AGENT_PLAN.md)、[开源借鉴与迭代台账](docs/OPEN_SOURCE_ADOPTION_MAP.md) 和 [REA 项目分解索引](docs/REA_PROJECT_BREAKDOWNS.md)，四个项目各有独立 REA 工具分解文档。建议先隔离验收 OpenMausBot P0/P1，不能因为启动成功就替换 mybot；随后按模块吸收 Cindy 的设备协议、nanoMuse 的同步/渠道、QwenPaw 的渠道/插件能力。Cindy 官方开源页进一步确认：公开客户端/共享包与独立服务端分离，企业 Gateway 是候补路径，不应当作当前可直接替换的私有底座。REA 只用于发布包/运行时等适合场景，完整源码仓库仍用常规源码分析。

**权限实测：** [OpenMausBot P0](docs/OPENMAUSBOT_P0_RESULTS.md) 启动可行，但初始 Bot 为 Full，service 信任不等于执行只读。权限 v4 补测确认：Ask 创建模板可被 `settings.approvalMode=full` 覆盖，也可用 `useDefaults=false` 跳过。v3 “拦住显式 Full”因探针把字段放在顶层而误判，已撤回，旧 Evidence 保留。31 项上游纯函数验证、66 项本地只读 ceiling 合同通过；后者只是内存 fixture，未接入生产。最新 REA Evidence 在 `tests/research/evidence/permissions-v4/`。该 P0 阶段无模型/工具调用，后续单次真实 CLI 文本验证另见上文，两类证据不混用。

本轮回归：全部 Python 测试 104 项通过（既有 38 + 研究合同 66），保留 Starlette/httpx 弃用提醒；REA 最终报告 hash 对照一致。不要把“观察上游 Full 行为符合预期”的测试通过当成只读门槛通过。

## 1. 最新目标

面向研发团队的 AI 工作台，先单人试点。

用户希望通过 Super-agent / Subagent 把工作分配给适合的模型，追踪每个 Agent、模型和工具调用，具备好用、原创的界面，以及可视化、审计和运行分析。

**视觉约束：用户明确否定 V1“太丑了，不高级”。不要继续把 V1 作为推荐方案或只作轻微美化。** 当前真实界面延续原创 V2 石墨色工作区，不代表用户已最终认可视觉。

用户新指定参考：`gottaBoy/dsh-superagent-prototype`、`Playa-Cyrene/Cyrene-Agent`、AgentsPulse Super-agent 架构教程，以及微信文章。身份、commit、已读资料和视觉边界见 [USER_REFERENCES_2026-11-02.md](docs/USER_REFERENCES_2026-11-02.md)。

注意：用户先说“先个人”，后明确“主要用于研发团队”。最新含义是团队产品、单人试点，不要再退回通用个人助手，也不要立即堆完整企业平台。

## 2. 不可丢失的约束

- 实现授权已覆盖此前“只做设计”的阶段限制；本轮仅做单用户只读调研，不自动扩到代码写入和部署。
- UI 全新设计，不借鉴 `/home/my/workspace/ainfra` 下任何项目的视觉、布局或交互。
- 可以参考用户指定的公开产品风格与能力，不复制品牌、角色图或整套页面。此项不解除本地 UI 禁借鉴要求。
- 可以分析公开开源产品的能力与架构，不复制界面。
- 本地项目仅作可选后端能力；存在源码不代表已验证或已接入。
- 多 Agent 按需使用；角色不等于模型，不强制全部角色参与。
- 追踪、可视化和分析不能只做动画或聊天历史。
- 不展示模型内部思维链；只保存明确选择并确认发送的上下文和模型正文，不采集隐藏资料或凭证。
- 暂停/取消/恢复需真实语义，有副作用的操作不能盲目重试。

## 3. 当前实际状态

当前实现：

- FastAPI + SQLite + 一个后台 Worker；无前端构建依赖，不强制 GPU。
- 真实项目、模型配置、任务、发送快照与 hash 校验、调用/时间上限。
- Super-agent 生成 1–2 个受限研究任务，最多两个并行，汇总角色生成最终方案；各角色可选不同模型。
- 运行、Agent、逐模型调用、用量/缺失、时间、尝试、成果、事件和人工审查持久化。
- 阶段边界暂停、请求取消、失败/中断后确认续跑；不自动重试、回退或重放已完成阶段。
- 默认本机访问，远程令牌/Host/Origin 边界；模型密钥仅引用专用环境变量。
- 响应式真实 UI，手机工作/成果切换、模型表单、登录/退出；不提供原生 App 或离线模式。
- 38 项后端测试通过；浏览器实际结果以 `tests/evidence/browser.json` 为准，测试不发送外部模型请求。
- 真实模型、GPU 服务、Safari 和真机未验收；没有执行代码修改、Shell、测试命令或部署的 Agent 能力。

本机启动：`.venv/bin/python -m workbench --host 127.0.0.1 --port 4180`。若端口占用先检查现有进程，不要再开多个服务竞争同一数据目录。正式运行数据位于 Git 忽略的 `.runtime/`。

本轮已启动 `http://127.0.0.1:4180`，`/healthz` 正常，Bootstrap 的项目/模型/任务/运行为零；真实应用手机导航也已检查。服务是否仍在线以下次实际端口检查为准。仅本机监听，未开放手机远程访问或 TLS 代理。

此前设计与研究记录（保留历史）：

- 产品定位纠偏与两份决策记录。
- 能力地图、六条用户旅程、界面文字规格。
- 任务依赖图、Agent 委派树、调用时间线的设计提案。
- 本地能力候选的阅读记录，加入 Artifact Keeper。
- OpenHands/SDK、OpenBot、OpenMuse 的官方资料与部分代表源码阅读。
- 记录上游 commit、已读文件、初步结论、证据等级与研究缺口。
- 将已撤回旧方案移入 `docs/archive/`。
- 第一轮有边界的源码链路对照，记录 H1-H6、B1-B8、M1-M5 证据与适配影响。
- 首版范围 P01-P10、执行器能力检查、两种模型配置的验收边界。
- 原创文字线框 V1：工作台、项目、任务、调度、调用、成果和审批/恢复。
- 原创图形化低保真 `design/review-v1/index.html`：18 个静态画面，支持本地文件打开，不需要开发服务。
- 6 个视口的浏览器检查、5 条设计导航/状态检查和 16 张选定截图，实际结果在 `design/review-v1/evidence/verification.json`。
- 用户要求代码提交 Git；本轮基线提交范围为设计稿、文档和验证证据，不推送远端。下次使用 `git log -1 --oneline` 检查实际提交。
- 用户对 V1 的负面评审已记录；V1 的技术检查通过不等于视觉被接受。
- 新参考已核对：gottaBoy 是 DeepSeek 官方 fork，本次 HEAD 相同；用户最后指定的 Cyrene 是 Playa-Cyrene/Cyrene-Agent，不能与 Yongchu-Yitao/Cyrene 混用。
- V2 曾在收到参考后暂停；现已重做任务与调用重点画面，并新增 `studio.css`，原始样式文件已恢复保留。
- V2 默认打开任务，桌面工作记录与代码/验证并列，手机使用面板切换；调用筛选和页签是可用的静态交互。
- 新增 V2 浏览器检查和截图，实际结果见 `design/review-v2/evidence/verification.json`；不代表用户已认可。
- 用户要求不断迭代、加强 UI 体验。反馈与下轮优先级保存在 `docs/UI_ITERATIONS.md`。
- 本轮用户要求 Super-agent、Control Panel，并要求继续改善排版、操作与风格，完成后提交。
- 已新增任务协调、Control Panel、本地配置差异三个画面。当前共 21 个画面、6 视口（126 项渲染）与 14 条交互；实际结果见 V2 evidence/verification.json。
- 模型/资源草稿可本地编辑、校验、预览、撤销；不写历史运行，刷新重置，真实应用禁用。
- 当前文档内导航保留调用筛选、成果/手机面板、展开状态与滚动位置，不承诺刷新或跨设备恢复。
- 2026-11-03：新增 `plan` / `plan-review`，从失败证据修订下一次计划，不再用普通新任务替代修改流程。目标、验收、两步交付和原因可编辑，人工审查固定保留，提交禁用。
- 模型配置有检查弹窗，所有连接/能力明确未验证，切换远程样例配置提示资料发送边界；这是本地草稿，不是真实 Provider 信息。
- 本轮静态矩阵扩大为 23 画面、6 视口（138 项）与 19 条交互。实际结果看 V2 verification.json，详见 `docs/PLAN_REVISION_FLOW.md`。

尚未完成：

- OpenMausBot P0 已有受控启动/元数据证据，不再只有静态分析；默认 Full 与可跳过/覆盖模板均不满足只读底座门槛。P1 模型/工具、Bot API、Chief 实际委派、SSE/运行中恢复、配对、自托管完整性和许可验收未完成。
- Cindy、nanoMuse、QwenPaw 的逐模块 REA/源码对照和真实连接器 POC 未完成；当前台账是候选借鉴，不是已接入。
- 四份 REA 工具分解已准备，但 Cindy/nanoMuse/QwenPaw 的官方发布包或授权运行目标尚未取得；当前对应文档中的 REA 命令是待执行步骤，不是已完成运行证据。
- 三个开源项目的完整安全审计和运行故障验证；不把本轮静态节选阅读当作完整审计。
- 能力和用户旅程的正式评审。
- 图形化低保真的用户评审、最终原创视觉定版和真实可用性验证。
- 真实 Provider 兼容性、代码执行器、写入门禁和沙箱；本轮已有后端/数据库/协议适配器，不把未验收项等同全部未实现。
- 上游完整部署、真实 Agent 任务和业务账号 POC；P0 仅空环境启动/配置探针，不覆盖这些验收。

`prototype/` 是未采用的早期静态草图，保留但不作为当前界面或工程起点。当前阶段可以启动本机真实应用；不要用 FakeProvider 测试服务器冒充用户环境。

`design/review-v1/` 是被用户否定的低保真，不是当前视觉基线。`design/review-v2/` 是保留的视觉与交互提案，23 个静态画面未接业务；所有样例都未真实执行。`web/` 才是真实应用入口。

## 4. 推荐阅读顺序

1. [实现 ADR-0004](docs/decisions/ADR-0004-implementation-slice.md)、[实现状态](docs/IMPLEMENTATION_STATUS.md) 和 [启动方式](README.md)。
2. [UI 迭代日志](docs/UI_ITERATIONS.md)、`web/`、`workbench/` 和 [测试说明](tests/README.md)。
   最新工作流评审先读 [多版本设计与组合能力](docs/DESIGN_CAPABILITY_REVIEW.md)，不要按旧 Lab 后续顺序继续叠加技术演示。
3. [现代研发工作台定义](docs/MODERN_RND_WORKBENCH.md) 和 [定位 ADR-0002](docs/decisions/ADR-0002-rnd-team-single-user-pilot.md)。
4. [源码链路对照](docs/SOURCE_CHAIN_ANALYSIS.md)、[首版长期范围](docs/MVP_SCOPE.md)，必要时回看开源调研。
5. [V2 静态预览](design/review-v2/index.html)、[计划修订设计](docs/PLAN_REVISION_FLOW.md)；未实现设计不得与真实能力混用。
6. [执行计划](docs/EXECUTION_PLAN.md) 与原有产品/设计文档，按具体任务阅读，不重新开始无限调研。

`docs/archive/` 和 ADR-0001 中被 ADR-0002 修订的个人产品定位不是当前默认方案。

## 5. 下一次具体步骤

产品目标/最新视觉边界先读 [AI_AGENT_WORK.md](docs/AI_AGENT_WORK.md)。用户新增白龙马参考不等于批准全套监控风格或自动心跳 Agent；不能把官网截图当本地执行证据。Cindy 中国站本轮抓取超时，参考来自官方国际站展示与固定源码。

最新具体路线以 [AGENT_INTEGRATION_ROADMAP.md](docs/AGENT_INTEGRATION_ROADMAP.md) 第 5、7 节为准。先交付只读 BackendConnection/ConversationRef、OpenMausBot 适配合同与现有 Web 的真实 Agent/会话列表；不新增 Lab、不自动扫描服务/账号、不静默降为 fixture。生产发送待权限/全调用预算和原生接口门槛成立；若上游门槛未通过，先测试夹具/只读接口，不为读页面自动启动可能发模型检查的上游。

用户已经反馈未达到效果。下一步以 [多版本评审](docs/DESIGN_CAPABILITY_REVIEW.md) 第 8、9 节为准：先比较并验证复用 OpenMausBot Bot/会话/工作控制的路径，完成持续工作闭环，再做同一人多端控制验收；不要未经比较就重写这些现成功能。保留 V2 可复用结构，但不宣布其视觉被接受；Runtime Lab 仅留作开发诊断候选，不再作为产品首页或新一轮主体验。当前只读权限、显式模型确认与单事实源不变。

多端必须区分控制端切换、内容同步、执行迁移与人工接管。当前 Agent 是 Run 内实例、没有 Conversation/Message；两个浏览器能访问同一 Run 不等于已验证手机接续。OpenMausBot 执行器验收不应阻塞会话产品增量；下面 P1 的安全任务是执行器采用支线，不覆盖最新用户工作流优先级。

1. 检查 `git status` / `git log -1` 和本机 4180 端口，核对当前服务与提交，不重复安装或新建架构。
   Codex 可靠性支线已完成 exec 调度/清理/诊断修复；长驻通道仍未接入。按 `docs/CODEX_RELIABILITY_PLAN.md` 的 A–G 门槛推进，不设置不存在的传输开关，不重跑 `8bd1...` 或把未知结果自动迁移到新通道。
   已完成一次 OpenMausBot MCP/会话复用 P1 研究；不要把该 fixture 结果接入生产，也不要重复使用同一 evidence 输出目录。
   若继续 P1，先读 Pi/Harness/HuLa 分层修订，冻结最小 RuntimeAdapter 的公共事件/权限/取消语义；Codex、Pi、DSH 以同一无工具/mock 合同比较，不并行叠加运行。HuLa 多端壳另做专项，不替换现有原创 Web。
2. 先读 `OPENMAUSBOT_PERMISSION_RESEARCH.md` 的 v4 修正，不再把创建模板当上限。下一轮设计独立宿主 ceiling、grant 生命周期和执行器管理口/网络隔离；当前合同只有内存 fixture，不能说强制落实到上游。
3. P1 先设计只允许专用本地 mock 的网络策略；当前 `tests/research/guard.py` 拒绝全部出站，不能为了模型测试随意关掉。只有 P0/P1 门槛通过才评审接入适配器；mybot 控制中心始终保留。
4. 原有真实 Provider、Safari/真机和只读应用验收仍按下方历史顺序进行；不把新方案当成已实现。

下面 N1–N4 是设计阶段的步骤与发现，保留作为来源，不覆盖本节的实现阶段顺序。

### N1：已完成第一轮有边界的源码对照

用“给现有仓库修改一项功能并验证”的相同样例，追踪：

输入 -> 任务/会话 -> 委派 -> 模型 -> 工具 -> 事件 -> 审批/失败/取消/恢复 -> 成果 -> UI。

OpenHands 优先看会话事件、Agent Server、工作区和用量；OpenBot 优先看 work loop、handoff、policy 与 audit；OpenMuse 优先看真实模型路径、Worker、预览与干预。

本轮已完成代表路径的静态对照，结果见 SOURCE_CHAIN_ANALYSIS.md，不是三个产品中实际执行过相同任务。缺口留给明确的后续核验；不要重新开始无限扩展的资料收集。

### N2：已提出首版范围，待评审

确认项目上下文、任务与多 Agent 执行、工具环境、追踪、成果质量、人工控制、分析七个能力域。

首版范围已写入 MVP_SCOPE.md。共享访问开启前具备身份、项目访问与凭证边界。先评审 P01-P10，不将全部长期能力变成首版依赖。

### N3：V1 视觉被否定，按用户参考重做 V2

本轮已形成石墨色双栏任务工作区和调用检查提案，不复制角色插画或陪伴功能。代码和测试可切换，手机有面板与列表替代。默认折叠原始目标，优先展示协作与问题；调用可按全部、失败、模型、工具筛选。

已补 Super-agent 与 Control Panel，在任务内有协调页签，标题旁控制图标可进面板。Control Panel 作用于下一次运行草稿，不是全局管理员权限界面。表单操作栏曾遮挡输入，已撤回吸底，新增实际遮挡检测。

计划修订、模型检查和数据范围提示已形成静态流程。下一轮先评审编辑密度与影响预览，再设计调用到精确步骤/成果的定位、长记录检索和草稿汇总。其余页面虽做渲染回归，不代表全部体验已打磨完成。

用户曾担心大量删除：当时只是 V2 旧 CSS 在中断时暂缺，已经从本仓库提交恢复，改为新增 `studio.css`。不要再先删整个样式文件，也不要误称删过业务模块。

微信原文无法读取，未判断其风格。AgentsPulse 教程能读，但技术结论回到一手源码；原文截图可以请求，不能假装已读。

### 本轮工具与验证

- 设计文件可通过 file URL 打开，不启动服务器。
- 设计阶段使用临时目录中的 Playwright 1.56.1 和独立 Chrome；实现阶段已安装 `.venv` 和锁定的 Python 依赖，运行测试说明另见 `tests/README.md`。
- 本地图标来自 Lucide Static 0.468.0，保留原始许可。
- 用户问到 ego(lite)：本轮不需要，未来真实浏览器任务再评估。官方仓库与范围见 ADR-0003。
- 检查通过以 evidence/verification.json 为准；没有模型/工具执行或上游部署验收。

### 本轮不能丢失的发现

- OpenHands 本地 delegate 路径使用父工作目录；子 Agent 不天然具有独立工作区。
- 子会话确认策略、确认回调和工作台人工审批不能混为一谈，接入前要验证。
- 父级统计可能包含子级累计，不能在分析页重复汇总。
- 租约与 CAS 不等于外部动作恰好执行一次，取消也不等于撤销。
- 模型宣布完成、测试通过和人工接受是三条事实轴。
- 执行器缺失计量、暂停或隔离能力时须显示降级，不能用 UI 补造事实。

### N4：只读 POC 已进入实现，代码执行仍后置

首条调研闭环已实现，验收使用测试 Provider；代码修改/测试和外部执行器仍未接入。不要直接拼接三套平台或将固定阶段编排宣称为 DeepSeek Harness 接入。

## 6. 后续执行器候选，不是已集成能力

自定义研发产品域、原创 UI、统一事件与审计；优先评估 OpenHands SDK/Agent Server 的执行能力，研究 OpenBot 的能力边界和 OpenMuse 的可见执行体验。

当前只读实现已选 FastAPI、SQLite 与 Chat Completions 适配器。后续代码执行器及其许可证仍待专项验证，不能把之前提过的 Next.js/Vue、LangGraph、Temporal、AG-UI、A2A 等全部变成硬依赖。

## 7. 本地项目与安全

- `../agent-delivery-platform`：后端工作流、审批与 DAG 候选。
- `../my-ai-swarm`：本地执行与 worktree 候选。
- `../artifact-keeper`：后续镜像/软件包/扫描候选。
- `../mattermost`：后续通知和审批渠道。
- `../aibiz`：不复用 UI 或运行时。

不要读取兄弟项目 `.env`、数据库目录、运行凭证或日志中的秘密。允许启动本机工作台与隔离测试；没有自动调用真实模型、启动外部基础服务或执行生产动作的授权。

## 8. 对下次会话的最短交接

> 先读 CONTINUE.md、ADR-0004、IMPLEMENTATION_STATUS.md 和 README。用户已授权实现，真实只读应用在 workbench/ 与 web/，SQLite 保存任务/运行/调用/成果/事件；静态 V2 保留且不接真实数据。使用测试 Provider 验证了闭环，没有真实付费请求。浏览器尺寸检查不等于 Safari/真机验收。下一步先明确授权验收一个真实 Provider，再迭代手机与追踪体验；代码写入、Shell、部署和团队权限尚未实现。不删除整份样式，记得提交和更新交接。

> 2026-11-07 补充：用户要求通过 REA 研究 OpenMausBot、Cindy、nanoMuse、QwenPaw，并询问是否先跑通 OpenMausBot。已记录结论：可以先跑隔离 POC，但不直接替换 mybot；默认 Full access、Bot API 工具边界、企业许可和自托管依赖是硬门槛。继续前读 `docs/MULTI_DEVICE_AGENT_PLAN.md`、`docs/OPEN_SOURCE_ADOPTION_MAP.md`，按 M01-M16 记录来源、机制、本地设计、测试、unknown 和采用/淘汰决策。

> P0 已执行并经 REA process capture 留存：启动/元数据可用，默认 Full 门槛未通过；Ask 可手动设置并持久，但不等于全局强制策略。测试服务已停止，无业务账号/模型/工具调用。下一步先研究 Ask-first，再设计专用本地 mock 的 P1，不直接接入或重写 mybot。

> 权限研究增补（以 v4 为准）：31 项上游纯函数、66 项本地只读契约通过；`settings.approvalMode=full` 和跳过模板均可得到 Full，顶层字段无效。v3 的“模板拦住 Full”已撤回。Ask 仍允许 saved command/tool/own-file grants。mybot 必须独立维护 capability ceiling，尚未接入生产。

> 最新账号验证已单独调用过一次真实 CLI 文本请求，不再把历史 P0 的“无真实模型请求”概括成整个项目的最新状态。该授权已使用完毕；继续设计/REA/离线测试不能自动再发模型请求。OpenMausBot、工作台真实 Provider 兼容验收仍未完成。

> 最新反馈：用户认为多个设计未达到 Cindy + OpenMausBot/nanoMuse 的效果。先读 DESIGN_CAPABILITY_REVIEW.md；不要再默认迭代 Runtime Lab。建议真实应用先做长期 Agent/持续会话，再做多端同一工作控制和应用连接；执行迁移、Rust Node、GUI 是后续独立能力。本轮只评审和记录，没有新增实现/运行证据。

> 最新进展（2026-11-08）：OpenMausBot 复用探针 v1 35 项、v2 38 项通过；真实发布包 + 合成 ACP，未接业务/UI。先读 OPENMAUSBOT_MCP_REUSE_RESULTS.md。后台 AI checks 默认可能发送探测提示，保存模型的对照已避免启动/干净重启额外提示；不把这个配置当调用授权/预算强制门禁。下一步先受控读取 Bot/会话并映射状态，发送仍受全部调用预算、隔离和原生接口验收约束。
