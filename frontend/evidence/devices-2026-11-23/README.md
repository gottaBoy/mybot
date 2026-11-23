# 任务范围设备接续初版

日期：2026-11-23，Asia/Singapore。基线`5ca3cc3`已push/工作树干净。
合同：[ADR-0024](../../../docs/decisions/ADR-0024-scoped-device-continuation.md)。

## 可见交付

Task页新增“在其他设备继续”，进入设备接续时保留精确Task ID。
主工作台确认Task和范围后创建十分钟一次性配对码；另一浏览器在`#pair`输入码与设备名，
获得这个Task的查看和补充要求保存权限。它能看到真实最近Run/成果，主工作台能看到同一条消息。
主工作台可撤销授权；撤销后的新读写被拒绝，已保存消息保留。

- [主工作台撤销记录](devices/owner-revoked-device.png)
- [手机配对任务](devices/paired-zira-dark-390.png)
- [中文手机主工作台](devices/owner-neutral-dark-390.png)
- [配对端浅色桌面](devices/paired-neutral-light-1440.png)

截图来自隔离fixture，配对码关闭后才截图，不保存原码、token或正式任务正文。
这是任务范围的浏览器身份，不是手机App控制、执行节点迁移或团队账号体系。
配对端不能启动模型、预览文件、修改配置或控制Run；执行仍需主工作台明确确认。
两个浏览器上下文验证不是物理手机或远程网络认证。

## 实现与分工

backend Agent：4新表、pair/claim/revoke/CAS/操作回执、cookie身份边界、任务投影/50事件游标、
同事务授权检查与消息保存，46项新后端测试。
client Agent：strict DTO、15s超时/取消后迟到拒绝、精确回执、独立PairPortal、67项client/portal测试。
UI Agent：设备目录/Task确认/配对码内存保管/撤销/unknown恢复/草稿保护，27项页面测试。
root：路由/导航/Task入口、原fixture schema、本机受控启用、双浏览器/综合/正式只读验收与记录。

32随机字节的配对/设备secret只在浏览器内存或HttpOnly cookie传递，DB只存SHA256。
配对码不进入URL/偏好/事件/回执；原请求标识可进入受管URL用于reload核对。
配对身份固定`task_read,message_save`，cookie存在即不得回退到loopback-owner。
设备message POST和receipt GET都绑定`X-Workbench-Device-Id`，同事务核对当前cookie身份：
另一标签页换cookie不能把旧Task草稿写入新Task。
未知创建/配对/保存/撤销只核对原回执，不自动重发；无原文/凭据的reload404不编造新请求。
网络失败保留明确stale，需显式Refresh恢复GET；撤销/过期清私有内容。

本机无令牌模式依然信任localhost：人工清除设备cookie后，原local-owner规则仍然适用。
它不是共享电脑的多用户ACL。远程部署仍需显式配置令牌、可信HTTPS/网络入口；
本批没有改监听地址、隧道、TLS或外网访问。不能把`127.0.0.1`链接当手机网络地址。

## 验证

| 证据 | 最终结果 | 范围 |
| --- | --- | --- |
| `python-tests.txt` | 1178项通过 | 46新增设备合同/并发/过期/重启/隔离；既有1项httpx提醒 |
| `frontend-tests.txt` | 2052项 / 68文件通过 | 94新增client/portal/管理交互及既有回归 |
| `build.txt` | typecheck/生产build通过 | 最终产品代码 |
| `devices/verification.json` | 13项 / 15PNG | 两独立浏览器、真实HTTP/SQLite、一次性配对、丢响应、断线、撤销、12布局 |
| `workbench/verification.json` | 58项 / 61PNG | 既有任务/模型/预算/查询/审查/恢复/主题完整回归 |
| `local-activation-summary.json` | 6项GET-only | 正式Task入口/空设备目录/未配对页面，桌面英文与中文390px |

共77项最终浏览器检查、76张fixture PNG。三style Neutral/Zira/Y2K双mode，
主工作台/配对端两surface共12组，document overflow全部0，最终pageerror/外部HTTP均0。
人工检查手机长设备名、任务标题、真实状态/成果与消息，未发现逐字挤压或重叠。
Safari、物理手机/IME、真实Provider与网络接入仍未认证。

专项fixture`/tmp/mybot-astryx-workbench.kZEYWU`从空业务库开始：
2Task，仅授权1Task；1邀请/1设备后撤销，3条消息，1次owner显式启动FakeProvider Run。
配对端Bootstrap/其他Task/模型/Run/Workflow/管理API均403。
故意在创建邀请、claim、保存与revoke真实写入后丢响应，均原ID/GET核对，未重复写入。
cookie为HttpOnly/SameSiteStrict，reload可用；断线期间owner写入后，显式GET刷新补齐，
不自动POST；撤销后scopeGET/POST401、ownerAPI仍403，旧消息不删除。
综合使用独立fresh fixture`/tmp/mybot-astryx-workbench.AFZ9gC`，FakeProvider/MockTransport。
没有真实Provider或费用。

复现需专用空fixture和指向4187的5176生产preview，禁止主4180/5173：

```bash
# frontend/
MYBOT_BROWSER_FIXTURE=1 DEVICE_EVIDENCE_DIR=/tmp/mybot-devices-new \
  node scripts/verify-devices.mjs
# 综合使用另一空fixture及其frontend URL
MYBOT_BROWSER_FIXTURE=1 PLAYWRIGHT_MODULE=/tmp/mybot-browser-tools/node_modules/playwright/index.mjs \
  BROWSER_EXECUTABLE=/usr/bin/google-chrome node scripts/verify-workbench.mjs
pnpm test
pnpm build
```

构建保留大chunk警告。app JS195.89kB/gzip62.68、CSS39.15/7.39；
lazy DevicesPage JS21.82/7.80、CSS3.74/0.89；PairPortal JS20.30/7.14、CSS2.10/0.65。
这是产物大小，不是整体transfer/性能或完整Rust Node落地结论。无依赖升级。

## 失败与修复边界

- `failures/required-label/`：Astryx required标记属于accessible name，脚本exact字段名未命中；
  改为语义标签前缀定位，未改产品required/accessibility。
- `failures/route-inflight/`：脚本在sending时看到已存在但禁用的核对按钮，提前unroute，
  造成route already handled。改为等待真实unknown反馈后再移除拦截；保留错误文本，
  该进程未写出JSON，不伪造完整报告。
- 全量单测最初两项旧command-count预期未含新设备导航；更新合法目的地为12项，最终2052通过。
- 源码复核收紧cross-tab cookie更换的写入意图绑定、初始session读失败不当未配对、
  invalid scope DTO清私有而非成功样式/旧内容、manual refresh不被自身busy取消。
- 没有用关闭权限检查或自动重试来消除上述失败，没有在失败截图中泄露配对凭据。

## 本机启用与剩余任务

原4180 PID3459239空闲：无active/queued Run/Call/modeltest/未决恢复/preparedturn/子执行器。
核对命令/cwd/环境在内存内继承，在线一致备份→私有副本Store迁移原表原列摘要比对→
再次空闲检查→SIGTERM/锁释放/停服备份，同命令/cwd启动新PID1104938。
原1Project/1Task/6Run/1model/18Agent/17Call/6Artifact/157Event及Workflow等原行不变，
4个设备表均0行，未在正式环境创建配对、发消息或调用模型。
主5173桌面/中文手机6项只读通过，浏览器后原行再比对相同。
私有备份`.runtime/backups/before-devices-20261123T143812Z/`目录700、DB/log600，不进Git；
不导出正式截图/正文/凭证，身份绑定脚本不能重复对旧PID运行，不热覆盖回退。

主4180/5173保持运行；临时4187/4188/5176/5177停止。
D1/D2与D3权限边界/D4有界读取/D5双浏览器初版交付；D3的委托执行控制、D4更广工作位置恢复、
D5远程HTTPS与真机验收仍待。无独占控制租约、执行迁移或全量历史同步。
原119/9/110不变，不把本批当056–068等全部完成。后续连接器仍按飞书/语雀/邮箱等顺序。
