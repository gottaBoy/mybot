# nanoMuse REA 工具分解

固定源码：`nano-muse/nanoMuse`，commit `a7b31d0ab6eb9a7db33d30fd234b462713bdd274`，许可证 GPL-3.0-or-later。

## 1. 研究目标

```text
设备会话 -> hub/relay -> conversation sync
         -> cursor/tail/owner/presence
         -> channel manager -> agent thread
         -> approval/task/action -> event/result
```

目标是借鉴同步和渠道机制，不复制 GPL 代码或把 nanoMuse Relay 作为 mybot 事实源。

## 2. 源码研究入口

```bash
git -C "$ROOT/nanoMuse-a7b31d0ab6eb9a7db33d30fd234b462713bdd274" \
  show HEAD:nanomuse/sync/engine.py
git -C "$ROOT/nanoMuse-a7b31d0ab6eb9a7db33d30fd234b462713bdd274" \
  show HEAD:nanomuse/hub/service.py
git -C "$ROOT/nanoMuse-a7b31d0ab6eb9a7db33d30fd234b462713bdd274" \
  show HEAD:nanomuse/hub/actions.py
git -C "$ROOT/nanoMuse-a7b31d0ab6eb9a7db33d30fd234b462713bdd274" \
  show HEAD:nanomuse/channels/base.py
git -C "$ROOT/nanoMuse-a7b31d0ab6eb9a7db33d30fd234b462713bdd274" \
  show HEAD:nanomuse/channels/manager.py
```

关键静态问题：cursor 是否单调、tail 是否有限、owner 是否隔离、working presence 是否 best-effort、远程 action 是否白名单、渠道状态是否阻塞核心任务。

## 3. REA 目标一：静态 Web bundle

仓库包含 `nanomuse/server/static`，但 sparse clone 后必须显式 checkout：

```bash
git -C "$ROOT/nanoMuse-a7b31d0ab6eb9a7db33d30fd234b462713bdd274" \
  sparse-checkout init --no-cone
git -C "$ROOT/nanoMuse-a7b31d0ab6eb9a7db33d30fd234b462713bdd274" \
  sparse-checkout set nanomuse/server/static
```

然后：

```bash
npx -y rea-agents@6.8.0 analyze-javascript-application \
  "$ROOT/nanoMuse-a7b31d0ab6eb9a7db33d30fd234b462713bdd274/nanomuse/server/static" \
  --artifact-format directory --detail summary \
  --evidence_output /tmp/mybot-rea/evidence/nanomuse-web.json \
  --source-path index.html \
  --source-path manifest.webmanifest \
  --source-path assets/index-CCyixzKg.js \
  --source-path assets/DevicesScreen-D2tGbopn.js \
  --source-path assets/ChannelsScreen-BC9h2IUg.js \
  --source-path assets/CodingScreen-CZ5MyK-r.js \
  --json
```

文件名是构建 hash，必须先用 `git ls-tree` 或 inventory 替换。REA 只说明静态 bundle 的模块/请求/存储候选，不说明真实 Relay 已连接。

## 4. REA 目标二：Android/桌面发布包

取得官方 APK、AppImage 或桌面 bundle 后：

- Android：`inspect-android-package`、`inspect-apk-signature`、`search-android-classes`、`trace-android-references`。
- Electron/Web：`analyze-javascript-application`、`inspect-electron-fuses`、`capture-electron-scenario`。
- 本地 Rust/原生组件：`inspect-rust-binary`、`inspect-binary-layout`，不执行二进制。

重点 seed：

```text
hub
sync
device
approval
channel
task
stop
file.get
file.put
```

## 5. 运行观察

只有用户提供测试账号/本地 Relay 并明确授权后，才使用：

1. `capture-browser-scenario`：登录测试租户、发送测试任务、停止、重新加载。
2. `capture-electron-scenario`：观察设备/渠道设置和断线重连。
3. `compare-web-captures`：比较同步打开/关闭或不同版本。
4. `reconcile-javascript-runtime`：静态 bundle 与运行证据对齐。

不抓取真实邮箱、消息、联系人或模型请求；不把 demo 的“在线”状态当作可靠同步。

## 6. mybot 实现映射

| nanoMuse 机制 | mybot 实现 |
| --- | --- |
| cursor/tail | `event_cursor` + 快照水位 |
| owner/account | `Principal`/`Project` ACL |
| working presence | best-effort `DevicePresence` |
| hub task/approve/stop | `Command` + `Approval` |
| channel Bus | `ChannelAdapter` |
| file action limits | Resource scope + size/path limits |

GPL 代码不直接复制；只在许可证评审后决定是否实现兼容协议。

