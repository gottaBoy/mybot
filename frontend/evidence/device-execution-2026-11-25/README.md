# 精确下一轮的一次设备执行委托

日期：2026-11-25，America/New_York。
合同：[ADR-0026](../../../docs/decisions/ADR-0026-single-use-device-execution.md)。
本批在上批未提交的历史位置切片上继续，没有覆盖或丢弃已有修改；
Git提交基线仍`55fd4d9`，两批修改均尚未提交/push。

## 用户能完成的操作

1. Task“任务会话”保存一条补充要求，点击“安排下一轮”。
2. 资料/资源向导最后一步选择“仅准备，稍后委托设备或继续确认”，确认冻结；
   此步不调用模型、不创建Run。
3. prepared提示中的“到设备页委托执行”进入真实设备目录，选择设备“执行委托”。
4. 主工作台核对Task/消息、模型、资料数量与hash、调用/并行/时间/输出设置，
   明确授予一次执行；最多十分钟，且不晚于该设备到期。
5. 配对端在概览或运行视图读同份摘要，独立确认后启动这个精确候选。
   applied表示唯一Run已入队，后续执行成功、人工接受与费用结清仍分开。

- [主端中文390px确认](delegation/owner-zira-dark.png)
- [配对端中文390px摘要与确认](delegation/paired-zira-dark.png)
- [主端英文桌面](delegation/owner-neutral-light.png)
- [配对端英文桌面](delegation/paired-neutral-light.png)

这是一次精确启动授权，不是通用Run控制租约。pair scope仍`task_read,message_save`；
配对端不能编辑模型、读owner Bootstrap、预览任意文件、暂停/取消/恢复Run或批准成果。
授权摘要没有文件正文/路径、endpoint、key_env或secret。
模型标识/名称、配置上限、资料数量/bytes/hash与选中消息来自冻结的真实候选；
Codex CLI保留实际单通道和输出Token设置非硬限制说明。

## 实现与合同

root完成本批后端/client/UI/浏览器/本机启用，没有新增Agent委托或第三方依赖。
新增`device_execution_grants`、`device_execution_operations`两张表，原表schema不改。
TaskTurn执行抽出共享同事务helper，保留原模型/快照/冲突检查。
授权消费、唯一Run入队和TaskTurn applied处于同一个BEGIN IMMEDIATE事务。
owner与device同时执行只创建一个Run；owner先执行时unused grant显示superseded，
不能伪造成设备applied回执。撤销与execute竞争只有一个合法结果。

owner create/revoke使用稳定ID、canonical hash与不可变回执；摘要绑定精确候选。
同Device或同Turn最多一个未过期未消费grant，过期/撤销后可显式重新授权同一prepared候选。
device active cookie、`X-Workbench-Device-Id`、recipient/Task/candidate、到期/撤销及模型
均在消费事务内检查。重复成功请求返回同一个grant/Run，不重复排队。
记录device actor、grant/Task/Turn/hash审计事件；保存授权本身不调用模型。

owner页面的`executionDevice/executionOperation`和paired的`deviceExecute`保存原标识，
不包含正文/凭证/consent。丢响应、reload和404只核对原GET；unknown不能关闭换新请求。
无效execute回执保留原锁；没有用latest Run推断某个请求成功。
授权与资料刷新撤回consent；外观/导航不创建授权或自动POST。

## 验证

| 证据 | 结果 | 覆盖范围 |
| --- | --- | --- |
| `frontend-tests.txt` | 2147项、72文件通过 | 48新增client/view/URL/unknown/Codex说明及全部既有回归 |
| `python-tests.txt` | 1208项通过 | 17新增grant/scope/consent/expiry/restart/competition/readonly及既有回归 |
| `targeted-tests.txt` | 17项通过 | 最后三项recipient/TTL/跨Task检查单独先验，随后全量复验 |
| `build.txt` | typecheck/生产build通过 | 最终代码与新增说明，既有大chunk警告保留 |
| `delegation/verification.json` | 9项、12PNG | 两独立浏览器、实际HTTP/SQLite、prepare-only/授权/执行/撤销与丢响应 |
| `workbench/verification.json` | 58项、61PNG | 原创建/任务/模型/预算/执行/审查/查询/恢复/八style回归 |
| `local-activation-summary.json` | 8项GET-only | 正式Task/空设备/未配对边界，1440英文/390中文 |

共75项最终浏览器检查、73张最终fixture PNG；失败截图不计入。
最终pageerrors0，专项与主external空，综合阻止外部HTTP。
两端Neutral/Zira/Y2K双mode共12组合，1440英文与390中文；document overflow均0。
手机确认弹窗内部滚动，内容未被挤成单字列；配对端摘要与确认无重叠。
没有真手机、平板、Safari、真实IME、远程HTTPS或真实Provider认证。

最终专项fixture`/tmp/mybot-astryx-workbench.IMaATi`从空库开始：
1Project/1Task/1合成model/1device、2消息/2grant；只完成1个FakeProvider Run。
先实际UI仅prepare，断言0Run与没有execute；owner grant真实提交后故意丢响应，
reload按原operation GET核对，只有一次grant POST。
paired再次确认，真实execute提交后丢响应，reload按原grant GET核对，
只有一次device execute POST，FakeProvider最终产生report。
owner重放同候选execute返回同一Run；新一条prepared仅用于撤销验收，
UI revoke后旧device确认409，没有第二Run；最后撤销device清除私有内容。
脚本记录的被拒绝普通Run/旧grant请求不算成功执行。

综合为独立空fixture`/tmp/mybot-astryx-workbench.GhrLUg`，FakeProvider/MockTransport。
无真实Provider或费用，未在正式库创建配对、消息或grant。

复现要求独立空`/tmp/mybot-astryx-workbench.*`和`tests/browser_server.py`。
专项固定配对ID且最后撤销，重跑必须新fixture；综合也使用另一独立空fixture。
生产preview代理对应fixture端口，禁止指向主4180/5173：

```bash
# frontend/，专项的5176需代理专用4187fixture
MYBOT_BROWSER_FIXTURE=1 DEVICE_EXECUTION_EVIDENCE_DIR=/tmp/mybot-execution-new \
  node scripts/verify-device-execution.mjs

# 综合的5177需代理另一专用4188fixture
MYBOT_BROWSER_FIXTURE=1 MYBOT_FRONTEND_URL=http://127.0.0.1:5177/ \
  WORKBENCH_EVIDENCE_DIR=/tmp/mybot-workbench-new \
  PLAYWRIGHT_MODULE=/tmp/mybot-browser-tools/node_modules/playwright/index.mjs \
  BROWSER_EXECUTABLE=/usr/bin/google-chrome node scripts/verify-workbench.mjs
pnpm test
pnpm build
```

代码保持React19/Astryx0.7.13、project wrapper与共享tokens，无vendor源码副本或升级。
新增ExecutionFacts是领域摘要组件，不是另一套通用UI/主题。
产物大小以`build.txt`为准：app196.86kB/gzip63.03、CSS39.15/7.39，
lazy共享DeviceExecution29.78/9.01、PairPortal28.59/9.63、DevicesPage23.35/8.17；
不是初始transfer/整站性能结论，Bootstrap仍全量。

## 失败记录

- `failures/prepare-role`：脚本等待原dialog hidden，但提交期间Astryx会换为alertdialog，
  因而过早读取saved状态。实际库已prepared且Run0；改为等待真实form卸载，
  使用新fixture重跑，没有调整产品来自动执行或放松回执校验。
- `failures/preview-stopped`：临时5176停止后connection refused，进程停止原因未确认；
  恢复loopback preview后用空fixture重新验收，没有指向正式服务兜底。
- 初始旧Task DTO断言未包含新execution_delegation标记；更新精确字段集，
  保持unknown字段拒绝，不改成宽松schema。
- 最后补Codex已知限制说明与单测后重新typecheck/build、全量及两套生产浏览器，
  证据对应最终产物；没有把早期成功报告当最终构建证明。

## 本机启用与剩余范围

主4180原PID1303596空闲，核对command/cwd/env并仅内存继承；
在线一致备份→私有副本Store建新表演练→原表原列摘要比较→
复查空闲→SIGTERM/锁释放/停服备份→同command/cwd/env启动PID425660。
`device_execution_delegation:true`，主5173保持运行并加载新入口。
8项GET-only主浏览器检查后，原行摘要再次相同。
仍1Project/1Task/6Run/1model/18Agent/17Call/6Artifact/157Event；
4设备表与2执行授权表均0行，Workflow草稿1/versions0/operations0。

私有`.runtime/backups/before-devices-20261125T121621Z/`目录700、DB/log600，不进Git。
公开summary没有正式正文/截图、原行hash、环境或凭证。旧PID脚本不可重跑，不热覆盖回退。
没有正式配对/消息/grant/模型请求，未改监听、TLS、隧道或远程网络；
`127.0.0.1`仍仅代表当前电脑，不能作为另一台手机的网络地址。
主4180/5173保留且HTTP200；临时4187/4188/5176/5177已确认停止。

D3b只关闭一次精确启动；通用暂停/取消/恢复/审查委托与控制租约仍待。
D4b跨设备草稿/更广未决candidate和D5b可信HTTPS/物理设备继续开放，
随后飞书入站→语雀只读→邮箱草稿→钉钉/微信。原119/9/110不变。
