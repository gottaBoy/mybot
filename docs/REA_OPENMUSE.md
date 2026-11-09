# OpenMuse 研究与 REA 分解

日期：2026-11-08。对象：`CopilotKit/openmuse` @ `a4944f4c471d3dc93b8bfc060b5da309b5216ab2`，不是 nanoMuse 或 OpenMausBot。

## 已有观察

- E1：README、`docs/RICH-THREADS.md`，结合既有 FEATURES、VERIFICATION 等阅读。
- E2：`apps/server/src/engine/worker.ts` 前 185 行、`packages/backends/src/openbot.ts` 前 195 行；其余既有路径见 [链路分析](SOURCE_CHAIN_ANALYSIS.md)。
- Worker 的 lease/guard/checkpoint/CAS，与外部副作用核查是两层。
- Rich Threads 每种模式依赖独立 Intelligence 服务；追问队列在打开的 App 内，不是持久服务端 Inbox。
- OpenBot adapter 默认关闭，按认证传输探测，非直接可用 AG-UI SSE；接口/测试不是已连通证明。
- 本轮无安装、账号、模型、运行或 REA；MIT 应用许可不包含独立服务与全部依赖。

## 待验证的问题

只研究“任务→成果→人工接管/审批→取消/结果未知”，不复制 UI 或迁入第二套会话系统。

1. 源码读 Worker、service/model/actions、浏览器/文件权限。
2. 官方固定 server/Web 产物记录 SHA-256；无发布物时不为 REA 安装整套依赖。
3. REA inventory 确认打包路径，选择 worker/action/preview 静态分析与追踪，源码路径不当作包路径。
4. 运行仅合成模型/邮件、独立目录、禁外网/真实凭证；REA process capture 观察租约失效、取消和 unknown。
5. 启动若必须 Intelligence key，停下记依赖；未经授权不注册/登录或上传已有消息。

REA 不提供沙箱，静态可达不证明工具策略有效。

## mybot 输出

- 成果携带 Task/Run/来源版本，短期 URL 不写进长期消息。
- 追问/队列真正持久化，不复刻 App 内存队列的跨端局限。
- 租约失效不能覆盖新结果，已发外部动作仍可能未知。
- 模型完成、租约有效、HTTP 成功不是测试通过。

clone 方法见 [手册](UPSTREAM_CLONE_AND_IMPLEMENTATION.md)，采用顺序见 [路线](AGENT_INTEGRATION_ROADMAP.md)。当前是机制参考，不是平台接入。
