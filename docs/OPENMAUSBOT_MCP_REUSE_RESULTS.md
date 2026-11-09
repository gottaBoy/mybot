# OpenMausBot 会话能力复用实测

日期：2026-11-08。状态：隔离研究通过部分门槛，**尚未接入 mybot 业务和界面**。

结论：Bot、会话、任务和工作控制已有可运行的上游实现，应优先受控复用，不必默认全部重写。权限上限、自动请求、模型用量与业务隔离仍需适配，不能直接把整个 OpenMausBot 当作已通过的底座。

## 1. 固定目标

- 源码身份：`milind-soni/OpenMausBot` @ `1bc4749aa8307d7d6998bf86de4ef6478460dd93`，仅用作源码/文档对照。
- 运行目标：`openmausbot@0.1.146`，npm sha512 与既有 P0 相同；运行前逐文件核对 tarball 与解压目录，没有修改上游产物。
- Node `24.22.1`、REA `6.8.0`、Linux Landlock ABI 7 + libseccomp。没有新安装依赖。
- 实际 MCP 源码是 `scripts/mcp-server.ts`，不是之前待查列表中的 `server/mcp-server.ts`；发布入口为 `dist-server/mcp-server.js`。
- 源码 commit 与 npm 发布包是两个独立固定对象，不推断构建身份完全相同。

clone/版本固定沿用 [实现手册](UPSTREAM_CLONE_AND_IMPLEMENTATION.md)；研究路径与新增观察见 [上游台账](OPEN_SOURCE_RESEARCH.md) §11.1/11.2。

## 2. 实际跑了哪一层

```text
受限 stdio MCP 原生入口：initialize / tools/list

隔离 MCP 处理器
    -> 研究 bridge（仅固定本机测试服务与白名单路由）
    -> 原始 OpenMausBot HTTP API / 持久数据
    -> customAcp driver
    -> 合成 stdio ACP peer（明确 MOCK ONLY，无真实模型和工具）
```

没有放宽 `guard.py` 的出站网络策略。MCP handler 通过已有 `handleToolCall`/`processMcpMessage` 接入研究 HTTP fetcher，**不是原生 MCP 网络传输端到端验收**。研究 bridge 只用于验证，不进入 `workbench/`，更不是新的产品运行时。

服务使用新临时目录、干净环境和合成配对会话；不读本机 CLI 账号、真实配置、兄弟项目或数据库。仅临时夹具元数据和研究证据发生写入；没有 Agent Shell/代码修改/App 操作。

## 3. 已有能力的运行证据

| 能力 | 本次观察 |
| --- | --- |
| MCP 发布入口 | stdio 初始化成功，列出 20 个工具；有 Bot/Task/Message/Wait/Interrupt |
| 访问身份 | 一次性配对、未配对写入拒绝、合成会话撤销后拒绝；测试 scope 为 `admin/client`，不是项目最小权限 |
| 长期 Bot | 创建、更新 profile、明确选择合成引擎、干净重启后保留 |
| Task/会话 | 创建独立任务会话、同会话连续两轮、消息读取、跨 Bot 任务绑定拒绝 |
| 发送去重 | 相同 `send_id` 返回同一消息回执，首条标记只有一次 mock prompt |
| 等待与中断 | 长任务等待超时不误报完成；interrupt 到达 ACP peer，结果不标为成功 |
| 失败/继续 | 失败保留失败，用户显式发起新一轮可以完成 |
| 持久化 | Bot、Task、Transcript 在干净重启后保留；已完成用户轮次未重放 |

注意：interrupt 后 MCP 的 `status` 可为 `settled`，但 `state` 为 `failed`。**`settled` 不是成功**，需结合 job、状态与原生事件映射，不能直接映射为 mybot `succeeded`。

运行中取消只测合成 stdio peer，不推断真实 Provider 已停止处理、停止计费或撤销副作用。

## 4. 自动请求发现与对照

第一轮未保存默认模型：

- 35 项研究检查通过。
- 合成 ACP 共记录 11 次 `session/prompt`，其中 4 次没有用户标记；包含 3 次连接检查和 1 次上下文恢复。
- 因而“用户任务未重放”不能扩写成“重启零请求”。

第二轮显式保存合成 `defaultModelSelection`，并延长夹具记忆整理等待：

- 38 项检查通过，增加启动、读取模型列表和干净重启不额外发 prompt 的三项检查。
- 无连接检查 prompt；全流程仍有 8 次合成 prompt，其中 1 次无用户标记的上下文恢复。用户发送 6 个不同工作标记，不能用消息数推断调用数。
- 模型记忆/辅助用途的另一条带旧标记 prompt 没有在本轮进一步追踪归属；不能把所有相同文字都认定为用户任务重放。

发布包静态路径 `server/tested-ai.js`：

- `backgroundAiChecks()` 在普通环境默认允许后台检查，支持 `OMB_AI_CHECKS=0` 关闭。
- 已保存模型选择使 `fixed()` 为真，后台 sweep 不运行；这一路径已在第二轮 mock 对照验证。
- `OMB_AI_CHECKS=0` 开关仅做源码核对，本轮未独立运行该开关。
- `server/engine-check.js` 通过 `generateText` 或 `generateMemoryText` 发实际检查提示，因此后续使用真实 Provider 时可能计费。

适配要求：明确保存模型、关闭/审查自动探测与辅助调用、在执行器边界统计所有请求与预算。保存默认模型不是无法绕过的强制门禁，不可替代宿主授权。

## 5. REA 与复现

| 版本 | 检查数 | Evidence | 完整报告 SHA-256 |
| --- | --- | --- | --- |
| [v1 默认行为](../tests/research/evidence/omb-mcp-v1/rea-summary.json) | 35 | `ev_d1b5bc9e9a6dfa5ee1cf5ac96aee5b21df7233659c84607dbe2634c75b8ac35c` | `acd065b30338c9a6d40467b691f9ee0ee2453c393264064146dc99dec844d4b2` |
| [v2 保存默认模型](../tests/research/evidence/omb-mcp-v2-fixed-default/rea-summary.json) | 38 | `ev_71d9d64e20f3121276dd4bfc704956e548138c75e194232c562f2c71aaae7c76` | `b3213bc7774e7bdf60088f1323514b78b4fbba637a436946240999236d62010d` |

两个输出目录各含 `omb-mcp.json`、`rea-omb-mcp.json`、`rea-summary.json`，不覆盖历史。旧 v1 对应旧探针 hash，当前代码增加了可选对照，复现必须记录当前 hash，不要求与历史字节相同。

```bash
.venv/bin/python -I tests/research/capture_omb_mcp.py \
  --package "$OMB_PACKAGE_DIR" \
  --archive "$OMB_ARCHIVE" \
  --node "$NODE_24_22_1" \
  --rea "$REA_6_8_0_SCRIPT" \
  --output /tmp/mybot-mcp-new-evidence \
  --fixed-default
```

不加 `--fixed-default` 可观察默认行为，不能因此接入真实模型或账号。参数必须指向既有固定公开产物，不能指向正式数据目录。报告内不存配对代码或 token。

先跑离线测试：

```bash
.venv/bin/python -m pytest -q tests/research/test_omb_mcp_probe.py
```

REA 报告未截断，捕获进程退出 0；测试服务端口和 bridge 子进程关闭。但 REA 保留进程抽样、未观测网络、可执行文件绑定和若干 `EACCES` 进程归属 unknown，不将其改成“全机清理认证”。

## 6. 能采用和不能采用的结论

**建议进入受控适配设计：** 复用 Bot/会话/工作控制与持久化；mybot 继续负责项目授权、发送确认、运行预算与审计，适配前明确上游 conversation/task 和本地 Task/Run 的权威关系。

**仍不能上线：**

- 默认 Full、Ask 保存 grant/委派提权等既有问题没有被本次测试修复；MCP 不开放 grant 工具，不代表执行器不会执行工具。
- 配对测试是一个高权限合成客户端，不是团队项目 ACL、手机真机/TLS 或最小权限 service 账号验收。
- 未测原生 MCP HTTP fetch、SSE/replay、MCP cancellation、实时审批答复、运行中崩溃恢复、多 Agent delegation 或真实连接器。
- 上游报告中 mock 用量的 `0`/`unavailable` 不能直接带入 mybot UI；无真实计量时仍保持未知。
- 没有完成生产适配器、生产权限上限或 UI 接线，不生成“已接入 OpenMausBot”状态。

下一项应交付最小受控适配：先读取已授权 Bot/会话并映射状态，再在显式确认、全部调用预算与执行器限制成立后开放发送。原始权限风险不通过时，停在只读查询或继续隔离 mock，不能用按钮隐藏替代后端策略。

## 7. 本轮验证

- 完整 Python 回归：142 项通过，保留既有 Starlette/httpx 弃用提醒；其中新增探针离线测试 27 项。
- Node Runtime Lab 既有夹具：24 项通过，不与上游运行检查混算。
- 探针语法、`git diff --check`、7 份入口/报告文档的本地链接通过。
- 两份运行报告的 SHA-256 与 REA 摘要一致；归档文本未检出 `omb_sess_...` token 值。
- 没有修改 `workbench/`、`web/`、静态设计或正式运行数据；没有真实 Provider/账号请求和新 UI 预览。
