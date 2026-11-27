# 有界嵌套任务与收尾验收

日期：2026-11-27，America/Los_Angeles。用户继续上一批核心交付，
沿既有多Agent、验收、本机启用和提交push授权。起点`73191b1`干净并与origin/main一致。
本批先交付真实嵌套执行闭环；AI建议拆解仍是下一项，不自动调用付费模型。

## 冻结合同

- 最多两条父边：根→子→孙；每计划2–8项，当前树最多73Task，只允许同层DAG依赖。
- 每层文件都是父Task显式文件的子集；发布/修订仅处理元数据，不读源码或运行模型。
- 独立外部门禁：本层前置、所有祖先前置、每层current/retired。子任务不继承父任务的
  “全部子任务已验收”条件，避免循环等待。
- 容器Task先完成全部当前子任务验收，才可启动自己的收尾Run；供上层依赖使用时，
  还须最新Run成功、报告人工接受，且Run绑定当前子计划和子证据摘要。
  不自动完成父Task，也不隐式发送子报告正文或合并子代码。
- 采用当前证据语义：撤回后原样恢复同一accepted证据可恢复原scope；
  不把状态读取当作不可逆的撤销日志。外部前置仍采用原直接依赖规则。
- 首次嵌套和以后嵌套结构编辑要求整棵当前树无活动Run、prepared候选、恢复或未消费授权。
  修订预览绑定祖先/当前树head/完整影响，并在事务内重验。
- 替换容器使整棵旧当前子树退役；新Task不复制旧子计划或报告。历史仍可读。
- 新`nested_task_plans`与schema3承载parent和ownplan并存、外部/子任务条件及权威汇总。
  永久root marker不因移除子树而降回旧语义；旧平面schema1/2、历史和回执保持。
- 所有执行路径绑定精确`task_plan_scope`；scope变化时准备、执行、worker claim、
  resume/retry/recovery不能把旧输出悄悄改绑新证据。旧候选默认字段不回填。
- 新`task_turn_discard`只允许明确放弃已知prepared TaskTurn，候选全文精确归档、
  消息/原ID/旧哈希保留；未知结果仍须GET核对。设备旧grant回执不变，
  当前状态显示superseded，不能消费已放弃准备。

## 多Agent分工

| 编号 | 负责人 | 工作 | 状态 |
| --- | --- | --- | --- |
| T0 | root+三Agent | 现状/合同/作用域及生命周期分析 | 已完成 |
| T1 | backend_workflow | 树/聚合/退役/CAS/strict schema；准备放弃测试 | 82结构回归及17放弃测试通过 |
| T2 | frontend_workflow | 同一Task父/子角色、scope、显式放弃、原ID核对 | 2526前端/87文件、tsc通过 |
| T3 | verification_docs | ADR0036、fixture、独立结构/设备/恢复审计、专项脚本 | 15fixture及独立审计通过 |
| T4 | root | 所有执行scope、实际流程、完整回归、启用/提交 | 1565后端、81浏览器检查通过，已本机启用；Git回执单列 |

## 可见验收

根计划X→A→B，A拆成A1→A2。X未验收时孙任务不能执行，但可以规划。
X接受→A1运行并人工接受→A2运行接受；此时B仍须等待A的新收尾Run与人工接受。
A完成后B可运行；撤回A1或更换其最新结果，未来A/B门禁变化，旧Run证据不被改写。
另验scope已变化但仍ready、prepared放弃与设备竞争、缺失marker/绑定/member的拒绝、
祖先CAS/退役与活动子树保护、schema1/2及原回执保持。

浏览器用空临时fixture与固定FakeProvider，实际API/SQLite/Run/审查为真。
主环境只有只读检查，启用沿身份核验、一致备份、副本演练及原行比对流程。
历史119/9/110保持。

最终1565Python、2526前端/typecheck/build通过；专项nested9/discard6、
综合58、主只读8共81浏览器检查/81最终fixturePNG。
原业务行未变；[完整证据与保留失败](../frontend/evidence/nested-plans-2026-11-27/README.md)。
