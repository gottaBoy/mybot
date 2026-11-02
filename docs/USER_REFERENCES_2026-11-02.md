# 用户指定参考：Super-agent 与 Cyrene-Agent

日期：2026-11-02。状态：身份核对与有边界的资料阅读，不是选型或运行验收。

## 1. 最新反馈优先

用户否定 V1 静态稿：“太丑了，不高级”。V1 不能继续写成待微调或已获视觉认可。

参考核对时 V2 曾暂停定稿。其后用户要求继续并加强体验，现已重做任务/调用重点画面、补充静态浏览器检查；依然没有用户视觉认可或业务实现。本轮状态见 [UI_ITERATIONS.md](UI_ITERATIONS.md)。

用户允许参考其指定的公开产品风格与能力。这不解除“不借鉴 ain fra 本地项目界面”的要求。可以研究参考的布局原则、信息层级、密度与交互，不复制品牌、角色资源或整套页面。

## 2. 参考身份

| 用户提供对象 | 核对结果 | 如何使用 |
| --- | --- | --- |
| gottaBoy/dsh-superagent-prototype | DeepSeek 官方项目的 fork；本轮两者 HEAD 相同 | 研究授权、工单、执行派发和长任务生命周期 |
| deepseek-ai/deepseek-harness | 官方 Harness 仓库 | 运行时与执行适配候选，不作为自动定版 |
| Playa-Cyrene/Cyrene-Agent | 用户进一步指定的 Cyrene 桌面产品 | 研究 Harness、代码工作空间和界面截图 |
| Yongchu-Yitao/Cyrene 的 cyrene-hero.png | 用户此前单独提供的架构图，不是上述桌面产品 | 只保留分层参考，不混用两个项目的能力 |
| AgentsPulse 教程 | 已读的二手架构解读 | 辅助理解与发现路径；技术结论回到一手源码核对 |
| 微信文章 BJkaOPRtTFXkotZsnZ7N6w | 工具无法读取正文，curl 返回环境验证页 | 未分析文章风格；不能冒称已读 |

暂查的 pungme/superagent-desktop 不是用户要的 Super-agent，没有选用。不能把此前推测写成用户选择。

## 3. 快照与证据

本次通过公开 `git ls-remote` 获得：

| 仓库 | HEAD |
| --- | --- |
| gottaBoy/dsh-superagent-prototype | `6337fc823ce20251c8de8085948165c81aaa701e` |
| deepseek-ai/dsh-superagent-prototype | `6337fc823ce20251c8de8085948165c81aaa701e` |
| deepseek-ai/deepseek-harness | `ce7073d51254c26cd63b22a60835b8f948deb447` |
| Playa-Cyrene/Cyrene-Agent | `7194e287dec6c61fbd37e47d4f6e7e1b287864c9` |
| Yongchu-Yitao/Cyrene | `8b79388a47506f79d60f932471de746f2a17262d` |

GitHub 元数据确认 gottaBoy 的 parent/source 均为 deepseek-ai/dsh-superagent-prototype。当前 HEAD 相同，不推出未来两者始终相同，也没有发现本快照独有的 fork 功能。

所有外部内容为静态阅读；未安装运行上游应用，未导入个人浏览器登录态，未执行模型或工具任务。具体许可和分发条件尚未完整评估。

## 4. DeepSeek Super-agent：借鉴工作授权与生命周期

一手阅读：

- `docs/001-domain.md`、`002-authorization.md`、`003-execution.md`。
- 用户指定 fork 的 `docs/007-architecture.md`，本轮读取前 220 行。
- 上游同快照 `src/core/tickets.ts`，本轮读取 1-170 行。
- 上游同快照 `src/app/role-models.ts`，全文件。

阅读到的主要思想是把接入信号、授权依据、工单和执行尝试分开；独立执行者负责具体任务，并通过确定的领域接口报告结果。角色模型初始化也是明确的配置与事件，不等于自动最优路由。

对我们的建议：

- Super-agent 不一定亲自管理每一个代码步骤；入口可以只负责受控接单、分发与追踪。
- 一项工作可以有多次执行尝试，用户停止、失败、等待人工和真正交付不能混成一种状态。
- 任务授权不是给 Shell 的完整安全隔离，隔离仍需另外设计。
- 首版先处理人明确发起的任务，CI/Issue 主动触发等以后再评估。

这不是要求把全部 Trigger/Thread/Eval/Mandate 对象直接加入 UI。领域精确性应隐藏在后端契约中，界面仍使用用户能理解的任务、范围、授权、结果。

## 5. DeepSeek Harness：执行底座候选

已读官方 README、SAFETY.md，并查询 Agent 生命周期、权限、子 Agent 等文档索引；没有逐项审计整个运行时。

它是模型调用、工具、会话及插件运行的底层候选，与上层工单/授权编排不同。其安全说明也不能替代我们对不可信仓库、进程、网络与凭证的隔离验证。

不因为用户指定研究就直接替换 OpenHands。后续应按同一执行器契约比较：

- 指定模型与子 Agent 事件归属。
- 权限、真实取消、工具结束确认。
- 工作区隔离与结果未知处理。
- 事件补取、用量计量及日志脱敏。

只选择一个底座做首个 POC，不让两套 Agent Loop 同时拥有一项任务的恢复与工具控制权。

## 6. Cyrene-Agent：借鉴执行事实与检查空间

一手阅读：

- README 的产品定位、功能及真实截图引用。
- `docs/references/cyrene-harness.md`。
- `src/main/orchestrator/harness/tool-call-scheduler.ts` 1-240 行。
- 历史问题记录 `docs/internal-issue/2026-08-25-harness-parallel-scheduling-known-issues.md` 1-190 行。

重点是统一会话轨迹、工具副作用与恢复，而不是角色陪伴本身。文档区分工具结果 success/failure/unknown/not_executed；已读调度片段在取消、halt 后区分已发射与未发射调用，并尝试保留已经发生的事实。只读并发还要求明确的安全声明。

历史问题文件包含上游声称的修复状态，不能把旧故障当作本快照仍存在的漏洞，也不能把“已修复”当作本项目已经复测。

直接尝试 `harness/run-recovery.ts` 返回 404，未将该路径记为已读实现；恢复能力仍待核对实际文件与故障测试。

对我们的建议：

- UI 事件、模型上下文和审计共享可关联的事实，不各编一份历史。
- 未执行、执行失败、结果未知明确分开，未知写入不能自动重放。
- 调用实际完成顺序与提交给模型的协议顺序分别保留。
- “工具并行”与“多 Agent 并行”不是一回事，不能用一个并发数字概括。

## 7. 已看的视觉素材

Playa-Cyrene/Cyrene-Agent 固定快照下：

```text
docs/image/dark1.png
docs/image/light1.png
docs/image/code.png
```

可参考：工作记录与代码检查区并列、明确的活动空间、底部输入停靠、面板层次、深浅主题对比。

不采用：角色插画、陪伴人格、粉色装饰、音乐与社交入口；这些不服务研发任务。

Yongchu-Yitao/Cyrene 的 `cyrene-hero.png` 是架构图，不是视觉稿。不能从它推断用户选择了某套颜色与控件。

V2 的“高级”落实为：正文可读、主次明确、真实内容占据空间、工具操作有熟悉图标、检查区可以展开，不靠低对比小字、渐变或装饰卡片制造观感。具体主题仍是提案，未确认。

## 8. 组合方案，不是直接拼平台

```text
原创研发工作台
  项目 / 任务 / 计划 / 成果 / 追踪检查空间
                  |
  接单与授权 / 持久任务编排
  借鉴 Super-agent 的领域与执行边界
                  |
  一个 Harness/执行器适配层
  评估 DeepSeek Harness 或 OpenHands，不同时接管
                  |
  受控工具 / 工作区 / 模型连接

所有层通过事件 ID、运行 ID、调用 ID 与成果版本关联
Cyrene-Agent 的执行事实与恢复处理作为对照
```

这张图是本项目设计推断，不代表上游的原生兼容协议或已经集成。

## 9. 下一步

1. 以用户明确的两个仓库和教程为参考，不继续混查同名项目。
2. 基于已看 Cyrene-Agent 工作区截图重新出 V2 主任务与调用检查两个关键画面。
3. 微信文章若能提供截图，再核对具体视觉偏好；不可读文章不阻碍其他可验证设计工作。
4. 先检查桌面和手机渲染，再更新可打开的当前入口，旧 V1 保留但不再推荐。
5. 设计获确认后，才做 Harness/执行器契约比较和技术 POC。

## 10. 来源

下面均为公开地址；未记录用户分享链接中的临时参数。

```text
https://github.com/gottaBoy/dsh-superagent-prototype
https://github.com/deepseek-ai/dsh-superagent-prototype
https://github.com/deepseek-ai/deepseek-harness
https://github.com/Playa-Cyrene/Cyrene-Agent
https://agentspulse.github.io/tutorials/deepseek-super-agent-architecture/
https://mp.weixin.qq.com/s/BJkaOPRtTFXkotZsnZ7N6w

https://raw.githubusercontent.com/gottaBoy/dsh-superagent-prototype/6337fc823ce20251c8de8085948165c81aaa701e/docs/007-architecture.md
https://raw.githubusercontent.com/Playa-Cyrene/Cyrene-Agent/7194e287dec6c61fbd37e47d4f6e7e1b287864c9/docs/references/cyrene-harness.md
https://raw.githubusercontent.com/Playa-Cyrene/Cyrene-Agent/7194e287dec6c61fbd37e47d4f6e7e1b287864c9/src/main/orchestrator/harness/tool-call-scheduler.ts
```
