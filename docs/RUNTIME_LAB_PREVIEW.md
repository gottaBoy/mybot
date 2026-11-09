# Runtime Lab 可交互预览

日期：2026-11-08。用户要求继续并可预览。

**入口：[design/runtime-lab/index.html](../design/runtime-lab/index.html)。** 直接本地打开，不需要新增服务或模型账号。

现有真实工作台在本轮检查时 `http://127.0.0.1:4180/healthz` 正常。新页面没有接到该应用 API，不读写 `.runtime/`，也不是其执行器配置已经上线。

## 1. 本轮交付

- 原创工作面：Codex、Pi、DeepSeek Harness 三组并列夹具及事件检查器。
- 可切换完成、取消、中断、失败、拒绝工具五种预设场景；支持手动停止、选择执行器、任务目标编辑和本地 JSON 导出。
- 标准事件、原始夹具、预设结果三个可用页签，含键盘方向键切换。
- 能力/权限矩阵和研究证据视图，将文档、本地证据、工作台接入分开。
- 平板、桌面与手机布局；手机切换执行对比/事件检查。
- `fixture-runtime.js` 与 Node 离线测试共用，包含终态锁定、去重、合法状态转换及取消后的迟到记录不重放。

没有新增依赖，没有借用外部产品 UI，没有删除 V1/V2 样式。图标复用本仓库已有 Lucide Static 资产与许可。

## 2. 必须保留的证据边界

1. 全部播放数据在浏览器内存中，是预设夹具，不是上游运行、模型生成或性能对比。
2. 页面没有 fetch/WebSocket/账号读取；CSP 指定 `connect-src 'none'`。导出只在用户主动点击时生成本地 JSON。
3. 三组夹具按选定协议形状展示；失败/取消等使用明确的 fixture signal。DSH envelope 是示意，不宣称 wire schema 已验证。
4. Pi 的 `agent_end` 不直接变成成功，夹具等待 `agent_settled`。这验证本地规则，不验证整个 Pi 的当前实现。
5. 模型请求/工具执行为零，用量始终为空；不伪造 tokens、价格、已应用配置或“已跑通 Pi/DSH”。
6. 来源中 Codex 的“一次独立文本已验证”是历史独立证据；不是本页调用，也不说明工作台适配器完成。
7. 视口模拟不是手机、Pad、Safari、Windows 或 Linux 原生应用验收。

## 3. 实际验证

| 范围 | 本轮结果 |
| --- | --- |
| Node 夹具状态机 | 24 项通过，含三执行器五场景、去重、取消/迟到终态、Pi settled 与异常顺序 |
| 浏览器 | 6 视口、13 交互组通过，控制台/外部页面请求均为空 |
| Python 回归 | 115 项通过，原 Starlette/httpx 弃用提醒保留 |
| 静态检查 | JS 语法与 `git diff --check` 通过 |
| REA | 捕获本地 Node 夹具测试，退出 0，主进程组 verified，临时根 removed |

浏览器报告：[verification.json](../design/runtime-lab/evidence/verification.json)。

截图：

- [桌面对比](../design/runtime-lab/evidence/desktop-comparison.png)
- [手机对比](../design/runtime-lab/evidence/mobile-comparison.png)
- [手机结果检查](../design/runtime-lab/evidence/mobile-inspector.png)
- [研究记录](../design/runtime-lab/evidence/desktop-research.png)
- [能力边界](../design/runtime-lab/evidence/desktop-capabilities.png)

## 4. REA 证据

完整文件：[rea-fixture-tests.json](../design/runtime-lab/evidence/rea-fixture-tests.json)。

Evidence ID：`ev_e6d5a100450b0adc6d60eaead5c79ef7966a5d91209f3004e9a7bce6c9cb1bd7`。

本轮用 REA 6.8.0 `capture-process` 包装固定 Node 的本地 `--test` 命令，并对 `fixture-runtime.js`、`test_runtime_preview.cjs` 做前后文件快照；两个文件 hash 与测试源绑定。它不是 Pi/Codex/DSH 产物的 S1，也没有捕获真实模型流或认证信息。

REA 保留的局限包括：进程采样、无法原子证明可执行文件绑定、未记录继承环境、未观察网络。调用 REA 时提供了空 HOME 与最小环境；该调用条件不消除 Evidence 自身声明的 unknown。

## 5. 复现

```bash
node --test tests/research/test_runtime_preview.cjs
node --check design/runtime-lab/lab.js

PLAYWRIGHT_MODULE=/path/to/playwright-core/index.mjs \
CHROME_PATH=/path/to/chrome \
node design/runtime-lab/verify.mjs

.venv/bin/python -m pytest -q
```

浏览器脚本使用 `file:` 入口，不启动开发服务器；自动阻断并记录页面的 HTTP(S) 请求。截图/报告是本次本地 mock 的回归材料，自动通过不代表用户认可视觉。

## 6. 下一步

先由用户预览任务密度、状态词和手机检查流程，再把确认过的最小事件/权限/取消契约迁入真正 RuntimeAdapter 的设计与 mock 接入。不能把这个独立设计页直接改名为生产执行器，也不能因用户点击“播放 Mock”而发起收费调用。
