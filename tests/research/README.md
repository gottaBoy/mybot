# 上游研究探针

这些脚本只用于隔离研究，不随 mybot 应用启动，也不是生产执行器。

- `guard.py`：Linux Landlock ABI 6+/libseccomp，白名单文件访问、干净环境、指定监听端口、拒绝全部出站连接；不支持则停止。
- `guard_selftest.py`：合成文件/网络探针，不读取真实凭证。
- `verify_omb_p0.py`：固定包完整性、启动、匿名访问边界、降低权限及配置重启检查。只改临时夹具元数据，不发送模型提示。
- `capture_omb_p0.py`：使用固定 REA `6.8.0` 的 `capture-process` 记录探针与报告文件。
- `verify_omb_mcp.py` / `capture_omb_mcp.py`：固定 OpenMausBot 发布包的 MCP/会话复用探针与 REA capture；通过隔离 bridge 和合成 ACP 验证 Bot/Task/Message/Wait/Cancel/Restart，只发合成标记，无真实模型请求。
- `omb_mcp_bridge.mjs` / `mock_acp.py`：仅研究用 stdio/HTTP bridge 与 ACP peer；mock 回执带 `fixture_only`，不是生产适配器。
- `test_omb_mcp_probe.py`：27 项离线 bridge 路由/ACP 夹具测试，不启动上游。
- `omb_permission_functions.mjs`：只加载固定发布包中的权限/运行时纯函数，验证默认、委派、Ask grants 和 Bot API fence；不启动服务。
- `readonly_ceiling.py` / `test_readonly_ceiling.py`：mybot 研究用的独立 capability ceiling 合同；只读内存 fixture，不是生产执行器。
- `codex_text_smoke.py`：明确授权才提交一次文本 turn；默认只预检，使用本机 CLI 认证，不复制密钥。离线测试是 `test_codex_text_smoke.py`。
- `test_runtime_preview.cjs`：独立 Runtime Lab 的 24 项本地夹具测试；不加载任何上游或 Provider，REA 证据另在 `design/runtime-lab/evidence/`。
- `evidence/`：本轮公开包与合成测试结果，不能冒充实际用户 Agent 运行。

最新权限探针 Evidence 在 `evidence/permissions-v4/`；`ask-default`、`ask-default-v2`、`ask-default-v3` 保留但不作为最终结论。v3 的“拦住 Full”实际使用了无效的顶层字段；v4 补测 `settings.approvalMode` 和 `useDefaults:false` 后已撤回该推论。

运行本地研究合同：

```bash
.venv/bin/python -m pytest -q tests/research/test_readonly_ceiling.py
```

仅检查所选上游权限函数：

```bash
"$NODE_24_22_1" tests/research/omb_permission_functions.mjs "$OMB_PACKAGE_DIR"
```

推荐直接使用 `capture_omb_p0.py`：它在 guard 内检查原函数、HTTP 元数据和正常退出，并经 REA 保存报告。测试夹具可临时设为 Full 以复核返回值，但无模型选择、无出站、无工具；结束前统一降回 Ask。新 Evidence 目录不得覆盖既有报告。REA 自身退出 0 不代表探针通过，wrapper 也会检查被捕获进程退出码。

运行方法与限制见 [P0 结果](../../docs/OPENMAUSBOT_P0_RESULTS.md)。

注意：测试服务按需启动并在脚本内关闭。退出 0 仅表示探针流程完成，最终采用结论必须读取 `p0_verdict`；当前 `ask_first_default=false`，未通过底座门槛。

MCP 复用证据在 `evidence/omb-mcp-v1/`（35 项）和 `evidence/omb-mcp-v2-fixed-default/`（38 项）。后者保存合成默认模型，增加启动/实例读取/干净重启无额外 prompt 的对照；不覆盖 SSE、手机、实时审批、多 Agent delegation、原生 MCP 网络调用或真实 Provider。REA 的 `unverified_processes` 与网络 unknown 保留；[完整结果和复现](../../docs/OPENMAUSBOT_MCP_REUSE_RESULTS.md)。

2026-11-07 用户单独授权的一次本机 Codex 文本测试已经完成。该授权已用完；不得让 pytest、REA 或研究脚本自动重跑真实模型。[结果与权限范围](../../docs/CODEX_ACCOUNT_SMOKE.md)。
