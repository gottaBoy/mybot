# 有界嵌套任务交付

日期：2026-11-27，America/Los_Angeles。用户继续既有核心、多Agent、提交push授权；
起点`73191b1`干净并与origin/main一致。
[计划](../../../docs/CORE_NESTED_PLAN_2026-11-27.md)、
[ADR-0036](../../../docs/decisions/ADR-0036-bounded-nested-task-plans.md)。

## 最终验证

| 验证 | 实际结果 |
| --- | --- |
| 后端全量 | `MYBOT_REQUIRE_PI_RUNTIME=1 .venv/bin/python -m pytest -q`：1565通过，496.05s |
| 结构定向 | 28新增nested+19旧plan+35旧revision共82通过 |
| 准备放弃 | 17通过，含archive/CHECK/幂等/权限/设备竞争/原数据迁移 |
| 执行与恢复 | 112相关检查通过，含8新增scope、设备与durable recovery |
| 旧功能复验 | 311查询/项目/保存视图等通过，74.29s |
| 前端 | 87文件/2526测试，6.74s；TypeScript通过 |
| 生产构建 | `pnpm build`通过，17.07s |
| Nested专项 | 全新`a9aj4kyz`，9检查/16PNG，pageerror0/externalHTTP0 |
| Discard专项 | 全新`p2cv2xzm`，6检查/4PNG，pageerror0/externalHTTP0 |
| 综合浏览器 | 全新`pn1fon2b`，58检查/61PNG，pageerror0 |
| 主入口 | 英文1440/中文390共8项GET-only，写请求0、无外部HTTP/错误/截图 |

合计81最终浏览器检查、81最终fixturePNG。保留原httpx弃用与大chunk构建警告。
Bootstrap仍全量；119/9/110台账不变，测试数不是完整产品范围的完成比例。

初始app241.22kB/gzip75.21、CSS39.89/7.50；lazyPlanEditor16.23/6.00、
PlanPanel26.85/8.82、CodingDialog31.17/10.10、Run27.17/9.86、Task37.83/12.46。
相较上一批，初始JS增长；没有新增或升级React/Astryx/第三方依赖。

## 实际嵌套链

`tests/nested_plan_browser_server.py`是独立空fixture，只提供受控FakeProvider和只读统计。
真实Task、计划、Run、审查全部通过应用API和UI创建，不是预置状态或业务成功占位。
模型文本为fixture，HTTP、SQLite、Worker、门禁和人工决定是真实执行。

根计划为`X -> A -> B`，A内为`A1 -> A2`：

1. X未接受时A可以提前规划，A1即使没有本层前置也被祖先门禁阻止。
2. X运行并接受后，A1可以启动；A1成功但未审查时A2仍被阻止。
3. A1接受后A2运行、接受；B仍等待A自己的收尾与人工验收。
4. A新收尾Run记录当前子证据scope，接受报告后B可实际启动。
5. 撤回A1接受后，未来B执行被挡；已完成B、A原context和原已接受报告不重写。

最终6Task、2plan、1nestedroot、5Run、20FakeCalls、15Artifact。
根Task`776581c5df2b4fcbb49926529f972813`；
A为`d980551ba99d4cc1a2ea6f2b9506d394`，
收尾Run`320ed766c0fe4efd8363d1e0284fb100`。
没有自动把根目标标成完成，也没有给B或根自动接受报告。
原文件hash始终相同，子报告正文未隐式发送给A模型。
详情见[nested/verification.json](nested/verification.json)及
[收尾准入](nested/integration-admission.json)。

嵌套创建故意丢响应，用原`taskPlanRequest` GET核对，1次创建POST；
A1已准备补充执行也故意丢响应，同一原ID核对，未产生第二Run。
旧schema1原创建回执保持原样。实际点击子链接进入孙Task；
模拟已广告读取失败时禁止执行，不伪造空计划/零计数。
三style双mode、英文1440/中文390的同一parent+ownplan布局、dirty/Escape/焦点均验收。

## 实际准备放弃

独立fixture只有1flatTask、2条不可变消息，0Run/0Call/0Artifact。
第一次消息已准备；确认对话框Escape保留候选并恢复焦点。
再次确认时1次discard POST应用后故意丢响应，原向导保持unknown，
原TaskTurn GET核对后才确认discarded。刷新仍保留原消息、candidate/hash。
之后新消息可以准备，证明原prepared锁释放；手机中文确认也可取消且无第二discard。
详情见[discard/verification.json](discard/verification.json)与原候选回执。

归档使用两nullable列，精确保留旧候选字节；内部saved/candidateNULL满足原CHECK，
public为discarded并仍返回原候选。原同输入prepare重播可返终态，不能再执行。
已应用候选不能放弃；未知结果不能因404/timeout直接抛弃。
17项后端检查与独立审计证明设备执行和discard只有一个合法赢家；
当前grant变superseded，旧grant操作回执不变。配对端没有owner discard权限。

## 作用域与限制

最多root→child→grandchild、73个当前Task，每层2–8同级DAG，文件逐级subset。
历史退役不计入当前73分母。祖先外部门禁与自身children验收分开，避免循环等待。
容器供上层使用时，必须最新成功报告人工接受、当前ownplan+children scope仍匹配。
只改变外层顺序且复用未改容器，不虚构新的child completion scope。

普通预览、TaskTurn、coding准备绑定新的nested scope；execute、claim、
resume/retry/recovery和devicegrant重验。scope变化即便仍ready也不能改绑旧候选或复用旧输出。
恢复exact同一accepted证据可恢复scope，这是当前状态语义，不是永久撤回日志。
外部仍是直接依赖：X后来撤回不自动撤A历史报告或给B添加X依赖；
需要X和A时必须显式让B依赖两者。child scope变化则使A收尾过期、立即挡B。

永久marker、definition/binding/Task/member双射和bounded tree都需有效；
缺失不降flat、不静默丢前置。首次nested及nested结构编辑要求全当前树空闲，
预览绑定lineage/treeheads/impact/CAS，事务内重验；替换容器退役整个当前子树。
新Task不自动继承旧subplan或报告，旧版本、Run、回执和默认字段省略保持。

本批没有AI建议/自动规划、跨层依赖、自动Run链、子代码合并、通用Task完成状态、
真实模型质量或团队权限认证。子报告不因门禁自动成为模型上下文。

## 失败与修正

- 独审实证marker丢失、bindings缺项、member丢失会绕过祖先门禁；
  已集中严格验真并重放为409、无新Run/调用。
- 首轮scope测试漏导入fixture，recovery测试漏consent；修正测试后8项scope通过。
  新preview提前拒坏树时，旧helper不再假定一定有context_hash，继续验证POST拒绝。
- 首全量1523通过/42失败：root新`require_scope`导入覆盖SavedViews同名函数，
  已alias隔离；另补两份安全seed的精确新表清单，没有放宽fixture边界。
  修后311旧功能与1565全量通过，原失败日志保留。
- 首discard脚本把taskSend恢复误当自动完成；实际需点“核对保存回执”，
  脚本改为核对原GET再打开prepared，产品未改。原失败截图/报告单列。
- 临时服务中断曾使综合page inventory超时；最终使用身份绑定的独立临时服务。
- 旧综合mock关了task_plans却继承新nested capability，并中止所有新GET，
  因而向导正确禁止Next。仅把这些明确legacy投影的nested能力也关掉；
  广告新能力后读取失败仍必须阻断，专项已真实验证。最终新fixture全58项重跑。
- 主只读后比对脚本一处PRAGMA按dict取tuple，改为列索引后比对通过；
  无数据写入或权限放宽。

早期通过不拼成最终结果；最终两个专项、综合、主入口各自独立完成。
截图/报告与[失败记录](failures/)分开，完整命令日志也保留。
首轮失败日志仅清理行尾空格，不改异常内容、测试数或结果；临时原输出保持。

## 本机启用

入口`http://127.0.0.1:5173/`。4180原空闲369142经身份/cwd/env内存核验、
一致备份、Store副本迁移演练、原行比对、SIGTERM/锁释放，同command/cwd/env启动896247。
5173原进程保持，nested_task_plans/task_turn_discard均true。
主8项GET-only之后再次逐值比对原表原列一致：
1Project/1Task/6Run/1model/18Agent/17Call/6Artifact/157Event、原Workflow保留。
coding_jobs/task_turns/model_tests/task_plan_versions/task_plan_nested_roots均0。
没有在主环境发布计划、预览源码、创建候选、discard、测试或调用模型。
[只读报告](primary-get-only.json)不含原正文/DOM或私有数据摘要。

私有备份`.runtime/backups/before-devices-20261127T180601Z/`目录700、DB/log600，
不进Git，无原环境/正文/截图或原摘要导出。身份绑定脚本不可直接用于下一轮；
新schema不能与旧服务代码热混用或热覆盖回退。临时4187/4188/4189/5176/5177/5178已停。
下一核心：显式模型/预算/资料确认的AI建议拆解、草稿审查与人工发布。
