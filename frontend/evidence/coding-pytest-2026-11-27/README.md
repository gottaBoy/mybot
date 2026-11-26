# 固定 Python pytest 研发验证

交付：2026-11-26–27，Asia/Singapore。起点 `b886ce0`；
合同 [ADR-0031](../../../docs/decisions/ADR-0031-python-pytest-profile.md)。
Task“研发实现”可选 unittest/pytest，核对资料、模型和预算后在隔离副本执行；
Run 与测试 Artifact 显示实际框架。

## 交付与验证

可选 `config.profile` 与 snapshot/hash/Run/逐轮证据绑定，旧省略字段保持省略。
已装 pytest 仍须真实隔离自检；不安装或回退。固定可信配置和显式测试，禁 conftest/
自动和模块插件/cache/logging/faulthandler，`-B` 不写字节码，原隔离权限未放宽。
收集/setup/teardown错误保留，xfail计skip、XPASS计fail；
零项、全skip/xfail、缺失/重复/矛盾回执、超时/截断不能通过。
prepared失cap可放弃不可执行，unknown仍原ID GET；旧检查点切框架重新跑基线。

| 检查 | 最终结果 |
| --- | --- |
| Python 全量 | 1312 passed / 323.82s，保留 Starlette/httpx 弃用警告 |
| 前端全量 | 2309 passed / 79 files |
| 类型 / 生产构建 | 通过，保留既有 >500kB chunk 警告 |
| pytest / 旧编码接续依赖专项 | 24 / 63 passed |
| pytest 浏览器 | 10 checks / 15 PNG，page errors/external HTTP 0 |
| 新环境综合浏览器 | 58 checks / 61 PNG，page errors 0 |
| 主入口只读 | 8 checks，writes/external/errors 0 |

共76浏览器检查、76最终fixture PNG；119/9/110历史台账保持。
最后收紧“全跳过却自称成功”的回执拒绝规则后，再次全量2309前端、build和主8只读通过；
10/58浏览器是该细化之前的合法数据链路验证，新拒绝支路由单测覆盖，未冒称浏览器重跑。
专项 `.SWNcW9` 复制真实mybot schemas.py及显式依赖，仅schemas.py可改：

| round | tests | failures | exit | passed |
| --- | --- | --- | --- | --- |
| 0 原基线 | 4 | 2 | 1 | false |
| 1 只修换行 | 4 | 1 | 1 | false |
| 2 全控制字符 | 4 | 0 | 0 | true |

1Run、2次注入模型JSON；prepare/execute各丢响应后reload只GET原请求，各1POST。
源文件/不变测试/原仓库字节不变；下载patch只 `git apply --check`，没有应用。
模型是BrowserProvider fixture；副本写入、隔离测试、HTTP/SQLite与导出真实执行，
不是付费Provider/Codex或模型质量认证。人工接受独立。

[专项结果](specialist/verification.json)、
[逐轮原文](specialist/actual-test-attempts.json)、
[补丁](specialist/actual.patch)、
[综合结果](workbench/verification.json)、
[主只读](primary-read-only.txt)。
三style双mode、1440英文/390中文/reduced motion的实际画面：
[桌面候选](specialist/candidate-neutral-light.png)、
[手机候选](specialist/candidate-y2k-dark.png)、
[手机结果](specialist/result-zira-dark.png)、
[输出](specialist/actual-tests-desktop.png)。
同目录 `mybot-pytest-{python-final,frontend-final,build,new,legacy}.txt` 为命令结果。
不是真机/Safari、用户视觉认可或完整pytest插件兼容认证。

## 保留失败

初探pytest logging写/dev/null、收集父目录/tmp均被拒绝；禁logging和固定confcutdir解决，
没有放宽权限。专项乘法例两个失败被测试预期错写一个，修断言后API实际2→2→0；
浏览器路径例独立2→1→0。

综合脚本最初遗漏外部Playwright路径，在启动前失败；使用已装路径后仍有一次
context closed，原因未确定。[中断记录](retained/interrupted-workbench.json)不计成功。
新fixture `.mzRSJ1` 完整重跑58checks，未更改产品调用详情逻辑。
主GET脚本早期渲染时序/一次fetch中断，等待真实shell后桌面手机完整重跑8checks。
没有用早期部分画面拼接最终通过。

## 本机启用

入口 `http://127.0.0.1:5173/`。4180原空闲PID84755经command/cwd/env内存核验、
一致backup、私有Store演练、原表原列比对、SIGTERM/锁释放，同command/cwd/env启动
PID378077；5173原进程保持，coding_pytest=true。8GET-only后原行再次相同。
原1Project/1Task/6Run/1model/18Agent/17Call/6Artifact/157Event保持，
coding_jobs/TaskTurns/计划/设备授权空，Workflow原记录不变。

私有备份 `.runtime/backups/before-devices-20261126T160459Z/`700/DBlog600，不进Git；
无正式候选/模型/测试、正文截图/环境/原摘要导出。旧PID脚本不可重跑，不热覆盖数据库。
临时4187/4188/5176/5177已停。

app207.08/gzip65.88kB、CSS39.89/7.50、lazyCoding16.20/6.13、
RunWorkspace25.75/9.43、TaskWorkspace36.81/12.18；Bootstrap仍全量。
剩余：其他语言/runtime、可写fixture/插件、计划修订/更广分解、基线冲突处理、
真实模型效果。没有原项目应用/合并/部署或任意Shell。
