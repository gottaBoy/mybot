# OpenMausBot 权限边界研究

日期：2026-11-07。范围：固定 npm `openmausbot@0.1.146` 的创建、委派、API 和执行权限。先记录源码观察，再进行隔离夹具；本文件不授权业务模型或工具执行。

关联：[P0 结果](OPENMAUSBOT_P0_RESULTS.md)、[REA 分解](REA_OPENMAUSBOT.md)。

## 1. 本轮问题

1. `newBotDefaults.profile.approvalMode=ask` 是默认值还是强制上限？
2. 委派是否可以提高接收者权限，外部起源是否自动将既有 Full 降为 Ask？
3. Ask 能否保证只读，Bot API 的 fence 能否直接作为研发执行接口？
4. mybot 应在哪些边界拒绝越权，而不是先创建再 PATCH？

## 2. 已阅读的 npm 发布包路径

这些是发布包 E2，不能仅因版本名称一致就认为与 Git commit 完全同构：

| 路径（`dist-server/` 下） | 实际观察 | 对 mybot 的影响 |
| --- | --- | --- |
| `shared/approval-mode.js` | `DEFAULT_APPROVAL_MODE=full`；`setDefaultApprovalMode` 影响未设置项，显式模式及 legacy auto 另有优先级 | 全局默认不是权限 ceiling |
| `server/new-bot-defaults.js` | `useDefaults=false` 跳过模板；`settings` 覆盖模板 | 不能把模板当不可绕过策略 |
| `server/routes/bots-create.js` | 创建会合并模板和显式字段；hosted 分支对 Full 另做拒绝；standalone 和 hosted 不等价 | 不通过伪造企业环境变量获得“安全模式” |
| `server/routes/bot-patch.js` | 授权 owner 可变更普通权限模式；Custom 走不同私有入口 | 设置接口与 Agent 身份必须隔离 |
| `server/runtime/level.js` | 有 Chief 血缘且起源为 person/routine 时按 own/inherited 取较高可用级别 | mybot 需要独立最大权限/能力上限，而非沿用 max |
| `server/host/delegated-level.js` | 上层 Chief 权限可沿工作链传递，依赖外部血缘判定 | 测试纯函数不等于血缘全链路审计 |
| `server/auto-approve.js` | Ask 可依赖 saved command/tool、own-file read 等既有授权；Full 在 explicit-approval guard 前分支 | Ask 不是“绝不写入”的证明 |
| `server/bot-api-fence.js` | 内部 route、工具集有窄白名单 | 能用来研究收敛原则，不是完整工具执行 API |
| `server/index.js` | Bot API/guest 等线程强制 Ask，并裁剪 integrations/检查 confined engine | API 的多层 fence 必须一起看，不能凭工具列表证明完整隔离 |

## 3. 本轮验证设计

### A. 上游原函数测试

在现有文件/网络 guard 下加载纯权限函数，不启动模型或工具：

- 未设置、显式 Full、legacy auto、线程覆盖、切换模型。
- Chief 提高接收方权限；outside 不继承 Chief，但 own Full 的值是否保留。
- Ask 的 existing grants、Full 的审批分支。
- Bot API 内部 route 白名单和禁用的工具集。

这是被选中函数的 E3，不是完整上游任务运行。原函数仍从已核验的包导入，不复制实现。

### B. 空模型 HTTP 元数据测试

只在独立数据目录、无模型选择、拒绝全部出站的测试服务内：

1. 保存 Ask 模板，创建 Bot，读取模式。
2. 在相同模板下测试 `useDefaults=false` 和显式 Full 的创建元数据。
3. 将所有测试 Bot 降为 Ask，正常退出。

Full 只作为空夹具的模式字段出现；不发送提示，不运行工具，不把研究动作写入 mybot 生产数据。HTTP 返回、模式与来源分别记录，不导出完整上游配置或账号数据。

### C. mybot 只读 ceiling 契约

先做研究专用的纯策略和合成工具 runner，不放进 `workbench/`，不代理到 OpenMausBot：

- 人工受信任 grant 与不可信 request 分离。
- 默认为 Ask，但真正的只读来自能力/资源白名单和副作用拒绝。
- 子 grant 只能缩小，不能因 Chief、模型文本或客户端字段扩大。
- 外部 API/渠道只允许草稿，不能直接启动；模型费用仍需独立确认。
- 启动时和每次工具前都重新检查 grant 版本、有效期、状态和能力。
- 缺字段、未知字段、未知来源、不支持能力、显式提权、过期或撤销均拒绝。

合成 runner 只返回内存中的 fixture，不读真实文件、不发请求。通过契约测试只能说明本地策略函数生效；尚未将 ceiling 强制落实到上游 CLI、worker、所有 HTTP 路由或 OS 工具执行。

## 4. 接入限制

不能仅放一个 HTTP 代理，就宣称 Agent 无法访问上游管理口。只要同用户/同网络的执行器仍能直连 owner 接口或改配置，它就可能绕过代理。正式接入需要：

- 独立的进程/用户或等价强隔离；执行器没有管理 token、写配置和上游数据库的权限。
- 上游只作为执行 adapter，mybot 保留 Run/审批/预算/来源事实。
- 若执行后端不能在每次副作用前服从 mybot ceiling，就不支持该能力，不用 prompt 补安全。
- 后续本地 mock 网络需要单独设计，不修改本轮全出站拒绝 guard 来放开网络。

## 5. 结果状态

### 5.1 已完成的纯函数验证

`tests/research/omb_permission_functions.mjs` 从固定 npm 发布包中只加载权限/运行时纯函数，不启动服务、不调用模型。结果保存为 [omb-permission-functions.json](../tests/research/evidence/omb-permission-functions.json)：

- 31 项用例全部通过；本轮也在 guard 下重复执行并纳入最新 REA 报告。
- `DEFAULT_APPROVAL_MODE` 未设置时是 `full`；`setDefaultApprovalMode("ask")` 只改变未显式设置的项；显式 `approvalMode:"full"` 仍返回 Full。
- Chief + `person`/`routine` lineage 可把接收者级别提高到 Full；`outside` 不继承 Chief，但接收者自己已有 Full 仍保持 Full。
- `ask` 不是只读：saved command、saved tool、own-file read 均可能给出批准来源；Full 在 explicit guard 前直接给出 full-access。
- Bot API 的工具集合只有 `hooks`，内部只允许 tool-result/hook 路径，不能把它当作 mybot 执行 RPC。

### 5.2 空环境 HTTP 验证

最新一次 REA capture 位于 `tests/research/evidence/permissions-v4/`：

- REA Evidence ID：`ev_ec84b18b83bf40cbac792270dab9bffd0ad749411cfbd222aada8e3396cb4bb8`。
- 报告 SHA-256：`9b595af149b9a210d58e35dd8707b2029716128ee97a02564ce8a91a5f64fd95`。
- 原始 P0 的 `ask_first_default=false` 仍成立：没有 Ask 模板时，空环境会创建 Full。

Owner 保存 `newBotDefaults.profile.approvalMode=ask` 后，用相同入口比较四组请求：

| 创建请求的差异 | HTTP | 返回模式 | 结论 |
| --- | --- | --- | --- |
| `useDefaults:true` | 201 | Ask | 模板默认生效 |
| 顶层 `approvalMode:"full"` | 201 | Ask | 该顶层字段不是实际权限设置入口 |
| `settings:{"approvalMode":"full"}` | 201 | Full | 正确结构的显式权限覆盖模板 |
| `useDefaults:false` | 201 | Full | 允许跳过模板，回到上游全局默认 |

全部是在受限、空模型的 Owner 测试服务中改变元数据，没有启动模型/工具；退出前将所有测试 Bot 降回 Ask，并验证重启后保留。

**证据修正：** `ask-default-v3` 及此前版本曾把顶层 `approvalMode` 作为提权探针。因此“Ask 模板可阻断显式 Full”是错误推论，已撤回；旧 Evidence 不修改、不删除。最新 v4 加入实际的 `settings.approvalMode` 和 `useDefaults:false`，与已读源码一致。Owner 本来有变更权限的授权，这不是未经授权提权漏洞，而是与 mybot 只读要求不同的产品策略。

### 5.3 决策

1. OpenMausBot 的新 Bot defaults 是可选择、可覆盖的默认，不是强制权限上限。
2. 仅配置 Ask、仅设置 service 信任或仅限制 UI 都不能落实 mybot 的只读保证。
3. mybot 必须在自己的 `CapabilityGrant`/`Approval` 层拒绝提权，并在执行器每次动作前复核；子权限取父权限与宿主策略的交集，不继承上游的 max 规则。
4. OpenMausBot 仍保留为候选旁车，暂不作为 mybot 底座。

尚未验证：Chief 实际委派 HTTP/线程链路、API key authenticated route、渠道入口、运行中权限切换、真实工具/模型、SSE 重放和重启恢复。

### 5.4 已实现的本地研究合同

`tests/research/readonly_ceiling.py` 与其测试只在研究目录中运行，不是 `workbench/` 执行权限：

- 请求不能提交 actor/origin/审批事实；这些由受信任宿主 context/grant 提供。
- 精确绑定人、项目、Run、grant revision；过期、撤销、未知输入拒绝。
- 仅允许白名单中的 `fixture.read` 与指定内存资源；Shell、写文件、发信等均无实现。
- 子 grant 只能缩小资源、能力与有效期；每次 fixture 读取重新校验。
- API/渠道起源只允许草稿，不启动 fixture 工作；真正模型调用的费用确认不在此合同内。
- 66 项契约测试通过，包含异常类型、NaN/无穷时间、请求字段伪造、越界资源、委派扩权和撤销后再次调用。

合同不构成上游运行时强制：尚无宿主 grant 存储、父子撤销传播、实际 driver/工具门禁和隔离集成，不能用于发布“已完成权限系统”。原 38 项应用测试未变动。

## 6. 本轮验证和复现

```bash
.venv/bin/python -m pytest -q
.venv/bin/python -m pytest -q tests/research/test_readonly_ceiling.py

python3 -I tests/research/capture_omb_p0.py \
  --package "$OMB_PACKAGE_DIR" \
  --archive "$OMB_ARCHIVE" \
  --node "$NODE_24_22_1" \
  --rea "$REA_6_8_0_SCRIPT" \
  --output /tmp/mybot-permission-evidence-new
```

- 全部 Python 测试 104 项通过（原应用 38 + 本地研究合同 66），保留原 Starlette/httpx 弃用提醒。
- 上游所选纯函数 31 项在 guard 下通过，HTTP 四种创建对照均与源码预期一致；这是观察上游行为通过，不是 mybot 安全门槛通过。
- REA 快照中报告的完整 SHA-256 与保存的 `omb-p0.json` 一致；原始 Evidence 不覆盖。
- 三次上游服务正常退出，所用监听端口均关闭。REA 对进程归属的 unknown 与采样局限保留，未声称完整进程树审计。
- 下一步是宿主 grant 生命周期/隔离设计和独立本地 mock P1；本轮没有联网 Provider、工具执行或生产接入。
