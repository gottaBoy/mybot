# QwenPaw REA 工具分解

固定源码：`agentscope-ai/QwenPaw`，commit `2cf28d14a20c9f9c769cce2a9c0568ccf84e459c`，许可证 Apache-2.0。

## 1. 研究目标

```text
IM/Web channel -> ingress/ACL/normalization
               -> plugin/channel runtime
               -> tool governance -> Agent/Model
               -> response/outbound -> audit
```

目标是提炼渠道身份、插件生命周期、工具所有权和隔离代理，不搬 QwenPaw 的整个平台。

## 2. 源码研究入口

```bash
git -C "$ROOT/QwenPaw-2cf28d14a20c9f9c769cce2a9c0568ccf84e459c" \
  show HEAD:src/qwenpaw/app/channels/access_control.py
git -C "$ROOT/QwenPaw-2cf28d14a20c9f9c769cce2a9c0568ccf84e459c" \
  show HEAD:src/qwenpaw/app/channels/ingress.py
git -C "$ROOT/QwenPaw-2cf28d14a20c9f9c769cce2a9c0568ccf84e459c" \
  show HEAD:src/qwenpaw/app/channels/manager.py
git -C "$ROOT/QwenPaw-2cf28d14a20c9f9c769cce2a9c0568ccf84e459c" \
  show HEAD:src/qwenpaw/app/channels/isolated_proxy.py
git -C "$ROOT/QwenPaw-2cf28d14a20c9f9c769cce2a9c0568ccf84e459c" \
  show HEAD:src/qwenpaw/plugins/api.py
git -C "$ROOT/QwenPaw-2cf28d14a20c9f9c769cce2a9c0568ccf84e459c" \
  show HEAD:src/qwenpaw/plugins/channel_adapter.py
git -C "$ROOT/QwenPaw-2cf28d14a20c9f9c769cce2a9c0568ccf84e459c" \
  show HEAD:src/qwenpaw/channel_protocol/normalization.py
```

重点问题：匿名 actor 是否 fail closed、租户/用户/话题是否分开、入站载荷是否限流、插件是否可撤销、工具所有权冲突是否拒绝。

## 3. REA 目标一：Tauri/桌面发布物

当前 commit 主要提供源码和 Tauri 工程，不应对源码树强行使用 REA。取得官方 Windows/macOS 包后：

```bash
npx -y rea-agents@6.8.0 inspect-artifact /path/to/qwenpaw-installer.exe \
  --json > /tmp/mybot-rea/evidence/qwenpaw-artifact.json

npx -y rea-agents@6.8.0 analyze-javascript-application /path/to/unpacked-qwenpaw \
  --artifact-format directory --detail summary \
  --evidence_output /tmp/mybot-rea/evidence/qwenpaw-console.json \
  --source-path package.json \
  --source-path index.html \
  --json
```

如果包中包含 Rust sidecar：

```bash
npx -y rea-agents@6.8.0 inspect-rust-binary /path/to/qwenpaw-sidecar \
  --json > /tmp/mybot-rea/evidence/qwenpaw-rust.json
```

重点 seed：`channel`, `ingress`, `plugin`, `tool`, `approval`, `workspace`, `computer`.

## 4. REA 目标二：渠道与插件运行证据

取得测试环境并明确授权后：

1. `capture-browser-scenario`：只用 Fake/测试渠道打开 Console、启用/停用 plugin、查看能力。
2. `capture-electron-scenario`：验证 Tauri desktop 的 channel runtime 状态。
3. `observe-javascript-runtime`：只观察开发实例，不注入代码。
4. `compare-web-captures`：比较停用 plugin 前后能力目录和错误状态。
5. `reconcile-javascript-runtime`：确认静态 ingress/ACL 与运行行为一致。

真实飞书、钉钉、微信、邮箱连接必须另立授权记录；REA 不替代供应商签名验证、OAuth scope 检查或业务回执。

## 5. mybot 实现映射

| QwenPaw 机制 | mybot 实现 |
| --- | --- |
| Channel ACL | `Principal` + `ThreadBinding` + channel-specific grant |
| Ingress limits | body/frame/concurrency/timeout quotas |
| Channel manager | `ChannelAdapter` lifecycle |
| Isolated proxy | connector process boundary |
| Tool ownership | manifest owner + registration conflict |
| Normalization | canonical inbound event schema |
| Plugin config | versioned manifest + revoke/health/stop |

必须先用 FakeChannel/FakePlugin 通过契约测试，再连接第一个真实 IM。

## 6. 淘汰条件

- 匿名入站可进入高权限任务。
- 停用/撤销后旧连接仍能调用工具。
- 插件可覆盖其他插件的工具所有权。
- 运行时状态只显示“在线”，但没有能力、账号、scope 和回执证据。

满足任一条件时只保留源码研究，不接入 mybot。

