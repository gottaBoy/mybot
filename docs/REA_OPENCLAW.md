# OpenClaw 研究与 REA 分解

日期：2026-11-08。暂定对象：`openclaw/openclaw` @ `9b8aa392679f35f75674ba6bb01993ced16f1bd1`。用户输入是 `openclawe`，身份假设需保留。

## 已有观察

E1：README 前部、LICENSE、固定文档：

```text
docs/concepts/architecture.md
docs/gateway/security/trust-model.md
docs/plugins/architecture-internals/channel-surfaces.md
docs/channels/feishu.md
```

E2：

```text
extensions/feishu/channel-entry.ts
extensions/feishu/index.ts
extensions/feishu/src/channel.ts (前 145 行)
```

- Gateway、operator、Node 分角色，握手声明身份/能力；node pairing 不等于项目 ACL。
- 文档明确单 Gateway 是单信任域，不是敌对多租户隔离。
- 实时事件不能默认当持久重放，缺口需刷新/对账。
- 飞书插件涵盖消息/资料工具，但引入大量 `openclaw/plugin-sdk/*`，入口注册多项工具，不能复制目录就当独立只读连接器。
- 插件声明存在不是真实账号连通或权限强制证据。

本轮无安装、Gateway 启动、REA、渠道、账号或模型测试。

## 分解顺序

1. 追飞书入站→sender/tenant/thread→session binding→分派，记录宿主依赖。
2. 比较官方 SDK 窄适配、独立库与服务适配成本，不默认运行第二个 Agent。
3. 固定 npm 包，`npm pack --ignore-scripts`；REA inventory 后只选 loader/channel/config inspection，先静态。
4. 运行只用合成 webhook/SDK peer、空凭证，验去重、撤销、群/私聊身份、scope、限流；真实账号另授权。
5. 网络仅专用 mock，不整体取消 deny-all；保存 coverage/unknown，capture 不代替网络审计。

## mybot 门槛

- Channel 只建草稿/查状态，不默认启动工具/模型。
- Node 配对不自动授权整个项目和其他用户会话。
- 持久 Inbox/Outbox 与游标；短期 dedupe 不当永久 exactly-once。
- 发消息/读资料/写文档分 scope，模型动作另过审批，撤销影响缓存/任务。
- 若只能通过高权限 Gateway 完成，保留参考，优先官方 SDK 窄连接器。

未实现上述连接器。clone 见 [手册](UPSTREAM_CLONE_AND_IMPLEMENTATION.md)，阶段见 [路线](AGENT_INTEGRATION_ROADMAP.md)。
