# 原项目基线变化后的显式继续实现

日期：2026-11-27，Asia/Singapore。起点`6f94d73`。用户继续核心交付，
三Agent分别做后端、前端和独立合同/夹具，root整合、实际验收与本机启用。
[实施计划](../../../docs/CORE_BASELINE_PLAN_2026-11-27.md)、
[ADR-0034](../../../docs/decisions/ADR-0034-explicit-code-baseline-reconciliation.md)。

## 交付

Task“研发实现”选检查点后可显式比较旧基线O、检查点K和当前项目N；
每个可修改文件明确选current/checkpoint/manual全文，得到下一次起点R。
测试和只读依赖固定用当前N，新增/缺失/重排路径先拒绝。
比较不运行测试/模型或保存候选；最终preview/prepare重验源和当前指纹，
配置变化清确认，409保留手工内容。重新比较保留内容但撤回每个旧选择。

冻结后origin_files=N/files=R，来源O/K/旧patch独立保存；模型只收到R、
本轮要求/实际测试和来源固定身份，不附带O/K/旧patch正文。
累计Diff是N→final，增量是R→final；新checkpoint根为N，再普通接续不回旧根。
全选current的R==N合法，但模型仍须新增修改且最终累计Diff非空。
旧候选/回执/hash/两值checkpoint读取合同保持，无新表、原项目应用或自动merge。

## 最终验证

| 项目 | 结果 |
| --- | --- |
| Python全量 | 1446 passed / 436.91s，显式要求可选Pi SDK存在；保留httpx弃用警告 |
| 后端相关专项 | 108 passed，其中40新基线处理测试 |
| 前端最终全量 | 2435 passed / 84 files |
| 类型 / 生产构建 | 通过；保留已有>500kB chunk警告 |
| 专项浏览器 | 8 checks / 14 PNG，page errors/external HTTP 0 |
| 综合浏览器 | 58 checks / 61 PNG，page errors 0 |
| 主入口只读 | 8 checks，writes/external/errors 0 |

共74浏览器检查、75最终fixture PNG；119/9/110历史台账保持。
最终前端额外修复了迟到预览与配置变化的竞态，4个测试覆盖Task/model延迟响应、
陈旧confirm handler和prepared豁免。修后全量2435/build及两个全新fixture的8/58
浏览器完整重跑，不把修前画面当最终证据。后端未因此改变，1446仍覆盖最终后端。

### 实际链

最终fixture `/tmp/mybot-astryx-workbench.5KuyMW` 复制真实mybot schemas/saved_views/init，
加显式baseline_info和不变pytest，只有schemas可改。模型为受限注入JSON。

1. 旧项目四测试失败2项→一次局部换行修复后失败1项，失败Run保留可信检查点。
2. 独立夹具固定操作显式推进当前源码维护注释、只读依赖及测试，写入只发生一次并单列记录；
   当前五测试新增依赖版本断言。普通接续仍409，模型调用不增加。
3. UI读取三份，测试无选择器。人工全文保留当前维护注释与局部修复；
   显式重比较保留手工正文、要求重新选择，再核对/确认。
4. 丢prepare响应→reload原IDGET得到冻结N/R、新consent unchecked；
   丢execute响应→原IDGET，一次execute POST，无重复调用。
5. 实际R/N测试基线5项失败1→一次修复后5项全过。O/K正文/旧patch不进模型；
   源Run候选hash保持，执行后当前项目源码/测试/依赖字节保持。
6. 累计patch基于N，增量基于R，累计只做`git apply --check`未应用。
   新checkpoint origin_hash等于采用N指纹。
7. 第三Run普通严格接续新checkpoint，不携带reconciliation；
   基线和修订测试均5项通过，一次新注释修改，证明新根可持续接续。

最终1Task/3Run/3注入模型响应；原项目推进只属于fixture，不归为Agent写原项目。
隔离副本写入、测试进程、HTTP/SQLite和hash/回执都实际执行。
没有真实付费Provider/Codex/Pi模型质量认证。

[专项结果](specialist/verification.json)、
[测试原文](specialist/actual-tests.json)、
[夹具写入和模型调用](specialist/fixture-writes-and-calls.json)、
[累计patch](specialist/cumulative.patch)、
[增量patch](specialist/incremental.patch)、
[综合结果](workbench/verification.json)。
三style双mode、1440英文/390中文、reduced motion实际画面：
[手工解决](specialist/manual-resolution-desktop.png)、
[手机手工内容](specialist/manual-resolution-mobile.png)、
[中文手机候选](specialist/prepared-zira-dark.png)、
[中文手机结果](specialist/result-zira-dark.png)。
命令结果在本目录`mybot-*.txt`；不是Safari/物理设备或用户视觉满意度认证。

## 复核与修正

首轮新后端测试把已execute的源回执误期望为prepared，实际applied正确；
测试改为源运行完成后GET的确切回执，最终108通过。
独立review发现finalpreview等待期间Task/model变化可能让迟到响应恢复旧candidate，
后端CAS仍会409，但UI不该允许发起该准备。修复为捕获/重验完整binding并在confirm/
submit二次门禁；已prepared冻结回执豁免。4回归通过，最终浏览器新环境完整再验。
没有放宽旧hash、只读文件规则或模型工具权限来通过验收。

## 本机启用

入口`http://127.0.0.1:5173/`。4180原空闲PID1552381经command/cwd/env内存核验、
一致备份、私有Store演练、原表原列比对、SIGTERM/锁释放，同环境启动PID2447464，
5173原进程保持。coding_reconciliation=true；主8只读后原行再次相同。
原1Project/1Task/6Run/1model/18Agent/17Call/6Artifact/157Event、Workflow和空计划/设备表
保持；coding_jobs/TaskTurns/model_tests/plan_versions均0。
无正式候选/测试/模型/源码比较请求。

私有备份`.runtime/backups/before-devices-20261127T011801Z/`700/DBlog600，
不进Git；无原正文/截图/环境/原摘要导出，不热覆盖回退，旧PID脚本不可重跑。
临时4187/4188/5176/5177已停。
app208.51/gzip66.45kB、CSS39.89/7.50、lazyCoding27.48/9.31、
RunWorkspace27.03/9.81、TaskWorkspace37.78/12.49；Bootstrap仍全量。

剩余：路径增删/重命名、自动三方行合并、原项目应用/merge/deploy、其他语言/runtime、
嵌套/AI分解及Pi完整受限工具Harness。旧root漂移不再只能拒绝，但没有自动替用户决定冲突。
