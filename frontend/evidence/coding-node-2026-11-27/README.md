# 固定 Node.js 研发验证交付

日期：2026-11-27。起点`688c232`。用户继续既有多Agent核心交付与提交push授权。
本批是固定`node-test`子范围，不是完整项目环境、通用命令或真实模型质量认证。
[计划](../../../docs/CORE_NODE_PLAN_2026-11-27.md)、
[ADR-0035](../../../docs/decisions/ADR-0035-node-test-profile.md)。

## 最终验证

| 验证 | 实际结果 |
| --- | --- |
| Python全量 | `MYBOT_REQUIRE_PI_RUNTIME=1 .venv/bin/python -m pytest -q`，1497通过，464.06s；旧httpx弃用警告保留 |
| 后端定向 | 90通过：32Node runner、13API集成、21旧coding、24pytest；44.29s |
| 前端 | 2470通过/84文件，6.78s；231相关定向通过，TypeScript通过 |
| 生产构建 | `pnpm build`通过；保留已有大chunk警告 |
| Node专项浏览器 | 最终全新`YP7SYx`：8检查/10PNG，pageerror0、外部HTTP0 |
| 综合浏览器 | 全新`MIXOHQ`：58检查/61PNG，pageerror0 |
| 主入口只读 | 英文1440/中文390共8检查；所有API写被拦截，无外部HTTP、无pageerror、无截图 |

合计74最终浏览器检查、71最终fixturePNG。独立复核另以生产runner实测after/import/
empty/expectedFailure/only/late六边界，均未假通过；不重复计入浏览器检查。
旧119/9/110台账不变。Bootstrap仍全量，未宣称数据迁移或整体规模验收完成。

主应用JS208.51kB/gzip66.44、CSS39.89/7.50；
lazyCodingRunDialog29.14/9.64、RunWorkspace26.99/9.82、
TaskWorkspace37.83/12.50。未升级React/Astryx或新增前端库。

## 真实链路

`tests/node_browser_server.py`将真实`frontend/scripts/api-proxy.ts`中的
`forwardedOrigin`提取为`forwarded-origin.mjs`。只机械去掉三个参数类型，
函数体原样；完整TS模块没有执行。来源/函数/副本摘要及提取方法在
[fixture-status.json](node/fixture-status.json)中，当前源和测试摘要与初始一致。

最终fixture只有1Task、1Run、2次注入JSON模型响应。Task
`8d06ec9971f3408385e8d6af108e4726`，Run
`53b82f596b404d75a84552bbf5aeeb46`。
四个不变测试保留有效同源转发与异源拒绝，再要求拒绝带凭证和路径的代理目标：

| 轮次 | 实际Node测试项 | 失败 | 错误/跳过 | 退出码 | 结果 |
| --- | --- | --- | --- | --- | --- |
| 原始基线0 | 4 | 2 | 0/0 | 1 | 未通过 |
| 只修目标凭证1 | 4 | 1 | 0/0 | 1 | 未通过 |
| 再修目标形状2 | 4 | 0 | 0/0 | 0 | 通过 |

每轮实际输出包含Python启动器命令、Node实际版本/execArgv/argv、
五字段测试回执和退出状态。断言固定v24.21.0、permission/jitless/禁TS stripping。
准备与执行各故意丢一次响应，刷新只GET原ID，各原ID仅1次POST；重新打开consent未勾选。
同一冻结候选跨Neutral/Zira/Y2K双明暗、英文桌面/中文手机保持profile。
Diff与测试JSON实际通过UI下载，原JSON字节一致；Diff只做`git apply --check`。

模型JSON是确定性fixture；Node、隔离、HTTP、SQLite、测试与导出是真实执行。
源仓库函数与所选host副本/测试均未由执行器改写。没有付费Provider或Codex效果认证。

13项API集成还证明CommonJS实际fail2→fail1→pass4、
同Task Python→Node→Python每次重跑相应框架、
Node失败检查点接续与当前基线变化后的三Run显式解决、新根锚定，
以及失runtime后原GET/discard/applied回执不重发。
旧默认profile保持省略、旧candidate/hash不回填。

## 隔离与可用性

本机Linux/aarch64、Landlock ABI7，固定已安装Node v24.21.0。
可信C模块是显式本机build，产物与manifest不进Git；
运行前核对Node/native/source摘要，bootstrap再核对实际版本。
单线程Python先施加Landlock再exec，所有Node/libuv线程继承文件边界；
trustedprewarm后native seccomp TSYNC覆盖既有线程。
探针让Nodepermission仅放行合成canary路径，而OS仍拒绝同步/异步读；
native直接证明socket/clone/可执行内存被拒，不能只把任意异常算作隔离证据。

仅选中.mjs/.cjs，不发现、安装或运行npm scripts。选入package.json可有普通模块解析
语义，不授权隐式宿主依赖。文件副本/测试只读，网络/外部进程/worker/native addon、
元数据修改受限；原测试timeout/output/取消清理边界保持。
这是受限本机执行，不是VM或对同进程恶意JavaScript的独立密码学证明。

计数采用Node原生test项，包含父test和子test、不含suite，不能说是叶测试或断言数。
原生.only在none模式下会隐式过滤，用精确版本固定内部context关闭，并验证nested
runOnly不能隐藏失败。可信setup捕获每个模块import错误，避免原生占位及注册后丢异常。
自然drain，hookFailed/runtime异常与退出状态参与最终回执。迟到native fatal可退出7且
无完整回执；该结果为未验证，不补造错误数或成功。

## 保留的失败

[failures](failures/)保留原始轮次日志及首轮未归一滚动的浏览器证据：

- 初期仅主线程施加Landlock和信号同步方案被否决；正式使用pre-exec继承与TSYNC。
- `only:false`仍隐藏其他测试、原生after失败不一定更新summary、
  注册pass后模块throw被files加载吞掉，均以实际probe发现并在正式adapter修正。
- 首runner29项中after失败、第二31项中after/错误口径及退出码预期失败，
  manualsetup后45项中迟到错误无回执、top-level await已可执行而旧预期仍失败。
  最终32runner+13API+45旧项90通过。过强预期修正为真实failclosed边界，
  没有伪造late错误的完整receipt。
- 首API发现context尚未允许.cjs；只增加明确文本后缀，实际CJS链路随后通过。
- 首专项8项技术通过，但滚动中截全页使sticky chrome错位；保留于
  `failures/before-scroll-normalization`，最终新fixture归一scroll后全链重跑。
- 首主只读脚本是11月16日旧白名单，拦截了现有task-query/reference/counts读取而超时。
  正式使用当前只读脚本，8项通过且原记录复核一致；没有据此改业务菜单。
- `.venv/bin/pytest`旧shebang路径失效，使用实际解释器`python -m pytest`完成验证。

## 本机启用

入口仍为`http://127.0.0.1:5173/`。原4180空闲PID2447464经身份/cwd/env内存核验、
一致备份、Store副本演练、原表原列比对和SIGTERM锁释放后，同command/cwd/env启动369142。
capability `coding_node_test=true`；5173原进程保持。
主8项GET-only检查后再次比对原行完全一致：
1Project/1Task/6Run/1model/18Agent/17Call/6Artifact/157Event及原Workflow。
coding_jobs/task_turns/model_tests/task_plan_versions均0。
没有在主环境创建候选、读源码预览、运行测试或调用模型。

私有一致备份位于`.runtime/backups/before-devices-20261127T144503Z/`，
目录700、数据库/日志600，不进Git；未导出原正文/截图/环境或原记录摘要。
此目录的身份绑定脚本不可用于下一轮直接重跑，不热覆盖回退。
临时4187/4188/5176/5177已停止，主4180/5173保持。

下一核心是嵌套/AI建议分解、更多项目runtime/依赖与Pi受限工具Harness。
固定Node配置没有完成依赖安装、TS类型检查、任意shell、原项目应用/合并/部署或真实模型质量验收。
