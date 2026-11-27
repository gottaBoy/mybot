# 固定 Node.js 研发验证

日期：2026-11-27，America/Los_Angeles。沿用户“继续”和此前多 Agent、
核心交付及提交 push 的授权。起点 `688c232` 干净并与 `origin/main` 一致。
本批实现其他语言 runtime 的一个完整切片，不把入口增加当成研发目标全部完成。

## 问题与交付

当前隔离实现只接受 Python unittest/pytest。JavaScript 项目不能使用相同的
候选冻结、真实测试、有限修正、Diff 和可信检查点链路。
本批新增固定 `node-test` profile，复用现有执行和证据合同。

- 显式 capability 为 `coding_node_test`，表示产品理解该合同；实际可用性必须由
  每次执行前的真实运行时和隔离探测确认。
- 只接受显式选择的 `.mjs/.cjs` 测试，不发现其他测试，不运行 npm scripts，
  不安装依赖，不开放任意命令或原项目写入。
- 使用 Node 自带 `node:test`，固定可信启动入口、清洁环境和有界资源。
- 先在单线程启动器中施加 Landlock，再 exec Node，使后建线程继承文件边界；
  可信启动代码预热运行时后，以 seccomp TSYNC 覆盖全部现存线程。
  隔离探测失败即拒绝，不回退到裸跑或仅 Node permission 的模式。
- 可信 native addon 仅作为明确的本机安装步骤构建，不在 Task 或测试中编译。
- 空文件、空 suite、全 skip/todo、`.only` 过滤和预期失败倒置不能制造测试成功。
  计数与支持边界须用实际事件验证后记录在 ADR，不凭 stdout 文本猜测。
- profile 参与完整配置、快照和 hash；旧候选中省略的默认字段保持省略，
  原有 Python argv、回执、检查点和原 ID 核对行为保持兼容。
- 切 profile 后重新核对、准备和确认；prepared 不随 capability 消失而改写，
  可以原 ID GET/discard，不能从其他 profile 绕过执行。

## 分工与进展

| 编号 | 负责人 | 任务 | 验收 | 状态 |
| --- | --- | --- | --- | --- |
| N0 | root + Agents | 合同、官方源码和隔离可行性分析 | 全线程文件限制及真实统计语义 | 已验收 |
| N1 | backend_workflow | 两阶段隔离、Node 入口、运行时探测、执行器测试 | 同步/异步读写、网络/子进程被拒绝 | 32 runner 检查及真实探针通过 |
| N2 | frontend_workflow | profile/cap 门禁、配置、证据展示、UI 回归 | 旧身份不变、unknown 不重发 | 2470 前端测试、类型和构建通过 |
| N3 | verification_docs | ADR、真实 mybot 源副本夹具、独立复核 | 实际不变测试失败→修正→通过 | 6 夹具及 6 独立边界通过 |
| N4 | root | API/检查点集成、浏览器、全量回归、启用/提交 | 原项目/主数据不变、证据可核查 | 1497 后端、74 浏览器检查通过并本机启用；Git 回执单列 |

## 验收方式

用显式 mybot 文件的私有副本，确定性 JSON 模型响应只替换授权源文件。
实际 Node 测试先失败，首轮局部修改仍失败，下一轮修正后通过；核对每轮
固定命令、退出码、五字段回执、模型输入中的真实前轮证据和最终 Diff。
再验证可信检查点接续及显式基线解决不会假借历史测试通过。

另验空/全跳过/预期失败、suite/子测试及 hook/import 错误、超时/输出上限、
重复/损坏回执、丢响应原 ID 核对、配置/capability 变化、设备和退役门禁。
浏览器使用独立临时数据和实际 API，不调用付费 Provider。
本机启用按空闲核查、进程身份、一致备份、Store 副本演练和原行比对流程执行；
主入口只读验收。原 119/9/110 台账不变。

最终证据见[本批记录](../frontend/evidence/coding-node-2026-11-27/README.md)。
Node原生files加载会丢掉注册测试后的import异常，本地改为可信setup逐文件捕获import；
仅only:false仍隐式过滤，用精确版本的固定内部context关闭过滤；
全局after失败有独立事件但原生计数未必变化，须单独计error并自然排空。
这些实际发现与失败均保留，不把原生summary或一个通过示例当作完整验证。
