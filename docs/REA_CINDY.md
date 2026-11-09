# Cindy REA 工具分解

固定源码：`makecindy/cindy`，commit `f89971ffb1eab1af21d73b3826f7a99dd4db5e1c`。

Cindy 官方开源页确认公开重点是桌面端、手机端和共享 packages；服务端独立，企业 Gateway 不能当作当前客户端仓库中的完整私有底座。REA 只分析用户明确提供或官方发布的安装包，不能读取官方云内部。

## 1. 研究目标

```text
手机/Pad 控制端 -> device-link -> Relay/路由 -> 桌面被控端
                 -> allowlist/invoke -> session/agent
                 -> push/presence -> 控制端投影
```

目标是把设备协议转换为 mybot 的 `Device`、`Command`、`CommandResult`、`CapabilityGrant` 和 `EventPush`。

## 2. 源码先行（不使用 REA）

```bash
git -C "$ROOT/cindy-f89971ffb1eab1af21d73b3826f7a99dd4db5e1c" \
  show HEAD:packages/device-link/README.md
git -C "$ROOT/cindy-f89971ffb1eab1af21d73b3826f7a99dd4db5e1c" \
  show HEAD:packages/device-link/src/protocol.ts
git -C "$ROOT/cindy-f89971ffb1eab1af21d73b3826f7a99dd4db5e1c" \
  show HEAD:packages/device-link/src/transport.ts
```

记录握手、protocol version、presence、设备撤销、allowlist hash、ACK/replay/backpressure、session patch。

## 3. REA 目标一：桌面 ASAR/Electron

当前源码仓库没有随 commit 提交的完整 ASAR；取得官方 Release 的 DMG/目录后：

```bash
npx -y rea-agents@6.8.0 analyze-javascript-application /path/to/cindy-desktop.asar \
  --artifact-format asar --detail summary \
  --evidence_output /tmp/mybot-rea/evidence/cindy-desktop.json \
  --json
```

选定模块后再分析：

```bash
npx -y rea-agents@6.8.0 analyze-javascript-application /path/to/cindy-desktop.asar \
  --artifact-format asar --detail summary \
  --evidence_output /tmp/mybot-rea/evidence/cindy-device-link.json \
  --source-path package.json \
  --source-path apps/desktop/dist/main.js \
  --source-path packages/device-link/dist/protocol.js \
  --source-path packages/device-link/dist/transport.js \
  --json
```

实际路径必须先从 REA inventory 取得，不能假设上面的 `dist` 路径存在。

配套工具：

- `inspect-electron-fuses`：记录 Node inspector、ASAR、运行时开关。
- `trace-application-feature`：以 `link-open`、`presence-changed`、`REMOTE_INVOKE_ALLOWLIST` 为 seed。
- `inspect-analysis-view`：分页读取模块/occurrence/unknown，不重复分析。
- `compare-application-versions`：比较两个发布版本的设备协议变化。

## 4. REA 目标二：Android/iOS

取得用户明确提供的 APK/IPA 后：

```bash
npx -y rea-agents@6.8.0 inspect-android-package /path/to/cindy.apk \
  --json > /tmp/mybot-rea/evidence/cindy-android.json
npx -y rea-agents@6.8.0 inspect-apk-signature /path/to/cindy.apk \
  --json > /tmp/mybot-rea/evidence/cindy-android-signature.json
```

之后使用 `search-android-classes`、`inspect-android-class`、`trace-android-references` 定位 device-link、pairing、notification 和 storage；不安装到真实手机，除非另有真机授权。

## 5. 运行观察

已授权的桌面/浏览器目标：

1. `list-electron-targets` 或 `list-browser-targets`。
2. `capture-electron-scenario` / `capture-browser-scenario`：创建临时配对、打开任务列表、断开、重连。
3. `capture-web-screenshot` 只保存必要画面，不保存账号或消息正文。
4. `reconcile-javascript-runtime` 对照静态 Evidence 和运行 Evidence。

禁止连接 Cindy 官方账号、读取云端会话、抓取其他用户流量或把官方 Gateway 当成可自托管证据。

## 6. mybot 实现映射

| REA 观察 | mybot 设计 |
| --- | --- |
| `link-open/accept/close` | `DeviceSession` 状态机 |
| `presence-changed` | `DevicePresence`，不等于执行健康 |
| allowlist hash | `CapabilityGrant` 版本 |
| seq/ACK/replay/backpressure | `CommandTransport` 有界队列 |
| remote invoke | 只允许语义命令，不暴露任意 IPC |
| push event | `events` 表追加记录，按项目权限过滤 |

只有静态和运行 Evidence 对齐后，才实现 M04/M05；不复制 Cindy 包或 UI。

