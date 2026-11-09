# Pi 的 REA 与适配分解

日期：2026-11-08。当前理解是 Pi Coding Agent；用户未指定其他同名项目。

固定身份：`earendil-works/pi`，commit `085c84e98e7f4c950f2be606466fff4f75d8fe7c`，根 LICENSE 为 MIT。旧 `badlogic/pi-mono` 此时 HEAD 相同；不保证后续地址/包名始终一致。

## 1. 目标与源码入口

Pi 是 Harness 候选，不是 mybot 必装的额外一层。先读：

```text
packages/coding-agent/README.md
packages/coding-agent/docs/sdk.md
packages/coding-agent/docs/rpc.md
```

本轮只读上述文档和根 README/LICENSE。后续 SDK declarations、会话、工具分派、resource loader 和 retry 的具体源码路径要先用 `git ls-tree` 核对，不能按名称猜已审阅。

重点比较：SDK 的 `noTools`/工具集合、资源发现、内存会话、认证归属、自动重试、`agent_settled` 与 `agent_end` 的不同语义。

## 2. 工具步骤

1. 按 Clone 手册匿名获取固定 commit，不运行安装器或自动模型任务。
2. 若取得固定 npm 发布包，记录包名/版本/integrity；以实际目录 inventory 为准，不能把当前 HEAD 当作 npm 构建 commit。
3. 使用 REA `analyze-javascript-application` 分析发布目录，选择入口、session/RPC/tool 模块；路径来自 inventory。
4. 复用完整 Evidence 做模块/调用追踪，保留未选文件与动态关系 unknown。
5. 在独立测试配置和 mock Provider 下，以 `capture-process` 记录协议接受、终止、重复消息、取消、正常退出。

CLI 操作形态（占位路径不可直接执行）：

```bash
npx -y rea-agents@6.8.0 analyze-javascript-application "$PI_PACKAGE_DIR" \
  --artifact-format directory --detail summary \
  --evidence_output "$NEW_EVIDENCE_FILE" --json
```

REA 不是沙箱；运行前仍需确认环境、文件权限、网络、凭证和重试策略。默认 SDK 工厂或 CLI 会发现资源/配置，不能直接在当前账号 HOME 上做隔离验证。

## 3. 实现出口与验收

- 首期 Python 宿主可评估独立进程 RPC；TS 宿主可评估 SDK。仅比较，不在本轮安装。
- mybot 保持 Run/事件事实；Pi 会话为该执行尝试的外部引用，不能另设第二个业务权威。
- 不把 `prompt` 接受或 `agent_end` 当最终成功；要处理 settled、失败、用量未知、取消和队列。
- 子 Agent、MCP、联网、写代码不因支持扩展而默认开启。
- 本机 Codex 的凭证不复制给 Pi；认证兼容需要独立验证和授权。

当前：E1 文档证据；REA S1、mock/E3、模型请求均未执行。通过无工具契约后再决定是否接入。
