# 本机 Codex 认证最小验证

日期：2026-11-07。用户明确同意沿用本机现有 Codex 配置，发起一次最小文本测试，不改代码、不调用工具。

## 1. 结果

**本机 CLI 的既有 API Key 认证与配置可完成文本请求；没有复制凭证到 OpenMausBot 或 mybot。** 这不是 ChatGPT 订阅登录，也不是 OpenMausBot 已接通真实模型的证明。

脱敏报告：[codex-text-smoke-2026-11-07.json](../tests/research/evidence/codex-text-smoke-2026-11-07.json)。

| 项目 | 实际观察 |
| --- | --- |
| CLI | 本机 `codex`，此前 `--version` 为 `0.154.0` |
| 认证 | 此前官方 `codex login status` 显示 API Key；原始输出不保留，不直接读取/复制认证文件 |
| 模型 | 保留 CLI 配置的 `gpt-6.1-sol`；是本地配置名称，不是供应商返回模型/身份认证 |
| 提交范围 | 1 次 `turn/start`，无自动补发、无工具结果续跑 |
| 用户文本 | `Reply with exactly MYBOT_ACCOUNT_OK. Do not call tools or access any files.` |
| 最终正文 | `MYBOT_ACCOUNT_OK` |
| 状态与时间 | completed，约 8041 ms |
| CLI 可见用量 | input 2707、output 8、total 2715；cached input 0、reasoning output 0 |
| 工具事件 | 0；只观察到 userMessage/agentMessage |
| 清理 | App Server 退出码 0，已停止 |

未附加项目文件。实际输入用量还包含 Codex 协议/系统上下文，不能把上述短句字数等同整个请求的 tokens。报告不保存内部推理正文、供应商地址、密钥、账号标识或原始 stderr。

**计量限制：** 只证明本机配置的连接可用；不识别/担保最终供应商或底层模型，不估算价格，不证明账单费用为零。CLI 报告的 tokens 不是结算账单；没有独立网络抓包，无法把“一个 turn”扩大为底层 HTTP 请求数量已认证。

## 2. 执行方式

[codex_text_smoke.py](../tests/research/codex_text_smoke.py) 通过官方 App Server stdio 协议，由 Codex 自己使用本机认证：

1. 初始化与 `config/read`，不导出配置正文，只提取当前模型、Provider 配置是否存在和 MCP 名称用于关闭。
2. 使用空临时目录、ephemeral thread、read-only sandbox、`approvalPolicy=never`；不写生产工作区，不恢复已有会话。
3. 关闭 Shell/统一执行、MCP、插件/hooks、Apps、浏览器、图片、电脑控制、子 Agent 等集成，网页搜索关闭；不自动换模型。
4. 将选定 Provider 的 `request_max_retries` 和 `stream_max_retries` 设为 0，关闭无界重试。
5. 只有显式 `--allow-one-request` 才提交一个 turn；否则只做不启动模型 turn 的预检。
6. 遇到工具/审批请求拒绝并结束；遇到任何非文本 item 或错误结束，不发第二次提示。
7. 只保存固定测试正文、事件类型、可见用量、状态和清理结果；原始协议内容和 stderr 不写报告。

这是用于一项已授权连通性验证的 CLI 客户端，不是生产安全执行器；它没有沿用 P0 的“拒绝全部出站”guard，模型网络请求由现有 CLI 正常配置处理。不宣称动态检测工具事件能代替执行器沙箱或对所有工具提供先于执行的强制门禁。

没有将现有凭证以环境变量、字符串或文件传给 OpenMausBot。后续如需 adapter，应由同一个受信任 CLI 宿主保管认证，不把管理口和秘密暴露给第三方 Agent。

## 3. 预检修订

测试前有两次预检停在 initialize，没有提交 `turn/start`。本机首次指定临时 `sqlite_home`/`log_dir` 的配置组合未能在预检期限内初始化；取消这两个覆盖后成功。没有充分证据判定具体原因，也没有修改本机 Codex 配置文件。

两次失败预检与一次成功预检都未启动模型 turn，不能把它们计作已执行模型请求，也不能说做了多次付费重试。唯一获授权的模型 turn 随后成功，未再发请求。

## 4. 后续复现边界

离线协议测试可直接运行，不调用模型：

```bash
.venv/bin/python -m pytest -q tests/research/test_codex_text_smoke.py
```

默认预检不会提交模型 turn：

```bash
python3 -I tests/research/codex_text_smoke.py \
  --report /tmp/mybot-codex-preflight-new.json
```

真实请求必须重新取得用户明确授权，使用新报告路径，再传 `--allow-one-request`。本轮“一次”授权已经使用，不能因复现、修改脚本、REA 分析或继续研究而自动再调用。

现有报告文件不覆盖；wrapper 在网络请求前以排他方式占用报告路径。不要把这份成功记录当成后续调用的无限授权。

## 5. 来源

本轮先查官方文档，再核对本机 `codex exec --help`、`features list`、`app-server --help` 与本机生成的协议 schema。文档用于理解接口，本机脱敏报告才是调用证据。

离线协议测试 11 项通过；全套 Python 测试 115 项通过，保留原 Starlette/httpx 弃用提醒。测试未重复真实调用。该脱敏报告是直接 CLI 验证，不冒充 REA Evidence 或 OpenMausBot P1 验收。

```text
https://developers.openai.com/codex/auth/
https://learn.chatgpt.com/docs/app-server
https://learn.chatgpt.com/docs/config-file/config-reference
```
