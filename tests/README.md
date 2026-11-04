# 实现验证

## 后端

```bash
.venv/bin/pip install -r requirements.lock
.venv/bin/python -m pytest -q
node --check web/app.js
```

测试使用临时目录/SQLite、FakeProvider 和 HTTPX MockTransport，不发送外部模型请求。覆盖文件与凭证边界、发送确认、幂等、角色路由、调用计量、部分失败、截断、暂停/取消/续跑、重启与访问控制。

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

结果写入 [evidence/browser.json](evidence/browser.json)，截图的“测试输出”是夹具，不是模型回答质量证明。
