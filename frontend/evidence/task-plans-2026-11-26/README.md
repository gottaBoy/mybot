# 真实任务拆解、依赖与人工报告门禁

日期：2026-11-26，Asia/Singapore。
合同：[ADR-0030](../../../docs/decisions/ADR-0030-task-breakdown-dependencies.md)。
本批把目标拆解接到真实Task、Run、Agent、报告审查和下一项工作。

## 当前可用流程

Task目标页 -> 拆分任务 -> 填写2–8个子任务的目标、验收和显式资料
-> 明确前置关系 -> 核对候选 -> 确认创建。一个事务创建真实Task和固定依赖，
父Task不改，创建不读取源码、不启动Run或模型。

打开子任务后沿既有资源/模型确认开始工作。后续任务必须等待前置Task的**最近Run**
成功，且最终报告经人工接受、没有未解决的“要求修改”，才可启动。
新失败/未结束Run、缺报告或撤回接受都会阻止后续新执行。这个条件不是通用Task完成
状态，也不证明只读研究执行过测试。父Task状态不会由子任务自动改写。

执行门禁覆盖普通Run、TaskTurn、隔离编码、恢复/旧resume和设备一次执行委托，
并在worker领取队列时再次核查。入队后前置条件被撤回的尝试，在新模型调用前失败。
运行中的既有授权不会被静默取消；原历史保留，后续启动重新核查。
队列准入和开跑时的凭据分别记录；开跑被阻止时也保存当时具体的阻塞快照。
这些记录包含源Run/报告ID与digest，不隐式把前置报告正文发送给模型。

计划定义是固定v1，运行/审查状态是同一只读快照中的当前事实。刷新依赖或重新打开
Task会重新读取；这不是实时结果集租约，实际启动总由后端再次验证。
首版没有持久编辑草稿、修改已创建计划、嵌套/AI自动拆解、自动DAG调度或原项目写入。
更多测试runtime仍待；本批没有新的模型工具或执行权限。

## 实际验收

专项从空fixture创建一个目标，明确拆出两个真实Task：

1. 分析明确提供的README，得到实际FakeProvider Run和最终报告。
2. 根据已验收结论生成验证建议，依赖第一Task。

创建/预览不运行模型；循环关系在本地拒绝。实际POST创建成功后丢响应，reload通过
原operation GET恢复，始终只有两项子任务、一份计划和一次创建POST。
未运行/成功但未审查时，第二Task界面与直接Run POST均被阻止。
通过实际成果按钮接受第一份报告后，第二Task运行成功；各4个Call，总8个。
其上下文记录源Run/报告身份，却没有附加第一Task报告正文。
之后通过真实“要求修改”撤回前置报告接受，第二Task未来执行再次阻止，
已经完成的Run仍成功，其原准入凭据保持原样。

正文生成使用注入的FakeProvider，HTTP/SQLite/Task创建、调用记录、门禁和审查动作真实。
这不是真实付费模型、Codex生成质量、账单、实际代码测试或物理设备认证。
原119/9/110台账保持；不因这些检查数量宣称总目标已完成。

最终端到端fixture：`/tmp/mybot-astryx-workbench.pSBtFg`。
另加一个独立编辑专项根Task，用于390px中文长标签、Escape/保留草稿和底部取消检查，
最终fixture为4Task/2Run：原目标+2子任务+编辑专项根Task。编辑专项没有创建子任务/
计划或增加Run。独立综合fixture：`/tmp/mybot-astryx-workbench.f4jLyW`。

## 证据与结果

- [拆解/执行/人工审查专项](plans/verification.json)：8检查、10PNG。
- [中文手机编辑与读取失败](editor/verification.json)：3检查、1PNG。
- [既有工作台综合](workbench/verification.json)：58检查、61PNG。
- [原创建回执](plans/plan-creation-receipt.json)。
- [第二Task准入凭据](plans/dependency-admission.json)。
- [三样式/双mode的中文手机](plans/plan-zira-dark.png)和[桌面](plans/plan-neutral-light.png)。
- [具体前置阻塞](plans/prerequisite-blocked-desktop.png)。
- [当前阻塞与原准入并存](plans/current-block-and-original-admission.png)。
- [中文长表单与底部取消](editor/editor-zira-dark-mobile.png)。

加最终主入口8项GET-only，共77浏览器检查、72最终fixturePNG，
最终pageerror/外部HTTP0。三style双mode、英文1440/中文390和reduced motion；
手机输入通过真实控件，但未声称物理IME/Safari/真机认证。

前端最终2278项/79文件，Python全量1288项通过，随后对最终阻塞证据细化与夹具安全
进行22项定向复验；typecheck/生产build通过。
保留Starlette/httpx弃用与大chunk提醒。日志：
[前端](frontend-tests.txt)、[Python](python-tests.txt)、[最后定向](targeted-tests.txt)、
[构建](build.txt)、[最终主入口只读](primary-get-only.txt)。

最终app JS207.08kB/gzip65.89、CSS39.89/7.50；lazy TaskPlanEditor8.39/3.53、
共享TaskPlanPanel及DTO19.59/6.55、TaskWorkspace36.77/12.17、RunWorkspace25.25/9.31，
任务计划CSS1.11/0.41。入口指标不是全部transfer；Bootstrap仍全量，未宣称性能减量。

## 保留的失败

- `failures/react-mock`：旧Task工作区测试把分页对象套给所有useState，新增状态后React
  收到了对象正文；修正测试只替换实际分页状态，未为通过测试改业务逻辑。
- `failures/schema-seed`：严格空库夹具的表清单缺新4表；只更新确切清单，保留路径、
  marker、空库与禁止二次写入的限制，之后全量通过。
- `failures/nested-summary`：脚本summary定位匹配了准入详情与嵌套报告凭据，
  改为项目-owned外层详情的直接summary；最终从新fixture重跑。
- `failures/preview-stopped`：临时5176 preview进程停止，初次页面导航失败，
  没有执行业务请求；恢复后从空fixture完整运行。
- `failures/guard-label`：Astryx关闭按钮和页脚“继续编辑”同名，
  改为项目表单操作栏的实际按钮。草稿本身保持正确。
- `failures/native-dialog`：截图脚本只查显式role，漏掉原生dialog；
  改为同时识别native/ARIA呈现。
- `editor-before-footer`保留底部“取消编辑”补充前的成功画面；最后窄屏专项已重新执行。

## 本机启用

原4180空闲PID3844765经过identity/cwd/env内存核验、一致备份、私有副本Store演练、
原表原列比对与优雅重启为48883；最终阻塞证据细化后按相同流程对齐到84755。
`task_plans=true`，主5173入口已加载新能力。最终8项桌面英文/中文390只读通过，
新建表均为空，没有为正式Task预览/创建计划、子任务、模型或测试。

浏览器后再次比较原行全部相同：1Project/1Task/6Run/1model/18Agent/17Call/
6Artifact/157Event，coding_jobs/TaskTurns/设备/执行授权0；Workflow草稿1/version0/op0。
4张新计划表0行。新增报告读取索引不改变原数据。

私有备份`.runtime/backups/before-devices-20261126T135751Z/`与最终
`before-devices-20261126T141139Z/`，目录700/DBlog600，不进Git；
无正式正文/截图/环境/原摘要导出。旧PID绑定脚本不可重跑，不热覆盖数据库回退。
临时4187/4188/5176/5177已停止，主4180/5173保留。
