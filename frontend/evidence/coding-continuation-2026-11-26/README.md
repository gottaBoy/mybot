# 从前轮代码继续实现

日期：2026-11-26，Asia/Singapore。
合同：[ADR-0029](../../../docs/decisions/ADR-0029-isolated-code-continuation.md)。
本批补齐原“下一研究轮引用成果”不能接续实际代码的缺口。

## 可用流程

Task -> 研发实现 -> 实现起点“前轮代码检查点” -> 明确选择同Task已结束Run的检查点
-> 填写本轮实现要求 -> 核对继承修改、实际起点文件、原始基线、模型与资源
-> 新consent -> 新Run实际基线测试 -> 修改与真实验证 -> 人工审查。

每次合法模型修改由可信Harness保存结构化检查点，测试失败时也能保留代码。
新Run从所选代码开始，不把旧测试结论当作新结论；重新跑基线、重新计调用预算。
产物包含相对原项目的累计patch、相对本轮起点的增量patch、完整代码检查点JSON、
实际测试证据与报告。来源Run/Artifact/hash/要求在冻结候选和运行中保留。

原项目任何选定文件（含不变测试/依赖）变化会阻止接续，不自动rebase。
继承修改必须仍在新writable内；跨Task、未结束源、错误hash、篡改测试或无新修改拒绝。
准备后使用冻结快照，原文件或源Artifact后续变化不会改写该候选。
未知prepare/execute按原ID GET恢复，不自动重发；设备没有因此获得代码读取/执行scope。

旧Run没有检查点时，目录保持真实空态，不执行/反推原始Diff。不改原项目、
不安装依赖、不提供任意Shell或自动commit/merge/deploy。仍只有Python unittest profile。

## 真正验证了什么

专项复制本仓库schemas.py与依赖，保留四个不可修改测试：

| 工作 | 真实测试失败数 | 模型调用 |
| --- | --- | --- |
| 原始基线 | 2 | 0 |
| 第一Run部分修复换行 | 1；Run失败，留下检查点 | 1次注入响应 |
| 第二Run继承基线 | 1 | 0 |
| 第二Run修复Tab/ASCII控制字符 | 0；4测试通过 | 1次注入响应 |

文件复制/修改、Landlock/seccomp隔离、Python进程、退出码、测试数和Diff全部真实。
模型响应是`coding-fixture`/`coding-continuation-fixture`注入；没有自动调用付费模型，
不把此验收声称为真实Codex生成质量/费用证明。源文件与不变测试字节相同。
累计patch经`git apply --check`，没有应用到原库。

专项同时真实丢prepare/execute响应，reload原请求GET恢复，consent重新勾选。
只有2个Run，继续Run1次Call，来源与冻结文件完全一致；checkpoint和两类patch的
下载文件与服务端Artifact原文相同。继承基线的证据标签有专项检查。

Python合同另测连续三Run的接续、原文件/测试漂移、source candidate一致性、
冻结后原文变化、只重复继承修改拒绝、分页/不可用记录与设备越权。
没有将已有测试回执外推为对抗同一解释器内恶意测试的防伪证明；runner安全范围不变。

## 证据

- [专项浏览器](coding/verification.json)
- [综合工作台](workbench/verification.json)
- [真实逐轮测试](coding/actual-test-attempts.json)
- [累计补丁](coding/actual.patch)
- [本轮增量](coding/incremental.patch)
- [可信代码快照](coding/code-checkpoint.json)
- [原始基线与继承修改核对](coding/continuation-preview-desktop.png)
- [中文手机冻结候选](coding/prepared-zira-dark.png)
- [运行代码来源](coding/run-source-provenance.png)
- [继承基线测试](coding/inherited-baseline-test.png)

截图是隔离fixture、三style双mode、英文1440/中文390、reduced motion。
不是物理手机/Safari/IME认证，也没有保存正式项目正文或主入口截图。

## 失败与修正

- `failures/model-selection`：测试服务模型目录按时间返回，脚本未明确选择起始fixture，
  错用了仅处理继承代码的模型。无修改响应被正确拒绝为coding_output_invalid，
  修正为显式选择起始模型，不改变生产默认模型策略。
- `failures/option-focus`：脚本直接focus了option，Enter并未更新Selector活动项；
  后续要求输入正确保持disabled。最终通过combobox End/Enter完成真实键盘选择。
- `prior-capture`保留此前通过7项的专项截图/报告；最终补充显示原项目基线指纹、
  修正继承基线标签后，从新fixture完整重跑，不拼接早期成功结果。

验证和本机状态以本页后续记录与JSON最终回执为准；历史119/9/110保持不变。

## 最终验证

- Python全量1267项通过，之后补设备scope与NUL输入用例，最终44项核心定向通过。
  不把两次结果写成一次1269项全量运行。
- 前端全量2250项/77文件通过；最后cap丢失仍允许显式discard的补充边界经78项
  相关合同再验；typecheck/生产build通过。保留原Starlette/httpx与大chunk提醒。
- 专项8项/12PNG、独立综合58项/61PNG、主入口8项GET-only，
  共74浏览器检查、73最终fixturePNG；最终pageerror/外部HTTP均0。
- 最终编码fixture`/tmp/mybot-astryx-workbench.wghbIa`，独立综合
  `/tmp/mybot-astryx-workbench.Mixa8v`，没有使用正式库执行模型或测试。
- 最终app JS206.35kB/gzip65.68、CSS39.89/7.50，
  lazy codingDialog14.62/5.70、RunWorkspace24.73/9.15。
  相比上批新增接续代码主要留在lazy dialog与Run详情；Bootstrap仍全量，未宣称传输量改善。

日志：[Python](python-tests.txt)、[核心定向](targeted-tests.txt)、
[前端](frontend-tests.txt)、[最后合同再验](client-targeted-tests.txt)、[构建](build.txt)、
[主入口只读](primary-get-only.txt)。

## 本机启用

主4180原空闲PID2393603经身份/cwd/env内存核验、一致备份、私有副本Store演练、
原表原列比对、优雅停止与锁释放，同命令/cwd/环境启动PID3844765。
`coding_continuation=true`，主5173已暴露新入口。8项桌面英文/中文390只读通过；
主原6个研究Run没有代码检查点，目录真实为空，没有从旧Diff补造记录。

浏览器后再次比对全部原行相同：1Project/1Task/6Run/1model/18Agent/17Call/
6Artifact/157Event，coding_jobs/TaskTurns/设备/执行授权0；
Workflow草稿1/versions0/operations0。无正式候选、文件预览、模型、测试或写操作。
私有备份`.runtime/backups/before-devices-20261126T112433Z/`，目录700、DB/log600。
不导出正式正文/截图/环境/原摘要；旧PID脚本不可重跑，不热覆盖数据库回退。
临时4187/4188/5176/5177已停止，主4180/5173保留。

下一核心为更多运行时/测试profile、任务分解/依赖和原始基线变动时的显式冲突处理。
不是通用patch导入、自动历史、长期Agent或原项目自动写入完成。
