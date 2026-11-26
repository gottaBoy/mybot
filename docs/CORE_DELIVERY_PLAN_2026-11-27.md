# 核心研发交付计划：计划修订与 Pi

日期：2026-11-27，Asia/Singapore。用户明确要求深度分析、列计划、多Agent实现，
并最后补充Pi能力。起点`aee6715`，干净且与origin/main一致。
本文件区分已观察实现、本批决定、待验证行为和后续范围；不是完成率台账。

## 1. 当前能力与真正缺口

| 能力 | 已有源码和本地证据 | 断点 | 本批决定 |
| --- | --- | --- | --- |
| 目标与任务 | Task工作区、2–8真实子任务、报告前置门禁 | 计划只能发布v1；需求变化不能修订 | 优先完成不可变计划版本和影响确认 |
| 执行与成果 | 只读研究、隔离修改、unittest/pytest、可信检查点接续 | 原文件变化只能拒绝接续 | 保留拒绝，冲突合并单列后续 |
| 持续工作 | 不可变消息、显式成果引用、下一轮冻结 | 没有自动记忆或长期Agent | 不以修订计划偷偷增加隐式上下文 |
| Runtime | Chat/Codex适配，实际Call/usage/取消/unknown | Pi只有文档和自有协议夹具 | 最后增加真正受限的Pi文本Provider |
| 可观测 | Task/Run/Agent/Call/Artifact/Event、原ID回执 | 新计划/新Runtime必须进入同一事实链 | 复用，不另建一份状态或假成功入口 |

观察入口：`workbench/task_plans.py`、`provider.py`、`coding.py`，
`frontend/src/workbench/task-plans.ts`、`TaskPlanEditor.tsx`、`TaskPlanPanel.tsx`。
基线1312Python/2309前端及此前浏览器证据不能替代本批验收。

现有v1 parser把version/创建时间/原始Task内容严格绑定；直接放开version数字会破坏合同。
旧Task和Run不能因“改计划”而换掉目标或依赖含义。Pi的默认资源发现、自动重试、
压缩和缓存保温也不能继承为mybot的调用授权。

## 2. 实施次序与分工

| 编号 | 负责人 | 交付 | 验收标准 | 状态 |
| --- | --- | --- | --- | --- |
| A0 | root + 三Agent | 当前源码分析、优先级、精确合同 | 明确不可重写事实、权限和费用边界 | 已完成 |
| A1 | backend_workflow | 不可变计划版本、CAS、影响预览、精确回执 | 同基线竞争仅1次发布；旧Task/Run/原receipt保持 | 已验收 |
| A2 | frontend_workflow | 同一编辑器修订、版本历史、影响/阻塞确认 | dirty不丢、409不rebase、unknown原ID只GET | 已验收 |
| A3 | root + backend | 修订准入与跨入口校验 | 退役Task不可新执行；未变运行不受干扰 | 已验收 |
| A4 | verification_docs + root | 固定Pi SDK/受限bridge/Provider/UI | 真SDK对本地mock，单请求、空工具、实际maxTokens | 已验收 |
| A5 | root + 三Agent | 回归、浏览器、证据、本机启用、提交push | 原正式行不变、无真实模型自动调用、工作树同步 | 回归/启用已验收，Git回执单列 |

并行的是领域实现和测试；发布、迁移、正式环境启用及push由root顺序执行。
各Agent不修改兄弟项目、不读凭证、不运行真实付费模型。

## 3. 计划修订合同

1. 保留v1四表、原Task、Run和创建回执；新增不可变版本/成员/修订操作记录。
2. 当前计划仍2–8项、无环、显式文件为父Task文件子集；preview/发布只读元数据。
3. 同key字段及前置key/Task身份均不变才复用Task。新增或修改创建新Task；
   前置身份变化向下游传播替换，影响预览完整列出复用/新建/替换/移出。
4. 移出/被替换Task保留历史并退役，仍可查看和保存补充，不能启动、恢复或消费执行委托。
   受影响Task存在活动/排队/暂停Run、prepared/unknown候选或未消费委托时阻止发布；
   无关且未变的运行不被取消。
5. 预览绑定root、base version/hash、完整候选、父快照和影响；发布再次事务核对。
   409保留草稿和旧基线，不自动换新版本重试。
6. 同request/input先返回精确原回执，之后才处理当前CAS/阻塞。未知保留原ID，
   reload只GET；404不是在途写入已结束的证明。
7. 当前计划显示实时review/gate；历史版本仅不可变定义与Task快照，不能伪造过去验收。
   旧Run准入快照保持原样，新准入记录新版本/成员身份。
8. 新能力显式advertise；旧v1DTO保持。新版本读取失败不得退回旧Bootstrap/v1假成功。

## 4. Pi能力范围

先落地Pi作为现有研究和编码JSON生成的文本Provider，mybot保持唯一业务事实源。
Pi完整工具Harness、扩展/MCP/Skill、长期会话、执行迁移不在该首片授权范围。

- 固定SDK发布身份、版本、integrity和许可，不把源码commit冒充发布包构建证明。
- 专用Node bridge、空工具、空资源、内存session/auth/settings；不读HOME/AGENTS/账号。
- provider/model/HTTP(S) endpoint/key_env由用户明确配置；不使用Pi内置OAuth或其他CLI登录。
- 禁自动retry、compaction、cache warming、telemetry和包发现；一次mybot Call仅一次上游请求。
- SDK实际绑定maxTokens；原生RPC缺逐次该字段，故不提供通用RPC透传或静默忽略。
- 最终成功、truncated、error、aborted、timeout/unknown分别处理；取消清理整个进程组。
- 输入/输出usage独立于cache，成本估算不冒充账单；不记录隐藏reasoning。
- 缺SDK/Node时明确不可用，不下载、不切Chat/Codex。保存配置不调用模型。

## 5. 验收路径

计划：创建v1→前置Task实际研究并审查→修订要求→完整影响确认→发布v2→
旧Task/Run/回执仍读得到，新Task必须满足新依赖→双标签CAS冲突→丢响应reload核对。

Pi：用户明确配置/测试或启动→受限bridge→真实SDK→仅localhost mock→
严格JSON修改隔离副本→实际pytest→失败反馈/有限修正→Diff/测试/报告→人工审查。
模型回答由mock控制，SDK、协议、文件修改、测试与持久化必须真实；
不宣称真实模型质量或付费账号认证。

检查所有新DTO、事务竞态、取消/超时/输出上限、包缺失、权限与隐式资源负例；
同一Astryx树三style双mode、中英/手机、键盘、dirty/unknown、401和迟到响应。
本机启用单独执行空闲检查、身份校验、一致备份、副本演练、原表原列比对，
主入口只GET，不产生正式模型/测试/计划数据。证据与最终结果完成后回填。

本批最终：1406Python、2374前端、typecheck/build通过；最后可选SDK测试门禁调整后，
再以强制SDK模式验收Pi专项，结果见交付证据。计划9检查+2张影响补图的1检查、Pi5、
综合58、主8只读，共81浏览器检查/86最终fixture PNG。Pi2Run/6Call+1连接测试，
共7真实SDK请求；回复由本地mock生成，修改/pytest/HTTP/持久化真实。
原正式行一致、新三表空；4180/5173已启用。提交/push是否成功只看Git实际回执。
[证据](../frontend/evidence/plan-revisions-pi-2026-11-27/README.md)。

## 6. 后续独立任务

按产品价值继续：代码基线变化的三方比较/人工冲突解决、其他语言/runtime、
AI建议分解与嵌套目标、Pi更完整受限Harness。原项目应用/合并/部署、团队授权、
远程HTTPS/真机和外部连接器继续独立授权/验收。119/9/110历史台账不变。
