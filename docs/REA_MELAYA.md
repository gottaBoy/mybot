# Melaya Agentic Framework：研究与 REA 分解

日期：2026-11-08。用户指定页面：`https://melaya.org/zh/product/agentic-framework`。

## 身份与开源边界

- 官方产品页描述可视化 AI 智能体构建器：步骤、工具、子智能体、连边、模型、记忆、触发器、审批、运行回放和审计。
- 官方公开仓库为 `melaya-labs/melaya`；本轮没有固定 checkout/运行仓库实现。
- 官方 README 将 SDK/公共开发文档与托管平台、Agent Runtime、Device Control、Browser Control 分开；公开 SDK/文档许可与专有平台不能混同。
- 本轮只有 E1 产品页/README 观察，无本地部署、模型、设备或 MCP 运行证据。

## 可借鉴契约

| Melaya 概念 | mybot 可采用的最小含义 | 不直接继承 |
| --- | --- | --- |
| Pipeline / 项目 | 项目下可版本化的工作定义 | 不先做通用拖拽画布 |
| Step | 有输入、输出、Agent、模型、工具范围的阶段 | 模板步骤不等于已执行 |
| Subagent / handoff | 受预算、权限和父 Run 约束的委派 | 不让多个主循环控制同一 Run |
| Tool scope | 每一步明确工具/连接器/目录范围 | 提示词里的“不要使用”不算权限 |
| HITL gate | 发送、写入、发信、文档更新前暂停 | 接受文本不等于批准副作用 |
| Replay / audit | Run→Step→Call→Tool→Approval→Artifact 链 | 不用动画或静态 Graph 伪造运行 |
| Cost / evaluation | 成本、延迟、失败、验证、人工接受分开 | 缺失计量不填 0 |

当前 mybot 已有 Project/Task/Run/Agent/Call/Artifact/Event、预算、上下文快照和人工审查。近期应把固定流程投影为：

```text
Work definition v1
  -> planning
  -> bounded research (1–2 parallel)
  -> synthesis
  -> artifact + human decision
```

这是可视化运行关系，不立即支持任意 DAG。

## REA / 运行验证计划

本轮尚未执行 REA。若取得官方 SDK wheel/npm 包、CLI 或明确授权发布物：

1. 固定版本、包 hash、许可证和依赖；SDK 源码用常规工具，发布物再用 REA。
2. inventory 后选择 pipeline schema、step runtime、tool scope、approval、run/replay、cost/evaluation。
3. 用 fake model、拒绝执行的 fake tool、合成连接器测试成功、失败、等待审批、取消、超时和回放。
4. 验证凭证不进入 prompt、pipeline JSON、artifact、日志和 trace；网络只允许专用 mock。
5. REA `capture-process` 只记录隔离进程/文件/回执，不将 REA 当沙箱或网络审计。

禁止使用远程平台 key、真实连接器、设备或模型作为研究快捷方式。公开页面数字不是 mybot 测试证据。

## 采用决策

**局部采用：** Pipeline/Step/Tool Scope/HITL/Replay/Evaluation 的产品和数据语义；将 OpenMausBot、OpenAI Agents SDK、Pi 或 DSH 作为单一执行器候选。

**暂不采用：** Melaya 专有 Runtime/Device/Browser Control、整套托管会话、品牌 UI 或远程 MCP 作为 mybot 底座。

实施顺序继续以 [AGENT_INTEGRATION_ROADMAP.md](AGENT_INTEGRATION_ROADMAP.md) 为准：先只读 Agent/会话/成果，再受控发送、多端、一个 IM/资料源，最后研发执行和设备节点。
