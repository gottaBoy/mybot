# swarm-cursors：研究与 REA 分解

日期：2026-11-08。用户指定：`git@github.com:gottaBoy/swarm-cursors.git`。

## 身份

- fork：`gottaBoy/swarm-cursors`
- parent/source：`DhvanilPatel/swarm-cursors`
- 固定观察 HEAD：`3d49e0ac96172eb6af7ae8229b2152121bed2092`
- README 名称：Swarm Rebuild；Chrome MV3 扩展，将页面快照成 blueprint，再用多游标、任务解锁、复制和构建动画重建。
- README 明确写明目前没有 LICENSE；不能把代码、动画、物理或素材直接复制到 mybot。

本轮只读 README 与仓库元数据，未 clone/安装扩展、未运行页面脚本、未取得发布包。完整源码分析用常规 git 工具；REA 只有在取得明确授权的 extension zip/release 时才考虑。

## 值得借鉴

- `snapshot -> blueprint -> task dependencies -> render events` 的阶段化表达。
- master/duplicate、parent/child、scroll unlock 等依赖关系可以启发 Agent Work 的步骤依赖可视化。
- 实时游标应表达“哪个 Agent 正在处理哪个明确步骤”，不是隐藏思维。
- Replay/Go live/退出是演示交互，不等同于执行结果或权限确认。

## 不采用

- 不复制游标、群聚物理、动画、声音、页面重建 UI 或素材。
- 不把 DOM snapshot 当研发工作区、代码沙箱或项目权限。
- 不把游标数量当 Agent 数量、成功率或并行能力证据。
- 没有许可证前不复制 substantial code 或视觉实现。

## mybot 映射

```text
Agent Work Stage -> Step/Agent/Call/Event
dependency edge  -> persisted stage/assignment relation
replay           -> audit/event projection (not model replay)
cursor           -> optional current-step indicator
```

首期只显示真实阶段和回执；后续若增加动态效果，必须绑定事件 ID、状态和可停止语义。

## 后续 REA

取得明确授权发布包后，固定 zip/hash，inventory manifest/content scripts/background permissions；使用合成 HTML fixture 做 capture，记录 DOM 读取、canvas/media 处理、退出和网络 unknown。若许可证仍缺失，结论只保留机制观察，不复制实现。

决策：**机制/视觉参考，非执行后端；不纳入 RuntimeAdapter。**
