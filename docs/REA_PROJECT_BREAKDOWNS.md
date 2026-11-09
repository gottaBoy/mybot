# REA 项目工具分解

记录日期：2026-11-07。这里是后续逐项目执行入口；总流程见 [UPSTREAM_CLONE_AND_IMPLEMENTATION.md](UPSTREAM_CLONE_AND_IMPLEMENTATION.md)。

| 项目 | 当前可用证据 | 下一步 REA 目标 | mybot 映射 |
| --- | --- | --- | --- |
| OpenMausBot | S1 + P0/v4 + P1 会话复用 REA；35/38 项合成 ACP 检查，未接生产；Ask 仍非 ceiling | [受控适配与原生接口验证](OPENMAUSBOT_MCP_REUSE_RESULTS.md)，宿主权限/全调用预算/SSE/故障恢复 | 优先复用 Bot/会话/工作控制，不默认重写 |
| [T3 Code](REA_T3CODE.md) | `gottaBoy/t3code` fork HEAD 固定；README/LICENSE，未运行 | 固定桌面/CLI 产物、fake CLI 会话、权限和 credential 传播 | Harness 控制面/本地发现参考 |
| Cindy | 固定源码 E1/E2；暂无随仓库发布 ASAR | 官方桌面 ASAR、Android/iOS 包或已授权运行目标 | 设备链接、可靠传输、控制端 |
| nanoMuse | 固定源码 E1/E2；仓库含静态 Web 产物 | Web 静态图、Android APK、桌面包 | 同步、Hub、渠道 |
| QwenPaw | 固定源码 E1/E2；仓库含 Tauri 源码和 Web 源码 | Tauri 包、Web bundle、渠道运行证据 | 渠道 ACL、插件治理、连接器 |
| [Pi](REA_PI.md) | 2026-11-08 固定快照的 SDK/RPC 文档 E1；旧 pi-mono 与新地址此时 HEAD 相同 | npm 产物静态图、无工具/mock RPC 生命周期 | 可替换 Harness，不额外叠加一个主循环 |
| [DeepSeek Harness](REA_DEEPSEEK_HARNESS.md) | 固定 README/SAFETY/architecture E1；developer preview | 插件/profile 发布包、受限 mock 场景 | 执行器与插件机制候选 |
| [HuLa](REA_HULA.md) | Gitee/GitHub 同 HEAD；README/LICENSE、Rust manifest/入口节选 | Tauri/WebView/手机产物与合成消息场景 | 多端壳/消息/通知，不替代 Agent 内核或原创 Web |
| [OpenMuse](REA_OPENMUSE.md) | 固定文档与 Worker/adapter 节选；Intelligence 是独立依赖 | 官方 server/Web 产物、合成 lease/审批/成果路径 | 可核查任务/成果机制，不迁入第二套会话云 |
| [OpenClaw（暂定）](REA_OPENCLAW.md) | 固定文档与飞书插件入口节选；身份按 `openclawe` 假设 | 渠道/插件产物，合成入站/撤销/归属 | Channel/Node 机制参考，不自动引入 Gateway |
| [HarnessWorks（待确认）](REA_HARNESSWORKS.md) | 两候选固定 README/工程实践；未执行技能 | 只有确需比较打包插件时才使用 REA | 回归/记忆/效果指标，非运行时 |
| [OpenAI Agents SDK](REA_OPENAI_AGENTS_SDK.md) | 官方 SDK/图/tracing 文档；远端身份固定，未读该提交实现 | Python 发布物/隔离 fake model 生命周期，关闭隐式 trace | 自有运行后端候选，不叠加控制同一 Run |
| [AIFlowy](REA_AIFLOWY.md) | 官方介绍/技术/工作流文档；Gitee 身份固定，许可/代码未审 | workflow version→run→node/event，后续官方 Web/JAR 产物 | 流程与运行分离，不迁入整套 Java 产品 |
| [Headscale](REA_HEADSCALE.md) | 官方网络控制面文档/远端 HEAD，未部署 | 固定 release 的隔离注册/撤销/ACL/DERP 与真机网络专项 | 可选私网，不是 Agent/同步/项目授权 |
| [Melaya](REA_MELAYA.md) | 官方产品页 + SDK/文档仓库 README；平台 runtime 专有，未运行 | 固定 SDK/发布物的 pipeline/step/tool scope/HITL/replay fake 场景 | 借鉴可视化工作流语义，不引入专有平台 |
| [swarm-cursors](REA_SWARM_CURSORS.md) | `gottaBoy/swarm-cursors` fork HEAD 固定；README 明确无 LICENSE；未运行 | 授权发布包的 Chrome 扩展静态/合成页面场景 | 阶段依赖/回放表达参考，不复制动画/代码 |

规则：先完成对应文档的静态阶段，再决定是否进入运行阶段；REA Evidence、SHA-256、coverage、unknown 和清理结果都要保存。

当前产品实施顺序见 [AGENT_INTEGRATION_ROADMAP.md](AGENT_INTEGRATION_ROADMAP.md)，不要求先完整验收所有项目再交付。
