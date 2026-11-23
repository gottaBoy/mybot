# 下次从这里继续

更新日期：2026-11-23（Asia/Singapore；任务范围设备接续初版已启用）。

**最新交付：D1/D2与限定D3/D4/D5设备接续。**
基线5ca3cc3已push/干净工作树。先读
[ADR-0024](docs/decisions/ADR-0024-scoped-device-continuation.md)、
[最终证据](frontend/evidence/devices-2026-11-23/README.md)和PRODUCT_GOALS_CURRENT。
backend/client/UI三Agent分工，root接App/导航/Task入口/fixture/验收/启用/记录。
Task“在其他设备继续”进入#devices?task=ID，fresh Task确认后创建10min一次性邀请，
#pair独立入口输入code/name换HttpOnly/SameSiteStrict设备cookie，30day到期、owner可撤销。
固定一Task+task_read/message_save，只看目标/验收/最近Run/报告/最近20消息与保存补充。
无ownerBootstrap/配置/文件上下文/模型或Run控制权限，不渲染假设备/在线/进度。
scope50事件增量+有界snapshot，失败明确stale、显式Refresh只GET，未知写精确回执/不自动重放。
配对/设备secret32随机字节，只内存/HttpOnlycookie与DB hash，不进URL/storage/events/回执。
新device4表，TaskTurn save共享同事务helper，撤销/过期检查与消息写原子；原Task/Run不改。
cookie即使invalid/revoked也不得fallbacklocalhostowner；message POST/receipt GET强制
X-Workbench-Device-Id防另tab换cookie把旧草稿写错Task，identity变更清旧私有/重新读会话。
本机no-token仍信任localhost，人工清cookie仍适用原本机owner规则，不是多用户ACL。
未改监听/TLS/隧道，127.0.0.1不能当手机网络地址；远程生产需要显式配置可信HTTPS/token。

最终2052前端（68文件）/1178Python/typecheck/build通过；新增94前端/46后端。
专项13/15PNG（创建/claim/save/revoke丢响应、双context消息/真实FakeRun/断线/撤销/12布局），
综合58/61PNG，主只读6，共77最终浏览器/76PNG，无pageerror/外部HTTP。
Neutral/Zira/Y2K双mode、owner和paired两surface、中英390/长设备名截图已检查。
专项fresh fixture.kZEYWU为2Task/1邀请/1设备后撤销/3消息/1owner启动FakeProvider Run；
独立综合.AFZ9gC为FakeProvider/MockTransport，无真实Provider/费用。
保存消息不执行；paired用其他Task/模型/Run/Workflow/管理API均403，撤销scope读写401。
保留required标签匹配与route尚在途被脚本unroute的失败，不伪造缺失JSON或保存secret截图。

主4180原PID3459239空闲，命令/cwd/env内存核对，在线一致备份/私有副本Store迁移/
原表原列摘要检查，SIGTERM/锁释放/停服备份后同命令/cwd/env启动PID1104938，
device_continuation=true。原1Project/1Task/6Run/1model/18Agent/17Call/6Artifact/157Event、
Workflow等原行不变，4设备表0行；主5173桌面/中文手机6项GET-only后再次原行相同。
私有备份`.runtime/backups/before-devices-20261123T143812Z/`700、DB/log600，不进Git；
无正式配对/消息/Run、凭证库/兄弟读取/外网部署，不热覆盖回退。旧PID脚本不可重复。
主4180/5173保持运行；临时4187/4188/5176/5177已停止。httpx和chunk警告保留，
Bootstrap仍全量，无依赖升级；原119/9/110不变。本批commit/push以Git回执为准。

下一批**D3b委托执行授权/D4b工作位置与未决请求接续/D5b HTTPS与真实设备验收**仍待；
设备首版没有执行控制租约、进程迁移、全历史同步或物理手机认证。
不因手机能保存补充就赋予真实模型调用权限；实际远程网络或真实模型测试需其明确范围。
随后连接器按飞书入站→语雀只读→邮箱草稿→钉钉/微信，Rust执行节点仍独立后续。
下方W1–W5与视频议题保留历史，不重新搭建已完成页面或自动回到列表投影。

更新日期：2026-11-23（Asia/Singapore；固定Workflow初版已验收、本机启用）。

**最新交付：W1–W5固定Workflow与本机服务恢复。**
基线`0cf2c99`已push，恢复时工作树干净、4180/5173均停止。先读
[ADR-0023](docs/decisions/ADR-0023-fixed-workflow-versions.md)、
[最终证据](frontend/evidence/workflow-versions-2026-11-23/README.md)和PRODUCT_GOALS_CURRENT。
此前11月22日的“尚未提交/启用”只属于当时快照，代码后来已在0cf2c99提交；
本轮修复/生产验收/本机恢复另行记录，不重复实现或运行旧Agent。

backend/client/UI三个Agent复核并修复，root负责Forms/Run展示/共享guard/浏览器/启用记录。
已有`#workflows`固定Planning→Research→Synthesis、独立人工审查、阶段模型/指令/资源、
CAS草稿/impact/明确发布/不可变版本/20项历史；普通和TaskTurn资源向导均可分页选旧版本。
阶段指令与research_tasks真正进入Harness，恢复保留原snapshot而资源覆盖仍独立。
本轮补Run版本/完整快照展示，旧Run明确未记录，不用最新版本补造。
修复显式workflow:null绕过验证、版本picker只有首20、取消后迟到响应、pub回执内容hash、
cap丢失静默降builtin、保存后历史busy竞态、global新建覆盖dirty/unknown guard。
手机历史长hash曾挤压名称到0宽，截图识别后改有界列；最终名称171px/最大行高84px。
无新依赖/真实Provider/执行权限，仍单个固定只读工作流，不是任意DAG或长期Agent。

最终1958前端（65文件）/1132Python/typecheck/build通过，保留httpx与大chunk警告。
生产Workflow21/9PNG、综合58/61PNG、主GET-only6，共85项/70最终fixturePNG；
三style双mode/390中英/旧v1跨22发布/TaskTurn绑定/冲突/丢save与pub响应均验，
最终pageerror和外部HTTP0。脚本dialog→alertdialog误判、旧mock误宣cap及手机视觉反例保留。
最终fixture.AvwQtP与独立综合.VKfj6t都只用FakeProvider/MockTransport；物理手机/真实IME、
Safari、真实模型完整链未认证。原119/9/110保持，不当新里程碑完成率。

5173已恢复；主4180从停服状态完成空闲/锁检查、一致备份、副本Store迁移、
原表原列摘要对比后启动PID3459239，workspace/data/auth模式匹配原配置。
原1Project/1Task/6Run/1model/18Agent/17Call/6Artifact/157Event及其他原行未变，
workflow_drafts1（未绑定默认草稿）/versions0/operations0；未自动选模型/发布/执行。
主桌面/中文手机6项只读通过，浏览器后原行再次相同，未导出正式正文或截图。
私有备份`.runtime/backups/before-workflow-20261123T020755Z/`700、DB/log600；
旧进程已不存在，没有读取凭证库或声称继承其环境。回退不能热覆盖。
主4180/5173保持运行，临时4187/4188/5176/5177已停止。
本轮commit/push以Git实际回执为准。

下一产品任务：**D1–D5设备接续初版**，先定义身份/配对/撤销/控制权/断线事实，
再做同一Task接续；不把两个浏览器看同一页当设备控制完成。
后续连接器按飞书入站、语雀只读、邮箱草稿、钉钉/微信顺序。
Workflow更多对象/任意DAG、自动记忆、工具执行及prepared撤销仍有独立未完范围，
不为继续推进自动调用真实账号/模型。下方远控视频保持独立文档议题，未实施。

更新日期：2026-11-22（Asia/Singapore；Workflow W1-W5隔离验收进行中）。

**独立技术议题：车端远控视频方案已记录，尚未实施。**
见[最终推荐方案与V0-V7落地步骤](docs/REMOTE_VIDEO_ADAPTATION_PLAN.md)。
用户链路为ROS2 -> RTSP -> ZLM拉流 -> 浏览器WebRTC，GStreamer/ZLM仅知2025年11月版本线索。
推荐目标保留GStreamer/ZLM、车端控制编码器主动WebRTC上传，配合逐段追踪与本地自适应；
先核验精确版本/插件/管道并建立基线，再做反馈闭环和对照测试，不直接升级或改车端服务。
新增硬要求：每段保活、无新帧检测、快速本地通知、单任务重连与新鲜画面恢复确认；
见方案第6节/V4-R。不能保证网络永不断开，不能把连接存在或SDP成功当作实时画面恢复。
进一步拆解见[自顶向下可观测性O0-O9](docs/REMOTE_VIDEO_OBSERVABILITY_BREAKDOWN.md)：
L0业务 -> L1真实拓扑 -> L2分段指标 -> L3证据，S0-S8区分车端、上传、云端/ZLM、
下行和浏览器，C0/C1单列信令/遥测；定位输出证据等级与下一步，不虚构运营商内部探针。
持续500/800/1000ms RTT按分段测试连接保持，媒体超龄与断链分开，不以延迟高直接重连。
按用户指出“有些指标拿不到”修正：配套拆解第2.1-2.4节列A-D可获得性、S0-S8/C0/C1
难点与最小实施路径。首版围绕M0车端输出/M1可确认ZLM输入/M3浏览器进展，M2逐观看者
输出与跨机逐帧延迟按缺口补齐；数据缺失时合并区间，现场能力默认unverified。
配套文档第2.5节进一步核对ROS2订阅回调、GStreamer probe/queue/bus、ZLM接口/重拉与
浏览器getStats/连接事件。确定的是实现入口，不是现场已交付；ROS frame_id不是逐帧ID，
queue媒体时长不是实际驻留。ZLM源码观察固定2026年快照，不能外推用户2025年版本。
这是文档方案，不是已完成现场诊断、部署或萝卜快跑架构结论；不更改下述Workflow主线。

**固定 Workflow W1-W5 当前进展（实现与隔离浏览器验收，尚未本机启用）：**
先读[ADR-0023](docs/decisions/ADR-0023-fixed-workflow-versions.md)和
`frontend/evidence/workflow-versions-2026-11-22/README.md`。本轮把现有只读
LocalSuperagentHarness的Planning→Research→Synthesis做成固定定义、草稿、不可变版本、
CAS/impact/发布确认、版本历史和精确回执；Run与TaskTurn绑定完整Workflow snapshot，
旧Run与恢复保留原snapshot，阶段指令和research task上限进入实际Harness。
前端新增单一`#workflows`页面、固定阶段图、资源/模型配置、保存/发布与历史查看，并在
Run向导中选择已发布版本。主线代码、测试和生产构建已通过；不要将旧119/9/110计数
改成新版里程碑。

隔离浏览器报告`verification.json`有八项通过：API save→impact→publish、桌面页面与
发布历史、UI保存/影响检查/发布确认、发布v2后显式Run仍保留v1 snapshot、CAS冲突保留
本地候选、写入响应丢失后GET核对、dirty navigation guard、390px英文Gothic无横向溢出；
`externalRequests=[]`且`pageErrors=[]`。测试服务是一次性
`tests/browser_server.py` + FakeProvider，前端使用临时 Vite dev server；没有真实Provider、
费用、正式数据库写入或主4180/5173启用。证据目录保留两张截图。

仍未完成：本机Workflow启用与提交/推送、真实Provider/物理手机/IME、更完整的三style
双mode浏览器矩阵。下一步先由主线复核这些剩余事实，再单独决定是否做本机启用；不要
把隔离fixture证据当生产事实。

更新日期：2026-11-21（Asia/Singapore；用户日期11月20日America/New_York，历史条目原日期保留）。仓库：`/home/my/workspace/ainfra/mywork/mybot`。

**最新交付并本机启用（2026-11-21，C1–C6任务会话与下一轮Run初版）：**
起始391603c已push/工作树干净。先读
[ADR-0022](docs/decisions/ADR-0022-task-conversation-turns.md)及
`frontend/evidence/task-conversation-2026-11-21/README.md`，产品任务以PRODUCT_GOALS_CURRENT为准。
backend/client/UI三个Agent分工，root负责Forms/集成/真实接口/主入口/记录；
backend Agent另做异常浏览器验证。新Task“任务会话”页签、持久不可变消息/20项页，
选单条补充要求→显式preview/资源向导→prepare冻结→execute关联唯一Run，同Task看Agent/成果。
只发原资料和所选消息，不隐式发送旧消息/输出；保存不读文件/开始Run，原Task和旧快照不变。
prepared独立页外补取最多21DTO，一Task最多1条，普通Run/恢复不能绕过。
15s mutation未知结果保留同ID/GET核对；回执绑定immutable身份、完整candidate及送出的配置/hash，
不自动重试/执行。reload save404无原文继续taskSend锁，404不是在途POST终止。
修复composer草稿被其他表单guard覆盖、同Task不同turn表单key、回执candidate身份缺口；
手机四tab使用Astryx具名图标、单Unicode计数，未另建主题/页面树。
最终1813前端（60文件）/1055Python/typecheck/build通过；生产专项24/实际5/综合58/
主只读6，共93项浏览器与91最终fixturePNG，最终pageerror0。三style双mode/390中英、
草稿/过期读/缺cap/401/篡改及丢响应已验，失败脚本证据保留。
实际fresh fixture.8k8JKc两消息两Run，各4次FakeProvider，重复execute无第三Run，
第二条不带第一条补充；综合另一fresh fixture使用FakeProvider/MockTransport，无真实费用。
主4180由PID3356362受控更新为PID234937：空闲核查、在线一致备份、副本Store迁移、
原表原列摘要比对、SIGTERM/锁释放/停服备份，同命令/cwd/原环境内存继承。
原1Project/1Task/6Run/1model/18Agent/17Call/6Artifact/157Event及其他原行不变，
task_turns为空，task_conversation=true；主5173桌面/手机GET-only6项通过、无模型/业务写入。
私有备份`.runtime/backups/before-task-conversation-20261121T102836Z/`700，DB/log600；
身份绑定activation脚本不可再跑旧PID，不热覆盖回退，不导出正式内容/凭证。
主4180/5173保持运行，临时4187/5176已停止；Starlette/httpx和大chunk警告保留。
原119/9/110不变。prepared尚无撤销/改配置协议，无原文且持续404仍保留未知；
不是自动长期记忆、任意DAG、真机/真实Provider认证、多端控制或连接器完成。
下一批**W1–W5固定Workflow定义/不可变版本/可见配置/CAS与确认/验收**，
再多端接续和飞书/语雀/邮箱等。不重复搭建Task/会话页或自动挑下个列表投影。
本批commit/push以Git回执为准；下方“下一批会话”和旧PID是历史事实。

**最新交付并本机启用（2026-11-21，目标/任务工作区T0–T6初版）：**
起始344d7ba已push/工作树干净。先读
[ADR-0021](docs/decisions/ADR-0021-task-workspace.md)及
`frontend/evidence/task-workspace-2026-11-21/README.md`；产品路线见PRODUCT_GOALS_CURRENT。
用户明确要求列待办并多Agent实现，client/UI/browser分工，root负责路由/入口/Forms/
RunWorkspace身份/主服务启用/完整回归与记录。新增稳定#task/encodedID，同一Astryx树
三视图目标验收/Agent执行/成果审查；完整项目目标与任务目标/验收/文件分开，历史20项页。
新建保存后进入Task，不自动preview；列表箭头/Inspector/Inbox/Quickfind直达Task。
Arrange显式复用既有资料/模型/角色/预算/consent，成功新Run仍在Task Agent页。
RunWorkspace lazy嵌入复用原调用/图/成果/审查/恢复，绑定exactTask/Run/Project防串任务；
取消检查先于response写，403/404/401清旧私有内容/操作。
浏览器发现Task保存后被表单自身busy guard阻断导航，已修为saved后仅释放navigation，
operationBusy重复提交锁保持；生产真实fixture Task→Arrange→budget3→FakeRun→审查链通过。
最终1683前端（58文件）/996Python/typecheck/build；生产workspace37/12PNG、
综合58/61PNG，73最终PNG无pageerror，三style双mode/390中文/长内容/缺cap/错误/迟到已验。
保留Project presentation未重读、字段Required定位、创建导航真缺陷和旧Quickfind脚本失败。
新fixture.0h505H专用FakeProvider/MockTransport；无真实Provider或费用，无新Python/deps。
**主4180已受控更新为PID3356362，近期读取cap现为true，5173使用新工作区，不再说legacy。**
更新前原2064113空闲：1项目1Task6终态Run/1model/18Agent/17call/6artifact/157event；
无active/queued/call/test/applying/子进程，一致备份+私有副本Store迁移比较、停服备份、
同命令/cwd/环境启动，原表原列逐行摘要启动后及浏览器后不变，认证/workspace不变。
私有备份`.runtime/backups/before-task-workspace-20261121T031726Z/`700，DB/log600；
不含旧内存代码，回退需停服务并另行确认，不热覆盖。身份绑定脚本不可重复运行。
主5173桌面/手机6项只读通过，无写请求/外部HTTP/pageerror，不导出真实截图/DOM/正文。
初查5173未运行，已恢复200；临时4187/5176停止。无凭证/兄弟修改/远程部署/权限扩张。
原119/9/110不变，T0–T6只关闭本初版范围；真机/真实Provider长期能力未认证。
下一批**任务内持续会话/补充要求/下一轮Run**，再固定Workflow版本；设备接力/连接器仍待办。
不要再自动做其他列表投影，也不要重复搭建Task页。commit/push以Git回执为准。

**优先级调整（2026-11-20，用户反馈“看着没什么变化，目标呢，任务呢”）：**
先读[当前产品目标与交付任务](docs/PRODUCT_GOALS_CURRENT.md)。
收尾进行中的Inbox/ADR-0020后，下一批优先做“目标与任务工作区”的可见闭环：
真实目标/任务→资源安排→Agent过程→成果/审查；然后持续会话和固定Workflow版本。
总览/层级/文档等剩余投影和Bootstrap减量不再自动成为下一批，只按阻塞/正确性/规模推进。
该调整已由上方Task初版交付落实；下方记录保留当时的事实，不再视为最新启用状态。

**最新完成（2026-11-20–21，IZ-07.3c2b2 Inbox收尾）：**
起始dd6b34c已push/工作树干净。先读
[ADR-0020](docs/decisions/ADR-0020-bounded-inbox.md)及
`frontend/evidence/inbox-2026-11-21/README.md`。client/UI/browser三Agent分工，
root接入口、实际API/综合、产品目标重排和记录。client因用户steering中断后原Agent恢复，
保留落盘成果，没有重复实现。新产品文件无Python/依赖/执行权限变化。
复用明确task_query与独立task_detail，不加重复后端；Inbox固定Task-latest pending/attention，
完整list DTO/独立inboxType/20/50/100/真实总数；文本草稿Search/非IME Enter提交、类型scope
即时且保留草稿，非法type与不支持的JQL/项目/状态/group条件明确阻断。
仅呈现的选中项按需读详情，手机只一份Dialog；advertised失败不回退，缺detailcap用已验list
快照，不补Bootstrap error。fresh detail不再符合Inbox时不开放动作；原Review仍需资料确认。
busy/迟到/15s/ready-only poll/401、稳定显式ID移除不换任务、分页与Dialog焦点都已验。
最终1605前端（56文件）/156既有Python接口合同/typecheck/build；生产59/实际8/综合58，
78最终PNG无pageerror。后续client仅格式化与补44测试，final build执行JS/CSS指纹同已测构建；
不把source map差异当功能变动。完整996Python属前批，此轮未重跑，无新Python。
实际fixture.OTbdY6含45项目45Task88终态Run/0model，Inbox44=43attention+1pending；
恢复成功Task排除，原业务数组前后不变，仅公开fixture登录POST。综合fresh MkX2k7使用
FakeProvider/MockTransport，无真实Provider/费用/正式写入。保留cap更新时序和手机隐藏Refresh
的脚本失败，最终用真实poll验移除；Starlette/httpx与大包警告保留。
主4180仍PID2064113，无task_query/task_detail，5173保持200/legacy；临时4187/5176停止。
无凭证/正式DB/兄弟修改/升级/部署，原119/9/110不变；commit/push以Git回执为准。
**下一批以PRODUCT_GOALS_CURRENT为准：T0本机版本对齐、T1–T6目标/任务工作区。**
总览/层级/文档与Bootstrap减量仍留待办，按实际阻塞推进，不自动作为下一轮主线。

**最新完成（2026-11-20，IZ-07.3c2b1看板按列有界读取）：**
起始3ab8c69已push且工作树干净。先读
[ADR-0019](docs/decisions/ADR-0019-bounded-task-board.md)和
`frontend/evidence/task-board-2026-11-20/README.md`。延续用户多Agent授权，
backend/client/TaskBoard三分工，root整合/固定项目意图/焦点/真实API/综合/记录。
新明确task_board能力，GET /api/tasks/board一次ro/query_only快照返回五列总数及各20项页，
最多100Task卡；复用Task查询SQL/序列化、最新Run分类/固定顺序，无JQL/新排序或拖动写状态。
保留完整Task DTO供目标展示和原Review流程，不用Bootstrap补acceptance/files。
strict客户端/独立boardPages URL、query原子重置/呈现保留/非法仅阻断remote board；
取消/迟到/15s/ready-only poll/显式GET重试/401清私有。Task/Run表格排序容量不控制看板。
既有Astryx同一卡片树、每列真实范围/页脚，列内纵滚/画布横滚，busy阻断卡片；
父层按请求key保留横向位置/恢复可用分页或Retry焦点、不抢用户移焦。
复核修复projectWorkspaceLocation给呈现patch注入项目字段误清boardPages：按原始命令意图保留，
2新增unit及桌面/手机真实跨Tasks/Board、mode、排序/容量回归通过。
最终1540前端（54文件）/996Python/typecheck/build；生产专项50/实际8/综合58，
76最终PNG无pageerror，三style双mode/390中英/reducedmotion/慢GET跨真实poll已验。
保留中文文案断言、fixture登录后未刷新、测试服务SIGTERM中断及早期locale初始化覆盖证据，
最终actual显式验证中文heading，不把早期英文截图当中文。既有大包/httpx警告保留。
最终actual fixture.gKDKl0从45项目45任务88终态Run/0model起，原数组前后不变，仅fixture登录；
43attention/1pending/1completed，项目000历史15失败但latest成功，板中attention0。
综合fresh rEJTRT使用FakeProvider/MockTransport，无真实Provider/费用/正式写入。
主4180仍PID2064113未启用新cap；5173恢复200继续legacy，临时4187/5176停止。
原119/9/110不变，无凭证/兄弟修改/升级/部署，独立commit/push以Git回执为准。
下一项IZ-07.3c2b2 Inbox，再总览/层级/文档及其余Project消费者，随后Bootstrap协商减量、
失效影响图及实际传输/规模测量；不因看板完成关闭07.3/07.4。

**最新完成（2026-11-20，IZ-07.3c2a全历史Run服务端分页）：**
起始5710f3d已push且工作树干净。先读
[ADR-0018](docs/decisions/ADR-0018-bounded-run-history.md)和
`frontend/evidence/run-query-2026-11-20/README.md`。
继续用户多Agent授权：backend/client/table分工，root整合/焦点/浏览器/记录。
新明确run_query能力、GET /api/runs/query，所有历史Run按自身status分类，minimal DTO、
20/50/100/真实总数/有限JQL与单Run排序/一次ro query_only快照，不发送上下文或模型。
客户端strict身份/分页/发送绑定、15s取消/迟到丢弃/ready-only poll，错误不回退Bootstrap。
RunsTable使用同一Astryx wrapper/serverSorted，保留服务端行序，无browser再filter/sort/slice；
独立runOrder URL不继承Task sorts，不进SavedViews；原单行查询/右上表格工具保持。
翻页隐藏旧页、samekey刷新保留busy行并阻断；父视图保留列/紧凑偏好、分页focus排除native及
ARIA禁用/不抢用户移焦。偏好仅当前页面内存，不宣称reload持久。
最终1415前端（51文件）/906Python/typecheck/build；生产专项48/实际API9/综合58、
80最终PNG无pageerror，三style双mode/390中英/8s跨6spoll/错误不重放/401已验。
保留JQL wire/header、重复candidate和旧同步排序断言失败；未删除原模型/预算/恢复检查。
真实fixture.cYS5vD从45项目45任务88终态Run/0model起，全部原业务数组前后不变，仅fixture登录；
项目000为45历史/15失败，Task latest成功，分母和状态分别验证。综合fresh qExepv使用
FakeProvider/MockTransport，无真实Provider或费用。Starlette/httpx及大包警告保留。
主4180仍PID2064113未启用新cap；5173恢复200继续legacy，临时4187/5176停止。
无凭证/正式DB写入/部署/兄弟修改/升级，原119/9/110不变；独立commit/push以Git回执为准。
下一项IZ-07.3c2b Board/Inbox/总览/层级/文档等剩余投影与Project消费者，再协商Bootstrap减量、
失效影响图及实际传输/规模测量；不因Run表格完成关闭07.3整体或07.4。

**最新完成（2026-11-20，IZ-07.3c1b完整项目资源消费者）：**
用户继续（America/Los_Angeles11月19日），起始7bb2140已push/工作树干净。先读
[ADR-0017](docs/decisions/ADR-0017-project-resource-consumers.md)和
`frontend/evidence/project-resources-2026-11-20/README.md`。
三个Agent分别完成backend/client与列表/taskform，root负责路由/共用radio/browser/记录。
新增独立project_detail/project_query能力：单项目五字段完整资料及20/50/100分页四字段摘要，
任务数/全历史Run数同ro/query_only快照；摘要不带notes，复用既有参数/CTE，无逐项HTTP。
项目route不再用Bootstrap查找/伪造完整Project，按ID读取、区分missing/forbidden/接口失败；
同ID暂时刷新失败保留已验内容+明确stale提示及任务查询草稿；missing/forbidden隐藏，401清私有。
项目列表保留目标/目录，URL q/page/pageSize与Back/刷新、Search/IME、旧响应/显式重试已验。
Task创建caprefs路径不默认Bootstrap首项，Astryx单选分页确认候选；POST前fresh GET精确ID，
15s/取消/卸载/fingerprint/duplicate锁，失败保留输入；真无项目Create project经过dirty保护。
最终1314前端（48文件）/787Python/typecheck/build通过；资源37/原项目条件44/综合58/实际API4，
81最终PNG、无pageerror，三style双mode/手机中英/键盘radio/长名均验。保留定位误差及旧综合
依赖隐式默认项目的失败；综合已改显式选择真实fixture项目，所有原模型/审查/恢复断言保留。
实际fixture.9HjicZ由45项目45任务88终态Run/0模型起步；只新增1任务及preview，所有原任务/
projects/runs/models比对不变，无新Run/模型/真实Provider。综合fresh fixture.sgdukI为FakeProvider。
既有Starlette/httpx及大包警告保留，个别chunk已记录，不宣称总初始传输/整体提速。
主4180仍PID2064113、未加载新cap；5173已恢复200继续legacy，临时4187/5176已停止。
无凭证/正式DB写入/部署/兄弟项目修改/依赖升级，原119/9/110不变；独立提交push以Git回执为准。
下一项IZ-07.3c2a全历史Run有界查询，然后Board/Inbox/总览/层级/文档等剩余投影与project消费者；
再Bootstrap协商减量、失效图和实际传输/规模测量。不因c1a/b完成就关闭07.3整体/07.4。

**最新完成（2026-11-19，IZ-07.3c1a项目条件与保存视图引用准入）：**
起始2a3bbdc已push且工作树干净。先读
[ADR-0016](docs/decisions/ADR-0016-project-query-selection.md)和
`frontend/evidence/project-query-selection-2026-11-19/README.md`。
沿用户多Agent授权：picker/准入及SavedViews/浏览器三条分工，root整合、回归和记录。
复用project_references接口，无新后端；主查询项目选择器用Astryx Button/Dialog/Checkbox
组成真正20项分页多选，独立目录搜索，跨页保留候选、100上限、缺失项可移除。
候选/目录/committed引用分别读取；主Search才提交完整条件，cap缺失保留原路径，
声明后失败不回退Bootstrap。committed引用首次未确认隐藏结果，missing和读取失败分开；
标题也用远程引用，same-key刷新保留已验值，不因poll打断任务查询。
SavedViews可选onValidateApply先fresh GET确认项目，再检查草稿/URL/列baseline；
期间busy锁阻止重复加载和导航，失败不重放待导航；最终先确认URL获准才改列/草稿并报成功。
初版锁误覆盖legacy detail，已限到新增引用校验阶段；旧项目切换取消/迟到保护32项回归通过。
最终1245前端（45文件）/typecheck/build通过；生产picker44/SavedViews32/综合58/实际API5，
96最终PNG、无pageerror。保留导航回归、请求日志时序、字段播报重复和双呈现计数失败。
实际fixture.3eAI8M中45项目45任务88终态Run/无模型，原业务数组前后不变，仅公开fixture登录POST。
综合使用全新fixture.TnytgE及FakeProvider/MockTransport；本轮无真实Provider或费用。
未改Python，710是11月18日前批证据、此轮未复跑；现有Starlette/httpx/大包警告保留。
原4180仍PID2064113，新cap未启用；已恢复5173入口并核验200，继续legacy。临时4187/5176已停。
下一项IZ-07.3c1b完整Project路由/列表/创建表单，再其他视图/Bootstrap协商减量和失效/传输测量。
不拿最小refs补空字段冒充完整Project，不关闭07.3/07.4或更改119/9/110；无凭证、
正式DB写入、部署、兄弟项目修改或依赖升级。独立commit/push以Git回执为准。

**最新完成（2026-11-18，IZ-07.3b2项目引用目录本地验收）：**
起始`b83e5d9`已在origin/main且工作树干净，没有重复开发b1。先读
[ADR-0015](docs/decisions/ADR-0015-project-reference-directory.md)及
`frontend/evidence/project-references-2026-11-18/README.md`。
三Agent分别完成后端71新增、严格client128新增、共享目录17新增，root整合/浏览器/记录。
新增明确project_references能力的只读分页接口：最小Project引用、逐项目Task/全历史Run数、
全工作区总数和独立selected/missing补齐，同一次ro/query_only快照，无N+1 HTTP。
全局项目侧栏和任务范围接同一Astryx目录，Search/IME/分页不改主查询；已选项跨页保留，
固定项目只读展示；错误不回退Bootstrap或伪0，显式GET重试、取消/迟到/后台poll规则已验。
浏览器发现手机隐藏桌面导航仍挂载，现只挂当前可见导航；endContent对齐计数列。
最终1199前端（43文件）/710Python/typecheck/build通过；生产目录37/真实API8/综合58/
计数15项，82最终PNG、无pageerror。保留重复挂载及两处旧脚本依赖隐藏DOM的失败记录，
修复后最终构建重测通过；真实45项目45任务88Run夹具业务数据前后不变，无模型。
Bootstrap仍全量，主查询项目选择器/SavedView校验/项目路由、列表、表单及其他视图待迁移；
面板重挂可重置本栏搜索/页码，不声明跨断点恢复。先做IZ-07.3c1项目完整数据消费者，
再迁移其他视图、协商Bootstrap减量及失效/传输测量，不提前关闭07.3整体/07.4。
原4180保持PID2064113未重启，新cap未在主环境加载；5173开发入口已恢复并继续legacy。
临时4187/5176已停；无真实Provider/凭证/正式DB写入/部署或依赖升级。原119/9/110不变。
按独立提交push交付，以git log和origin/main实际回执为准。

**最新完成（2026-11-18，IZ-07.3b1本地验收完成，始于11月17日）：**
用户继续，原366ca3e已推送且起始工作树干净。实施全局/范围计数和bounded Quick find。
先读ADR-0014。workspace_counts/search明确能力准入，旧后端保持legacy；失败不回退旧域数据、
计数不伪0。Task最新态与Run历史分母分开；搜索支持历史Run ID、有限20/50、total/has_more。
T3重启取消原UIAgent、clientAgent先前并发错误，落盘代码保留；本轮已恢复3Agent完成backend/
client/UI，root负责counts hook/整合/记录。最终1054前端（41文件）/639Python/typecheck/build通过；
生产搜索32/计数15/实际API6/综合58/详情40项，81最终PNG、无pageerror，全部隔离fixture。
证据`frontend/evidence/workspace-reads-2026-11-18/`，保留初轮client共享fixture变更错误、
综合选中同名但未ready导航被正确阻止，以及计数脚本未等scope请求的失败记录。
Astryx会乐观保留旧选项/catch错误/默认空态；项目wrapper用稳定source/generation、
可观察busy、显式错误和捕获旧项click/Enter解决；IME不误拦截，同queryRetry只GET。
未知活跃数不当0停止后台状态检查；实测403后6.5s存在Bootstrap poll但无自动计数重试。
Task状态范围与Run历史分母切换、固定route scope、真实20/48搜索和旧RunID均已验证。
Bootstrap、项目目录计数/引用及其他页面投影仍全量；本项只是07.3b1，不关闭b/整体/07.4。
未重启原4180（PID2064113），只读核实两新cap均未advertise；恢复5173开发入口，继续legacy。
临时4187/5176已停。不读凭证、不调用真实Provider或写正式DB；本批按独立提交交付，
实际commit/push以git log及origin/main为准。下一项07.3b2项目引用目录/逐项目计数，然后其他视图迁移、
Bootstrap协商减量和失效/传输测量。原119/9/110不变，已有大包/httpx警告保留。

**最新完成切片（2026-11-17，IZ-07.3a本地验收完成）：**
用户要求“看下现状，提交后，并继续”。已核实`f917608`在main/origin/main且工作区原本干净，
不是重新补交旧改动。沿现有多Agent分工继续：后端详情/分页历史、严格client、浏览器专项；
主Agent整合Inspector与记录。先读[ADR-0013](docs/decisions/ADR-0013-on-demand-task-detail.md)。
新增明确task_detail能力准入与GET任务detail，同一只读SQLite快照返回Task/最小Project、
latestRun/attempts和20/50/100历史页。客户端复用任务投影校验，不重算排序；
Inspector只在选中后读取，历史页与列表页分开，错误不回退Bootstrap；旧能力缺失保持原路径。
最终943前端（39文件）/562Python/typecheck/build通过；详情40、真实API6、查询35、综合58项，
四份最终生产报告77PNG、无pageerror。证据`frontend/evidence/task-detail-2026-11-17/`。
保留键盘末页ARIA禁用失败及综合异步reload断言失败；修复后均在最终构建重跑通过。
后端新增63项，含snapshot/连接关闭/认证和仅空临时fixture可用的seed；正式4180未重启。
发现并修复A页2→B→A恢复旧页的问题，Inspector身份key现绑定workspace/scope/task，切换从1页。
跨桌面/手机容器切换仍会重挂Inspector并回历史第1页，选中任务保留，不宣称跨断点页码恢复。
分页焦点同时识别native/aria-disabled，末页选可用邻项、失败选Retry；用户主动移焦时不抢回。
Bootstrap、Quick find、侧栏、Board/Run history等全量投影未减；IZ-07.3整体/07.4和119计数不变。
下一项IZ-07.3b全局计数/查找与引用目录，然后其他消费者迁移与精简Bootstrap，不跳过失效和测量。
本批按独立提交交付，实际commit/push以git log及origin/main为准，无真实Provider/凭证/
正式数据库写入或部署。临时4187/5176已停；原5173本轮发现已停止，已启动开发入口并核验200。
4180仍原PID2064113，task_query/task_detail均未advertise，主入口继续legacy；保存视图原能力保持。

**最新完成切片（2026-11-17，IZ-07.2本地验收完成）：**
用户明确要求多Agent实现；根Agent负责页面/表格整合和全量回归，合同Agent复核严格client，
浏览器Agent补异常/权限场景，文档Agent整理ADR与进度。已推送基线为`f9e5484`及查询API
`608b8bd`；本批IZ-07.2已完成本地验收/记录，按独立提交交付。
实际commit/push状态以git log及origin/main为准，不把代码记录当主环境启用。
先读[ADR-0012](docs/decisions/ADR-0012-task-query-client-admission.md)。
新后端明确advertise task_query=true才采用服务端任务列表，缺能力保留原Bootstrap路径；
声明能力后404/503/异常2xx明确失败，不能静默回退。草稿不请求，响应按query key隔离、
取消/丢弃旧读，分页不再二次sort/slice，server clamped page只用于展示，不改请求URL/history。
Bootstrap区分explicit/poll刷新：显式成功推进refreshRevision，poll只使ready页失效重查，
不取消loading或自动重试403/404/error，请求不再依赖每轮data对象identity；慢查询补测已通过。
服务端是文字匹配/排序权威，browser仅严格校验结构/算术/请求绑定/身份与分类关系并保序；
不能因JS/Python Unicode版本不同而重算文字/排序拒绝合法页。15共享样例不是全Unicode证明。
最终870前端（38文件）/499Python/typecheck/build通过；专项35项/6PNG、实际API6项/2PNG、
高级30项/24PNG均在稳定生产构建通过，无pageerror。含8s慢GET跨真实6s poll只1GET、
403后6.5s poll无自动重试、显式Retry恰好1GET及HTML401清私有投影。
综合最终58项/60PNG通过，四份报告合计92PNG、无pageerror。首轮因fixture已有记录在
fresh guard停止，保留失败后改用只读确认空库的全新fixture.OaPiOM，非用户正式库。
证据`frontend/evidence/server-pagination-2026-11-17/`已归档；既有大包/httpx警告保留。
本批跨11月16/17日，保留各报告实际时间，不用早期2项检查冒充最终验收。
Bootstrap、Quick find/侧栏计数与Inspector历史仍全量，下一项IZ-07.3待办，07.4不关闭，
不宣称整体提速。临时验收4187/5176已停止。
原4180/5173未重启，新能力尚未在主后端启用，用户主入口继续legacy，保存视图仍已启用。
原119项仍9完成/110未完全完成，无真实Provider/凭证读取/正式DB写入/执行权限提升或部署。

**最新开发切片（2026-11-16）：**
已验收累计成果已提交`f9e5484`并push到origin/main，main无冲突/未强推。
IZ-07.1新增task_query.py与GET /api/tasks/query，复用SavedView有限定义，
OR/AND、固定项目、最新Run分类、三层排序、20/50/100真实分页与总数；
单次SQLite只读快照、无写锁、连接必关闭，新增两个索引。文档ADR-0011及
docs/evidence/task-query-2026-11-16/记录合同、测量和本地验收。
API排序标识unicode-natural-v1，不宣称等于Intl.Collator；当前前端尚未消费此接口，
Bootstrap尚未缩减、历史详情仍全量，IZ-07.2–04保留待办。原119/110计数不变。
原4180未再次重启，新查询路由仍404，不把代码/提交当主环境启用；保存视图保持已启用。
本批作为独立切片提交push，实际提交/推送状态以git log与origin/main为准；
下一步先做严格client/排序对齐/页面接入，再减少Bootstrap。
最终本轮477项Python通过（71新增+原406），无Provider请求；2k/20k隔离测量已记录。
第一轮关闭连接测试误跨线程检查，已在同Worker线程验证并全量重跑通过。
794前端/build为基线提交前本轮复跑结果，新API未改前端，不能算新增界面验收。

**当前执行方式（2026-11-16）：**
用户要求“完成每一项，提交push”，已授权按工作项验证、记录、提交并推送到现有origin/main。
先提交此前已验收的React/Astryx工作台、恢复/模型测试和保存视图，作为下一批开发基线；
提交前本轮实际复跑794项前端、406项Python与build通过，既有警告保留。
私有.runtime备份/日志/数据库/环境与凭证不进Git；既有隔离证据/静态历史保留。
后续从IZ-07服务端查询合同/分页开始拆成可验收提交，不声称一次完成所有110未完成项。
账号/付费/外部写入/设备/生产部署门槛不因“完成每一项”自动解除。

**最新：保存视图已在4180主服务启用（2026-11-16）：**
用户在明确询问任务检查/一致备份/受控重启后回复“继续”，本轮已实际执行。
先读`frontend/evidence/local-activation-2026-11-16/README.md`和SAVED_VIEWS_ACTIVATION。
原PID1826917从本仓库启动且仅回环，默认.runtime/工作区，无认证令牌、无子执行进程。
API/只读SQLite检查1项目/1任务/6Run/1模型；Run为1成功3失败2取消，无排队/运行中/
进行中的Call/模型测试/恢复应用。SQLite在线一致备份和停服一致备份都在私有.runtime；
副本迁移及启用后/浏览器后按原列逐表摘要比较，全部原有记录不变。
优雅SIGTERM后确认锁释放，以原命令/cwd/原环境启动当前代码，新PID2064113。
健康200、工作区/认证不变；4180及5173代理保存视图目录现在实际200。5173进程608518
未重启，继续使用5173/#workbench；4180仅Web外观仍旧。不要再说主API未启用/404。
真实桌面/手机只读浏览器5项通过，无写请求/意外API/pageerror；不采集私有截图/DOM，
没有自动创建视图或发送任何模型/Run/重试/控制请求。用户实际CRUD操作未代做。
私有备份`.runtime/backups/before-saved-views-20261116T004900170654Z/`700，
库/日志600且Git忽略。不是旧运行代码归档，恢复需单独确认，详见启用记录。
本轮没有改产品源码，未重跑794/406，它们仍是上一批基线。原119/110计数不变，
无远程部署/真实Provider/凭证读取/commit/push。两个用户服务保持运行。
下一实施包IZ-07：服务端任务查询/排序/计数/分页与性能测量，保持Basic/JQL/草稿/
固定项目/SavedView合同；然后再按持续工作、连接器和设备路线，不提前实现执行权限。

**上轮：保存视图本地合同完成，主服务待启用（2026-11-16，已由上方启用取代）：**
用户要求“继续按计划实现目标”。先读最新ADR-0010、`docs/SAVED_VIEWS_ACTIVATION.md`
和`frontend/evidence/saved-views-2026-11-16/README.md`。IZ-06的菜单/实际HTTP-API/SQLite
闭环已完成本地验收：保存/加载/更新/另存/删除、固定项目、已提交快照、CAS、丢响应、
dirty/Back、权限、竞态与中英文手机。GET资源不冒充原请求回执，unknown编辑器不是
跨刷新操作日志，不能外推到付费执行幂等。
修复project_unavailable映射与非JSON401清理；复现并修复初始订阅前URL变化导致旧查询，
沿用canonical监听，仅补初始同步并保留默认视图偏好。截图又发现手机长反馈挤断标题、
分页截断，已将反馈置于页头下方同主题区域，窄屏分页两行；搜索仍一行，Astryx不变。
最终794项前端、406项Python、typecheck/build通过；生产专项/实际API/综合/布局/导航
32/8/58/26/9项、116PNG，无pageerror。保留原大包/httpx警告及初始化失败基线。
原4180/5173未重启；本轮结束实际核对5173保存视图API仍404。不要说用户已可用。
下一步先明确确认主服务启用：检查活跃/排队Run、私有备份和原配置，再优雅更新4180；
不可擅自接管进程/改正式DB或触发真实模型。随后IZ-07服务端查询/分页，再按原产品路线。
原119项仍9完成/110未完全完成，IZ是交叉包。本批无真实模型/账号读取、正式数据写入、
部署、commit/push；临时4187/5176结束后停止。视觉/真机仍未最终接受或认证。

**上轮：用户批准的工作台可见整改（2026-11-15）：**
先读UI_ITERATIONS第24节及`frontend/evidence/visible-workbench-2026-11-15/README.md`。
已实际重排工作台/共享项目任务页：两级页头、一行查询、独立结果工具带（视图左/列右）；
Inspector打开后列工具仍对齐表格。手机Basic/JQL用既有Astryx adaptive Selector，
状态范围加图标，详情重排目标/验收/文件/历史，触控英文桌面分页增宽。没有换库/另建页面。
同合成数据对照搜索宽度：1440为135.3→484.3px，1024为143.3→284.3px，
390为114.3→202px；顶部舒适密度增加约80px是分层取舍，不等于视觉已被接受。
最终781项前端、typecheck/build通过，生产布局/综合/高级/草稿/项目/连续性
26/58/30/15/16/10项通过，无pageerror；123生产PNG和6修改前PNG分开保存。
IZ-05滚动修复已最终复测，仅内存恢复；IZ-06保存视图专项/精确错误映射和原4180启用
仍未完成。原4180/5173未重启，用户看新UI仍用5173/#workbench，4180是旧入口。
Python本轮未跑，406是前批基线；原大包警告和119/110计数不变。没有新Agent执行能力、
真实模型/账号读取、正式数据写入、部署或commit/push。临时4187/5176结束后停止。
下一步先收用户当前可见排版反馈；不要把本轮UI验收自动扩大成保存视图/多端/Workflow完成。

**历史反馈与暂停扩展（2026-11-15，已由上方可见整改继续）：**
用户问“到底改了什么，感觉页面没有变化”。最近主要是列表/查询底层行为和配置合同，
没有完成可见的整页视觉改版，不能把测试数字或本地功能验收当用户体验接受。
已实际核对：5173为新React前端；5173/api/saved-views及原4180该API均404，
新保存视图尚未在主后端启用。原4180/5173仍保留，未为展示而自动重启正式服务。
已暂停继续扩展，所有Agent停源码且无运行测试会话。后续先回应/确认可见页面验收，
不要未经方向确认继续只加后台项。保持Astryx、单业务树和旧版本，不擅自整页重写。
本轮未完：Menu/client61项与前端初次781为较早检查，最后2处UI改动未复测且保存视图
没有浏览器/真实API验收；错误code project_unavailable精确映射仍待补。后端406已过但
只在测试环境。连续性dev-r2为10项/6截图通过，双轴与StrictMode修复已保留，
但修后未单独重跑unit/typecheck/生产构建。证据在/tmp/mybot-list-continuity-20261115-dev-r2/。
没有新增Cindy多端接力、可执行Workflow或编程执行权限；下方新批仍不能标完成。

**本轮未完成：IZ-05连续性与IZ-06保存视图（2026-11-15）：**
用户要求继续完成。管理Agent已实现单用户workspace/project保存视图API及严格v1定义、
CAS/稳定创建ID/删除tombstone，100新增后端用例，Python406通过；数据Agent实现40项
受管history内存LRU与恢复hook，47纯测试，正在修浏览器发现的横向滚动恢复时序。
交互Agent实现SavedViewsMenu/API严格client，因账号并发限制中断后已按最新反馈冻结；
61项client/wrapper测试保留，不能把尚未跑完的UI专项算验收完成。
主Agent已整合Focus菜单/快照capture/URL应用和continuity，39定义单测，前端初次781通过；
新增实际API脚本verify-saved-views-live.mjs待执行。新生产构建/浏览器综合尚未最终验收。
保存只取已提交Task列表，未提交query不可偷存；加载复制快照，不是URL动态绑定/模型请求。
恢复仅内存IDs/scroll/focus，auth/logout清空，不写业务history/localStorage。正式4180/5173
保留，新API尚未启用旧4180；只用隔离fixture，不发真实模型/读凭证/改正式DB。

**最终补测完成：** 表头Clear sort回调已保留完整剩余规则，两项真实菜单验证覆盖3→2→1层。
已重建并重跑全部生产报告，最终高级30项、111生产截图；不复用补测前28/109作为最终证据。

**最新完成：高级查询与表格（2026-11-15）：**
先读最新ADR-0009、TODO_INDEX本批与`frontend/evidence/advanced-workbench-2026-11-15/README.md`。
数据Agent完成现有项目/五状态分类的字段目录与OR/AND纯合同、URL独立测试；
交互Agent完成AppMultiSelect及30项高级生产专项；管理Agent完成列顺序/最多三层排序/
设置Dialog和独立复核，主Agent整合JSON URL参数projects/states/sorts、Task/Run/Board过滤。
旧单值project/filter/order兼容，非法结构/不可用项目明确报错，固定项目优先。
多选仍是草稿；手机Filters可实际编辑候选并Search。可搜索MultiSelector的trigger是button，
combobox在其popup内，后续测试不要套用旧单选角色。设置Dialog的单项排序也写sorts JSON，
旧快捷单排序写order；JQL ORDER BY仍优先。新列顺序/多排序只由任务列表消费，不外推Run。

最终634项前端、typecheck/build通过；同一生产构建的综合/草稿/项目/高级/导航/恢复
分别58/15/16/30/9/9项通过，111生产截图；独立设置6类/2补充截图，均无pageerror。
后端未改，本批未重跑Python，306仍为上一批基线。已有大包警告保留，视觉未最终接受。
本批本地关闭现有字段范围的IZ-02/03及IZ-04；不宣称110项全部完成。下一批IZ-05列表/
详情连续性、IZ-06私有保存视图、IZ-07服务端查询/分页与IZ-08扩大验收仍待办。
正式4180/5173未重启，4187/5176临时验收后停止；无真实模型/凭证/正式数据写入/部署/
commit/push。原119项仍9完成/110未完全完成，原编号不可因UI测试数量而改计数。

**最新完成：IZ-02/03查询草稿第一切片（2026-11-15）：**
先读TODO_INDEX本批和REA_ZIRA_ISSUES_QUERY第8节。主Agent实现Basic文本/项目/状态分类
候选与一次提交；交互Agent给canonical导航增加push/replace/traverse原因；
管理Agent独立复核并复测字段草稿覆盖、history混合状态与draft-only无法清除三项修复；
数据Agent完成15项查询草稿专项和16项项目专项，全API拦截。
Search/Enter才提交主查询条件，侧栏即时push只同步被改字段，原生Back/Forward整份
恢复已提交Basic/JQL，展示/外观push保留草稿。清除移到原行X图标，不另增一行查询。
新增18项候选单测及16项导航原因测试，452项前端、TypeScript/生产构建通过；
同一生产构建的综合/草稿/项目/导航/真实API恢复分别58/15/16/9/9项通过，87实际截图，
无pageerror，证据`frontend/evidence/query-drafts-2026-11-15/`。后端未改，未重跑Python；
下方306是前批基线，不冒充本批新结果。原119/110计数不变，正式4180/5173未重启。
IZ-02/03仍只完成第一切片，字段目录/多选、列顺序/多排序、保存视图、服务端分页继续待办。
手机使用既有Filters即时范围；合成IME/尺寸不是实际输入法/真机/视觉接受。

**当前结果：多Agent收尾WUI-01/06/11已完成本地验收（2026-11-15）：**
先读`docs/TODO_INDEX.md`、最新ADR-0007/0008与
`frontend/evidence/ui-closeout-2026-11-15/README.md`。数据Agent完成项目查询专项，
交互Agent完成受管history/草稿事务，管理Agent完成持久恢复后端与独立复核，
主Agent完成恢复客户端、响应丢失实测和综合回归。UI原13项均在已记录的本地合同
范围内完成；不等于视觉最终接受、全部产品完成或所有浏览器兼容。
最终418项前端、306项Python、生产构建通过；四份生产浏览器报告分别57/16/9/9项，
共78张截图，无pageerror。旧367/265/57证据保留，不冒充本轮结果。

恢复流程先登记prepared资源与snapshot/request_id，再显式consent执行并原子保存
applied回执；刷新/路由重开可GET原ID。替换候选B丢响应不能查询旧A；已应用回执
不阻塞后续合法新候选；UI刷新失败不改写已应用事实；50条截断历史也拒绝同ID矛盾。
applied只表示控制应用，不是模型成功或费用结清。unknown锁不允许换ID绕过。
导航共享`mybot:navigation`；支持时用独立Native Navigation stamp与绝对traverseTo，
不覆盖目的entry。Chrome已验连续/插队Back和刷新；无Navigation API的并发压力、
Safari/实体设备、跨文档取消仍未验，不承诺全平台相同保证。

原119项仍9完成/110未完全完成，UI整改不与其相加。下一步按IZ-01–08逐切片推进真实
字段/条件、列顺序/多排序、列表详情连续性、私有保存视图及服务端规模化；
长期会话、连接器、Cindy设备接力与执行权限仍单列。正式4180/5173进程保持，
4180尚未加载新模型测试/恢复接口；本轮临时4187/5176验收服务在结束时停止。
没有真实模型/账号调用、正式数据写入、部署、commit或push。

**历史用户方向：深度学习截图中的Zira Issues（2026-11-14）：**
本段中的3项部分状态已由上方2026-11-15结果取代，保留原验收过程。
先读`docs/REA_ZIRA_ISSUES.md`，三Agent专题分别为`REA_ZIRA_ISSUES_SHELL.md`、
`REA_ZIRA_ISSUES_QUERY.md`、`REA_ZIRA_ISSUES_RESULTS.md`。均已完成源码研究，
区分用户1853×963截图、固定HEAD `1ce0d0510cb590f3a79ca498f7239ff0852ed0d7`、
mybot实现与运行证据。图中的双左栏/Basic/ZQL/Type/Columns与此HEAD页面不完全相同，
不能混称已核实的原样实现。后续IZ-01–08是交叉整改方案，不增加119项台账计数，
未新增截图版页面或宣称完整JQL/保存视图。最新“继续”沿此方向，不绕过第一批验收。
当前安全复核发现WUI-06未知恢复锁仅当前页面有效，路由卸载/刷新后丢失；
必须保留“部分未完成”，待服务端持久操作意图/精确回执合同，不用浏览器内存冒充。
WUI-04已补持久测试回执与latest_test恢复；模型测试ready缓存遮蔽新回执问题已修。
最终367项前端、265项Python、生产构建与57项完整浏览器检查通过，60份截图、
无pageerror；证据`frontend/evidence/issues-rea-2026-11-14/`。实际发现并修复了
URL恢复却丢表单的问题，Forms与Workbench现共享navigation-guard，同一事件只判一次。
UI 13项中10项本地完成，WUI-01项目查询专项、WUI-06持久恢复、WUI-11完整history
仍3项部分；原119项统计不变。临时4187/5176已停止，正式4180/5173保留。

**实施过程快照：第二批多Agent整改与统一外观（最终结果以上方为准）：**
用户要求先完成UI待办，再按产品目标继续。当前待办入口仍为`docs/TODO_INDEX.md`，
原119项统计不变。项目详情已复用任务工作台；Quick find含任务、快捷键识别子弹层，
手机待处理详情和受控树展开已实现。筛选折叠移到筛选标题处；单排序移入表格右上
列菜单，加入真实列显隐/重置。包装层共享舒适/紧凑/触控默认尺寸，8样式外增加独立
强调色。以上仍待本批完整构建与浏览器回归，不能引用前批230/44作为新证据。
数据Agent实施WUI-11表单验证/草稿保护及WUI-04客户端，管理Agent实施持久模型测试
回执，交互Agent实施WUI-06原生恢复及回归。模型测试新增请求ID+consent及只读GET
对账，未知结果不自动重放；正式4180服务未重启，因此新接口需在新fixture验证。
先收敛代码与综合测试、更新证据，再进入下一批产品能力；没有commit/push、真实模型
或第三方连接。Zira本地commit与用户截图的排序位置不完全一致，见REA专项的新节。

**最新：全部待办与多Agent第一执行包（2026-11-14）：**
先读 `docs/TODO_INDEX.md`。原119项仍9完成/110未完全完成；完整110行已逐行核对，
37部分/56待办/15授权门槛/2暂缓。UI及BP包是交叉整改视图，不与原台账相加。
主Agent完成BP-01工作台区域重组；数据Agent完成WUI-02资料正文选择；
管理Agent完成WUI-07调用Dialog实时投影；交互Agent负责布局/只读场景回归。
WUI-02/07/13本地完成，其他10项及BP-02–05待实施；没有宣称全部长期能力已完成。
230项前端测试、构建和44项完整浏览器检查通过，证据
`frontend/evidence/blueprint-multiagent-2026-11-14/`，完整输出
`/tmp/mybot-blueprint-multiagent-20261114-r3/`。仍有>500KB警告。
本机4180/5173保留，测试服务已停止；无正式模型请求、后端权限/数据库变化、
commit/push或用户视觉最终接受。下一批优先WUI-01/03/10等共享查询/快捷键/全局查找，
列配置/多排序仍按BP-05单独合同实现。

**最新：先整体自顶向下分析排版（2026-11-14）：** 用户在列/排序截图后明确要求
先整体分析。新提案 `docs/LAYOUT_BLUEPRINT.md` 定义：现有全局顶栏/快速查找保留，
全局导航、页面上下文栏、主内容三层；Filters从页面顶部开始，与右侧页头同层；
右侧一行查询/条件/模式/视图，再结果与单一分页；详情按空间收纳。
四类页面和Astryx映射、响应式宽度约束及实施顺序已记录。
**这是待评审设计，未实施区域重排/列配置/多条件排序。** 本轮仅文档，无新模型/
业务改动/测试/commit/push。继续前先读蓝图，再对照WUI清单，不再按单个截图零散加控件。

**最新：整体产品与页面审计完成，整改待分批实施（2026-11-14）：**
先读 `docs/PRODUCT_UI_AUDIT.md` 的 WUI-01–13 和三批路线；不是全站已优化。
继续保留 Astryx 0.7.13 与同一业务树。待优先处理项目详情的旧工作台/查询口径、
Quick find 缺任务源、文档选中对象、子弹层快捷键、调用实时详情；模型测试未知结果、
快照409恢复和 React 原生重试/资源是独立合同工作。高级 PowerSearch/列插件/抽屉
按真实字段和验收渐进接入，不升级或引入第二套UI。
本轮只完成 WUI-13：总览“最近任务动态”每任务最近Run一行；并收紧列表一行查询，
顶部快速查找保持独立，手机条件用现有Dialog。214项前端单测、构建、39项浏览器
检查（含10路由×3视口、3表单）通过，证据
`frontend/evidence/product-ui-audit-2026-11-14/`。仍有>500KB警告；没有正式模型请求、
后端/权限变化、用户视觉接受或commit/push。原119项业务台账不变。

**最新：用户再次否定搜索和列表（2026-11-14）：** 不沿用下方“单条搜索/下拉”的
第 14 轮视觉结论。已逐段复核 Zira IssueNavigatorPage、JqlBar、IssueTable/Cell、
Toolbar 等实际源码，改为提交式查询带、可折叠真实状态/项目导航、结果工具栏及
编号/摘要独立列；手机保留同一筛选来源的 Dialog。Basic 草稿到搜索/Enter 才提交，
`q/filter/project/order/page/pageSize` 与现有 JQL/视图一起恢复；JQL 全语法仍不支持。
具体记录见 UI_ITERATIONS 第 15 节和 REA_ZIRA_LAYOUT 专项，最新结果以进度日志
“搜索与列表链路重做”为准。旧截图/静态设计/`web/` 保留，没有改 Zira 或调用真实模型。
最终 214 项前端单测、生产构建、38 项浏览器检查和 16 组样式/明暗计算值通过，
证据 `frontend/evidence/search-list-2026-11-14/`；仍有 >500 KB chunk 警告。
不要把本次技术检查或旧 36 项测试当作用户已经接受新体验。

**最新：整体产品审计（2026-11-14）：** 用户要求整体分析并优化 mybot 的功能与页面。
审计已写入 `docs/PRODUCT_UI_AUDIT.md`：当前主要缺口是壳层、页头/工具栏、任务/Run/
项目事实投影、unknown 状态、配置表单和移动行为不够统一，不是继续增加页面数量。
本轮先完成低风险跨页修正：总览“最近运行”改为每个任务一条最近 Run，历史次数放在
辅助信息中，避免同一任务的旧失败重复占据总览。三批优化路线已记录，不能宣称
所有页面已经完成优化。

**最新反馈与实施：工作台排版仍太乱（2026-11-14）：** 用户明确否定
`5173/#workbench` 的实际体验，不把此前模板整合/测试通过当作视觉接受。
当前默认路由改用 `FocusedWorkbench.tsx`：标题→单条搜索/项目/状态筛选→结果工具栏
→任务列表；移除本屏概览指标、常驻项目侧栏和重复新建入口。每任务一行，以最近 Run
展示当前事实，历史记录按需查看；桌面可选 Inspector，窄屏使用 Astryx Dialog。
任务/看板/运行记录分开，真实分页、共享排序、任务 ID 查询及 page/pageSize URL
恢复一起验证。所有样式仍共用 Astryx 包装与同一业务树，旧 web/设计保留。
最新验证与未完成边界见 `docs/PROGRESS_LOG.md` 的“任务优先工作台”条目；
新截图是待用户评审的迭代，不宣称已经达到/被接受为 Zira 效果。

**最新：用户要求完整研究 Zira 并多 Agent 分工（2026-11-14）：** 已完成全前端
625 个文件、79,264 行的结构索引，以及交互、数据、管理配置三条核心链路源码研究。
总报告 [ZIRA_FRONTEND_STUDY.md](docs/ZIRA_FRONTEND_STUDY.md)，三份专题为
`ZIRA_STUDY_INTERACTIONS.md`、`ZIRA_STUDY_DATA.md`、`ZIRA_STUDY_ADMIN.md`。
根 `AGENTS.md` 已合并动作真实性、URL/草稿、权限/缓存、unknown、元数据、版本/发布
和验收规则。结构扫描不等于逐行审计，三份源码专题也不代表 Zira 实际后端已验证。
没有改 Zira、读取其凭证/数据库或运行其应用。

**当前前端边界：** 用户明确要求保持 Astryx，可学习 Zira 的布局/搜索/列表/操作及同配色。
已生成 20 份 CLI 指定参考到 `frontend/src/app/`，适配为总览、筛选表/看板、待处理、
层级、资料、Run 工作图/对话、三步确认与偏好设置，而不是 20 个假业务站点。
采用地图见 [ASTRYX_TEMPLATE_INTEGRATION.md](docs/ASTRYX_TEMPLATE_INTEGRATION.md)。
同一业务树可切 Neutral、Zira、Gothic、Matcha、Stone、Butter、Chocolate、Y2K，
明暗/密度/语言独立保存；快速查找已移到顶栏。没有引入 Zira 的 Radix/CVA/Tailwind UI。

**查询与后端：** 用户给出的 jql/mode/view/groupBy/group 可随 URL 恢复，当前执行仅为
created/summary ORDER BY 白名单。无负责人/用户模型，assignee/currentUser 必须明确
拒绝，不默默返回全部。完整 JQL/分组/保存视图仍待实现。后端仍 Python/FastAPI/SQLite，
Rust 仅为后续经测量确定的节点候选；PostgreSQL 检查和建议见
[POSTGRES_EVALUATION.md](docs/POSTGRES_EVALUATION.md)，没有建库/迁移/改密码/重启。

**验证与继续：** 127 项前端单测、244 项 Python、生产构建通过；Theme Editor
13 项检查和 58/58 模板通过。产品浏览器最新完整结果为 31 项、16 组样式/模式计算值，
含 Zira 配色、URL恢复、键盘与手机；证据与最终补测以 PROGRESS_LOG 本轮条目为准。
仍有 >500 KB 可选运行时/共享 chunk 警告，不声称性能优化全部完成。
旧 4180 生产入口保留，新预览为 5173。原 119 项台账计数不变，继续先做真实交互/查询/
重试资源闭环，不再无边界增加模板或套用 Zira 的 Jira 领域。

**最新：Astryx 真实业务工作台（2026-11-13）：** 用户要求重新分析项目并用 Astryx
实现。本轮结论和后续顺序见
[ASTRYX_WORKBENCH_REASSESSMENT.md](docs/ASTRYX_WORKBENCH_REASSESSMENT.md)。
沿用既有 FastAPI/SQLite/Harness，不重写 Rust 或再加编排框架。React 默认入口改为
`frontend/src/workbench/`，通过项目自有 Astryx 包装层实现任务/项目列表、筛选检索、
项目/任务保存、文件快照与角色/资源确认、模型配置/默认选择/显式测试、本机后端配置/
确认健康检查/撤销、真实 Run 阶段/Agent/调用/成果/审计、成果审查下载和暂停/确认取消。
支持中英文、明暗主题、手机导航/成果视图；认证失效清空私有投影。保存/打开页面不会
自动调用模型。重试资源/恢复、会话缓存仍明确链接旧版，不伪装已迁移。

**预览与边界：** `http://127.0.0.1:5173/` 是新 React 工作台，默认代理本机 4180；
`#templates` 保留独立工具，不会读取 Bootstrap。4180 仍由 FastAPI 提供旧 `web/`，
未替换生产静态入口，未开放局域网访问。旧 React 摘要/Chat 源保留但不再作为默认产品页。
新业务组件不直接依赖 vendor，Theme/语言与表单/弹层由 `components/ui/` 封装。
Vite 只改写同源 Origin，不放宽后端校验。

**本轮验证：** 生产预览隔离 fixture 的 25 项浏览器检查通过，包含 1440px、
320/390/768px、焦点返回、Escape、深色/英文、暂停/取消、撤销与退出清缓存；
244 项 Python、112 项前端测试及 typecheck/build 通过。主题编辑器 13 项检查与
58/58 模板生产渲染通过。正式账号/数据未写入，没有真实模型调用或第三方连接。
浏览器初次运行发现保存后刷新竞态，已改为等待刷新再关闭；开发依赖优化热重载曾报错，
最终稳定生产预览无 pageerror。最终证据和复现方法见进度日志与
`frontend/scripts/verify-workbench.mjs`。

**性能与下一步：** 不再将 Core/图标/所有主题强行合并进产品首屏；生产登录后初始
JS 实测约 0.82 MB（gzip 260 KB），不加载 Monaco/TS 编译器/模板页。共享样式及可选
预览仍较大，构建仍有 >500 KB 警告，不能宣称性能优化完成。接下来先迁移 React
重试与资源、恢复及会话缓存，再做生产入口等价切换；设备接力、应用连接、任意 DAG、
代码执行权限仍为独立后续工作。原 119 项台账计数未因本轮测试数改变。

**Theme Editor 完整接入（2026-11-12）：** 已按固定上游
`5770e5b197cf80d5a824667c23046887cc8fa0f5` 移植三层编辑器：Base Styles
（颜色/字体/字号比例/圆角/间距/尺寸/动效/四种预设）、Components（组件 Token 与自定义
CSS 覆盖）、Advanced（分组原始 Token）。七种主题可选，支持独立明暗分支、切换确认、
重置及安全导出 `defineTheme`。编辑通过结构化主题消息驱动 iframe，状态跨视图切换保留。
本地源码已配置 StyleX 编译；不再只依赖预构建 CSS。

**Playground 运行时完成（2026-11-12）：** 使用独立 `preview.html`、始终
`sandbox="allow-scripts"`、nonce/MessageChannel、CSP 禁止连接/表单提交、运行时
ErrorBoundary、提交后 rendered、白名单/主题校验、超时/重试；已撤销父页 fallback。
Monaco、self-hosted TypeScript/TSX 编译器、StyleX runtime shim、编辑后实时预览、
编译/运行时错误恢复、Targeting 和属性源码回写已接通。属性面板现由 pinned
Astryx Core 的 162 个 PropDoc 组件注册生成，不再依赖 Button/Card/Text 手写子集。
预览依赖已拆分为独立 TypeScript/Core/主题/图标/图表 chunks。模板页不读
`/api/bootstrap`。58 模板按需加载，源码也按需读取；生产构建仍有较大的预览运行时
依赖总量，但 `PreviewRunner` 入口已从约 5MB 降至约 16KB。支付模板远程 Logo
改为离线文字；字体不自动联网下载。

**最终验证（2026-11-12）：** `pnpm typecheck` 通过，前端 85 项测试通过，`pnpm
build` 通过；Chrome 浏览器已验证 Monaco、本地类型声明、编辑/编译/错误状态、
Theme Editor、模板切换、Targeting、属性 Apply 回写、桌面和手机视图。保留的差异
是上游回调/slot/ReactNode 等不可安全写回类型仍显示只读，以及预览依赖总量仍较大；
本地运行时只允许白名单模块，不把任意网络或业务 API 暴露给编辑器代码。

**当前验证与继续位置：** 测试与生产浏览器证据见
[REA_ASTRYX_THEME_EDITOR.md](docs/REA_ASTRYX_THEME_EDITOR.md)，本地入口仍为
`http://127.0.0.1:5173/#templates`。旧 `web/` 未改、未替换生产静态入口，
没有真实模型调用或后端权限变更。本次用户明确要求 commit + push；以后不能据此重复
推送新的未请求改动。后续先补 Monaco/TSX 编译隔离或选定模板的业务迁移，不再恢复成静态
Theme mock。

**React/Astryx 迁移授权（2026-11-11）：** 用户已明确授权将当前 `web/` 原生
HTML/CSS/JavaScript 应用逐步迁移到 React 19+ + Astryx。该授权只改变实施边界，
不代表迁移已经开始或完成。按 [ADR-0006](docs/decisions/ADR-0006-react-astryx-frontend-migration.md)
执行：先保留 vanilla 回滚路径，按切片替换并做桌面/移动端、键盘、无障碍和构建验证；
不要一次性删除 `web/`，也不要把迁移工作混入模型、Provider 或 Agent 执行权限变更。

**Astryx Playground 参考授权（2026-11-11）：** 用户先允许借鉴指定的
`https://astryx.atmeta.com/playground` 组件和页面模式，以及两个带 `#code=...`
的变体；随后明确升级为允许选定组件/模板的本地完整复刻。编码后的示例仍需经过
项目封装、品牌替换和许可证检查，不能把 Astryx 官方身份带入产品。

**Astryx 本地复刻授权（2026-11-11）：** 用户进一步明确允许使用
`/components`、`/docs/theme`、`/templates` 和指定 Playground 变体，选择合适的
组件/模板在本地完整复刻，作为 React + Astryx 迁移切片。复刻结果必须改成 mybot
品牌，保留许可证和第三方依赖审查；该授权不代表已经完成迁移。

**React 第一切片已实现（2026-11-11）：** 新增 `frontend/` Vite 应用，使用 React 19、
Astryx Core 0.7.13、neutral theme 和项目自定义 `mybotTheme`；已接入 Theme 明暗切换、
项目自有 Button/Text/Badge/Stack 适配层、响应式工作台 Shell，以及真实
`GET /api/bootstrap` 的项目/任务/运行摘要。Vite `/api` 代理默认指向
`http://127.0.0.1:4180`。旧 `web/` 仍是当前 FastAPI 静态入口，React 尚未替换生产入口。
验证：`pnpm typecheck`、`pnpm build` 通过；Playwright/Chrome 已检查 1440px 与 390px
截图。构建仍有单个 JS chunk 超过 500 kB 的性能警告，尚未做代码分割。

**Astryx AI Chat 迁移切片已实现（2026-11-11）：** 新增
`frontend/src/ChatWorkspace.tsx`，复用 Playground 的 ChatLayout、Composer、Message、
ToolCalls、Markdown、Artifact 双栏、Resizable 和移动端 Dialog 能力；内容来自真实
`GET /api/runs/{id}` 的 Agent/Call/Artifact，不使用示例对话冒充执行记录。入口为
`#chat` 或侧栏“对话与成果”；发送保持只读并明确禁用。已验证桌面 1440px、手机 390px，
手机点击“打开成果”能打开全屏 Dialog。当前生产静态入口仍是旧 `web/`，下一步是把
React 路由接入 FastAPI 或继续迁移模型/后端/项目详情页面。

**Astryx 页面模板本地化（2026-11-11）：** 通过 `@astryxdesign/cli@0.7.13`
生成 58 个页面模板到 `frontend/src/templates/generated/`，包含 AI Chat、
Dashboard、Shell、Table、Settings、Form、Login、Work Item 等页面形状；新增
`#templates` 本地目录/预览入口和 `frontend/README.md`。模板源已通过 TypeScript
检查和 Vite 构建，当前属于可预览的本地复刻层，不等于已把每个模板都接入 mybot
业务事实。后续应按研发工作台需求，把合适模板替换进真实页面，不要把全部模板一次性
加载进产品首页。

**Astryx Playground REA 对比已完成（2026-11-11）：** 已直接读取本地
`/home/my/workspace/ainfra/mywork/astryx/apps/docsite/src/app/playground/` 源码，
对照 `PlaygroundClient`、`PreviewStage`、`ThemeEditor`、Monaco、iframe runner、
postMessage channel 和移动端行为。报告见
[REA_ASTRYX_PLAYGROUND_COMPARE.md](docs/REA_ASTRYX_PLAYGROUND_COMPARE.md)。
当前 mybot 已补齐 Playground 壳层、58 个模板源码、hash 分享/恢复、模板切换确认、
Desktop/Phone、暗色、全屏和导出；实时 TSX 编译、sandbox iframe、真实 ThemeEditor、
Build 状态和 targeting 仍是后续 P0/P1。

**Playground 安全预览切片（2026-11-11）：** 多 Agent 已补齐
`frontend/src/playground-preview/`：nonce + MessageChannel、ready/building/rendered/
error/rebuild、模板白名单、开发/生产 sandbox 差异和 iframe 恢复。生产预览使用
`sandbox="allow-scripts"`，不会执行编辑器任意 TSX；当前仍不是 Astryx 的 Monaco + TSX
编译器完全复刻。REA 报告已更新当前完成度和剩余 P0/P1。

**最新 B04/B05 修正：** 固定源码权限核对已完成离线阶段，见
[OPENMAUSBOT_READ_SCOPE.md](docs/OPENMAUSBOT_READ_SCOPE.md)。owner/service、admin/client 都不是
天然只读 scope；默认生产 transcript 同步现 fail closed（backend_sync=false），仅显式健康检查可联网。
测试注入的 MockTransport 可走完整会话读取。缓存 GET/Bootstrap/同步写回事务均检查撤销；
Adapter 使用当前 Store 连接，不依赖进程内先列会话。原生 Bot GET 使用 messages=0，
近期消息只投影 kind=text/role=user|bot/at，持久化 hasMore 并展示历史缺口；不宣称全历史或 SSE 接入。
旧 32dd2fd 的浏览器测试未覆盖读取路径，本轮补齐确认、无重复请求、刷新、缓存/XSS 与撤销用例。
当前 119 项仍 9 完成、37 部分、56 待办、15 授权门槛、2 暂缓，未完全完成 110。
本轮完整回归 244 项 Python、5 视口/15 条浏览器交互通过，无真实模型/账号/上游运行。

**最新工作项口径：** [WORK_ITEMS.md](docs/WORK_ITEMS.md) 是当前单一清单，保留原 001–119：
9 完成、37 部分、56 待办、15 授权门槛、2 暂缓，未完全完成合计 110。实现计划不重复计数，
没有把仅有合同/mock 的原生接入标记完成。旧条目中的历史测试数/下一步以本条及台账覆盖。

**最新交付 B01–B03：** 模型与控制页已可保存本机回环 Backend 配置；保存/列表/GET health
不联网；显式 POST check + consent 才请求一次 `/api/health`，拒绝重定向、64 KiB/10 秒限制，
不读取凭证、不启动 Agent。检查结果只标 reachable/authentication=unverified/read_access_verified=false。
支持幂等撤销、在途检查不能覆盖撤销，撤销后禁止检查和缓存会话读取。测试只使用
MockTransport，生产未新增连接/账号。下一执行包为 B04 会话工作区和 B05 离线认证读取合同，
真实账号/付费/上游启动另行授权。逐包结果见 PROGRESS_LOG 2026-11-10。

**最新真实执行成功（2026-11-09）：** 用户明确“你自己跑吧”后，仅创建一个关联重试 `49acc6c258094a2794b153a6b6629800`，来源 `bd69...`。规划复用，新增调用预算 3、Codex 单通道、单次时限 240 秒。两项研究与汇总均成功，耗时分别 109074/126864/88651 ms，总历时约 5 分 25 秒，3 份成果均待审查。CLI 报告 input 41460/output 9993 tokens；金额未知，不包含来源失败调用。没有再次重试、切换 Provider 或修改来源记录。仍未附加源码快照，输出为分析提案；正文引用了 CLI 自动上下文中的 AGENTS.md，因此不能声称输入严格只有 mybot 可见快照。CLI 无工具 ceiling、隐式上下文、输出 Token 硬上限仍是未验收边界。进度记录已更新，当前无活动 Run；后续不要重复消费这次真实执行授权。

**最新 P0 隔离修复（2026-11-09）：** 针对上述真实 Run 暴露的隐式 `AGENTS.md` 上下文问题，Codex Adapter 现在在临时空 cwd 启动，不进入用户仓库；显式忽略用户配置和规则，禁用项目文档加载、web search 和 shell 环境继承。用户确认的快照仍通过 prompt 发送。181 项 Python 测试、5 视口/11 条浏览器交互通过；没有新的真实模型调用。该隔离降低隐式上下文风险，但不等于完整工具权限 ceiling；下一步进入 OpenMausBot 只读适配前，继续冻结工具/权限合同。

**最新 Phase 3 只读 Adapter（2026-11-09）：** 已新增 `BackendConnection`、`ConversationRef`、`MessageRef`、`ConversationBackendPort`，SQLite 表和只读 API；通用 Adapter 与 `OpenMausBotNativeReadAdapter` 已通过隔离 MockTransport 合同测试，覆盖 GET-only、观察到的 `/api/bots` 和 `/api/threads/{threadId}/messages?limit=N`、游标/去重/错误映射，并固定研究 commit `1bc4749aa8307d7d6998bf86de4ef6478460dd93`。未连接真实账号，不提供发送接口。191 项 Python 测试通过。下一步是核对原生认证、SSE/replay 和运行恢复，再接 adapter service。

**Phase 3 健康检查合同（本轮）：** `OpenMausBotNativeReadAdapter.check_health()` 已按固定发布包观察到的 `GET /api/health` 实现 MockTransport 映射，验证 `app=openmausbot`、`static` 字段、401/403 和错误服务身份；不修改连接状态、不读取凭证、不连接真实账号。完整 Python 回归 195 项通过。

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
