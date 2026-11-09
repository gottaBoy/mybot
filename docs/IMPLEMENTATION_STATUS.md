# 实现进度与平台范围

更新日期：2026-11-09。

当前：用户已授权实现，第一条只读研发调研闭环；不是完整团队交付平台。

架构方向：见 [ADR-0005](decisions/ADR-0005-modular-domain-architecture.md)。当前以模块化单体实现，LocalSuperagentHarness 已抽离固定只读编排；领域边界和中英文资源将增量落地，不做一次性企业 DDD 重写。

## 1. 已实现

| 能力 | 本轮实际行为 |
| --- | --- |
| Agent Work 可视化 | Run detail 返回 `local-superagent` 阶段事实；真实 Web 提供 Agent Work 列表、Planning/Research/Synthesis 阶段图和事实边界 |
| 本地 Harness/默认模型发现 | Bootstrap 仅检测 `codex`/`claude`/`opencode`/`t3` 可执行文件；默认模型可在 UI 设为工作区设置或由 `WORKBENCH_DEFAULT_MODEL_ID` 指定；不读取凭证或自动调用 |
| Codex CLI Adapter | 显式“启用 Codex Adapter”创建 `codex_cli` 模型配置；调用使用临时隔离 cwd、`--ignore-user-config`、`--ignore-rules`、禁用项目文档加载、ephemeral/read-only；认证由 Codex CLI 管理；单通道失败不会启动排队中的下一个研究调用 |
| Backend/Conversation 只读合同 | 持久化 `BackendConnection`/`ConversationRef`，提供只读列表 API；隔离 MockTransport Adapter 已支持健康检查、通用/观察到的 OpenMausBot 只读路径、消息映射和错误映射，并固定研究 commit；未接入真实 OpenMausBot 网络或发送 |
| 项目 | 名称、目标、相对目录、允许发送的项目资料 |
| 模型 | 本地/远程 Chat Completions 配置；密钥只引用服务端环境变量 |
| 任务 | 目标、验收要求、最多 10 个显式源码文本文件 |
| 发送确认 | 预览实际资料快照与发送端点，hash 校验防止预览后内容变化 |
| 协调 | Super-agent 生成 1–2 个受限只读研究子任务 |
| 分工 | 规划、研究、汇总可选不同模型；最多两个研究任务并行 |
| 持久运行 | 单机 SQLite 保存运行、计划、Agent、调用、成果和事件 |
| 控制 | 阶段边界暂停、继续、本机请求取消、明确重跑成本确认；失败/中断/暂停可进入独立“重试与资源”流程，调整未完成步骤的模型、预算、并行、时限和输出上限 |
| 追踪 | 运行 → Agent → 模型调用；状态、时间、尝试、用量与缺失 |
| 成果 | 研究中间产物、最终方案、文本下载、人工接受/要求修改记录 |
| 安全边界 | 默认本机监听；远程令牌、Host 白名单、Origin/自定义请求头检查 |
| 响应式 UI | 真实 API 驱动，手机工作/成果切换，桌面并列检查 |

UI 没有静态演示任务、伪造 Token、占位测试结果或假在线模型。没有配置真实模型时，从空工作区开始。

## 2. 刻意未实现

- Shell、代码编辑、Git 提交/PR、测试执行与部署。
- 浏览器操作、自动联网搜索、文件夹自动扫描或手机文件上传。
- 任意动态 DAG、递归子 Agent、跨 Agent 消息群聊。
- DeepSeek Harness / OpenHands 等运行时接入。
- Token 流式输出、复杂耗时瀑布图、价格计费和学习型模型路由。
- Codex App Server 的真实 Provider 验收、跨版本协议兼容和断线恢复。
- 团队成员、项目级多用户权限、SSO 与公网生产部署。
- 原生 macOS/Linux/Android/iOS 应用、PWA 离线模式与后台推送。
- 项目/模型配置编辑删除、成果内容编辑和自动按修改意见重新规划。

“未执行测试”必须保持可见，人工接受方案也不能将它改成“测试通过”。

## 3. 平台矩阵

| 平台 | 客户端方案 | 本轮证据 |
| --- | --- | --- |
| Linux 桌面 | Chrome/现代浏览器访问 Web | 本机 Chrome 完成端到端 |
| macOS | Safari/Chrome 访问同一 Web 服务 | 响应式设计，无 Mac 真机验收 |
| Android | Chrome 等浏览器 | 390px 尺寸模拟，无 Android 真机验收 |
| iPhone | Safari 浏览器 | 320px/390px 尺寸模拟，无 iOS Safari 真机验收 |
| 平板 | 浏览器，单列/双列自适应 | 768px/1024px 尺寸检查 |
| 执行服务器 | Python 3.11+，本轮 Linux；POSIX 文件边界和进程锁 | Python 3.12/Linux 测试；Mac 服务端尚未验收 |

尺寸模拟不等于设备/操作系统兼容性认证。后续需要 Safari、触摸键盘、安全区和实际网络重连测试。

手机浏览器只提供操作界面，模型和上下文处理发生在服务器。手机输入的项目路径属于服务器工作区，不是 iPhone/Android 本机目录。

关闭浏览器不会取消后台任务；服务器进程停止会中断运行，重启后需要手动确认恢复。没有承诺手机后台常驻、离线工作或浏览器推送。

## 4. 上下文、凭证与访问边界

- 服务器 `WORKBENCH_WORKSPACE` 是目录上界，默认本仓库。
- 项目路径不能越界、经过符号链接或进入隐藏/敏感目录。
- 仅读取明确列出的文本，单文件最多 32 KiB，总文件内容最多 64 KiB。
- 隐藏文件、已识别的凭证命名、`node_modules` 等受限目录、二进制、特殊文件和符号链接拒绝读取。
- 这些不是完美的秘密识别：用户仍需检查显式选择文件和资料的内容。
- 发送预览与启动时 hash 不一致会拒绝，要求重新确认。
- 密钥变量名须为 `WORKBENCH_MODEL_<NAME>_KEY`；密钥值不存数据库、不返回浏览器。
- 原始模型内部思维链不采集；模型正文输出与用户确认过的上下文会作为成果/快照保存于私有数据目录。
- Codex 不在用户仓库 cwd 中启动；每次调用使用临时空目录，避免自动加载仓库 `AGENTS.md` 或其他隐式规则。用户确认的快照仍通过显式 prompt 发送。
- 数据目录权限 700，SQLite 文件权限 600；本轮不提供加密存储。

## 5. 运行控制口径

- 运行排队、执行、暂停请求、已暂停、取消请求、已取消、失败、中断、完成分别记录。
- 暂停是阶段边界暂停，可能等待当前多个只读调用结束。
- 取消只中断本机请求；远端可能已接收并产生费用，因此中断用量保持未知。
- 服务重启将未完成 Run/调用标记中断，不自动重发模型请求。
- 手动继续会复用已完成阶段，但未完成请求可能重跑，必须确认费用与预算。
- “重试与资源”创建新的关联 Run：来源快照、历史调用和成果只读保留；已完成 Agent/Artifact 可复制引用，不计入新调用；只为未完成步骤预留新增预算。来源 Run 不会被改写。
- 调用总数包含所有尝试。时间上限针对一次连续执行段，暂停/恢复后重新计时；不是跨多次恢复的累计硬上限。
- 同一数据目录只允许一个活动服务进程，通过文件锁防止多个 Worker 重放任务。
- 事件为追加审计/追踪记录，不是不可篡改证明。
- “要求修改”只保存人工决定，不会触发付费调用；后续运行仍需显式创建并确认发送。

## 6. 模型兼容范围

请求是 OpenAI-compatible `POST <base>/chat/completions`，带 `model`、`messages`、`max_tokens`、`stream:false`。响应需提供 `choices[0].message.content` 字符串；用量缺失保留未知。

不保证所有服务都支持该参数和字段，尤其供应商专有 API、Reasoning 参数、工具协议或 Responses API。首次先配置并主动测试，测试请求只验证可达和基本文本，不证明工具能力。

输出截断、无内容、错误 JSON、超时和 Provider 非 200 都保留失败，不能改成生成成功。不自动重试、跳转或跨 Provider 回退。Codex 超时会保留脱敏的事件数、最后事件类型和部分正文标记，不保存原始 stderr/响应或凭证。仅有效 `turn.completed.usage` 才计入 CLI 用量；未知不填零。

App Server 草稿未通过最终协议/能力边界复核，已撤回生产入口，不提供可启用的长驻通道。复盘与分步门槛见 [Codex 可靠性方案](CODEX_RELIABILITY_PLAN.md)。当前 CLI 的无工具强制上限和输出 Token 硬上限尚未验收，不把只读沙箱称为完全无工具执行器。

## 7. 验证与未验收事项

最新真实执行：2026-11-09 用户授权的 Codex 关联重试 `49acc6c258094a2794b153a6b6629800` 已完成两项研究与汇总，规划复用，3 次新增调用、3 份待审查成果，约 325 秒。证明当时配置下的真实文本闭环可完成；不代表本次新增隔离实现、Backend Adapter 或工具 ceiling 已做真实账号/模型验收。详细用量和边界见 [进度记录](PROGRESS_LOG.md)。

- 后端测试：完整 Python 回归 195 项通过；保留 Starlette/httpx 弃用提醒。
- 协议测试使用 HTTPX MockTransport；后台流程使用仅测试可注入的 FakeProvider。
- 浏览器：`tests/verify-live.mjs` 创建临时服务器与临时 SQLite，以 FakeProvider 验证 UI→API→Worker→数据库，不访问外部模型。
- 浏览器检查报告：[browser.json](../tests/evidence/browser.json)。
- 本轮 Chrome 五种尺寸与六组流程通过，包括登录/退出、角色/调用/成果检查、审查持久化、手机导航和表单；没有浏览器外网请求。
- [桌面截图](../tests/evidence/live-desktop.png)、[手机尺寸截图](../tests/evidence/live-android-size.png)的内容均为明确测试夹具，不是真实模型质量证明。

尚未完成：隔离 cwd 变更后的真实 Codex 回归、OpenMausBot 固定 fork 真实接入/原生认证、SSE replay 和运行中恢复、本地 GPU 模型兼容性、Safari、设备真机、断电一致性/压力测试、TLS 反向代理、团队权限与生产安全审计。

当前 TestClient 依赖产生一条 Starlette/httpx 迁移提醒；本轮测试能运行，不隐瞒该依赖警告，也不在这一轮更换协议客户端。

启动与测试复现见 [README](../README.md)、[测试说明](../tests/README.md)。默认服务只绑定 `127.0.0.1:4180`，手机不能直接使用这个回环地址连接服务器。

本机服务已实际启动并通过健康检查，正式数据目录有用户运行记录；不再是空工作区。没有将测试夹具或静态设计写入正式数据目录。远程访问与 HTTPS 代理没有启用。
