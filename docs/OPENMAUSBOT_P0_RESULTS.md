# OpenMausBot P0 实测

日期：2026-11-07。目标：固定 npm `openmausbot@0.1.146`。范围：隔离启动、接口权限和配置持久化，不包含模型/工具任务。

**结论：启动可行；尚未通过作为 mybot 执行底座的验收。** 空数据目录会创建一个默认 `Full access` Bot。把匿名本机请求设为 `service` 不会将 Bot 执行权限改成 Ask。Ask 模板是可覆盖的默认：正确的 `settings.approvalMode:"full"` 和 `useDefaults:false` 均会返回 Full。仅靠该模板不能作为 mybot 的全局安全上限，Ask 本身也不是只读保证。

## 1. 可复核证据

- [探针报告](../tests/research/evidence/omb-p0.json)：基础启动检查，`ask_first_default=false`；另有 7 项隔离探针全部满足。
- [权限扩展报告 v4](../tests/research/evidence/permissions-v4/omb-p0.json)：对比顶层字段、实际 `settings.approvalMode` 和跳过模板；明确模板可以被覆盖。早期 v3 的“拦住 Full”结论因字段结构错误已撤回，原始证据保留。
- [完整 REA Evidence](../tests/research/evidence/rea-omb-p0.json)：`rea.process-capture`，Evidence ID `ev_6e1d70a83bab7db53f9f18705708942600eec16d8dc3c45693f99c49271b9795`。
- [REA 摘要](../tests/research/evidence/rea-summary.json)：调用环境、场景、测试脚本 SHA-256、退出和清理，以及 unknowns。
- REA 为 `6.8.0`，Node 为 `24.22.1`，Linux/aarch64。已检查 npm 完整性并逐个核对 1666 个解包文件与该 tarball 一致。
- 报告 SHA-256：`b1fb3bb70ead38fb675fd421d3d3bed4a009000e5ac992e6323b6c3e9b9f68e2`；REA 的最终文件快照另提供完整报告 hash，可与当前文件比对。

证据等级是**本地受控 P0/E3**，不是整个 Agent 产品 E3。REA 捕获探针终端、退出和报告文件；HTTP 请求由 Python 探针发起，不能把报告中的每个判断都说成 REA 独立观察到了请求与内核调用。

## 2. 实际过程与发现

| 步骤 | 实际结果 | 没有证明什么 |
| --- | --- | --- |
| CLI `--help` | 无账号即可返回帮助，退出 0 | 不代表所有 CLI 命令可用 |
| 首次 service 启动 | 健康接口、静态 HTML、`edition=oss` 可用 | 未做浏览器渲染、手机或真实模型测试 |
| 匿名 service 管理请求 | `/api/config` 与修改 Bot 请求为 403 | 不是所有 service 路由都拒绝；`/api/bots` 列表仍可读 |
| 模拟未配对浏览器头 | 访问 Bot 列表被拒绝 | 是 HTTP 头探针，不是真机或完整配对 |
| 首次 Bot 状态 | 自动创建 1 个 Bot，`approvalMode=full`，模型未选择 | `service` 信任不等于只读 Agent |
| Ask 模板 | Owner 保存 `newBotDefaults.profile.approvalMode=ask` 后普通创建为 Ask | 只是默认；不是工具级只读 |
| 正确字段的显式 Full | 同一模板下 `settings.approvalMode=full` 创建为 Full | 模板不是强制上限 |
| 跳过模板 | `useDefaults=false` 创建为 Full | 管理调用方可以不采用模板 |
| 临时 owner 阶段 | 仅把该测试 Bot/线程降为 Ask | 没有提高任何执行权限或发送提示 |
| 重启回 service | Bot 身份与 Ask 配置保留 | 不是运行中任务、未决调用或 SSE 的恢复 |
| 退出 | 三次退出码均为 0，六个监听端口关闭 | 不是跨 OS 全进程树可靠性的证明 |

启动实测约 620-772 ms，只是当前空环境的健康探针时间，不是产品性能对比。

不修改上游源码，不安装其可选原生依赖，不主动调用安装/更新命令，不登录引擎，不连接官方账号、IM、文档、邮箱和模型；没有发送任何模型提示。启动内部后台行为未做全面审计，出站受 guard 拒绝，不能把本轮启动结果说成无隔离时的完整离线认证。

## 3. 隔离方式及限制

当前环境拒绝 Bubblewrap 的网络 namespace/UID map。没有降级为只修改 `HOME` 后直接运行，而是新增了研究专用 [guard.py](../tests/research/guard.py)：

- Landlock ABI 6+；当前 ABI 7。仅允许共享系统运行库、指定 Node/包的只读访问，以及全新研究目录的读写。
- 清空继承环境，只保留必要路径、临时 HOME/XDG、数据目录与指定端口；关闭额外继承文件描述符。
- Landlock 限制 TCP bind/connect；seccomp 拒绝出站 `connect`、数据报发送和相关跨进程/namespace 操作。
- 先用合成文件和 `192.0.2.1` 测试读写边界、环境清理、TCP/UDP 拒绝及监听限额；失败即停止，不执行上游。
- 使用独立临时数据目录；不读取原用户凭证、兄弟 `.env`、数据库或 `.runtime/`。

**不是通用生产沙箱**：没有独立网络 namespace；端口规则本身不限制 bind 地址，本轮已读的上游入口绑定 `127.0.0.1`。没有完整系统调用审计、资源配额、内核漏洞防护或全面 metadata 隐私保证。可用性依赖 Linux Landlock/libseccomp，不支持时应停测，不绕过。

该 guard 禁止所有出站连接，因此不能直接拿来做下一步模型 mock 调用；P1 必须先设计只允许专用本地测试端点的独立策略，不能放开通用网络。

## 4. REA 清理与 Unknown

REA 报告主进程组 `verified`、自身临时根 `removed`、输出未截断；同时保留两个无法读取 `/proc/<pid>/environ` 的进程归属 unknown，未操作这些进程。

捕获结束后用 `ps` 仅检查对应 PID，不读取环境，两个 PID 已不存在。探针自己等待三次服务退出并检查端口关闭。不能据此把原 REA unknown 改写成“完整进程树均认证通过”。

未测试：真实模型/工具、工具审批、Bot API 认证任务、手机配对/撤销、SSE 重放、运行中任务重启、代码/邮件等外部副作用、企业许可适用性和生产安全。

## 5. 复现

先按 [Clone/发布包手册](UPSTREAM_CLONE_AND_IMPLEMENTATION.md) 获取固定包，在工作区外解压，准备满足要求的 Node 和 REA CLI。下面的环境变量是路径，不是模型凭证：

```bash
python3 -I tests/research/capture_omb_p0.py \
  --package "$OMB_PACKAGE_DIR" \
  --archive "$OMB_ARCHIVE" \
  --node "$NODE_24_22_1" \
  --rea "$REA_6_8_0_SCRIPT" \
  --output /tmp/mybot-p0-evidence-new
```

只跑探针、不通过 REA：

```bash
python3 -I tests/research/verify_omb_p0.py \
  --package "$OMB_PACKAGE_DIR" \
  --archive "$OMB_ARCHIVE" \
  --node "$NODE_24_22_1" \
  --report /tmp/mybot-p0-evidence-new/omb-p0.json
```

脚本退出 0 表示探针完成且无非预期失败，**不是底座验收通过**；必须读取 `p0_verdict`、`ask_first_default` 和 `not_tested`。每次新建临时数据目录，输出目录不要复用既有真实证据。

## 6. 决策与下一步

当前分类：**保留为执行后端候选，暂不接入 mybot**。

权限补测已确认模板不能强制收紧；见 [权限研究](OPENMAUSBOT_PERMISSION_RESEARCH.md)。下一轮需设计独立宿主 capability ceiling 与执行器隔离，再验证每次动作是否受控，不能继续把 UI/创建模板或逐个 PATCH 当安全边界。

只有此项、任务事件映射及 P1 mock 闭环通过，才考虑 adapter。mybot 现有控制中心、原创 UI 和运行数据库不变。

## 7. 本轮回归

- Python 研究脚本语法检查通过。
- 既有后端 `pytest -q`：38 项通过，保留原 Starlette/httpx 弃用提醒。
- `git diff --check` 通过。
- REA Evidence 的 `files_after` 中 `omb-p0.json` 的 SHA-256 与仓库报告一致。
- 权限扩展的最新 REA Evidence 位于 `tests/research/evidence/permissions-v4/`；v1-v3 报告保留用于解释探针修订。
