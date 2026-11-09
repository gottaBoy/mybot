# T3 Code：控制面与本地 Harness 研究分解

日期：2026-11-08。用户指定 fork：`gottaBoy/t3code`。

## 身份与固定版本

- fork：`gottaBoy/t3code`
- parent/source：`pingdotgg/t3code`
- 固定观察 HEAD：`09a54f01bc0ae83865347a965ced50f8c8ec2953`
- GitHub metadata：fork，MIT license。
- README 定位：agent harness control surface；通过本机已经登录的 Claude Code、Codex、Cursor、Grok Build、OpenCode、Antigravity、fx 控制多种 Harness，并提供 Web、手机和 Electron 客户端。
- 本轮只读 README/LICENSE/官网资料与 Git metadata；未安装、未执行 `t3`、未读取 CLI credential store、未调用模型。

## mybot 可借鉴

| T3 Code 机制 | mybot 采用方式 | 保留边界 |
| --- | --- | --- |
| 多 Harness 控制面 | `HarnessPort` / `HarnessBinding`，一个 Run 固定一个执行权威 | 不把 T3 UI 或服务当事实源 |
| 复用 CLI 登录 | Codex/Claude 等 CLI adapter 只调用已配置的 CLI | 不读取/复制 OAuth、API key、keyring 或配置文件 |
| 手机/浏览器控制 | 后续 DeviceSession/Command | 先 HTTPS/私网/Headscale，再做真机 |
| 分支/PR 工作流 | 后置 Action/Artifact/Review | 当前只读阶段不执行 Git 写入或发布 |
| Harness 切换 | 新一轮 Run 选择新 adapter，记录上下文重建 | 不承诺跨 Harness 活进程迁移 |

## 本地默认模型/认证策略

1. 显式环境模型：`WORKBENCH_MODEL_<NAME>_KEY` + endpoint 可作为已配置模型，启动时可标记为可用但不发请求。
2. CLI Harness 发现：只检测 `codex`、`claude`、`opencode` 等可执行文件是否存在，状态显示“已发现，认证未验证”；不访问 credential store。
3. 默认选择：由用户在“连接与 Harness”中显式选择并持久化；不能因为可执行文件存在就自动产生模型请求。
4. Codex API key：若用户显式设置专用 `WORKBENCH_MODEL_CODEX_KEY`，可配置 OpenAI-compatible Provider；若使用 `codex login`，走 CLI adapter，不导出 key。
5. 连接检查、模型探测和记忆辅助调用必须显式显示、计入预算，或关闭。

当前工作台支持通过 `WORKBENCH_DEFAULT_MODEL_ID` 指定已保存模型配置为默认选择；本地 CLI 发现只返回“可执行文件存在/认证未验证”，不会自动产生请求。

当前模型设置 UI 已明确区分：

- 本地 Harness：Codex CLI 等可执行文件发现，认证未验证。
- 模型连接：OpenAI-compatible endpoint/key_env 配置。

Codex CLI 尚未成为 Workbench 执行器；后续需显式启用 Adapter，复用 CLI 登录态但不读取/复制 credential store。

当前已完成最小 Codex Adapter：模型设置页的“启用 Codex Adapter”只创建 `codex_cli` 配置，不发请求；Run 明确启动后调用 `codex exec --json --ephemeral --sandbox read-only --skip-git-repo-check`。Adapter 不执行 Shell/写入授权，不导出凭证。真实 Codex Run 仍需用户显式确认，当前测试只验证配置/路由，未自动发真实模型请求。

可靠性边界：每个 CLI 调用独立进程组，取消/超时 kill 进程组并限时等待；默认超时 90 秒，可用 `WORKBENCH_CODEX_TIMEOUT_SECONDS` 调整到 10–300 秒。失败 Run 最多允许两次失败/中断重试，避免无限重放和费用累积。Codex 多研究任务自动单通道，不与同一 CLI 登录态并发。

## REA 路线

取得官方 release/desktop package 后，固定版本/hash，inventory Electron/CLI/remote-control，使用 fake CLI/无账号场景 capture 启动、列出 Harness、创建会话、断线、撤销和停止。网络仅专用 mock；不连接真实 Provider、GitHub、手机或远程服务。

决策：**控制面/本地 Harness 参考，非 mybot 事实源；不直接复制 T3 Code。**
