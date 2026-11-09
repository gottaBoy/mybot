# Pi、Harness 与 HuLa 的位置

日期：2026-11-08。状态：用户要求纳入评估；分层和优先级为建议，未采用为底座，未安装或运行。

## 1. 先澄清名称

- 本轮 Pi 按此前上下文理解为 Pi Coding Agent，而非其他同名项目。
- Pi 本身就是 Agent Harness；Harness 首先是一类运行时职责，不是必须再安装的一层软件。
- 如果 Harness 特指此前指定的 DeepSeek Harness，本轮单独评估 `deepseek-ai/deepseek-harness`，不与 `dsh-superagent-prototype` 的上层工作编排混用。
- HuLa 是用户指定的 `HuLaSpark/HuLa`，其消息客户端能力与 Agent 工具执行是不同层。

## 2. 固定身份与已读范围

| 项目 | 本次观察快照 | 已读文件 | 证据 |
| --- | --- | --- | --- |
| Pi | `earendil-works/pi`，`085c84e98e7f4c950f2be606466fff4f75d8fe7c`；旧 `badlogic/pi-mono` 此时 HEAD 相同 | 根 README、LICENSE；`packages/coding-agent/README.md`、`docs/sdk.md`、`docs/rpc.md` | E1 文档/许可，不是执行器实测 |
| DeepSeek Harness | `deepseek-ai/deepseek-harness`，`fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159` | README、SAFETY、`docs/architecture.md` 前 180 行 | E1；MIT 为上游声明 |
| HuLa | Gitee 与 GitHub 的 `HuLaSpark/HuLa`，此时 HEAD 均为 `16871546d8f42252ed8b475540b0f74f1ea44fd6` | README 技术/平台/许可段、根 LICENSE；`src-tauri/Cargo.toml`、`src-tauri/src/lib.rs` 前 130 行 | E1 + 有边界 E2 源码观察 |

只通过匿名 Git 识别 HEAD，读取固定快照文本；没有安装依赖、执行下载脚本、登录、发送消息或调用模型。两个远端此时同 HEAD 不意味着永久同步。Pi 的旧包名/旧文档不能与新快照混用。

Gitee 页面抓取超时；身份对照来自匿名 `git ls-remote`，README/许可/源码文本来自 GitHub 的相同固定 hash，没有把未读到的 Gitee 页面当成额外证据。

## 3. 取舍

| 对象 | 值得考察 | 对 mybot 的影响 | 不能据此承诺 |
| --- | --- | --- | --- |
| Pi | TS SDK、语言无关 JSONL RPC、会话与工具集合、扩展和生命周期 | 与 Codex 并列的可替换 Harness 候选；先比较无工具、mock 与事件契约 | 不能直接信任默认工具/资源/凭证发现；SDK 的 automatic retries 与 mybot 不自动重发要求须协调 |
| DeepSeek Harness | Cordis 插件生命周期、session 事实、agent/tool 扩展点、SDK/headless profiles | 适合评估复杂插件/执行环境需求，也可仅借鉴机制 | 官方标为 developer preview，明确未安全审计；不以插件/审批代替外部隔离 |
| HuLa | Tauri/Rust/Vue/TS 客户端分层、桌面/移动条件编译、消息和本地存储入口 | 桌面壳、通知、消息同步/离线补齐的研究候选 | README 的 Web 暂不支持；不能当即插即用 Web 工作台、Agent 沙箱或飞书/微信连接器 |

Pi SDK 默认发现资源、设置与凭证，默认会话持久化；这些必须由宿主显式收敛。其文档区分 `agent_end` 和 `agent_settled`，前者不能直接映射为 mybot 最终完成，因为后续可能还有恢复/排队工作。

HuLa 的 Rust manifest 和入口能确认 Tauri、SQLite、WebSocket 与平台分支存在；没有追踪或验收消息可靠性、加密、备份、后台常驻、服务器端或真机支持。根 LICENSE 是 Apache-2.0，不代表第三方组件和服务全部已审计；Cargo 的空 license 字段不能被当作完整许可结论。

## 4. 修订后的架构建议

```text
mybot 原创 Web / 后续桌面与移动壳
    ├─ 研究 HuLa 的平台分层、消息与通知机制，不复制 UI
    └─ 统一 mybot API
              |
mybot 项目 / 任务 / Run / 权限 / 审批 / 预算 / 事实事件
              |
RuntimeAdapter（一个 Run 只选一个执行权威）
    ├─ Codex：已完成单次独立文本连通，不是已接入
    ├─ Pi：SDK / RPC 候选，未运行
    └─ DeepSeek Harness：SDK / headless 候选，未运行
              |
受限能力 / 连接器 / 后续 Rust 设备节点
```

模型 Provider、Harness、连接器和客户端分别建模。Harness 是运行模型/工具循环、会话和取消等职责的载体，不等于模型供应商，也不自动成为业务任务事实源。宿主的权限上限必须独立，不由 Pi、Codex、DSH 的默认配置决定。

当前 FastAPI/SQLite 和静态设计历史保留。引入 HuLa 不意味着把 mybot 改成聊天软件，也不强制将现有 Web 改为 Vue；参考仅限能力与架构机制。

## 5. 下一阶段怎么变

此前“下一步接 Codex”的建议需改为：

1. 先定义最小可替换 `RuntimeAdapter` 契约；首批候选是 Codex 与 Pi，DSH 同表评估。
2. 对同一无工具/mock 场景比较上下文边界、事件映射、完成/取消、恢复、默认重试、认证归属和费用确认。
3. 首个闭环只实现一个通过门槛的候选，不并行引入多个循环控制同一 Run。Codex 只是当前连通性基线，不是已定唯一内核。
4. HuLa 放在后续多端壳/消息专项；先验证 Web 与壳能力边界，再考虑依赖或代码复用，维持原创设计。
5. 每完成一小项就记录 E1/E2/S1/E3、unknown、适配方法，再做受限实现，不要求先把所有候选“完全读完”。

这些变化尚未成为替换 ADR-0004 的新决策。本机真实请求的一次授权已使用完，研究/离线比较不得自动复用。

## 6. REA 与复现

具体工具分解见 [Pi](REA_PI.md)、[DeepSeek Harness](REA_DEEPSEEK_HARNESS.md)、[HuLa](REA_HULA.md)。本轮未对这三个项目运行 REA，不把源码阅读写成发布包或运行证据。

按照 [Clone 手册](UPSTREAM_CLONE_AND_IMPLEMENTATION.md) 的模板分别替换 URL、NAME、COMMIT：

```text
https://github.com/earendil-works/pi.git
085c84e98e7f4c950f2be606466fff4f75d8fe7c

https://github.com/deepseek-ai/deepseek-harness.git
fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159

https://gitee.com/HuLaSpark/HuLa.git
16871546d8f42252ed8b475540b0f74f1ea44fd6
```

Clone 不是安装，发布包不是源码构建证明，单元测试不是隔离证明。REA 优先用于固定发布包与受控 mock 场景，普通源码架构继续使用 `git show`/`rg`。
