# 实现进度与平台范围

更新日期：2026-11-21。

**当前交付：目标与任务工作区初版（ADR-0021）。** 新建/搜索/列表/Inspector/Inbox进入
稳定Task route；目标验收、Agent执行、成果审查在同一Task上下文，显式Arrange沿原确认流程，
新Run保持Task上下文。不是持续会话、任意Workflow或Cindy多端控制完成。
1683前端/996Python/build、37生产专项/58综合/6主入口检查通过，73最终PNG。
主4180已备份/空闲核查/原记录对比后更新为PID3356362，5173实际加载新读取能力；
原1Project/1Task/6Run及所有原行不变，主验收GET-only无模型调用。
见[交付与启用证据](../frontend/evidence/task-workspace-2026-11-21/README.md)和
[当前产品任务](PRODUCT_GOALS_CURRENT.md)。下一批持续会话/下一轮Run，再固定Workflow版本。
以下是历史分批记录，“未加载/legacy”和旧测试数不代表当前启用状态。

最新切片IZ-07.3b1全局计数/快速查找本地验收完成。明确workspace_counts/workspace_search
能力才采用新读；Task最新态与Run全历史计数分开，未知不伪0，失败显式GET重试。
未知活跃数保守检查后台状态，已失败计数不自动重放。Quick find用同一Astryx树，
本地导航与远程最小引用分离；旧乐观选项按generation阻止click/Enter，错误不回退Bootstrap，
截断显示returned/total，旧RunID可从全历史搜索。
1054前端（41文件）/639Python/typecheck/build通过，搜索32/计数15/真实API6/综合58/详情40，
81PNG，无pageerror。[ADR-0014](decisions/ADR-0014-workspace-counts-search.md)及
[验收](../frontend/evidence/workspace-reads-2026-11-18/README.md)保留失败与最后构建证据。
项目引用目录/逐项目徽标、其他全量消费者与Bootstrap协商减量仍待，07.3/04及119计数不变。
4180未更新、两新cap未advertise；5173开发入口已恢复，临时4187/5176已停。
无真实模型/凭证/正式数据写入或部署；实际提交/push以git log及origin/main为准。

最新完成IZ-07.3a本地验收：新增按需任务详情与分页历史合同，Inspector选中后读取，
Task/最小Project/latestRun/attempts及历史页在同一只读SQLite快照内返回。
明确task_detail=true才采用，旧能力缺失保留原路径，声明能力后错误不读Bootstrap兜底。
客户端复用严格Task投影，历史与列表分页独立；不同任务identity重挂并从第1页，
跨桌面/手机布局切换也会回历史第1页，任务选择保留。
943前端（39文件）/562Python/typecheck/build通过，详情40/真实API6/查询35/综合58项通过，
77最终PNG已归档。键盘ARIA禁用与异步reload断言失败已保留并在修复后重跑通过。
合同见[ADR-0013](decisions/ADR-0013-on-demand-task-detail.md)；Bootstrap未减量，
全局查找、计数与其他视图迁移单列下一切片，不关闭IZ-07.3/04或原119台账。
证据：[按需详情](../frontend/evidence/task-detail-2026-11-17/README.md)。
上批`f917608`已在main/origin/main，本批按独立提交交付，以git实际回执为准。
主4180未重启，task_query/task_detail均未advertise；已启动原本停止的5173并核验200，
该入口继续legacy读取。临时4187/5176已停，没有真实Provider或正式DB写入。

上批切片：IZ-07.2严格查询client与Astryx任务表接入已完成所列本地验收并归档。
只有Bootstrap明确task_query=true才启用新路径；缺能力保留legacy，已声明但404/503或
异常2xx是失败而非本地回退。query-key隔离/Abort丢弃旧读；草稿不请求；server页保序，
不二次排序/切片，clamped page不覆盖请求URL。文字命中、计数和顺序以server为权威，
不因JS/Python不同Unicode映射在browser重算准入；有限共享样例不是全Unicode证明。
Bootstrap显式刷新成功推进refreshRevision；poll只使ready页失效，不取消loading或重试
error/403/404，请求不再依赖data identity；8s慢查询跨6s poll只1GET、403后真实poll不重试已通过。
合同：[ADR-0012](decisions/ADR-0012-task-query-client-admission.md)。
最终870前端（38文件）/499Python/typecheck/build通过；稳定生产构建专项35项/6PNG、
实际API6项/2PNG、高级30项/24PNG、综合58项/60PNG通过，共92PNG、无pageerror。
首轮非空fixture在fresh guard停止，保留失败后改只读确认空库的fixture.OaPiOM完成最终综合。
证据：[本批目录](../frontend/evidence/server-pagination-2026-11-17/README.md)；已提交并push为`f917608`。
Bootstrap、Quick find、侧栏计数和Inspector历史仍全量，IZ-07.3/04仍待推进，
没有整链传输/性能提升结论。原4180/5173未重启，新能力未在主backend启用，主入口走legacy；
保存视图保持已启用。119总/9完成/110未完全完成不变，无真实Provider/凭证/正式DB写入或权限提升。
临时4187/5176验收服务已停止；既有大包及Starlette/httpx警告保留。

上轮开发切片：IZ-07.1服务端任务查询API本地完成，复用严格查询/排序定义，支持OR/AND、
固定scope、最新Run分类、最多3层排序、真实计数与20/50/100分页；单次只读SQLite快照，
成功/失败均关闭连接，无新依赖或Provider请求。477项后端通过（71新增），2k/20k隔离
测量见[任务查询证据](evidence/task-query-2026-11-16/README.md)及
[ADR-0011](decisions/ADR-0011-server-task-query.md)。
前端仍使用Bootstrap，新API排序未与Intl.Collator等同；新路由尚未在当前4180加载，
不得宣称IZ-07全部完成或界面已提速。后续client/页面接入、Bootstrap/详情减量与规模验收分开。
已完成累计成果基线`f9e5484`已push，后续按用户要求逐项验证、记录、提交push。

最新主服务状态：用户确认后，4180已一致备份并在空闲状态受控更新，保存视图目录实际200；
原1项目/1任务/6运行/1模型及其余历史原记录经迁移副本和前后比较均不变。
新后端PID2064113，5173前端未重启；桌面/手机真实只读5项通过，没有添加主数据或发模型/
运行请求。证据：[主服务启用](../frontend/evidence/local-activation-2026-11-16/README.md)。
下一包IZ-07服务端查询/排序/计数/分页，原119/110计数不变。

此前：IZ-06保存视图完成本地合同验收，覆盖真实API/SQLite、已提交快照、分作用域、
CAS/丢响应/另存/删除、dirty保护和中英文手机。修复实际错误码、非JSON401、初始化
URL订阅缺口，以及长反馈挤断手机标题/分页截断。794前端、406Python、构建与生产
32/8/58/26/9项通过，116PNG无pageerror；见
[保存视图证据](../frontend/evidence/saved-views-2026-11-16/README.md)、
[ADR-0010](decisions/ADR-0010-private-saved-views.md)。
当时原4180/5173未重启、接口404，现已由上方独立确认/备份/启用取代；
[SAVED_VIEWS_ACTIVATION](SAVED_VIEWS_ACTIVATION.md)保留下一次更新的安全门槛。
没有新增团队共享、连接器、多端接力或执行权限；原119/110统计不变。

上轮可见整改：工作台/共享项目任务页已重排两级页头、一行查询、独立结果工具带，
列设置固定在表格右上（含打开详情时）；手机用Astryx Selector切换Basic/JQL，
详情按项目/编号、状态/入口、目标、验收、文件和历史分区。1440搜索135.3→484.3px，
390搜索114.3→202px；合成数据前后对照与781项单测、生产26/58/30/15/16/10项报告见
[本轮证据](../frontend/evidence/visible-workbench-2026-11-15/README.md)。视觉尚未获用户接受。
IZ-05内存连续性修复已最终复测；IZ-06专项/原后端启用、服务端分页仍未完成。
原4180/5173未重启，无新执行能力、真实模型或正式数据写入；已有构建警告保留。

此前结果：现有项目/状态字段目录和多选OR/AND、7列顺序、最多3层任务表排序已本地完成。
移动Filters有可见候选与Search；新JSON URL参数兼容旧单值，非法结构/不可用项目明确拒绝。
634项前端、typecheck/build及58/15/16/30/9/9生产浏览器报告通过，111生产截图；
独立设置6类/2截图。证据：[高级查询与表格](../frontend/evidence/advanced-workbench-2026-11-15/README.md)，
合同：[ADR-0009](decisions/ADR-0009-structured-list-conditions-and-sorting.md)。
新Task排序不外推运行历史；后端未改、Python未重跑。IZ-05/06/07和执行/设备/连接器仍待办。

此前结果：IZ-02/03的Basic三字段草稿第一切片已验。主行项目/状态/文本一次提交，
侧栏即时字段与未提交候选分开；Back/Forward整份恢复，Clear留在原查询行。
452项前端、TypeScript/构建、综合/草稿/项目/导航/真实API恢复58/15/16/9/9项通过，
87截图无pageerror；[本批证据](../frontend/evidence/query-drafts-2026-11-15/README.md)。
后端未改且本批未重跑Python；字段目录/条件多选/完整JQL/保存视图仍未实现。

此前结果：WUI-01/06/11多Agent收尾已通过本地验收，UI原13项均在已测试合同范围内完成；
不等于全部后续UI、用户视觉接受或完整产品完成。418项前端、306项Python、生产构建、
四份浏览器报告57/16/9/9项通过，78截图，无pageerror。
证据：[11月15日验收](../frontend/evidence/ui-closeout-2026-11-15/README.md)。
项目查询专项验证固定scope、分页与history；恢复改用服务端prepared意图/原子精确回执；
受管同文档导航改为共享事务，Chrome已验连续/插队Back和刷新。
合同及限制见[ADR-0007](decisions/ADR-0007-durable-recovery-intents.md)、
[ADR-0008](decisions/ADR-0008-managed-browser-navigation.md)。
正式4180/5173未重启，4180尚未加载新接口；无真实模型或账号验收。

历史方向：[Issues深度学习](REA_ZIRA_ISSUES.md)及壳层/查询/结果三份专题已完成，
明确新截图与固定Zira源码差异，后续IZ-01–08不与原台账叠加、不作为已集成能力。
第二批已补项目列表复用、Quick find/Overlay、手机待处理/树状态、字段/草稿/409、
统一尺寸/强调色及模型测试持久回执；367项前端、265项Python、构建及57项完整
浏览器检查通过，证据`frontend/evidence/issues-rea-2026-11-14/`，60份截图。
当时WUI-01/06/11仍部分，已被上方11月15日验收取代；不因其关闭扩张执行权限。
下方230/44也是前批证据，当前状态以TODO_INDEX为准。

此前整体体验审计：[PRODUCT_UI_AUDIT](PRODUCT_UI_AUDIT.md)，完整待办入口
[TODO_INDEX](TODO_INDEX.md)。WUI-02/07/13本地完成，其他10项待实施；BP-01工作台
区域重组完成，BP-02–05待办。230项前端测试、44项浏览器检查及构建通过，证据在
`frontend/evidence/blueprint-multiagent-2026-11-14/`。不代表整站优化完成、视觉被接受
或新增执行能力，既有大包警告未解决。

最新规则与参考：[Zira 全前端结构/三线研究](ZIRA_FRONTEND_STUDY.md)；
根 AGENTS.md 已明确 Astryx-only、一套组件树的八种样式、Zira 可选配色、真实动作、
查询/权限/草稿/缓存与验收边界。模板整合、当前有限 URL/JQL 支持和未完成范围见
[ASTRYX_TEMPLATE_INTEGRATION.md](ASTRYX_TEMPLATE_INTEGRATION.md)。

最新 UI：见 [Astryx 业务复核](ASTRYX_WORKBENCH_REASSESSMENT.md)。
`frontend/` 默认入口现为真实任务工作台，而非迁移摘要；项目/任务/快照确认、
角色资源、模型/连接配置、Run/Agent/Call/Artifact/Event 与审查控制已接既有 API。
支持中英文和明暗主题。React已提供原生重试资源/恢复与旧版回退；会话缓存仍使用旧版入口。FastAPI生产
静态入口仍为 `web/`。不将 Astryx 模板、尺寸模拟或 FakeProvider 验收说成跨设备接力、
任意工作流或真实 OpenMausBot 接入。

工作项统一台账：[WORK_ITEMS.md](WORK_ITEMS.md)。119 项中完成 9 项、未完全完成 110 项；
本地实现、离线合同和真实账号验收分开计。

当前：用户已授权实现，第一条只读研发调研闭环；不是完整团队交付平台。

架构方向：见 [ADR-0005](decisions/ADR-0005-modular-domain-architecture.md)。当前以模块化单体实现，LocalSuperagentHarness 已抽离固定只读编排；领域边界和中英文资源将增量落地，不做一次性企业 DDD 重写。

## 1. 已实现

| 能力 | 本轮实际行为 |
| --- | --- |
| Agent Work 可视化 | Run detail 返回 `local-superagent` 阶段事实；真实 Web 提供 Agent Work 列表、Planning/Research/Synthesis 阶段图和事实边界 |
| 本地 Harness/默认模型发现 | Bootstrap 仅检测 `codex`/`claude`/`opencode`/`t3` 可执行文件；默认模型可在 UI 设为工作区设置或由 `WORKBENCH_DEFAULT_MODEL_ID` 指定；不读取凭证或自动调用 |
| Codex CLI Adapter | 显式“启用 Codex Adapter”创建 `codex_cli` 模型配置；调用使用临时隔离 cwd、`--ignore-user-config`、`--ignore-rules`、禁用项目文档加载、ephemeral/read-only；认证由 Codex CLI 管理；单通道失败不会启动排队中的下一个研究调用 |
| Backend 配置/检查/撤销 | 独立会话后端页保存回环配置不联网；显式健康检查不代表认证；撤销后禁止缓存读取及在途同步写回 |
| Backend/Conversation 只读合同 | 离线测试覆盖原生字段、近期缓存和历史缺口；生产会话同步默认关闭，等待最小读取权限验证，未提供发送 |
| 项目 | 名称、目标、相对目录、允许发送的项目资料 |
| 模型 | 本地/远程 Chat Completions 配置；密钥只引用服务端环境变量 |
| 任务 | 目标、验收要求、最多 10 个显式源码文本文件 |
| 发送确认 | 预览实际资料快照与发送端点，hash 校验防止预览后内容变化 |
| 协调 | Super-agent 生成 1–2 个受限只读研究子任务 |
| 分工 | 规划、研究、汇总可选不同模型；最多两个研究任务并行 |
| 持久运行 | 单机 SQLite 保存运行、计划、Agent、调用、成果和事件 |
| 控制 | 阶段边界暂停、继续、本机请求取消、明确重跑成本确认；失败/中断/暂停可进入独立“重试与资源”流程，调整未完成步骤的模型、预算、并行、时限和输出上限 |
| 持久恢复回执 | 服务端prepared/applying/applied/rejected/unknown/abandoned；按原ID刷新对账，原子排队/继续，不自动重放；正式4180未启用 |
| 追踪 | 运行 → Agent → 模型调用；状态、时间、尝试、用量与缺失 |
| 成果 | 研究中间产物、最终方案、文本下载、人工接受/要求修改记录 |
| 安全边界 | 默认本机监听；远程令牌、Host 白名单、Origin/自定义请求头检查 |
| 响应式 UI | 真实 API 驱动，手机工作/成果切换，桌面并列检查 |
| Basic查询候选 | 主行文本/项目/状态分类为内存草稿；一次URL提交；展示push保留、traverse整份恢复，不构成模型授权 |
| 多选与任务表设置 | 真实Project/五状态目录，OR/AND；手机可见候选，列顺序/显隐偏好，最多3层任务表排序与URL；不是完整JQL/保存视图 |

UI 没有静态演示任务、伪造 Token、占位测试结果或假在线模型。没有配置真实模型时，从空工作区开始。

## 2. 刻意未实现

- Shell、代码编辑、Git 提交/PR、测试执行与部署。
- 浏览器操作、自动联网搜索、文件夹自动扫描或手机文件上传。
- 任意动态 DAG、递归子 Agent、跨 Agent 消息群聊。
- DeepSeek Harness / OpenHands 等运行时接入。
- Token 流式输出、复杂耗时瀑布图、价格计费和学习型模型路由。
- Codex App Server 的真实 Provider 验收、跨版本协议兼容和断线恢复。
- OpenMausBot 原生认证/配对、读取 scope、会话消息工作区和 SSE/replay；健康检查不包含这些能力。
- 团队成员、项目级多用户权限、SSO 与公网生产部署。
- 原生 macOS/Linux/Android/iOS 应用、PWA 离线模式与后台推送。
- 项目/模型配置编辑删除、成果内容编辑和自动按修改意见重新规划。

“未执行测试”必须保持可见，人工接受方案也不能将它改成“测试通过”。

## 3. 平台矩阵

| 平台 | 客户端方案 | 本轮证据 |
| --- | --- | --- |
| Linux 桌面 | Chrome/现代浏览器访问 Web | 本机 Chrome 完成端到端 |
| macOS | Safari/Chrome 访问同一 Web 服务 | 响应式设计，无 Mac 真机验收 |
| Android | Chrome 等浏览器 | 390px 尺寸模拟，无 Android 真机验收 |
| iPhone | Safari 浏览器 | 320px/390px 尺寸模拟，无 iOS Safari 真机验收 |
| 平板 | 浏览器，单列/双列自适应 | 768px/1024px 尺寸检查 |
| 执行服务器 | Python 3.11+，本轮 Linux；POSIX 文件边界和进程锁 | Python 3.12/Linux 测试；Mac 服务端尚未验收 |

尺寸模拟不等于设备/操作系统兼容性认证。后续需要 Safari、触摸键盘、安全区和实际网络重连测试。

手机浏览器只提供操作界面，模型和上下文处理发生在服务器。手机输入的项目路径属于服务器工作区，不是 iPhone/Android 本机目录。

关闭浏览器不会取消后台任务；服务器进程停止会中断运行，重启后需要手动确认恢复。没有承诺手机后台常驻、离线工作或浏览器推送。

## 4. 上下文、凭证与访问边界

- 服务器 `WORKBENCH_WORKSPACE` 是目录上界，默认本仓库。
- 项目路径不能越界、经过符号链接或进入隐藏/敏感目录。
- 仅读取明确列出的文本，单文件最多 32 KiB，总文件内容最多 64 KiB。
- 隐藏文件、已识别的凭证命名、`node_modules` 等受限目录、二进制、特殊文件和符号链接拒绝读取。
- 这些不是完美的秘密识别：用户仍需检查显式选择文件和资料的内容。
- 发送预览与启动时 hash 不一致会拒绝，要求重新确认。
- 密钥变量名须为 `WORKBENCH_MODEL_<NAME>_KEY`；密钥值不存数据库、不返回浏览器。
- 原始模型内部思维链不采集；模型正文输出与用户确认过的上下文会作为成果/快照保存于私有数据目录。
- Codex 不在用户仓库 cwd 中启动；每次调用使用临时空目录，避免自动加载仓库 `AGENTS.md` 或其他隐式规则。用户确认的快照仍通过显式 prompt 发送。
- 数据目录权限 700，SQLite 文件权限 600；本轮不提供加密存储。

## 5. 运行控制口径

- 运行排队、执行、暂停请求、已暂停、取消请求、已取消、失败、中断、完成分别记录。
- 暂停是阶段边界暂停，可能等待当前多个只读调用结束。
- 取消只中断本机请求；远端可能已接收并产生费用，因此中断用量保持未知。
- 服务重启将未完成 Run/调用标记中断，不自动重发模型请求。
- 手动继续会复用已完成阶段，但未完成请求可能重跑，必须确认费用与预算。
- “重试与资源”创建新的关联 Run：来源快照、历史调用和成果只读保留；已完成 Agent/Artifact 可复制引用，不计入新调用；只为未完成步骤预留新增预算。来源执行事实不改写，但追加恢复审计事件。
- 新恢复接口先登记资源候选再显式执行；保存prepared不启动模型。applied是控制命令应用，
  不等于模型执行成功或费用结清。unknown按原ID只读对账，不能弃用/换ID或旧入口绕过。
- 调用总数包含所有尝试。时间上限针对一次连续执行段，暂停/恢复后重新计时；不是跨多次恢复的累计硬上限。
- 同一数据目录只允许一个活动服务进程，通过文件锁防止多个 Worker 重放任务。
- 事件为追加审计/追踪记录，不是不可篡改证明。
- “要求修改”只保存人工决定，不会触发付费调用；后续运行仍需显式创建并确认发送。

后端连接：`POST /api/backends` 只保存配置；列表、Bootstrap 和 `GET .../health` 不联网。
`POST .../check` 需 consent，只做健康请求，不带凭证、不自动读取会话；拒绝重定向，
响应上限 64 KiB、总时限 10 秒。当前只允许字面量回环 IP（例如 127.0.0.1、[::1]），
不允许浏览器配置任意主机、路径、settings 或凭证。`POST .../revoke` 幂等，
撤销后拒绝进一步检查和缓存会话读取；在途响应不能将撤销覆盖为可达。

## 6. 模型兼容范围

请求是 OpenAI-compatible `POST <base>/chat/completions`，带 `model`、`messages`、`max_tokens`、`stream:false`。响应需提供 `choices[0].message.content` 字符串；用量缺失保留未知。

不保证所有服务都支持该参数和字段，尤其供应商专有 API、Reasoning 参数、工具协议或 Responses API。首次先配置并主动测试，测试请求只验证可达和基本文本，不证明工具能力。

输出截断、无内容、错误 JSON、超时和 Provider 非 200 都保留失败，不能改成生成成功。不自动重试、跳转或跨 Provider 回退。Codex 超时会保留脱敏的事件数、最后事件类型和部分正文标记，不保存原始 stderr/响应或凭证。仅有效 `turn.completed.usage` 才计入 CLI 用量；未知不填零。

App Server 草稿未通过最终协议/能力边界复核，已撤回生产入口，不提供可启用的长驻通道。复盘与分步门槛见 [Codex 可靠性方案](CODEX_RELIABILITY_PLAN.md)。当前 CLI 的无工具强制上限和输出 Token 硬上限尚未验收，不把只读沙箱称为完全无工具执行器。

## 7. 验证与未验收事项

最新真实执行：2026-11-09 用户授权的 Codex 关联重试 `49acc6c258094a2794b153a6b6629800` 已完成两项研究与汇总，规划复用，3 次新增调用、3 份待审查成果，约 325 秒。证明当时配置下的真实文本闭环可完成；不代表本次新增隔离实现、Backend Adapter 或工具 ceiling 已做真实账号/模型验收。详细用量和边界见 [进度记录](PROGRESS_LOG.md)。

- 后端测试：2026-11-15完整回归306项通过；前端418项、构建与57/16/9/9浏览器报告通过；
  保留Starlette/httpx弃用提醒与>500KB构建警告。最新证据见本页顶部，旧报告保留。
- 协议测试使用 HTTPX MockTransport；后台流程使用仅测试可注入的 FakeProvider。
- 浏览器：`tests/verify-live.mjs` 创建临时服务器与临时 SQLite，以 FakeProvider 验证 UI→API→Worker→数据库，不访问外部模型。
- 浏览器检查报告：[browser.json](../tests/evidence/browser.json)。
- 浏览器 5 视口/15 条交互通过，覆盖显式会话/消息同步、刷新/缓存不重发、正文转义、来源/角色/时间/历史缺口和撤销；全部 MockTransport。

B05 固定源码核对确认：admin/client 和 loopback 访问不是天然只读 scope，生产
`POST .../sync` 返回 backend_read_scope_unverified；只健康请求可显式执行。历史分页
使用 before/around 而非 generic cursor，尚未实现；SSE 跨重启恢复也未实现。
- [桌面截图](../tests/evidence/live-desktop.png)、[手机尺寸截图](../tests/evidence/live-android-size.png)的内容均为明确测试夹具，不是真实模型质量证明。

尚未完成：隔离 cwd 变更后的真实 Codex 回归、OpenMausBot 固定 fork 真实接入/原生认证、SSE replay 和运行中恢复、本地 GPU 模型兼容性、Safari、设备真机、断电一致性/压力测试、TLS 反向代理、团队权限与生产安全审计。

当前 TestClient 依赖产生一条 Starlette/httpx 迁移提醒；本轮测试能运行，不隐瞒该依赖警告，也不在这一轮更换协议客户端。

启动与测试复现见 [README](../README.md)、[测试说明](../tests/README.md)。默认服务只绑定 `127.0.0.1:4180`，手机不能直接使用这个回环地址连接服务器。

本机服务已实际启动并通过健康检查，正式数据目录有用户运行记录；不再是空工作区。没有将测试夹具或静态设计写入正式数据目录。远程访问与 HTTPS 代理没有启用。
