# DeepSeek Harness 的 REA 与适配分解

日期：2026-11-08。Harness 是运行时类别；此文针对上下文中此前指定的 DeepSeek Harness，不假定用户要求 Pi 与 DSH 叠加。

固定身份：`deepseek-ai/deepseek-harness`，commit `fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159`。README/SAFETY 声明 MIT、developer preview 与未安全审计。早期 `ce7073...` 研究记录保留，不能混写为同一快照。

## 1. 源码/文档入口

本轮已读 README、SAFETY、`docs/architecture.md` 前 180 行；不是完整实现审计。

下一轮先核对源码目录，再追踪：

- session 持久事实与 live agent 事件的区别。
- tools 注册/执行前检查，以及插件卸载与能力撤销。
- `sdk`/`sdk-minimal`/headless profile 的实际资源与默认权限。
- 模型适配与工具执行是不同 owner；停止/失败/重试如何落为可关联事实。

不要执行 `--dump-config` 来收集真实账号配置，文档示例不是运行许可。

## 2. REA 分解

1. Clone 固定 commit，阅读许可/安全；不运行 `pnpm install` 或启动 Web。
2. 从官方渠道取得固定 CLI/Electron 发布包，保存版本、hash 与来源；没有发布物时只做源码研究。
3. JS/Electron 目录或 ASAR 使用 `analyze-javascript-application`；路径先由 inventory 确认，不能硬编码当前源码路径为打包路径。
4. 用已保存 Evidence 追踪 plugin 生命周期、工具执行、session 事件等选定问题，不从静态可达推断隔离有效。
5. 受限 mock profile 的进程场景用 `capture-process`；只记录脱敏状态/回执，不保存原始模型内部推理或真实秘密。

profile/build/dependency 安装均会扩大执行面；需要先审阅和记录，不在本轮启动。REA 本身不提供运行隔离。

## 3. mybot 映射与门槛

- runtime profile -> Adapter 能力声明，不把整套 Web/数据库接管 mybot。
- session event -> mybot 外部执行事件引用；自己的 Run/Call/Approval 保持权威。
- tools hook -> 宿主策略候选检查点；必须验证真实拒绝，不用文档承诺代替。
- 插件停止/卸载 -> 撤销能力测试；已发副作用仍可能结果未知。
- 同一 Run 不同时运行 Pi、DSH、Codex 的主循环。

如果只读、凭证隔离、重试/取消语义无法满足，就保留为机制参考，不因插件丰富直接采用。

当前：E1 有边界阅读。未运行 REA/上游/模型；没有接入生产能力。
