# 实现验证

上游研究探针独立于业务测试，见 [research/README.md](research/README.md)。OpenMausBot P0 不使用生产数据、不发送模型请求；REA 完整证据与底座采用结论分开记录。

Runtime Lab 的预览验证独立运行：`node --test tests/research/test_runtime_preview.cjs`，浏览器入口 `design/runtime-lab/verify.mjs`。它只测试本地夹具，不自动启动或调用任何上游执行器，结果见 [预览记录](../docs/RUNTIME_LAB_PREVIEW.md)。

## 后端

```bash
.venv/bin/pip install -r requirements.lock
.venv/bin/python -m pytest -q
node --check web/app.js
```

测试使用临时目录/SQLite、FakeProvider 和 HTTPX MockTransport，不发送外部模型请求。覆盖文件与凭证边界、发送确认、幂等、角色路由、调用计量、部分失败、截断、暂停/取消/续跑、重启与访问控制。

Codex 故障测试只运行临时 fake CLI，覆盖事件用量、超时、取消、输出限额、临时文件/读取任务清理、共享单通道、临时隔离 cwd/忽略 AGENTS 规则，以及恢复时复用已完成研究。不会执行本机真实 Codex。

重试测试覆盖来源快照 hash、显式重放确认、最低新增预算、角色模型重新分配、来源 Run 不变、幂等请求、活动运行互斥和服务重启后的 lineage；不会自动发起真实 Provider 重试。

`tests/test_backend_service.py` 通过 MockTransport 检查配置/GET 无网络、显式 POST consent、
公共 health 不代表认证、回环地址限制、拒绝重定向/超大响应/慢流、幂等撤销和在途竞争。
不读取凭证、不连接上游服务；`tests/test_work_items.py` 校验 119 个编号及统计口径。
`tests/test_conversation_sync.py` 覆盖读取前确认、原生字段/hasMore、当前连接参数、
默认生产禁用、撤销阻断缓存/Bootstrap/写回、失败不污染旧缓存、重复去重和重新验证 origin。

本轮存在一条 Starlette TestClient/httpx 迁移警告，非测试失败；尚未迁移 httpx2。

## 浏览器

需要 Node.js、Playwright 和本机 Chrome。测试工具可安装在仓库之外：

```bash
npm install --prefix /tmp/mybot-browser-tools playwright@1.56.1
PLAYWRIGHT_MODULE=/tmp/mybot-browser-tools/node_modules/playwright/index.mjs \
CHROME_PATH=/usr/bin/google-chrome \
node tests/verify-live.mjs
```

`TEST_PORT` 默认 4182，冲突时显式指定空闲端口。脚本创建临时测试服务与数据目录，注入仅测试可用的 FakeProvider，结束后关闭服务；不会调用真实模型，不使用生产 `.runtime/`。

检查包括创建项目/模型、预览并启动运行、Agent/调用/审计/成果、展开状态、审查持久化、手机导航和表单、令牌登录/退出/重新登录。尺寸为 1440/1024/768/390/320px，不是真机或 Safari 兼容性认证。

超时诊断流程使用 BrowserProvider 固定故障夹具，检查 API 持久化和 320/1440px 弹窗，不是一次真实 Codex 超时。

Backend 表单、显式健康检查、撤销及刷新状态使用 MockTransport，新增截图为 backend-desktop/mobile；
不代表用户真实 OpenMausBot。新增 conversation-desktop/mobile 截图均为合成数据，
完整报告新增一条完整读取/缓存流程；不将旧 14 条交互误认为已测试这条流程。

结果写入 [evidence/browser.json](evidence/browser.json)，截图的“测试输出”是夹具，不是模型回答质量证明。
