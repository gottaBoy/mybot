# 核心研发实现与真实测试闭环

日期：2026-11-25，America/New_York。
用户在“感觉像玩具”的反馈后，明确接受隔离代码修改、明确允许的测试与Diff交付。
合同：[ADR-0027](../../../docs/decisions/ADR-0027-isolated-coding-delivery.md)；
原只读研究继续保留，设备/连接器不再是默认下一批。

## 当前可用流程

1. Task显式资料包含待修改源文件、依赖文件与独立Python unittest测试文件。
2. Task页点“研发实现”，选择模型、可修改路径、不变测试和最多三次模型调用。
3. “核对资料与测试环境”读取精确资料并实际探测隔离能力，不准备、不调用模型。
4. 确认发送/修改/测试与可能费用后，先持久化精确候选，再创建唯一Run。
5. 先运行基线测试，模型返回严格JSON文件替换，只写隔离副本；实际测试失败后，
   在已确认调用上限内回传失败结果并修正，保存Diff、逐轮测试与最后报告。
6. 查看实际测试数、退出码、argv和输出；下载patch/JSON，再由人决定是否接受。
   接受成果不会把补丁应用到原项目，也不会commit/merge/deploy。

不是给模型一个无限制终端；没有新增MCP/浏览器/任意Shell或自动安装依赖。
首版仅Python unittest与最多10个显式文本文件/64KiB；测试文件不能被模型修改。
需要其他运行时、可写fixture/测试临时目录或外部服务的测试，不属于本profile。
Codex仍走原只读文本生成适配，不把模型JSON当作测试通过证据。
原Codex底层工具ceiling尚未完整认证；本批不把本地测试进程的隔离证明外推到CLI，
也没有静默扩大其权限。

可见证据：

- [实际导出的补丁](coding/actual.patch)
- [逐轮真实测试JSON](coding/actual-test-attempts.json)
- [补丁审查画面](coding/actual-patch-desktop.png)
- [实际测试与命令参数](coding/actual-tests-desktop.png)
- [中文手机确认](coding/candidate-zira-dark.png)
- [中文手机过程与真实测试状态](coding/result-zira-dark.png)
- [真实阶段/Agent工作图](coding/graph-implementation-desktop.png)

截图与这些导出只含专用fixture，未保存正式Task正文或真实凭证。

本机可用本仓库现有文件创建相同需求：Task资料填
`workbench/__init__.py`、`workbench/schemas.py`、`workbench/saved_views.py`、
`tests/fixtures/coding_relative_path_case.py`，仅schemas.py可修改，最后一个文件作为不变测试。
测试模块由用户明确指定，不要求文件名以test开头；默认目录分类只是待确认的配置草稿。
模型、发送资料与费用仍需用户在页面确认，本批没有为正式库创建这个Task。

## 证明了什么

最终专项`/tmp/mybot-astryx-workbench.a12TAs`从空库开始，复制本仓库
`workbench/__init__.py`、`schemas.py`、`saved_views.py`，另有四项不变测试。
真实需求是relative_path拒绝换行/Tab，同时保留普通路径和中文路径。
只允许schemas.py被修改：

| 实际步骤 | unittest结果 | Provider响应 |
| --- | --- | --- |
| 原始基线 | 4项，2失败，退出1 | 无 |
| 第一次修改 | 4项，1失败，退出1 | 只补换行拒绝 |
| 第二次修改 | 4项，0失败，退出0 | 拒绝所有ASCII控制字符 |

文件写入、解释器执行、退出码、unittest回执、Diff和隔离均为真实实现。
模型响应使用测试服务中显式的`coding-fixture`注入；这不证明真实模型的生成质量、
真实Codex认证/兼容性或费用结算。主服务不会提供该测试Provider。
正式配置模型仍须用户在页面明确启动，本批没有自动发起真实付费调用。

两次修正只形成一个Run、两个Call；原source和不变tests字节完全相同。
owner prepare真实提交后丢响应，reload原GET恢复prepared且consent未勾选；
execute真实提交后再丢响应，reload只读原回执，进入原Run，没有第二POST或重复模型调用。
下载文件与服务端artifact原文一致，patch经git apply --check验证可用，
只检查、没有应用到fixture原文件或本仓库schemas.py。

## 实现边界

- coding_jobs单表，prepared/applied/discarded分开，稳定request_id与完整candidate hash；
  候选绑定文件内容、Task/目标/验收、模型/限制、writable/不变tests。
- Task内同事务冲突检查与Run入队，prepared候选阻止普通Run/TaskTurn/恢复绕过；
  API与client拒绝错误身份/候选/重复或非法参数，unknown404不解除原请求锁。
- 复用Run/Agent/Call/Artifact/Event与现有Provider，没有另一份执行事实。
  新coding实现和本地测试阶段按实际顺序/Agent ID显示，不借旧规划/研究/汇总标签。
  基线和中间失败保留，Run最终成功、测试通过、人审接受分别展示。
- 没有报告/回执、零测试、全skip、超时或大输出不能当作通过。未知Provider结果终止，
  只有实际失败测试会触发预算内下一轮；没有自动换模型或重发未知请求。
- 取消会回收实际测试进程组；重启保留interrupted，需要显式处理，不套用研究resume/retry。
  设备原scope不变，其一次研究执行grant不能启动coding。

## 隔离证据

本机Linux6.17.0-1032-nvidia/aarch64，Landlock ABI7，
已安装libseccomp2 2.5.5-1ubuntu3.1，无新增库/系统配置或特权服务。
bubblewrap0.9.0 namespace两次实际探测分别失败于loopback和uid-map权限，
没有把已安装当可用或退回无隔离宿主测试。

工作台先探测，再运行固定可信Python入口；选定代码导入前设置Landlock读白名单、
libseccomp网络/进程/元数据写拒绝、no_new_privs与CPU/内存/FD/输出/墙钟限制。
只读运行库与隔离副本；选定测试看不到模型环境变量，不继承模型密钥。
真实负向探测拒绝外部canary读取、副本写入、socket、fork、外部chmod。
最后定向复验还确认SysV共享内存创建被拒绝，避免仅隔离文件/网络却保留宿主IPC路径。
定向测试验证可读取/测试副本、大输出/超时被终止、未认证证据不能通过。
不支持的平台/库/ABI或probe失败明确阻断，且不调用模型。

这是受限本机进程，不是VM或完整安全审计；不认证内核漏洞、侧信道、其他平台、
第三方插件或任意Shell。运行库只读范围和已知元数据可见性限制见上游研究第39节。
没有把单个canary测试夸大为对所有恶意程序的证明。

## 验证结果

| 文件 | 结果 | 范围 |
| --- | --- | --- |
| `python-tests.txt` | 1229通过 | 全量后端；既有1项httpx弃用提醒 |
| `targeted-tests.txt` | 21通过 | 最终coding/profile/真实隔离/时限/实际argv与阶段顺序 |
| `frontend-tests.txt` | 2197通过、75文件 | 50新增client/dialog/stage标题与原回归 |
| `build.txt` | typecheck/build通过 | 保留既有大chunk提醒 |
| `coding/verification.json` | 10项、15PNG | 真实mybot源文件、完整候选/执行/修正/导出、丢响应、12布局 |
| `workbench/verification.json` | 58项、61PNG | 原工作台/资源/预算/审查/恢复/导航/八样式回归 |
| `local-activation-summary.json` | 8项GET-only | 主入口/真实配置打开/无候选与模型调用/旧Run测试未知 |

共76项最终浏览器检查、76张最终fixture PNG；失败PNG不计入。
最终pageerrors0、专项/主external空，综合阻断外部HTTP。
Neutral/Zira/Y2K双mode，候选/结果共12组合，英文1440/中文390；
document overflow均0，手机确认/阶段/长hash与实际Diff/日志截图已检查。
没有认证物理手机/Safari/真实IME；源码存在、fixture验证和正式启用分别记录。
综合使用另一空fixture`/tmp/mybot-astryx-workbench.ipcPhj`，FakeProvider/MockTransport。

复现需要独立空fixture与production preview，禁止主4180/5173：

```bash
# 仓库根目录：生成复制自mybot的测试输入；必须新的/tmp/mybot-astryx-workbench.*
PYTHONPATH=. .venv/bin/python tests/browser_server.py /tmp/mybot-astryx-workbench.NEW 4187 astryx-browser-fixture coding

# frontend/，5176需代理4187fixture；脚本会写该fixture并最终只检查导出patch
MYBOT_BROWSER_FIXTURE=1 CODING_FIXTURE_DIR=/tmp/mybot-astryx-workbench.NEW \
  CODING_EVIDENCE_DIR=/tmp/mybot-coding-new node scripts/verify-coding.mjs
pnpm test
pnpm build
```

React19/Astryx0.7.13、同一业务树/项目wrapper/语义tokens保持，未复制模板或升级依赖。
产物app JS197.45kB/gzip63.19；lazyCodingRunDialog9.24/4.06、
RunWorkspace22.68/8.69、TaskWorkspace34.20/11.36，最终以build.txt为准。
这是产物大小，不是整体transfer提速；Bootstrap仍全量。

## 失败与修复

- 首轮后端断言按artifact数组顺序把最新测试当基线；改按实际round比较。
  新CodingError最初被通用Engine错误归类，已保留明确code，既有Provider错误语义不变。
- `failures/artifact-view`保留首轮浏览器失败：390px工作记录视图的成果pane隐藏，
  脚本未先切成果tab就找Selector。修正为实际可见视图和桌面选择，并验证下载内容。
- 同一失败截图同时发现阶段标签按旧index标成规划/研究/汇总；修复为实际key标题、
  时间顺序及graph membership，新增单测和浏览器断言，未隐藏中间失败。
- 旧综合中的三个完全合成fixture继承了新cap却没实现coding GET；
  明确设isolated_coding:false，不让广告能力缺接口的fixture冒充产品故障。
- 结果画面将未定义的背景token改为已有wb-side，并补真实Diff/测试导出证据；
  最终专项重新使用新fixture与最终构建。没有覆盖正式数据来“修”验收。
- 最后补明确模块名支持与tests目录的可确认默认分类，全量/定向/主入口复验，
  再按备份比较流程更新本机；不依赖test文件名前缀，也不自动发现或执行未选模块。
- `failures/sticky-capture`保留整页截图中的sticky定位反例；归一window滚动并断言
  header top=0后只读重拍三个成果画面。`coding/capture-verification.json`记录位置，
  没有业务写入或修改产品布局；后续专项脚本也使用相同归一方式。

## 本机启用

主4180原PID425660空闲，经command/cwd/env内存核验、一致在线备份、
私有副本Store建表演练/原表原列摘要比较、再次空闲检查、SIGTERM/锁释放/停服备份，
同command/cwd/继承环境启动PID859094，随后以相同备份/比较流程对齐至940971
以支持明确指定的Python模块名，isolated_coding=true；主5173已加载入口。
桌面英文/中文手机8项只读通过：打开实现配置不preview/测试/模型，
原样关闭不产生候选；旧研究Run仍显示“未执行测试”，未补造历史测试结果。
之后原记录摘要再次相同，coding_jobs0。

原1Project/1Task/6Run/1model/18Agent/17Call/6Artifact/157Event不变，
所有设备/执行授权表空、Workflow草稿1/versions0/operations0；无正式模型或编码任务。
私有初次`.runtime/backups/before-devices-20261125T150027Z/`与最终
`.runtime/backups/before-devices-20261125T152945Z/`均700、DB/log600，不进Git；
公开summary没有原行hash、正式正文/截图或环境，旧PID脚本不能重跑，不热覆盖回退。
主4180/5173保留且HTTP200，临时4187/4188/5176/5177已确认停止。
本批与前批未提交/push，原119/9/110不变。

后续核心优先更多运行时/测试profile、可核查任务分解/依赖与显式前轮成果引用。
不默认回到设备/连接器，也不宣称通用DAG、长期记忆、自动提交部署已经完成。
