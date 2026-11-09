# Runtime Lab 预览

2026-11-08，独立于正式 `web/` 的原创交互预览。直接打开 [index.html](index.html)，不需要开发服务器或账号。

范围：

- 三组协议形状夹具：Codex、Pi、DeepSeek Harness。
- 五种预设场景：完成、取消、流中断、失败、工具请求被拒绝。
- 选择执行器、模拟播放/取消、标准与原始事件、预设结果、JSON 导出、能力矩阵和研究来源。
- 手机切换执行对比/事件检查；平板/桌面自适应。

**不是上游执行器或真实 P1 集成。** 页面没有 fetch、Provider、账号访问或生产写入；CSP 的 `connect-src 'none'` 阻止脚本连接网络。本地 JSON 导出只在用户点击后发生，刷新清空内存。

`fixture-runtime.js` 是浏览器与离线测试共用的演示状态机。源形状只选取已读协议片段，取消/失败/权限信号为明确的 fixture signal。DSH 使用示意 envelope，不声称已核验上游 wire schema。Pi 的 `agent_end` 不直接变成成功，示例等待 `agent_settled`。

界面中的历史“CLI 单次文本已验证”来自独立研究，不能当作本页调用或工作台适配器通过。模型请求/工具执行始终为零，用量为空，不伪造 tokens、价格或性能排名。

图标复用本仓库已有 Lucide 静态资产与许可；未复用 HuLa、Cindy 或其他产品 UI。

验证方法与结果见 `verify.mjs` 和 `evidence/verification.json`；截图是 mock 内容，不是真实模型产物或设备认证。
