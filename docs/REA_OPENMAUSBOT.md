# OpenMausBot REA 工具分解

固定源码：`milind-soni/OpenMausBot`，commit `1bc4749aa8307d7d6998bf86de4ef6478460dd93`。固定 npm 包：`openmausbot@0.1.146`。

2026-11-08 用户指定 `gottaBoy/OpenMausBot`。GitHub 元数据确认它是上述仓库的 fork；本轮 fork HEAD 恰为同一 `1bc4749aa8307d7d6998bf86de4ef6478460dd93`。可沿用该固定提交的源码观察；上游当前 HEAD 已为 `86fd0ee19c0deae6c4f7304a2e5bfe047b9065b7`，不自动升级或混用。后续优先以用户指定 fork 固定提交作研究/构建入口；这不代表 fork 已采用为底座。npm 实测仍是独立产物，不宣称已运行该 fork 的源码构建。

2026-11-07：已完成受限 P0 启动/元数据实测，并通过 REA `capture-process` 留存；见 [P0 结果](OPENMAUSBOT_P0_RESULTS.md)。[权限 v4](OPENMAUSBOT_PERMISSION_RESEARCH.md) 已验证 Ask 模板可被嵌套 settings 覆盖或跳过，不是强制 ceiling。启动可行，不等于 P1 Agent 任务通过。

## 1. 研究目标

确认它能否作为 mybot 的**可替换执行后端**，而不是只看聊天页面：

```text
外部入口 -> Bot/thread -> assignment/runtime -> engine/tool
         -> approval -> event/SSE -> restart/cancel
         -> result/receipt -> mybot Run/Agent/Call/Event
```

## 2. 已完成的 REA 静态阶段

发布包解压到临时目录后：

```bash
npx -y rea-agents@6.8.0 analyze-javascript-application /tmp/mybot-rea/omb \
  --artifact-format directory --detail summary \
  --evidence_output /tmp/mybot-rea/evidence/openmausbot-policy.json \
  --source-path package.json \
  --source-path dist-server/shared/approval-mode.js \
  --source-path dist-server/server/bot-api-fence.js \
  --source-path dist-server/server/sse-fanout.js \
  --source-path dist-server/server/host/sse-replay.js \
  --source-path dist-server/server/auto-approve.js \
  --max-heap-mb 512 --analysis-timeout-ms 60000 --json
```

已保存摘要 Evidence：`ev_7b896bfbce3c598ae3893e90e8db25f973c75d89b59e66274aaffa8cc142ef72`。5 个 JS 文件被解析，报告 36 个 findings；其余发布文件仍为 unknown。

REA 结果只支持静态定位，不证明请求可达、权限覆盖所有路径、SSE 断线恢复或真实成本。

## 3. 后续静态分解

### A. 权限与审批

源码/包路径：

```text
shared/approval-mode.ts
docs/approval-levels.md
server/auto-approve.ts
server/host/delegated-level.ts
```

REA 操作：

1. 分析 `shared/approval-mode.js`。
2. `trace-application-feature` 追踪 `DEFAULT_APPROVAL_MODE`、`approvalModeFor`、`supportsApprovalMode`。
3. 对静态结果生成 reconstruction obligation ledger。

mybot 输出：`Approval`、`CapabilityGrant`、`levelSource`、Ask-first 默认；不能复制 Full access 默认。

### B. Bot API 与外部 runtime

路径：

```text
server/bot-api.js
server/bot-api-fence.js
server/drivers/agents-proxy.ts
docs/bot-api.md
docs/self-hosting.md
```

REA 操作：

1. 静态分析 Bot API fence 和 agents proxy。
2. `trace-application-feature` 以 webhook route、`needs_approval`、`thread` 为 seed。
3. P0 后用 `capture_browser_scenario` 验证浏览器端只读查询；不发真实 webhook。

mybot 输出：不可信 webhook/Bot API 入口只能创建受限草稿/查询，不能继承本地审批。这个入口结论不外推到已配对的 MCP/管理客户端；后者需单独校验身份与执行范围。

### C. SSE 与事件恢复

路径：

```text
server/sse-fanout.ts
server/host/sse-replay.ts
server/runtime/
docs/runtime-contract.md
```

REA 操作：

1. 静态分析 fanout/replay。
2. 追踪 event cursor、replay、disconnect 和 subscriber cleanup。
3. P0 运行时用浏览器场景断开/重连，保存 capture Evidence。

mybot 输出：SSE/增量事件游标、快照水位、重复事件去重；不把聊天文本当作事件事实源。

### D. 连接应用与触发

路径：

```text
server/composio*.ts
server/app-events.ts
docs/composio.md
```

REA 操作：

1. 静态追踪 app event ingress、cursor ack、untrusted event block。
2. 若取得发布 Web bundle，再用 `analyze-web-bundle` 只分析连接设置页面。
3. 不登录、不发送 Gmail/Slack 事件。

mybot 输出：`Connection`、`Inbox`、`Outbox`、`OperationReceipt`；外部事件必须按不可信资料处理。

### E. 已有能力复用与 MCP 团队控制

2026-11-07 用户追问后补充。同一固定源码的 `README.md`、`docs/mcp-server.md` 已复核；这部分是文档观察，不是新 REA/运行证据。

- 上游已有长期 Bot、会话/任务和手机共享工作区；不要因 mybot 未接入就默认从头重建。
- Bot API 是限制较强的外部文本入口，不是唯一接入协议。
- MCP 文档公开 `create_bot`、`update_bot_profile`、`create_task`、`get_bot_messages`、`send_bot_message`、`wait_for_conversation`、`interrupt_conversation` 等；发送有 `send_id` 去重，等待区分 job/state。
- MCP 不开放审批授权、记忆 grant、凭证修改或电脑生命周期。它不是通用只读沙箱，配对获得控制身份也不等于符合 mybot 的能力上限。
- 下一步先读 `scripts/mcp-server.ts` 及其调用路由，核对 npm 产物是否实际包含对应入口、版本是否匹配、认证及完整权限链。不能从 git 文档推断已测试 npm 包运行支持所有接口。
- 隔离 P1 用专用 mock 比较 Bot/会话读取、一次去重发送、等待、取消和重启；不得直接使用现有账号或真实模型。
- mybot 输出应是已有能力的受控适配与稳定 ID 映射；若通过再定义各类数据权威方，不双写竞争会话数据库。接口不足才局部补齐。

### F. 隔离 MCP/会话复用探针（2026-11-08）

结果、对照和复现集中见 [OPENMAUSBOT_MCP_REUSE_RESULTS.md](OPENMAUSBOT_MCP_REUSE_RESULTS.md)。下文 v1 默认行为保留；v2 保存默认模型已另通过 38 项，Evidence `ev_71d9d64e20f3121276dd4bfc704956e548138c75e194232c562f2c71aaae7c76`。v2 启动/实例读取/干净重启无额外 prompt，不代表任务期间没有内部调用。

已针对固定 `openmausbot@0.1.146` npm 包做一次受限 P1 研究探针；不是业务接入。脚本和证据：

- 探针：`tests/research/verify_omb_mcp.py`、`omb_mcp_bridge.mjs`、`mock_acp.py`。
- 运行方式：REA `6.8.0` `capture-process`，Evidence ID `ev_d1b5bc9e9a6dfa5ee1cf5ac96aee5b21df7233659c84607dbe2634c75b8ac35c`。
- 证据目录：[omb-mcp-v1](../tests/research/evidence/omb-mcp-v1/)；固定发布包报告 SHA-256 `acd065b30338c9a6d40467b691f9ee0ee2453c393264064146dc99dec844d4b2`。
- 35 项检查通过；归档/重放无覆盖；Linux Landlock + libseccomp 仍拒绝出站网络，模型/工具执行数均为 0。

实测确认：

1. 发布包内 `dist-server/mcp-server.js` 可通过 stdio 初始化并列出工作控制工具；包括 `create_bot`、`create_task`、`send_bot_message`、`wait_for_conversation`、`interrupt_conversation` 和会话读取。
2. 配对代码是一次性凭证；未配对 MCP 写操作被拒绝。配对会话的 `admin/client` scope 可查询和控制，但 MCP 工具列表没有审批 grant、凭证或电脑生命周期工具。
3. 配置自定义 ACP 夹具后，真实上游服务完成 Bot 创建、Ask 模板、profile 更新、Task 创建、同一会话两次消息、`send_id` 重复发送去重、跨 Bot Task 绑定拒绝、等待超时、interrupt、失败与新一轮继续。
4. 干净重启后 Bot profile、Task、Transcript 保留；已完成的用户标记消息没有重复发送。撤销会话后，MCP 查询被拒绝，没有回落到 service loopback。

重要限制：

- MCP 的 HTTP handler 通过受控 bridge 注入，未验证原生 MCP client 的网络调用；stdio `initialize/tools/list` 做了原生包入口检查。
- 没有验证 SSE/replay、MCP cancellation、运行中崩溃恢复、多 Agent delegation、实时审批答复、手机原生配对或真实连接器。
- ACP 夹具记录到 4 个无用户标记的 `session/prompt`：3 次连接检查和 1 次显式失败后的上下文恢复；不能将上下文恢复归因于干净重启。它们均为本地 mock，不是外部模型请求；真实 Provider 接入时不能假设后台探测或内部恢复绝对零请求，必须统计完整预算。
- 该探针证明“可复用能力链路存在且边界可测试”，不证明 OpenMausBot 适合作为 mybot 的最终底座，也不改变默认 Full/Ask grant 的权限结论。

## 4. 运行阶段

P0 的安全预检通过后，按具体范围选择工具：

- 本轮实际用 `capture-process` 包装 Python 探针；由探针启动受限的 headless server，记录三次启动、API 元数据及配置重启检查。没有 Electron 桌面/手机证据。
- `capture-process` 自身不是沙箱，必须保留 `tests/research/guard.py` 等目标运行隔离，不得继承真实用户环境直接运行上游。
- 后续 Electron/浏览器交互仍待对应环境与范围，不因 P0 完成自动扩大权限。

- `list_electron_targets` / `inspect_electron_fuses`：识别 Electron 目标和打包边界。
- `capture_electron_scenario`：临时 profile 中做启动、创建空 bot、查询、断开、重连。
- `list_browser_targets` + `inspect_web_page`：只读观察已授权页面。
- `observe_javascript_runtime`：只观察已授权 Node/Electron Inspector 目标。

禁止：真实 API key、真实 OAuth、真实 IM/邮箱、真实模型付费调用、未知安装器、未经授权的 Shell/Computer。

## 5. 淘汰与接入条件

- T1-T8 全部通过且许可边界明确：进入 `ExecutionAdapter` 设计。
- 任务能跑但权限、事件或私有化不足：作为旁车。
- 必须官方身份/云服务、默认 Full 无法收紧或无法对齐 Run/Call/Event：淘汰为参考资料。

## 6. mybot 当前 Adapter 进度（2026-11-09）

已在 mybot 内建立稳定的 `BackendConnection` / `ConversationRef` / `MessageRef`
合同和 `OpenMausBotReadOnlyAdapter` 隔离适配器。Adapter 固定研究 commit：

```text
gottaBoy/OpenMausBot
1bc4749aa8307d7d6998bf86de4ef6478460dd93
```

当前 Adapter 只支持合同级只读 GET 映射，端点路径通过配置提供，不宣称这些路径就是
OpenMausBot 固定 fork 的真实 API。已验证：

- 会话和消息列表；
- `cursor` / `next_cursor`、`nextCursor`；
- 重复外部 ID 去重；
- 403、404、5xx、schema invalid、revoked 和 unreachable 错误映射；
- 不存在发送、更新、任务启动或模型调用方法。

随后根据固定发布包 `dist-server/scripts/mcp-server.js` 核对到一组实际只读路径：

```text
GET /api/bots
GET /api/threads/{threadId}/messages?limit=N
```

mybot 新增 `OpenMausBotNativeReadAdapter` 只读映射夹具，将 Bot 的 `threadId` 转为
`ConversationRef.external_id`，消息映射为 `MessageRef`。这仍是 MockTransport 合同，
不是上游服务端点连通证据；消息端点当前是 bounded recent messages，未宣称 cursor
分页或 SSE replay。

Adapter 另提供只读 `check_health()`，映射 `GET /api/health`，仅接受返回
`app=openmausbot` 的服务；401/403、错误服务身份、revoked/unconfigured 分别映射为
稳定 BackendError。它不修改连接状态，也不处理配对码、token 或发送。

验证使用 `httpx.MockTransport`，没有真实账号、HTTP 服务、MCP client 或上游网络。
下一步必须先核对固定 fork 的原生协议/端点，再把 Adapter 接入配置服务；不能把合同
夹具结果写成 OpenMausBot 已连接。
