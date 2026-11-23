# 固定 Workflow W1–W5 交付与本机恢复

日期：2026-11-23，Asia/Singapore。基线`0cf2c99`已在main/origin/main，
恢复时工作树干净，4180/5173均停止。此前的11月22日隔离证据保留，
本目录记录本轮生产构建、修复与本机启用。
合同：[ADR-0023](../../../docs/decisions/ADR-0023-fixed-workflow-versions.md)。

## 用户可以完成的工作

进入`#workflows`，查看固定Planning→Research→Synthesis与独立人工审查。
可配置阶段模型、补充指令、调用/并行/时限/输出/研究任务数，保存草稿、检查发布影响、
明确确认后发布不可变版本。版本历史真实分页，旧版本可只读查看。
任务和任务会话的资源向导均可分页选择发布版本，Run显示自己的记录快照。
原历史Run没有版本时明确显示“未记录”，不替换成最新版本。

- [桌面配置](workflow/workflow-desktop-zh.png)
- [选择历史v1的Run](workflow/workflow-old-version-run.png)
- [中文手机Zira深色](workflow/workflow-zira-dark-390.png)
- [Y2K浅色](workflow/workflow-y2k-light-1440.png)

这些截图均是专用FakeProvider fixture；正式记录不导出截图/正文。
单个固定工作流不是任意DAG、插件执行器、长期Agent或Cindy设备控制。
保存/发布不启动模型；运行仍需资料/资源与费用确认，仍只有原只读权限。

## 本轮修复

- backend Agent修复显式`workflow:null`被当作历史字段缺失的错误；损坏快照在调用前拒绝。
  验证旧记录不回填、恢复可显式使用新模型而仍保留原指令/研究任务上限。
- client Agent补齐Run版本选择的20项分页、页外已选项保留、过期选项阻断，
  发布回执实际definition SHA256校验，以及忽略abort的transport迟到返回保护。
  已选发布版本失去capability时阻断，不能静默改成内置流程。
- UI Agent修复保存回执使旧历史请求失效但未重启、导致历史一直busy的竞态。
- root接入版本翻页、Run快照展示与严格准入；全局新建任务/项目先查询当前draft guard，
  防止dirty或未知Workflow写被另一个Form覆盖保护。测试保留原导航合同。
- 实际截图发现手机历史哈希使`auto`列吞掉名称空间。改为有界等分列并允许哈希收缩，
  最终手机名称宽171px、最大行高84px，六种组合document overflow均0。

## 最终验证

| 证据 | 结果 | 事实范围 |
| --- | --- | --- |
| `python-tests.txt` | 1132项通过 | 全后端，1项既有Starlette/httpx提醒 |
| `frontend-tests.txt` | 1958项 / 65文件通过 | Workflow/turn/Run准入、导航与既有组件 |
| `build.txt` | typecheck与生产build通过 | UI收口后；最后仅Workflow CSS改动，生产浏览器再验 |
| `workflow/verification.json` | 21项 / 9PNG | 真HTTP/SQLite/FakeProvider、CAS、未知回执、历史分页、两种Run入口、三style双mode |
| `workbench/verification.json` | 58项 / 61PNG | 最终构建的原任务/模型/预算/审查/查询/主题/恢复回归 |
| `local-activation-summary.json` | 6项只读通过 | 主5173→4180、英文桌面/中文390px、原历史无版本声明 |

共85项最终浏览器检查、70张最终fixture PNG，pageerror/external HTTP均0。
三style为Neutral/Zira/Y2K，均测明暗模式；另测390px英文Gothic。
计算色值、字体和输入圆角有记录，不把radio选中当主题证据。
物理手机、Safari、真实IME、真实Provider及真实账单仍未认证。

Workflow fixture`/tmp/mybot-astryx-workbench.AvwQtP`从空业务库开始：
最终23个发布版本，验证第2页选v1；普通API Run、普通UI Run、TaskTurn UI Run共3次，
没有真实模型。未知save/publish先实际写入再丢响应；发布重载后仅GET查询原operation，
只新增1版本、不重发POST。旧Run与原Task目标保留。
综合使用独立空fixture`/tmp/mybot-astryx-workbench.VKfj6t`，不能对主4180/5173运行。

复现需先配置专用`tests/browser_server.py`与指向该fixture的生产preview：

```bash
# frontend/；脚本禁止主4180/5173并检查空业务库
MYBOT_BROWSER_FIXTURE=1 WORKFLOW_EVIDENCE_DIR=/tmp/mybot-workflow-new \
  node scripts/verify-workflow-browser.mjs
# 综合用另一份新的空fixture与对应frontend URL
MYBOT_BROWSER_FIXTURE=1 PLAYWRIGHT_MODULE=/tmp/mybot-browser-tools/node_modules/playwright/index.mjs \
  BROWSER_EXECUTABLE=/usr/bin/google-chrome node scripts/verify-workbench.mjs
pnpm test
pnpm build
```

已有大chunk警告保留；app JS194.95kB/gzip62.28、CSS39.15/7.39，
lazy Workflow JS25.02/8.66、CSS6.07/1.32。不是实际初始transfer或全站性能结论。
没有升级依赖，Bootstrap仍全量。

## 保留的失败与视觉反例

- `failures/busy-dialog-role/`：脚本等`dialog hidden`，但提交时Astryx会转换为`alertdialog`；
  准备与执行之间过早断言“applied”。修为等待真实Form卸载，未放松候选验证或自动重试。
- `failures/legacy-capability/`：旧的context-conflict模拟Bootstrap继承了workflow能力，
  却没有该GET接口；客户端正确阻断。该独立旧模拟明确声明false，真实新能力另有21项覆盖。
- `failures/mobile-history-width/before.png`：横向overflow为0仍出现名称逐字换行，
  属真实排版缺陷。最终额外断言名称宽>=100、行高<180，并检查最终截图。

11月22日记录使用dev server且只有8项，不能作为本轮生产验收或当前启用证据；
也不把后来已提交的代码继续描述成“尚未提交”。

## 本机恢复

重启后4180/5173都停止，不再存在可继承的旧进程环境。
先恢复5173，再核查当前Settings的workspace/data/auth模式与原记录一致，
确认无queued/active Run、Call、test、未决恢复或prepared turn，取得worker lock。
私有一致停服备份→副本Store迁移→原表原列逐行摘要比较→再次空闲检查后，
用同一本仓库命令和回环地址启动4180，新PID3459239。

原1Project/1Task/6Run/1model/18Agent/17Call/6Artifact/157Event及其他原行不变。
新表仅1条未绑定默认草稿，0发布版本、0操作回执；未自动采用现有模型或发布。
主浏览器6项GET-only后再次比较原行相同，无正式写入/模型调用/外部HTTP。
私有备份`.runtime/backups/before-workflow-20261123T020755Z/`目录700、DB/log600，
不进Git；无凭证库/兄弟项目读取，不导出真实正文/环境，不热覆盖回退。

主4180/5173保持运行；临时4187/4188/5176/5177收尾停止。
W1–W5关闭的仅是本固定工作流初版；原119/9/110不变。
下一产品主线是设备配对/控制身份/撤销/断线接续，其后按顺序接飞书、语雀、邮箱等。
