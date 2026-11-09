# 上游项目 Clone、REA 与适配实现手册

记录日期：2026-11-07。版本：v0.1。

本文是 OpenMausBot、Cindy、nanoMuse、QwenPaw 以及后续第三方工具的可重复研究和适配方法。命令默认在仓库外的临时/缓存目录运行，不把上游源码、依赖、凭证或运行数据写入 mybot。

## 1. 基本原则

1. **固定身份**：记录仓库 URL、commit、许可证、阅读路径和证据等级。
2. **隔离目录**：上游源码放到 `/tmp` 或用户明确指定的缓存目录，不使用现有 `~/.openmausbot`、兄弟项目运行目录或凭证目录。
3. **不执行安装脚本**：首次研究使用 `--no-checkout`、`--filter=blob:none` 和 `npm_config_ignore_scripts=true`；只有 P0 明确需要时才安装依赖。
4. **REA 选择性使用**：完整源码仓库用 `git`, `rg`, `git show`；发布包、ASAR、Electron 静态产物和需要运行时证据时使用 REA。
5. **不复制整套产品**：借鉴协议、状态机和不变量；不复制 UI、品牌、私有数据库、官方云 API 或未公开身份服务。
6. **先记录再接入**：保存配置、建立连接、真实测试、能力验证和业务执行必须是不同状态。

## 2. 通用 Clone 方法

以下脚本只创建源码快照，不安装依赖、不启动服务。把 `COMMIT` 替换为台账中的固定值。

```bash
set -eu

ROOT="${MYBOT_UPSTREAM_ROOT:-/tmp/mybot-upstreams}"
NAME="project-name"
URL="https://github.com/owner/repository.git"
COMMIT="0123456789abcdef0123456789abcdef01234567"
DIR="$ROOT/$NAME-$COMMIT"

mkdir -p "$ROOT"
git clone --filter=blob:none --no-checkout "$URL" "$DIR"
git -C "$DIR" fetch --depth=1 origin "$COMMIT"
git -C "$DIR" checkout --detach "$COMMIT"

test "$(git -C "$DIR" rev-parse HEAD)" = "$COMMIT"
git -C "$DIR" status --short
git -C "$DIR" show --stat --oneline --decorate HEAD
git -C "$DIR" ls-tree -r --name-only HEAD | head -100
```

若上游不允许按 hash 直接 fetch，使用其 tag 或默认分支得到版本后记录实际 `git rev-parse HEAD`；不能把移动的 `main` 写成稳定证据。

### 2.1 当前四个项目

```bash
ROOT="${MYBOT_UPSTREAM_ROOT:-/tmp/mybot-upstreams}"
mkdir -p "$ROOT"

git clone --filter=blob:none --no-checkout \
  https://github.com/milind-soni/OpenMausBot.git \
  "$ROOT/OpenMausBot-1bc4749aa8307d7d6998bf86de4ef6478460dd93"
git -C "$ROOT/OpenMausBot-1bc4749aa8307d7d6998bf86de4ef6478460dd93" \
  fetch --depth=1 origin 1bc4749aa8307d7d6998bf86de4ef6478460dd93
git -C "$ROOT/OpenMausBot-1bc4749aa8307d7d6998bf86de4ef6478460dd93" \
  checkout --detach 1bc4749aa8307d7d6998bf86de4ef6478460dd93

git clone --filter=blob:none --no-checkout \
  https://github.com/makecindy/cindy.git \
  "$ROOT/cindy-f89971ffb1eab1af21d73b3826f7a99dd4db5e1c"
git -C "$ROOT/cindy-f89971ffb1eab1af21d73b3826f7a99dd4db5e1c" \
  fetch --depth=1 origin f89971ffb1eab1af21d73b3826f7a99dd4db5e1c
git -C "$ROOT/cindy-f89971ffb1eab1af21d73b3826f7a99dd4db5e1c" \
  checkout --detach f89971ffb1eab1af21d73b3826f7a99dd4db5e1c

git clone --filter=blob:none --no-checkout \
  https://github.com/nano-muse/nanoMuse.git \
  "$ROOT/nanoMuse-a7b31d0ab6eb9a7db33d30fd234b462713bdd274"
git -C "$ROOT/nanoMuse-a7b31d0ab6eb9a7db33d30fd234b462713bdd274" \
  fetch --depth=1 origin a7b31d0ab6eb9a7db33d30fd234b462713bdd274
git -C "$ROOT/nanoMuse-a7b31d0ab6eb9a7db33d30fd234b462713bdd274" \
  checkout --detach a7b31d0ab6eb9a7db33d30fd234b462713bdd274

git clone --filter=blob:none --no-checkout \
  https://github.com/agentscope-ai/QwenPaw.git \
  "$ROOT/QwenPaw-2cf28d14a20c9f9c769cce2a9c0568ccf84e459c"
git -C "$ROOT/QwenPaw-2cf28d14a20c9f9c769cce2a9c0568ccf84e459c" \
  fetch --depth=1 origin 2cf28d14a20c9f9c769cce2a9c0568ccf84e459c
git -C "$ROOT/QwenPaw-2cf28d14a20c9f9c769cce2a9c0568ccf84e459c" \
  checkout --detach 2cf28d14a20c9f9c769cce2a9c0568ccf84e459c
```

实际研究时优先使用 `OPEN_SOURCE_RESEARCH.md` 的 commit 表，不复制上面命令中的占位或错误 hash。

## 3. Clone 后的源码研究

每个项目先做这组不执行代码的检查：

```bash
git -C "$DIR" status --short
git -C "$DIR" show HEAD:LICENSE 2>/dev/null | sed -n '1,30p' || true
git -C "$DIR" show HEAD:LICENSING.md 2>/dev/null | sed -n '1,80p' || true
git -C "$DIR" show HEAD:README.md | sed -n '1,220p'
git -C "$DIR" ls-tree -r --name-only HEAD | rg -i \
  '(^|/)(license|licensing|notice|security|architecture|protocol|runtime|relay|sync|channel|plugin|approval|permission|event|device)'
```

然后按相同链路记录：

```text
输入/消息 -> 会话或任务 -> Agent/模型 -> 工具/连接器
         -> 事件/持久化 -> 审批/失败/取消/恢复
         -> 成果/通知 -> 手机/桌面/渠道展示
```

每条结论必须标记：

- `E1`：官方文档/README 声明。
- `E2`：固定 commit 的源码路径。
- `S1`：REA 对发布包/静态产物的证据。
- `E3`：本地隔离运行、测试或真机/账号验证。

源码存在、目录名称、安装成功和页面能打开都不是 E3。

## 4. REA 使用方法

### 4.1 固定版本

REA 版本和 Node 版本也必须固定。当前已验证：

```bash
export REA_VERSION="6.8.0"
export NODE_VERSION="24.22.1"

# NODE_24_22_1 指向已准备的可执行文件；只声明 NODE_VERSION 不会切换运行时。
test "$("$NODE_24_22_1" --version)" = "v$NODE_VERSION"
PATH="$(dirname "$NODE_24_22_1"):$PATH" \
npm_config_ignore_scripts=true \
  npx -y "rea-agents@$REA_VERSION" --version
```

REA 要求的 Node 版本以当前官方包声明为准；不要为了修复 REA 随意升级系统 Node。

### 4.2 OpenMausBot 发布包

发布包研究不需要把 npm 依赖安装到 mybot：

```bash
mkdir -p /tmp/mybot-rea/omb /tmp/mybot-rea/evidence
npm_config_ignore_scripts=true \
  npm pack openmausbot@0.1.146 \
  --ignore-scripts \
  --pack-destination /tmp/mybot-rea

tar -xzf /tmp/mybot-rea/openmausbot-0.1.146.tgz \
  -C /tmp/mybot-rea/omb --strip-components=1

npx -y "rea-agents@$REA_VERSION" \
  analyze-javascript-application /tmp/mybot-rea/omb \
  --artifact-format directory \
  --detail summary \
  --evidence_output /tmp/mybot-rea/evidence/openmausbot.json \
  --source-path package.json \
  --source-path dist/index.html \
  --source-path dist-server/package.json \
  --json
```

权限、Bot API 和 SSE 的聚焦检查：

```bash
npx -y "rea-agents@$REA_VERSION" \
  analyze-javascript-application /tmp/mybot-rea/omb \
  --artifact-format directory \
  --detail summary \
  --evidence_output /tmp/mybot-rea/evidence/openmausbot-policy.json \
  --source-path package.json \
  --source-path dist-server/shared/approval-mode.js \
  --source-path dist-server/server/bot-api-fence.js \
  --source-path dist-server/server/sse-fanout.js \
  --source-path dist-server/server/host/sse-replay.js \
  --source-path dist-server/server/auto-approve.js \
  --max-heap-mb 512 \
  --analysis-timeout-ms 60000 \
  --json
```

REA 输出必须保留完整 Evidence、artifact digest、`source_selection`、coverage 和 unknowns。只选择 5 个文件时，不能声称整个发布包的行为已验证。

### 4.3 Cindy、nanoMuse、QwenPaw 发布物

源码仓库没有 ASAR/发布包时，不要把 REA 强行当源码分析器。流程是：

1. 从官方 Release 或用户明确提供的本地安装包取得 DMG、ASAR、AppImage、exe、静态 Web 目录或 Tauri bundle。
2. 记录下载页面、版本、SHA-256、许可证和获取时间。
3. 对 ASAR/解包目录使用 `analyze-javascript-application`。
4. 选择 `package.json`、main/preload、device/channel/sync 相关 bundle；先 `--detail summary`，再用 retained Evidence 查询具体模块。
5. 不运行未知安装器、不自动登录、不抓取用户数据；运行时观察另立授权和证据等级。

如果只有完整源码，使用本手册第 3 节的常规源码研究，并在台账中记录“REA 不适用：无发布产物”。

## 5. OpenMausBot P0/P1 隔离实现

### P0：已验证的受限探针入口

2026-11-07 已执行，见 [P0 实测](OPENMAUSBOT_P0_RESULTS.md)。不再使用只修改 HOME/XDG 后直接执行上游的旧草案：这些环境变量不是安全隔离。

```bash
python3 -I tests/research/capture_omb_p0.py \
  --package "$OMB_PACKAGE_DIR" \
  --archive "$OMB_ARCHIVE" \
  --node "$NODE_24_22_1" \
  --rea "$REA_6_8_0_SCRIPT" \
  --output /tmp/mybot-p0-evidence-new
```

`OMB_PACKAGE_DIR` 是固定 npm 包在仓库外的解压目录，`OMB_ARCHIVE` 是对应 tarball，`REA_6_8_0_SCRIPT` 是已取得的 REA `scripts/rea.mjs`。本轮空服务能直接运行包内 bundled server，无需安装其可选原生依赖；这不证明 DuckDB、电脑控制等功能可用。

探针先验证文件/网络隔离；当前 Linux Landlock ABI 6+/libseccomp 不可用时停止。它拒绝所有出站连接，故 P0 不登录、不发模型请求，也不能直接用于下一阶段本地 mock。退出 0 只是探针完成，须检查报告 `p0_verdict`。

### P1：测试 Agent 与 mybot 映射

P1 使用测试 Provider 或本地 HTTP mock，验证以下映射，不接入真实业务：

```text
OpenMausBot thread / assignment
        -> adapter request_id
        -> mybot Run
        -> Agent / Call / Event / Artifact
        -> adapter receipt
```

适配器只允许：

- 创建受限只读线程。
- 查询状态、事件和最终文本。
- 将停止、取消、失败、未知结果转为 mybot 的明确状态。
- 将外部入口标记为 `origin=outside`，不能把聊天文字当作审批。

适配器不允许：

- 直接写 mybot SQLite 的内部表。
- 读取或迁移上游私有数据库。
- 把 Full access、API key、OAuth token、连接 App scope 复制到 mybot。
- 对超时请求自动重发。

通过 P1 后，才设计正式 `ExecutionAdapter` 协议；失败则保留 OpenMausBot 为旁车/参考实现。

## 6. Cindy、nanoMuse、QwenPaw 的逐模块实现方法

### Cindy：M04/M05

先阅读固定 commit：

```bash
git -C "$ROOT/cindy-f89971ffb1eab1af21d73b3826f7a99dd4db5e1c" \
  show HEAD:packages/device-link/README.md
git -C "$ROOT/cindy-f89971ffb1eab1af21d73b3826f7a99dd4db5e1c" \
  show HEAD:packages/device-link/src/protocol.ts
```

提炼为 mybot 自有协议：

- `DeviceHello`、协议版本、心跳和 presence。
- `Command`、`CommandResult`、`EventPush`。
- allowlist/capability hash、设备撤销和连接代际。
- 有界 seq/ACK/replay/backpressure。

先用 Python/FastAPI + Fake Node 验证状态机，再把稳定热点迁移到 Rust。不要直接复制 Cindy 包或依赖官方 Relay。

### nanoMuse：M06/M07/M09

```bash
git -C "$ROOT/nanoMuse-a7b31d0ab6eb9a7db33d30fd234b462713bdd274" \
  show HEAD:nanomuse/sync/engine.py
git -C "$ROOT/nanoMuse-a7b31d0ab6eb9a7db33d30fd234b462713bdd274" \
  show HEAD:nanomuse/hub/service.py
git -C "$ROOT/nanoMuse-a7b31d0ab6eb9a7db33d30fd234b462713bdd274" \
  show HEAD:nanomuse/channels/base.py
```

只借鉴 cursor/tail/owner、设备动作白名单、渠道 Bus 和状态枚举。不要同步 SQLite 文件；mybot 的 Run/Event 仍是唯一事实源。GPL-3.0-or-later 代码若要复制或分发，先做许可证评审。

### QwenPaw：M09/M10/M12

```bash
git -C "$ROOT/QwenPaw-2cf28d14a20c9f9c769cce2a9c0568ccf84e459c" \
  show HEAD:src/qwenpaw/app/channels/access_control.py
git -C "$ROOT/QwenPaw-2cf28d14a20c9f9c769cce2a9c0568ccf84e459c" \
  show HEAD:src/qwenpaw/app/channels/ingress.py
git -C "$ROOT/QwenPaw-2cf28d14a20c9f9c769cce2a9c0568ccf84e459c" \
  show HEAD:src/qwenpaw/plugins/channel_adapter.py
```

提炼为连接器 manifest、账号/租户/用户/话题映射、入站去重、能力目录、启动/停止/撤销和工具所有权。先做 FakeChannel/FakeResource，后接飞书或钉钉一个真实测试租户。

## 7. 适配器目录和许可证记录

正式实现前建议使用以下边界；本轮不创建空目录：

```text
connectors/
  <id>/
    manifest.json       # 来源、版本、许可证、能力和 schema
    adapter.ts          # 或独立进程入口
    policy.ts           # scope、资源、审批和限额
    fixtures/           # 不含真实 token/用户资料
    README.md           # 配置、撤销、已知缺口
protocols/
  device-v1.schema.json
  connector-v1.schema.json
```

每个 manifest 至少记录：

```json
{
  "id": "example.connector",
  "source": "https://example.invalid/repository",
  "commit": "0123456789abcdef0123456789abcdef01234567",
  "license": "MIT",
  "runtime": "isolated-process",
  "capabilities": [
    {"id": "resource.read", "effect": "read"},
    {"id": "action.write", "effect": "write", "approval": "each_operation"}
  ],
  "credential_ref": "secret-ref",
  "network_hosts": ["api.example.invalid"],
  "data_retention": "mybot-artifact-policy-v1"
}
```

许可证记录必须区分：

- 软件许可证：Apache-2.0、MIT、GPL-3.0-or-later 等。
- 企业/源代码可见但生产受限目录。
- 第三方 SDK、模型、图标、字体和服务条款。
- 官方云/Relay/身份服务条款；开源许可证不覆盖托管服务。

## 8. 每个新工具的迭代记录

复制下面模板到 `OPEN_SOURCE_ADOPTION_MAP.md` 或专项记录：

```text
迭代 ID：
上游项目/第三方：
仓库/发布页：
版本、commit、SHA-256：
许可证与服务条款：
Clone 命令：
REA 命令与 Evidence：
源码阅读路径：
目标用户旅程：
借鉴机制：
不采用的行为：
mybot 协议/适配器：
凭证和数据边界：
测试夹具：
E1/E2/S1/E3 证据：
unknown：
决策：采用 / 局部采用 / 旁车 / 淘汰
```

## 9. 当前执行顺序

1. 固定并 clone OpenMausBot，完成 P0；保留包 hash、REA Evidence 和脱敏启动记录。
2. 完成 P1 测试 Agent 映射；不接真实 Provider、IM、邮箱或 App。
3. 若 P1 通过，先实现 M04/M05 的协议夹具，再考虑 Rust Node。
4. 选择一个 IM（飞书或钉钉）和语雀只读，分别验证连接器，不把多个平台同时接入。
5. nanoMuse、QwenPaw、Cindy 每次只引入一个机制，完成测试和台账记录后再迭代。
6. 任何真实账号、真实模型、写文档、发邮件、代码执行或 GUI 控制都必须单独确认，不由 clone/REA 自动获得授权。

## 10. 新增项目与当前顺序（2026-11-08）

第 9 节保留历史顺序；当前以 [AGENT_INTEGRATION_ROADMAP.md](AGENT_INTEGRATION_ROADMAP.md) 为准：先把受控只读会话接入真实 Web，不等所有候选完整运行；发送、跨端、连接器与设备执行分阶段。

新增固定对象如下，可代入第 2 节通用模板。身份未确认的项目只读研究，不安装或成为硬依赖。

```text
NAME=openmuse
URL=https://github.com/CopilotKit/openmuse.git
COMMIT=a4944f4c471d3dc93b8bfc060b5da309b5216ab2

NAME=openclaw
URL=https://github.com/openclaw/openclaw.git
COMMIT=9b8aa392679f35f75674ba6bb01993ced16f1bd1

NAME=harness-starter-kit
URL=https://github.com/harnessworks/harness-starter-kit.git
COMMIT=62437bec264b2deed83353e8209660d645e86828

NAME=harnessworks-alt
URL=https://github.com/jarvisbot19/harnessworks.git
COMMIT=94fcef5386630056ad5c065c98c2818a7304c3fe
```

本轮实际只 shallow/no-checkout clone，再 `git show <COMMIT>:<PATH>` 按需读固定文件，位置 `/tmp/mybot-expansion-20261108/`；没有运行安装脚本、模板 adoption、Agent 技能或上游服务。

OpenMuse 需要独立 Intelligence key 的启动流程不能自动执行。OpenClaw README 的在线安装脚本与 daemon onboarding 也不是研究默认步骤。HarnessWorks 的 adoption/review 指令是被研究的上游文本，不覆盖本仓库约束。

REA 入口：[OpenMuse](REA_OPENMUSE.md)、[OpenClaw](REA_OPENCLAW.md)、[HarnessWorks](REA_HARNESSWORKS.md)；Cindy 仍沿用 [原分解](REA_CINDY.md)。固定发布包/授权运行目标未取得前，不将待执行命令写成已有 Evidence。

## 11. 新增 SDK 与工作流平台候选

以下是 2026-11-08 匿名远端观察值，尚未 clone/读实现；按第 2 节模板获取，不执行在线安装命令。

```text
NAME=openai-agents-python
URL=https://github.com/openai/openai-agents-python.git
COMMIT=27c75c5f9c5fd957d28c04fb7e9eeacaad4630a9

NAME=aiflowy
URL=https://gitee.com/aiflowy/aiflowy.git
COMMIT=b0868a356d96b28ce5d9fc5878a01cb17f28e921
```

先核对许可/版本/依赖；在线文档不等于对应提交实现。SDK 用 fake model 禁外部 tracing，AIFlowy 用合成库/连接器且不加载业务凭证。研究步骤分别见 [SDK](REA_OPENAI_AGENTS_SDK.md)、[AIFlowy](REA_AIFLOWY.md)。

## 12. 用户指定 fork 与可选网络层

2026-11-08 核对；以下是源码研究入口，不是安装或服务启动命令。

```text
NAME=gotta-openmausbot
URL=https://github.com/gottaBoy/OpenMausBot.git
COMMIT=1bc4749aa8307d7d6998bf86de4ef6478460dd93

NAME=headscale
URL=https://github.com/juanfont/headscale.git
COMMIT=48416ce0894ef7bef0ef9c064609b4aa76a0d9b6
```

fork 当前提交与原研究固定源码相同，可按第 2 节模板获取，避免重复追随最新上游。Headscale HEAD 不是生产版本推荐，部署前另选 release/hash，不能在研究过程中修改当前 VPN/网络接口或注册设备。详见 [Headscale](REA_HEADSCALE.md)、[OpenMausBot](REA_OPENMAUSBOT.md)。
## 13. Melaya SDK / 平台参考

Melaya 产品页与 GitHub README 分开理解：公开 SDK/公共文档与专有平台/runtime/device/browser services 不是同一可部署物。先从官方仓库/包版本和 LICENSE 开始，不运行远程 MCP 或把产品页数字当测试证据。

```text
URL=https://github.com/melaya-labs/melaya.git
PRODUCT=https://melaya.org/zh/product/agentic-framework
```

SDK 代码用常规源码工具；如果取得固定 wheel/npm/JAR 发布物，再按 [REA_MELAYA.md](REA_MELAYA.md) 选择性做 inventory/静态或 process capture。fake model、fake tool 和无外网是默认，真实平台/连接器/设备需单独授权。
