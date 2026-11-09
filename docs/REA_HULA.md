# HuLa 的 REA 与多端分解

日期：2026-11-08。用户来源：

```text
https://gitee.com/HuLaSpark/HuLa
```

本次 Gitee 与 GitHub `HuLaSpark/HuLa` 的 HEAD 均为 `16871546d8f42252ed8b475540b0f74f1ea44fd6`；固定源码阅读使用 GitHub raw 同一 hash。根 LICENSE 为 Apache-2.0；未审计全部依赖和服务端许可。

## 1. 职责边界

HuLa 在此作为 Tauri/Rust/Vue/TS 消息客户端参考，不是 Agent Harness、代码沙箱或飞书/微信的通用桥接。

README 对 Web 明确写暂不支持；OS/设备支持说明只是上游陈述，不是 mybot 真机验收。不能直接替换当前响应式 Web，也不复制聊天 UI、品牌或页面。

## 2. 研究入口

已读：

```text
README.md（定位、技术/平台与许可段）
LICENSE
src-tauri/Cargo.toml
src-tauri/src/lib.rs（前 130 行）
```

能确认 Tauri/SQL/WebSocket 依赖及桌面/移动条件编译存在。未追踪消息发送/同步、用户存储、撤销、通知和后台生命周期，也未研究服务器仓库。

下一轮按 `lib.rs` 引用核对消息/数据库/WebSocket/移动模块，再逐条阅读；源码里导入某命令不代表命令已安全或可用于 mybot。

## 3. REA 工具路线

1. 匿名 clone 固定 commit，拒绝读取真实配置或运行数据；不启动聊天服务。
2. 取得用户指定或官方固定桌面/手机安装包，记录 SHA-256 与版本，源码与包分别标识。
3. 原生安装包先 `inspect-artifact` / `inspect-desktop-application`；不运行未知安装器。
4. 解出的 JS WebView bundle 用 `analyze-javascript-application`；先 inventory 再选实际模块。
5. Rust binary 可用 `inspect-rust-binary` 看可用依赖 metadata；缺少 metadata 不代表没有依赖，也不代表安全。
6. Android 包可用 APK 声明/签名检查；JADX/设备侧能力需要单独准备与授权。
7. 用测试服务/合成消息做进程或 WebView 场景捕获，观察断线补齐、重复投递、通知和关闭清理；真机和桌面分别验收。

Tauri 不是 Electron；不能套用 Electron fuses/IPC/Inspector 工具作为 HuLa 的默认方案。仅有源码时不强行使用 REA，运行捕获仍需外部隔离。

## 4. 实现出口

- 可借鉴平台能力适配、通知与消息可靠性原则，不能把 IM 消息等同 Agent 任务事实。
- mybot 的会话/任务仍有自己的鉴权、事件游标与审批。
- 把系统能力隔离在桌面壳/Node，Web 使用无原生依赖的接口。
- 消息数据库与 mybot Run 存储分离；不直接同步或复用真实 HuLa SQLite。
- root Apache-2.0 不能替代对第三方资源、插件、服务端和分发方式的检查。

当前：文档 E1 + 有边界 E2；REA、安装/构建、服务连接、消息/通知和真机 E3 均未执行。
