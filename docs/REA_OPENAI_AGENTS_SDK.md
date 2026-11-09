# OpenAI Agents SDK：研究与 REA 分解

日期：2026-11-08。用户指定官方中文文档。

## 来源与身份

- 仓库：`openai/openai-agents-python`；本轮匿名远端 HEAD `27c75c5f9c5fd957d28c04fb7e9eeacaad4630a9`。
- HEAD 只证明查阅时远端身份；本轮未 clone/读该提交实现，不将当前网页当作该 commit 的精确内容。
- 已读：官方中文首页、visualization、tracing 文档，官方 agent orchestration 指南。
- E1 文档观察；无安装、模型/工具调用、REA 或本地集成。

```text
https://openai.github.io/openai-agents-python/zh/
https://openai.github.io/openai-agents-python/zh/visualization/
https://openai.github.io/openai-agents-python/zh/tracing/
https://developers.openai.com/api/docs/guides/agents/orchestration
https://github.com/openai/openai-agents-python
```

## 要解决的问题

若现有受限研究编排需要动态 Agent/tools，先评估成熟运行库，不自行实现另一个工具循环。但 SDK 不是已连接的会话后端，也不自动提供项目权限、多端同步或 UI。

- 比较 manager/tools 与 handoff 的责任归属，后者不默认等于并行分工。
- session 不能替代用户/项目/模型发送范围。
- 静态 Graphviz 是配置拓扑，运行关系/调用追踪另由实际事件构建。
- tracing 默认开启，文档支持禁用；接入前确认 payload、provider、数据保留和敏感字段，默认不发真实资料到追踪服务。

## 验证顺序

1. clone 固定提交，先读 Agent/Runner、session、模型/工具、tracing/guardrails 实现与根许可/依赖；不导入环境账号。
2. 与 mybot 当前 Chat Completions 适配比较，核对所选模型接口，不假定任意兼容端点与默认设置等价。
3. 普通源码用常规工具；官方固定 wheel 记录版本/hash 后才用 REA 合适的包/运行观察，不把 JS 专用分析器用于 Python 源码。
4. 用完全离线 fake model 和拒绝执行的 fake tools，验证完成、错误、handoff、取消、最大轮数、辅助请求、trace 关闭与敏感内容不外发。
5. REA process capture 仅包裹隔离测试；无真实 key/模型、无隐式网络，Evidence/unknown 和资源退出分别记录。
6. 所有契约成立再评是否采用为一个独立执行后端；不叠加控制 OpenMausBot 同一 Run。

mybot 输出：标准化 Run/Agent/Call/Event 适配与真实运行图，不是展示静态 Agent 图就宣称协作已发生。

clone 方法沿用 [手册](UPSTREAM_CLONE_AND_IMPLEMENTATION.md)，产品位置见 [AI_AGENT_WORK.md](AI_AGENT_WORK.md)。
