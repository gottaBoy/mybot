# OpenMausBot 读取权限与近期缓存合同

日期：2026-11-11。B05 离线研究与 B04 修正记录；不是原生账号验收。

## 来源

- 仓库：用户指定 `gottaBoy/OpenMausBot`，固定提交 `1bc4749aa8307d7d6998bf86de4ef6478460dd93`。
- 本地对象库：`/tmp/mybot-cross-device.FXoGm6/OpenMausBot`。工作树为空，但固定 Git 对象可读，
  使用 `git show <commit>:<path>`，没有 checkout、安装或执行上游。
- 已读路径：`scripts/mcp-server.ts`、`scripts/mcp-message-projection.ts`、
  `server/request-auth.ts`、`server/sessions.ts`、`server/routes/threads.ts`、
  `server/host/sse-replay.ts`、`server/index.ts` 的 SSE cursor/replay 段、`shared/wire.ts`。
- 本轮没有 REA capture、上游启动、配对、token 获取或真实模型调用。源码观察与本地
  MockTransport 测试分开；固定 npm 包的历史 35/38 项证据不能替代 fork 源码构建验收。

## 源码观察

| 机制 | 固定源码观察 | mybot 的处理 |
| --- | --- | --- |
| Loopback | `owner` 与 `service` 信任不同；SERVICE_ALLOW 除 GET 外含任务/消息等变更路径 | 回环可达不等于只读最小权限，不自动利用无认证访问 |
| 配对身份 | sessions schema 的 scope 是 `admin`/`client`；client allowlist 不只是读取 | 不导入现有会话 token，不把 client 当只读 scope |
| 撤销 | 无效/过期的已提交凭证不能降为 loopback owner | 不做匿名回退；本地撤销在缓存读取和同步写回事务中再次检查 |
| Bot 列表 | MCP 的 fleet 使用 `/api/bots?messages=0`，route 默认能附带消息 | 离线 adapter 显式 `messages=0`，只映射活动 thread 元数据 |
| 消息页 | thread route 支持 `limit`、`before`、`around`；未知 before 返回 404 | 当前只读取近期 30 条的一个窗口；未实现真实历史翻页，不伪造 cursor |
| 消息结构 | WireMessage 使用 `text`、`role=user/bot`、`at` 毫秒、`kind` | 只缓存 `kind=text` 的允许字段；时间转 UTC，卡片/secret/signin/图片等不缓存 |
| hasMore | 返回的是 `hasMore`，不是 next_cursor | 持久化并在缓存视图显示“较早历史尚未同步”，不能称完整 transcript |
| SSE | `STREAM_ID` 每次进程启动重新生成；游标是 stream:seq | 不将 cursor 当跨重启持久日志，不复用在 mybot 的事件序号中 |
| Replay | 内存 buffer 默认 500 帧/8M 字符；缺口或受众变化 hello.resumed=false | SSE 尚未接入；未来必须显式快照重建，不能靠重连掩盖缺口 |

上游读取可能存在内部元数据刷新（例如 Bot 列表中的 usage refresh），因此不能仅凭
GET 方法或 MCP 的 readOnlyHint 声称上游绝对无副作用/无内部调用。

## 本轮落地

1. 默认应用保留“保存连接、查看状态、显式健康检查”；**生产 transcript 同步默认拒绝**，
   返回 `backend_read_scope_unverified`。仅测试显式注入的 Adapter 可读取合成数据。
2. 读取统一重新验证 Store 中的连接 origin，不信任历史任意 URL/settings。
3. Adapter 收到当前连接参数，不依赖“先列会话”的进程内注册表，重启后不丢连接归属。
4. 原生 GET 统一拒绝重定向，10 秒绝对时限；health 64 KiB，列表/消息 1 MiB 上限。
5. 缓存消息按近期窗口更新，不宣称全历史同步；重复 ID 不新建重复记录，窗口顺序按时间展示。
6. Bootstrap、会话列表和消息缓存都检查撤销；在途请求完成时，事务内拒绝向已撤销连接写入。
7. UI 显示来源、角色、同步时间、近期文本条数和历史缺口；刷新/查看缓存不产生同步请求。
   上游正文仅作为转义文本显示，不执行 HTML/脚本；没有消息发送入口。

## 后续门槛

- 先选择可强制限制读取范围的宿主/代理合同；不能直接使用 owner/client/admin 当最小权限身份。
- 专用环境下重新验证 fork 产物、账号 scope、撤销、读路径的内部调用及计量。
- 原生历史分页与 SSE/replay 分别实现；重启、受众变化、缓存缺口必须独立测试。
- 这些门槛通过并得到新的明确授权后，才能为用户后端开放 transcript 同步。
