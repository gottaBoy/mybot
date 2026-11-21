# Task Conversation And Next Run

日期：2026-11-21，Asia/Singapore。起始`391603c`已push且工作树干净。
合同：[ADR-0022](../../../docs/decisions/ADR-0022-task-conversation-turns.md)。

## 用户可见交付

原Task页只有目标/执行/审查，本批新增“任务会话”页签：保存补充要求、刷新找回，
选中一条后安排下一轮，在资料/角色模型/预算向导中明确确认，再进入同Task的Agent页。
消息显示真实保存/准备/关联运行状态，并可查看对应Agent和成果，不伪造assistant消息。
手机页签沿Astryx具名图标模式，保留完整可访问名称；输入框使用单一Unicode字符计数。

- [实际SQLite保存后](live/live-saved-message.png)
- [实际准备记录刷新后](live/live-prepared-after-reload.png)
- [实际关联Agent执行](live/live-first-agent-run.png)
- [实际中文390px会话](live/live-mobile-conversation.png)
- [Zira深色手机](synthetic/zira-dark-390-conversation.png)

这些截图来自隔离fixture，不是正式任务或真实Provider记录。旧版对照保留在
`../task-workspace-2026-11-21/`，不声称用户已经接受全部视觉。

## 实现与分工

backend Agent负责`task_turns.py`、Store/API和59项新增测试；
client Agent负责strict DTO、hook、受管URL和112项client测试；
UI Agent负责Task会话、草稿/保存锁、响应式和定向组件测试；
root整合Forms/Workbench、真实接口/原功能回归、本机启用与文档。
backend Agent另以独立合成浏览器脚本验证边界。

保存是幂等消息写入，不读文件或开始Run。prepare冻结所选消息/资料/资源，
execute以同一request ID原子创建Run、关联applied；Worker仍使用原只读Harness。
同一Task最多一条prepared，独立于20项页补取，普通安排/恢复不能绕过。
直接mutation和GET回执均校验不可变消息身份、完整candidate及本次发送的配置/hash。
15秒mutation超时进入未知结果，不自动重试；GET仅核对，恢复prepared仍需新的执行确认。

只发送原Task资料及选定消息，不隐式追加旧消息/旧模型输出。原Task与旧Run快照不变。
没有新增工具执行权限、任意DAG、设备协议、IM/文档/邮件连接器或依赖。
模板采用沿既有`ai-chat/work-item-detail/form-wizard`模式与项目wrapper，
没有新复制上游源码或引入另一组件库。

## 验证

| 证据 | 最终结果 | 范围 |
| --- | --- | --- |
| `frontend-tests.txt` | 1813项 / 60文件通过 | 最终前端源码，含既有功能与本批测试 |
| `python-tests.txt` | 1055项通过 | 本批59新增与原有后端；后续只有前端/文档修改 |
| `build.txt` | typecheck/build通过 | 最终生产构建 |
| `synthetic/verification.json` | 24项 / 26PNG | 正常/未知/篡改回执、草稿、21DTO边界、缺cap/错误/401/迟到、三style双mode |
| `synthetic/mobile-accessibility.json` | 中文手机可访问名称通过 | Zira/Y2K四radio完整名称、无截断 |
| `live/verification.json` | 5项 / 4PNG | 真实HTTP/SQLite/FakeProvider，两消息两Run及丢响应核对 |
| `workbench/verification.json` | 58项 / 61PNG | 原模型/任务/审查/查询/主题/预算/恢复等完整回归 |
| `local-activation-summary.json` | 6项通过 | 主5173→4180桌面/手机GET-only，原记录不变 |

共93项最终浏览器检查，91张fixture最终PNG；失败截图另列不相加。
最终pageerror均0，六组会话几何document overflow均0；合成与主入口无外部HTTP。
Chrome视口不是Safari/物理手机/真实IME认证。

实际接口fixture为`/tmp/mybot-astryx-workbench.8k8JKc`，从空库开始，
两条消息、两次显式prepare/execute；一轮4次FakeProvider调用。
故意先完成HTTP写入再丢prepare/execute响应，GET核对后重新确认或打开原Run，
重复相同execute仍只有两Run，第二Run不含第一条补充要求，第一Run上下文不变。
综合回归使用另一fresh fixture，不对主服务运行fixture脚本。
`tests/browser_server.py`固定FakeProvider和MockTransport，无真实Provider或费用。

保留既有Starlette/httpx弃用提醒和大chunk警告。最终app JS179.53kB/gzip58.12，
app CSS38.91/7.35；lazy TaskWorkspace JS30.37/10.15、CSS5.62/1.26。
这是构建产物大小，不是初始实际transfer或整体性能结论。Bootstrap仍全量。

复现前必须启动新的专用空fixture和指向4187的5176生产preview，不能指向4180/5173：

```bash
# frontend/；使用已安装Playwright/Chrome与本仓库fixture，不下载新依赖
MYBOT_BROWSER_SYNTHETIC=1 node scripts/verify-task-conversation.mjs
MYBOT_BROWSER_FIXTURE=1 node scripts/verify-task-conversation-live.mjs
# 综合脚本使用另一份全新空fixture
MYBOT_BROWSER_FIXTURE=1 node scripts/verify-workbench.mjs
pnpm test
pnpm build
```

输出目录通过脚本顶部环境变量更换，避免覆盖失败或前轮证据。

## 失败与修正

- `failures/navigation-setup/`：脚本在已初始化页面上`goto(hash)`产生unmanaged历史，
  保存的replace被既有导航准入拒绝，没有POST；改用刷新后的正式deep link。
  没有绕过或放松历史管理。
- `failures/early-run-check/`：异步`waitForFunction`返回Promise被当作truthy，
  尚只有一次调用就进行最终4调用断言；这是脚本等待错误，不是模型漏跑。
- `failures/async-wait-check/`：改返回对象仍提前结束为false，进一步确认等待错误；
  最终改Node层显式有界GET轮询，两个fresh fixture均完整通过。
- 源码复核修复：composer草稿可能被另一个表单替换guard；已提升锁并阻止相关入口。
  direct prepare/execute和unknown GET补齐不可变身份及发送候选绑定；
  Form key加入turn ID，防同Task不同消息复用旧表单状态。
- reload后save404不代表在途POST终止；原文不在内存时保留taskSend和未知锁。
  原文尚在内存时，只能显式重试同内容/同ID，不能清锁换请求。
- 早期截图发现手机四tab截断和重复字符计数；最终改既有Astryx iconOnly及单Unicode计数，
  最终专项/实际/综合与主入口都重跑。

## 本机启用与剩余范围

原主服务PID3356362，无活动/排队Run、Call、model test、未决恢复或子执行器。
私有一致备份、副本Store迁移、原表原列摘要比对后，SIGTERM/锁释放/停服备份，
同命令/cwd/原环境内存继承启动PID234937，task_conversation=true。
原1Project/1Task/6终态Run/1model/18Agent/17Call/6Artifact/157Event不变，
新task_turns为空；最终主浏览器后原行再比对不变，无正式消息/Run写入或模型请求。
私有备份位于`.runtime/backups/before-task-conversation-20261121T102836Z/`，
目录700、DB/log600，不复制真实内容、截图、凭证或环境到Git。
身份绑定脚本不能再次对旧PID运行；备份不包含旧内存代码，回退不能热覆盖。

主4180/5173保留运行，临时4187/5176已停止。原119/9/110不变。
prepared暂不支持撤销/改资源；reload后无原文且持续404仍保持未决，
没有伪造终止回执或新ID逃逸。更好的终止/恢复协议留为后续明确工作项。
未验证真实Provider完整链、通用长期记忆、真机、设备配对/控制、远程网络或连接器。
下一批为产品W1–W5固定Workflow定义、版本、可见配置、CAS/确认和验收。
