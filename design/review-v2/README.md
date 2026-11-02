# V2：研发工作区视觉提案

日期：2026-11-02。状态：两个关键画面已重做、已做静态浏览器检查；等待用户视觉与交互评审，不是定版或业务实现。

## 查看

直接打开 [index.html](index.html)，不需要启动服务。默认进入任务工作区。

- [任务工作区截图](evidence/screenshots/desktop-task.png)
- [调用分析截图](evidence/screenshots/desktop-calls.png)
- [手机成果检查截图](evidence/screenshots/mobile-task-evidence.png)

## 这轮改变

- 石墨色工作空间，薄荷绿主操作，验证失败保留独立红色语义。
- 桌面左侧推进任务，右侧同时检查候选代码与测试证据。
- 手机在工作记录和成果检查间切换，不把两栏缩小硬塞。
- 原始目标、执行计划可展开，优先保留当前协作与验证结果。
- 调用可筛选全部、失败、模型、工具；失败尝试关联具体详情。
- 成果页签支持键盘左右键、Home/End，手机导航关闭后恢复焦点。

只有画面切换、筛选和静态详情等展示交互可用。真实模型调用、任务发送、审批、写入与应用变更均禁用，所有数据是样例。

## 范围与验证

任务与调用是本轮重点；其余画面共用新视觉层并做渲染回归，不等于 18 个画面的完整用户体验均已通过评审。

[verify.mjs](verify.mjs) 检查 18 个画面、6 个视口和 9 条交互；实际结果见 [verification.json](evidence/verification.json)。没有外网请求、模型执行或后端接入。

```bash
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
CHROME_PATH=/path/to/chrome \
node design/review-v2/verify.mjs
```

新视觉位于 `studio.css`。早期 `review.css` 已恢复并保留，未删除 V1、文档或任何业务模块；后续在视觉方向获认可后再整理样式层。

图标复用仓库内已保留的 Lucide 素材，许可见 `../review-v1/assets/LUCIDE-LICENSE`。不引入外部品牌或角色素材。

后续迭代、缺口和用户反馈见 [UI_ITERATIONS.md](../../docs/UI_ITERATIONS.md)。
