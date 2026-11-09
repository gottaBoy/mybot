# Codex 可靠性：故障复盘与下一步门槛

日期：2026-11-08。当前生产路径仍为 `codex exec`；本轮没有发起模型请求或重跑历史 Run。

## 1. 已确认的故障

Run `8bd1d79b7cc94f5d8aa518819a362320`：

- Planning 成功，耗时 16006 ms。
- 第一个 Research 在 90014 ms 后超时；结果、用量未知。
- 第二个 Research 在单通道信号量释放后启动，随即被 TaskGroup 取消，记录耗时 1 ms。
- 未执行 Synthesis，无成果；本轮保留这些事实。
- 上下文快照没有显式文件，只有目标、验收和项目备注。目录和项目名不代表已读取项目源码。

能确认宿主 90 秒超时和编排竞态，不能据此认定认证冲突、冷启动、供应商限流或推理速度是根因。此前这些解释只是假设。

## 2. 本轮实现

1. 单通道真正逐项 await，失败后未开始的研究 Agent 保持 pending。
2. 恢复时保留已分配计划；完成的研究不再占用新调用预算，不因剩余预算裁掉既有研究成果。
3. CLI 总时限覆盖启动、stdin、stdout、退出等待；超时不自动续期或重试。
4. JSONL 按行解析，总量上界 1 MiB；只保留模型正文、用量和固定协议标签，不累计原始事件或推理正文。
5. 所有退出路径回收本地进程组、等待后台读取任务，并删除临时输出文件。
6. 保存安全诊断：超时阈值、事件数、固定类型、最后事件距今毫秒、出现过正文与否、退出码、回收状态。部分正文不等于完成；进程回收不代表远端退款或停止计费。
7. `turn.completed.usage` 提供合法非负整数时保存逐调用 tokens；没有用量仍为未知，金额仍未知。
8. Run 和显式连接测试共享 CLI 锁，避免测试期间启动第二个 Codex 进程。

没有放宽工具授权、增加自动重试或宣称真实故障率已经下降。

## 3. App Server 研究与撤回

本轮尝试过一个可选会话草稿，但最终复核未达到门槛，已从生产路由撤回，`WORKBENCH_CODEX_TRANSPORT` 不是可用配置。原先简化 fake server 的通过结果不作为适配完成证据。

一手本地来源：

- 当前记录的 `codex-cli 0.154.0` 及其 `app-server --help`。
- 本机 CLI 生成的 `/tmp/codex-app-schema/v2/TurnCompletedNotification.json`、`ItemCompletedNotification.json`、`TurnStartParams.json`、`ThreadStartParams.json`。
- 已有 `tests/research/codex_text_smoke.py`：一次获授权的文本验证独立于生产适配器，不重复消费旧授权。

复核发现：

- `turn/completed` 的 ID 位于 `params.turn.id`，不是 `params.turnId`。
- 通知可能先于 RPC 响应到达，必须缓冲、关联，不能在等待响应时丢掉。
- `read-only` 和 `approvalPolicy=never` 不等于关闭 Shell/MCP/插件；必须独立验证工具 ceiling。
- 一个 thread 复用多个角色会隐式共享历史，与“只发送可见快照”的现有承诺冲突。
- 必须有绝对时限，持续事件不能无限推迟超时。

以上是源码协议观察，不是新的真实模型运行或 REA 运行证据。

## 4. 分步落地

| 工作项 | 验收门槛 |
| --- | --- |
| A. 先冻结会话合同 | 一个 Run 一个执行权威；Run 级进程、Agent 级隔离 thread；跨角色信息经 Store 成果显式传递；不同模型配置不能混用 thread |
| B. 无模型预检 | 只 initialize/能力检查，不 turn/start；CLI 版本、认证未验证、协议支持分别呈现，不读取 credential store |
| C. 文本能力上限 | 空临时工作区、禁项目指令自动加载；复核已有 smoke 的工具/MCP/hooks/apps/retries 关闭配置；请求审批/工具一律拒绝并结束 |
| D. JSON-RPC 会话管理 | 请求 ID、通知缓冲、thread/turn/item 关联、最终正文与 commentary 分开、只保留允许字段；完整支持官方嵌套完成事件 |
| E. 生命周期与预算 | 初始化/绝对/空闲时限、输出上界、stderr 消费、取消回执/进程回收、每次 turn 先记调用；未知结果不自动重放 |
| F. 故障合同 | 提前通知、分段文本、无 delta、错误 turn、错误 ID、工具请求、连续事件超时、父子进程退出、取消与重启，均以离线夹具验收 |
| G. 一次新的真实验收 | 获得新授权后，仅一个最小文本 Run；明确传输选择、费用与内容边界；失败不静默回退 exec |

通过后才开放可选传输；不直接替换默认值，不修改旧 Run。

## 5. 尚存边界

- 当前 CLI 只读沙箱不能证明不存在只读 Shell/MCP 调用，完整无工具 ceiling 尚需专项验证；不能用 Prompt 宣称强制安全。
- 当前 `max_output_tokens` 对 Chat Completions 有请求参数约束；Codex CLI 没有相同的已验证 token 硬上限，不应当作 CLI 预算保证。
- 本轮诊断只对新调用生效；旧 Run 不补造事件、正文、tokens 或退出状态。
- 长驻进程能否改善真实延迟和失败率仍需测量，不能凭架构名称作保证。
