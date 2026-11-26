# 计划修订与 Pi SDK 核心交付

日期：2026-11-27，Asia/Singapore。起点`aee6715`。
用户要求深度分析、计划和多Agent实现，并最后补Pi。
[实施计划](../../../docs/CORE_DELIVERY_PLAN_2026-11-27.md)、
[ADR-0032](../../../docs/decisions/ADR-0032-task-plan-revisions.md)、
[ADR-0033](../../../docs/decisions/ADR-0033-pi-text-runtime.md)。

## 用户可见交付

Task目标页可修订计划、核对复用/新增/替换/移出/阻塞并发布不可变版本，
查看20项分页历史。变更要求或前置身份会创建新Task并向下游传播替换，
旧Task/Run/报告/创建回执不改，新工作不能借用旧报告。
退役Task可查看和记录补充，但不可新执行或恢复。活动/准备/授权会阻止受影响发布。
409保留草稿；unknown保留原ID，只GET核对。原v1合同和明确能力门禁保持。

模型页可明确选Pi SDK，保存不请求；独立连接测试后可进入既有研究和编码流程。
实际SDK使用空工具/资源、内存身份与会话、固定消息/maxTokens、单请求和受限生命周期。
不读取CLI账号、自动重试、加载插件或开放Pi命令工具。副本写入/pytest仍由mybot执行。
公共input包含缓存；native未缓存值和cache是分项，不能再次累加；缺失保留unknown。

## 最终检查

| 项目 | 结果 |
| --- | --- |
| Python全量 | 1406 passed / 405.71s，保留Starlette/httpx警告 |
| 前端全量 | 2374 passed / 82 files |
| 类型 / 生产构建 | 通过，保留既有>500kB chunk警告 |
| 计划修订专项 | 35新测试；134相关联合检查曾通过，后收紧same-Task恢复锁再验35 |
| Pi实际SDK专项 | 50协议/计量 + 9 API/研究/编码整合 |
| 最后强制SDK复验 | `MYBOT_REQUIRE_PI_RUNTIME=1`下59 passed，无skip / 46.63s |
| 计划浏览器 | 9 checks / 13 PNG |
| 影响可见区域补验 | 1 check / 2 PNG |
| Pi浏览器 | 5 checks / 10 PNG |
| 综合浏览器 | 58 checks / 61 PNG |
| 主入口只读 | 8 checks，writes/external/errors全0 |

共81浏览器检查、86最终fixture PNG。最终各专项page errors/external HTTP均0；
综合page errors0。1406全量后仅增加可选SDK缺失时的测试门禁，再强制SDK验59，
未把环境无SDK时的skip当成本批执行证据。119/9/110台账不变。

### 真实计划链

新fixture `.xgzFuW`：v1实际两子Task→前置4次FakeProvider调用→人工接受→
改验收→预览两个替换节点→v2丢响应reload只GET原ID、仅1发布POST→
旧Task/Run/原receipt/v1不变→新前置4调用+新人工接受→下游4调用成功。
另一个browser真实抢先发布reorder v3，原editor收到服务器409并保留dirty直到显式放弃。
最终5Task/3Run/12FakeCall/3version，reorder保留当前两Task身份。
历史页仅冻结Task与依赖，无恢复/执行控制，不把今天的审查当过去事实。

[计划结果](plans/verification.json)、
[v2精确回执](plans/v2-revision-receipt.json)、
[新准入](plans/fresh-admission.json)、
[中文手机历史](plans/history-zira-dark.png)、
[桌面影响](frames/visible-revision-impact-desktop.png)、
[手机影响](frames/visible-revision-impact-mobile.png)。
补图明确滚动Dialog内部，使影响区可见；原字段截图不冒充完整影响画面。

### 真实 Pi 链

全新fixture `.A8So5w`，实际锁定SDK与自有localhost HTTP/SSE mock：
键盘选Pi→保存0请求→显式连接1请求→读取回执仍1→研究4Call→编码2Call，
共7个上游mock请求，每Call只1请求，无tools；研究与编码各1Run。
编码返回严格JSON，真实pytest四项 failure2→failure1→pass4。
执行响应丢失后reload原GET，只有1 execute POST；原源/测试字节不变。
模型回复是确定fixture，SDK、协议、文件修改、测试、HTTP和SQLite都真实；
不是真实付费模型质量或账号认证。

[Pi结果](pi/verification.json)、
[实际请求计数](pi/sdk-request-counts.json)、
[逐轮测试原文](pi/actual-tests.json)、
[配置](pi/model-pi-desktop.png)、
[真实连接回执](pi/pi-connection-receipt.png)、
[中文手机结果](pi/pi-result-zira-dark.png)。
三style双mode、1440英文/390中文、reduced motion已验；没有真机/Safari认证。

综合结果见[workbench](workbench/verification.json)。
命令日志在本目录`mybot-*.txt`。SDK包与源码观察分开：
npm1.5.0完整lock/integrity固定，但无gitHead，未假称源码085c84e是包构建commit。
`node_modules`未进Git，安装与模型测试独立。

## 保留的失败与修正

- 首个Pi研究API测试helper在override前读取未设context_hash，改测试输入后真实链通过，
  [早期失败](retained/pi-research-helper-key-error.txt)不是模型错误。
- Pi native input8与wire prompt11/cache3口径不同；统一总输入11，缓存子集不重复加，
  缺字段/坏字段/矛盾/0由50真实SDK用例验证。旧1386通过未当最终计量验收；
  新1406全量和最后59强制SDK复验覆盖最终规则。
- 第一次计划脚本在空白文档读localStorage产生错误，
  [失败记录](retained/plan-init-storage-error.json)不计成功；只对HTTP文档设偏好后
  新环境完整重跑9项，并另补Dialog影响区2图。
- Pi脚本初轮登录初始化、password role/required label、重复Add/Close定位错误，
  [部分执行记录](retained/pi-test-close-locator-error.json)不计最终成功；
  另一次临时服务终止导致连接拒绝。修正脚本且新fixture完整跑5项/7请求，
  没有为通过脚本修改产品行为或调用真实模型。

## 本机启用与剩余

主入口`http://127.0.0.1:5173/`。4180原PID378077空闲，经command/cwd/env内存核验、
一致备份、私有Store副本演练、原表原列比对、SIGTERM和锁释放，同环境启动PID1552381。
5173原进程保留。task_plan_revisions/pi_sdk显式true；后者仅本机安装存在，不是认证。
主8GET-only后原行再比对一致。原1Project/1Task/6Run/1model/18Agent/17Call/
6Artifact/157Event及Workflow保持，新3表、coding_jobs/TaskTurns/model_tests仍0。
未创建正式计划/Pi模型，未启动正式测试或模型。

私有备份`.runtime/backups/before-devices-20261126T202615Z/`700/DBlog600，不进Git。
无原正文/截图/环境/摘要导出，不热覆盖回退；旧PID绑定脚本不可重跑。
临时4187/4188/4189/5176/5177/5178已停。

app208.47/gzip66.42kB、CSS39.89/7.50、lazyPlanEditor13.30/5.27、
PlanPanel33.38/10.05、TaskWorkspace37.67/12.45、Run25.78/9.44。
Bootstrap仍全量，版本历史20完整快照有界但尚非metadata优化。
剩余：代码原基线冲突解决、其他语言/runtime、嵌套/AI分解、
Pi完整受限工具Harness/更多native Provider/长期会话与真实模型效果认证。
未提供任意Shell、原项目应用/合并/部署或团队权限。
