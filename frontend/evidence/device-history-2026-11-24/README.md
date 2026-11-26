# 历史Run与显式阅读位置接续

日期：2026-11-24，America/Los_Angeles。起始基线`55fd4d9`已push、工作树干净。
合同：[ADR-0025](../../../docs/decisions/ADR-0025-scoped-run-continuation.md)；
沿用[ADR-0024任务授权](../../../docs/decisions/ADR-0024-scoped-device-continuation.md)。

## 可见交付

Task页新增链条图标“复制设备接续链接”，复制精确Task/当前视图及运行或成果页的选中Run。
已配对的另一浏览器打开后可继续看同一个旧Run，而不是被切到最新Run。
配对端提供概览、目标、会话、运行、成果视图，真实20项历史分页与有界报告；
阅读URL保留独立historyPage，选中页外Run也能刷新和Back/Forward。

- [中文390px、Zira深色、页外选中Run](history/history-zira-dark.png)
- [英文桌面、Neutral浅色](history/history-neutral-light.png)
- [主Task入口与复制按钮](workbench/task-goal-desktop.png)

链接不创建授权，不包含配对码、补充正文、草稿或执行consent；另一设备仍需此Task有效配对。
授权固定`task_read,message_save`。历史接口不返回配置、文件上下文、模型或Agent控制。
错误Task链接隐藏内容，显式回授权概览；缺失Run或读取失败不换成latest。
同Task视图切换保留本页composer内存，未知保存锁导航并按原请求GET核对。
这不是服务端bookmark、跨设备草稿传输、执行委托或进程迁移。

## 实现与证据

本批由root实现和验收，没有新增Agent委托、依赖或上游源码副本。
后端两个GET在同一query-only快照检查cookie与`X-Workbench-Device-Id`，
20项真实计数/分页、精确Task/Run、报告最多20000 codepoints；无新表或数据迁移。
Bootstrap的`device_run_history`与配对Task的`run_history`均需显式true，
缺失保留旧路径，advertised读取失败不能回退owner Bootstrap或最新报告。
前端继续Astryx0.7.13/project wrappers、同一业务树和语义tokens；
GET有15s边界、取消迟到、身份绑定、明确错误和显式重试。

| 证据 | 最终结果 | 实际范围 |
| --- | --- | --- |
| `python-tests.txt` | 1191项通过 | 13新增history/隔离/参数/只读快照/过期；既有1项httpx提醒 |
| `frontend-tests.txt` | 2099项、70文件通过 | 47新增client/URL/view/portal病例及既有回归 |
| `build.txt` | typecheck/生产build通过 | 最终代码与CSS；保留大chunk警告 |
| `history/verification.json` | 10项、6PNG | 两独立浏览器、真实HTTP/SQLite、精确历史/位置与异常 |
| `workbench/verification.json` | 58项、61PNG | 原创建/任务/模型/预算/执行/审查/查询/恢复/多样式回归 |
| `local-activation-summary.json` | 6项GET-only | 主入口1440英文/390中文、复制链接与未配对边界 |

共74项最终浏览器检查、67张最终fixture截图；失败截图不计入。
最终pageerrors均0，专项与主报告external均空，综合禁止外部HTTP。
专项Neutral/Zira/Y2K三style双mode，浅色1440英文、深色390中文，
显式断言中文radio名称，document overflow均0。
人工检查中文手机页外报告、真实状态、可滚动历史与桌面Task入口，无文字重叠。
没有物理手机、平板、Safari、真实IME或真实Provider验证。

专项fixture`/tmp/mybot-astryx-workbench.KHoKCc`由空业务库启动后经guard seeder加入
45Project/45Task/88终态Run/0model，两个合成报告。Task000有45Run：
旧000与最新044报告不同，保证不以latest冒充选中项。
测试创建1邀请/1设备、真实保存1消息，并故意丢保存响应：一次POST、同ID GET恢复；
视图切换保留草稿、unknown阻断导航、受管Back/Forward不重复保存。
模拟503和缺失Run均明确错误；其他Task404、owner Bootstrap/执行API403，
最终撤销后私有内容消失。执行API测试是被拒绝的请求，没有创建Run或调用模型。

综合使用独立空fixture`/tmp/mybot-astryx-workbench.ezv2Ye`，FakeProvider/MockTransport。
没有复用已撤销的历史fixture或正式库，没有真实Provider费用。

复现先创建专用空`/tmp/mybot-astryx-workbench.*`，
启动`tests/browser_server.py`生成标记和初始schema，再使用有空库/路径/标记guard的seeder。
5176生产preview必须代理这个4187fixture；禁止指向主4180/5173。
专项会撤销设备，重跑必须使用新fixture：

```bash
# 仓库根目录；fixture先由browser_server.py初始化
PYTHONPATH=. .venv/bin/python tests/seed_device_history_fixture.py /tmp/mybot-astryx-workbench.NEW

# frontend/；专项需要上述seed，综合需另一独立空fixture
MYBOT_BROWSER_FIXTURE=1 DEVICE_HISTORY_EVIDENCE_DIR=/tmp/mybot-history-new \
  node scripts/verify-device-history.mjs
MYBOT_BROWSER_FIXTURE=1 WORKBENCH_EVIDENCE_DIR=/tmp/mybot-workbench-new \
  PLAYWRIGHT_MODULE=/tmp/mybot-browser-tools/node_modules/playwright/index.mjs \
  BROWSER_EXECUTABLE=/usr/bin/google-chrome node scripts/verify-workbench.mjs
pnpm test
pnpm build
```

构建app JS195.96kB/gzip62.73、CSS39.15/7.39；
lazy PairPortal JS27.52/9.24、CSS2.70/0.80，另共享pair-location JS1.30/0.72。
这是产物大小，不是初始transfer或整站性能结论；Bootstrap仍全量。

## 保留的失败

- `failures/radio-locator`：脚本用button查找Astryx SegmentedControl，实际role为radio；
  修正语义定位，未改产品ARIA。初始locale脚本也已改为只在未设置时设英文，
  最终每个深色画面明确验证中文radio，早期英文截图不当中文证据。
- `failures/backend-stopped`：fixture进程收到SIGTERM后GET空响应导致JSON解析失败，
  停止原因未确认。新空fixture重新seed并完整重跑，未给产品加成功fallback。
- `failures/write-counter`：page级route覆盖context route，计数器漏掉真实消息POST；
  改为request事件计数，最终报告确认仅1次message POST。
- view单测覆盖poll更新不取消loading GET、不自动重试error，显式重试后恢复；
  报告置于历史列表前，手机可先看到页外旧成果，历史区域独立有界滚动。

失败目录保存当时JSON/截图，不当最终通过证据，不保存配对secret或正式内容。

## 本机启用与剩余项

主4180原PID1104938空闲，核对命令/cwd/环境并仅在内存继承；
在线一致备份→私有副本Store演练/原表原列摘要→再查空闲→
SIGTERM/锁释放/停服备份→同命令/cwd/env启动PID1303596。
`device_run_history:true`，无需schema变更。主5173从停止状态恢复，实际入口已加载。

原1Project/1Task/6Run/1model/18Agent/17Call/6Artifact/157Event及其他原行未变；
4设备表0行，Workflow默认草稿1、版本0、操作0。
主桌面英文/中文手机6项只读通过，无业务非GET/外部HTTP/pageerror；
之后原表原列摘要再比对相同。没有正式配对、消息、Run或Provider调用。
私有`.runtime/backups/before-devices-20261124T170717Z/`目录700、DB/log600，不进Git；
公开summary无原行hash、环境、正式正文或截图。旧PID绑定脚本不可再运行，不热覆盖回退。

主4180/5173保留运行且HTTP200，临时4187/5176已确认停止。
未改监听/TLS/网络入口，`127.0.0.1`不能当另一台手机的网络地址。
D3b委托执行、D4b跨设备持久草稿/更广未决candidate接续、D5b可信HTTPS与真机
仍待；后续连接器保持飞书入站→语雀只读→邮箱草稿→钉钉/微信顺序。
原119/9/110不变，本批代码与记录尚未提交/push。
