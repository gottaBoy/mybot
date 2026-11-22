# Fixed Workflow Versions: Isolated Browser Evidence

日期：2026-11-22。合同：[ADR-0023](../../../docs/decisions/ADR-0023-fixed-workflow-versions.md)。

这是固定 `local-research` Workflow W1-W5 的隔离浏览器验收记录。服务由一次性
`tests/browser_server.py` 启动，使用 `FakeProvider`；前端通过临时 Vite dev server 运行。
没有指向主 4180/5173，没有读取正式数据库，没有真实 Provider 请求、费用或外部
HTTP。脚本拦截了外部请求，最终 `externalRequests=[]`，`pageErrors=[]`。

最终报告：[verification.json](verification.json)。

- API `save → impact → publish` 通过。
- 桌面 Workflow 页面和已发布版本历史通过。
- UI 保存、影响检查、发布确认通过。
- 显式 Run 在发布 v2 后仍保留 v1 Workflow snapshot。
- CAS 冲突保留本地候选通过。
- 写入响应丢失后只用 GET 核对原回执通过。
- dirty navigation guard 保留候选并支持放弃修改通过。
- 390px 手机英文 Gothic 样式通过，未出现横向溢出。

截图：

- [workflow-desktop-zh.png](workflow-desktop-zh.png)
- [workflow-mobile-en-gothic.png](workflow-mobile-en-gothic.png)

报告中的八项检查均通过，生成时间为 `2026-11-22T04:44:15.514Z`，临时前端地址为
`http://127.0.0.1:5178/`。Chrome 视口检查不等于 Safari、物理手机或真实 IME
认证；本次报告也没有把它当作本机启用或正式部署证据。

当前仍属于实现进行中：本地服务尚未启用 Workflow，代码和文档尚未提交。更完整的
三样式/双模式浏览器矩阵、物理手机/真实 IME 和本机启用仍需单独处理；已有合同、
单测和隔离浏览器证据不替代这些生产事实。
