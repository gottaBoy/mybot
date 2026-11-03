# V2：研发工作区视觉提案

日期：2026-11-03。状态：任务/调用、Super-agent、Control Panel、计划修订与模型检查已做静态检查；等待用户视觉与交互评审，不是定版或业务实现。

## 查看

直接打开 [index.html](index.html)，不需要启动服务。默认进入任务工作区。

- [任务工作区截图](evidence/screenshots/desktop-task.png)
- [调用分析截图](evidence/screenshots/desktop-calls.png)
- [手机成果检查截图](evidence/screenshots/mobile-task-evidence.png)
- [Super-agent 截图](evidence/screenshots/desktop-super-agent.png)
- [Control Panel 截图](evidence/screenshots/desktop-control.png)
- [配置差异截图](evidence/screenshots/desktop-control-review.png)
- [计划修订截图](evidence/screenshots/desktop-plan.png)
- [修订影响截图](evidence/screenshots/desktop-plan-review.png)
- [模型检查截图](evidence/screenshots/mobile-model-inspection.png)

## 这轮改变

- 石墨色工作空间，薄荷绿主操作，验证失败保留独立红色语义。
- 桌面左侧推进任务，右侧同时检查候选代码与测试证据。
- 手机在工作记录和成果检查间切换，不把两栏缩小硬塞。
- 原始目标、执行计划可展开，优先保留当前协作与验证结果。
- 调用可筛选全部、失败、模型、工具；失败尝试关联具体详情。
- 成果页签支持键盘左右键、Home/End，手机导航关闭后恢复焦点。
- Super-agent 展示当前目标与下一步建议，Control Panel 只编辑下一次运行的本地草稿。
- 模型和资源调整可预览差异、撤销；非法值阻止预览，应用配置仍禁用。
- 保留筛选、成果面板、展开记录和返回位置，减少导航后重找上下文。
- “要求修改”带入 Run 02 的失败依据，编辑计划 v3 草稿并预览修订影响。
- 模型检查区分连接声明与验证状态，切换到远程样例配置时提示资料外发边界。
- 检查弹窗支持 Escape、焦点恢复和背景滚动锁定。

只有导航、筛选、静态详情和本地配置草稿等展示交互可用。真实模型调用、任务发送、审批、写入、配置应用与应用变更均禁用，所有数据是样例。草稿只在当前文档会话内保留，刷新重置。

## 范围与验证

任务、调用、协调、控制与计划修订是当前重点；其余画面共用视觉层并做渲染回归，不等于 23 个画面的完整用户体验均已通过评审。

[verify.mjs](verify.mjs) 检查 23 个画面、6 个视口和 19 条交互，包括修订校验、文字转义、模型提示、焦点、上下文保持和输入遮挡；实际结果见 [verification.json](evidence/verification.json)。没有外网请求、模型执行或后端接入。

```bash
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
CHROME_PATH=/path/to/chrome \
node design/review-v2/verify.mjs
```

新视觉位于 `studio.css`，协调与控制在 `control.css`，修订与模型检查在 `revision.css`。早期 `review.css` 保留，未删除 V1、文档或业务模块；视觉方向获认可后再整理样式层。

图标复用仓库内已保留的 Lucide 素材，许可见 `../review-v1/assets/LUCIDE-LICENSE`。不引入外部品牌或角色素材。

后续迭代、缺口和用户反馈见 [UI_ITERATIONS.md](../../docs/UI_ITERATIONS.md)。
