# Zira 管理、配置与工作流专题研究

日期：2026-11-14（Asia/Singapore）。用途：补充
[全前端结构研究](ZIRA_FRONTEND_STUDY.md)，为 mybot 的工程规则和后续切片提供来源依据，
不表示 mybot 已具备 Zira 的管理能力。

## 1. 来源与证据等级

- 只读来源：`/home/my/workspace/ainfra/zira/frontend`。
- 本轮 `git rev-parse HEAD`：
  `1ce0d0510cb590f3a79ca498f7239ff0852ed0d7`，与既有索引一致。
- 使用既有 [625 文件结构索引](research/zira-frontend-2026-11-13.json)定位模块；
  其中 admin 为 **205 文件、32,106 行**，workflow-designer 为 26 文件、6,744 行。
  这是 AST 结构统计，不是 205 文件逐行审计。
- 本轮人工深读：管理入口与共享错误、工作流定义/草稿/函数目录/保存/发布/回滚/导入、
  字段/字段配置/屏幕、权限方案/全局权限/问题安全、项目方案/角色、系统配置、
  Dashboard 布局/单卡编辑/订阅的代表调用链。其他管理目录仍只有结构定位或局部源码观察。
- 未读取 `.env`、凭证、数据库、会话数据、运行日志或用户业务记录；未修改 Zira。
- **未启动 Zira、未请求其后端、未运行其测试或浏览器。** 前端注释中
  “已核实后端/已实现/已验收”的断言只作为上游作者的说明，本轮没有读取后端复核，
  更不转换成 mybot 的本地运行证据。
- 本轮只新增本文；无 mybot 业务代码、接口或依赖变更。

以下“观察”指固定 HEAD 下的前端源码；“建议”指 mybot 后续要求；
“风险”指由所见控制流推导、尚未运行复现的缺口。

## 2. 管理域结构

结构索引的 admin 子域：

| 子域 | 文件 / 行 | 本专题覆盖 |
| --- | ---: | --- |
| workflow-designer / workflow-schemes | 26 / 6,744；7 / 753 | 生命周期、函数表单、影响、真实写与回退 |
| fields / field-configurations / screens | 11 / 1,512；10 / 1,166；11 / 2,053 | 定义、选项、配置、映射、屏幕与消费缺口 |
| permission-schemes / global-permissions / issue-security | 13 / 1,759；5 / 1,110；13 / 2,915 | 授予、影响确认、整体替换、开关和绑定 |
| projects / application-access | 9 / 899；7 / 692 | 设置总览、角色成员、可登录主体语义 |
| identity / issue-types | 18 / 3,478；16 / 2,875 | 结构定位；目录停用代表链；不声称全量审计 |
| notification-schemes / system-config | 9 / 1,129；5 / 361 | 事件/接收者 API、配置表单与敏感项显示 |
| statuses / priorities / resolutions / issue-link-types | 8 / 910；5 / 611；5 / 524；6 / 620 | 结构定位，未逐项深读 CRUD |
| apps / audit | 3 / 394；5 / 531 | 结构定位，未审计插件生命周期或审计完整性 |
| api / hooks / shared / 两个导航文件 | 4 / 357；4 / 166；3 / 286；2 / 261 | 目录读取、共享错误、导航边界 |

管理壳是
`App.tsx admin/* → AdminPage → AdminRoutes → feature page → hooks → api`。
[AdminPage.tsx:77](/home/my/workspace/ainfra/zira/frontend/src/pages/AdminPage.tsx:77)
维护共同面包屑、管理导航、移动 Sheet 和内容区；
[AdminRoutes:228](/home/my/workspace/ainfra/zira/frontend/src/pages/AdminPage.tsx:228)
按 pathname 分发，而非每个子域复制一个壳。
`SELF_HEADER_PATHS` 防止子页已有 PageHeader 时再渲染第二个标题。

管理导航按项目、问题、工作流、权限通知、用户目录、系统分组。
[admin-nav.ts:32](/home/my/workspace/ainfra/zira/frontend/src/features/admin/admin-nav.ts:32)
是信息架构，不是权限策略。`App.tsx:116` 的管理路由只显示在通用 RequireAuth 下，
`AdminPage` 本身并未实施注释中描述的全局 ADMINISTER 门禁；
不能从菜单或注释推导服务端授权已通过。
页头“搜索配置”输入在
[AdminPage.tsx:131](/home/my/workspace/ainfra/zira/frontend/src/pages/AdminPage.tsx:131)
只有 `onFocus(select)`，未见搜索绑定，不能将这个控件认作完成的管理搜索。

**mybot 建议：** 保留单一产品壳与项目自有 PageHeader/Toolbar/ResultState；菜单可见性、
页面读取能力、具体操作授权和服务端强制检查分别建模。按实际能力暴露入口，不搬运
空搜索框、静态控制器路径说明或未经验证的角色名称。

## 3. 工作流完整消费链

### 3.1 对象与状态

```text
工作流目录
  → detail（draft 优先，否则 definition/published）
  → 服务端 bundle（版本、hasDraft、locked、draftLockVersion、contentHash）
  → 编辑态 definition + baseline + selection
  → 静态校验
  → PUT draft {definition, lockVersion}
  → GET impact
  → POST publish {note}
  → 版本列表 / 指定历史版本预览
  → POST rollback {version, note}
```

目录选择写 URL 的 `workflowId`，页面不先把目录行假装为完整定义。
[workflow-designer-page.tsx:50](/home/my/workspace/ainfra/zira/frontend/src/features/admin/workflow-designer/workflow-designer-page.tsx:50)。
详情转换在
[workflows.ts:246](/home/my/workspace/ainfra/zira/frontend/src/features/admin/workflow-designer/api/workflows.ts:246)
依次取 `draft → definition → published`；最后才尝试由散字段组装。
[use-workflow-definition.ts:61](/home/my/workspace/ainfra/zira/frontend/src/features/admin/workflow-designer/hooks/use-workflow-definition.ts:61)
归一化来源与锁/版本，`hasDraft` 和“已发布版本号”独立，不把“编辑中”视为“已发布”。

查询键统一位于 `['admin','workflows',id]` 下，版本/指定版本/影响是子键。
写成功统一失效工作流与管理前缀：
[use-workflow-mutations.ts:46](/home/my/workspace/ainfra/zira/frontend/src/features/admin/workflow-designer/hooks/use-workflow-mutations.ts:46)、
[invalidation.ts:85](/home/my/workspace/ainfra/zira/frontend/src/lib/invalidation.ts:85)。
这些函数使用 `void invalidateQueries`，不是“等待所有受影响数据读回后再完成”的合同。

### 3.2 编辑基线、乐观锁与未保存保护

[workflow-designer-page.tsx:122](/home/my/workspace/ainfra/zira/frontend/src/features/admin/workflow-designer/workflow-designer-page.tsx:122)
将服务端 bundle、本地 definition、baseline、selection、校验问题和写错误分开。
effect 仅在没有本地改动时应用新 bundle，防止窗口聚焦 refetch 覆盖编辑；
`dirty` 使用 `definition !== baseline` 的引用比较，不是规范化内容 diff。
保存将当前 definition 和 `draftLock ?? undefined` 发给 API，
从响应 `lock_version` 更新下一次保存基线，成功后才显示保存提示。

属性栏通过不可变操作回传定义，不在组件内直接请求服务器。
[workflow-property-panel.tsx:38](/home/my/workspace/ainfra/zira/frontend/src/features/admin/workflow-designer/components/workflow-property-panel.tsx:38)
区分 workflow meta、step、transition；被其他对象引用的 step/transition id 为只读。
写请求在途时冻结属性输入，`locked` 又与临时 pending 独立。

**可采用：** 本地编辑、保存草稿、发布版本、运行快照应为不同对象；基线应携带对象 ID、
服务端 revision/ETag/hash，保存必须 compare-and-set；409 保留输入并展示重新读取、
差异比较或放弃，不自动覆盖。

**不能照搬的控制流：**

- `handleReload` 在
  [page:161](/home/my/workspace/ainfra/zira/frontend/src/features/admin/workflow-designer/workflow-designer-page.tsx:161)
  直接覆盖 definition/baseline，返回列表在 `page:254` 直接调用 onBack。未见
  `beforeunload/useBlocker` 或 dirty 确认；防 refetch 覆盖不等于离页/重载保护。
- 同一 `WorkflowDesignerView` 的 state/ref 未按 workflowId 重置，且渲染处无 `key`
  （`page:103`）。若仍挂载时 workflowId 改变且本地 dirty，effect 可能继续保留旧对象草稿，
  保存 hook 却已绑定新 ID。此为源码推导风险，未运行复现。
- 发布/回滚成功只触发失效，没有像丢弃那样显式 `handleReload`。
  若当前 dirty，既有 effect 会拒绝新 bundle；这既保护了编辑，也要求产品明确显示
  “服务端版本已变、本地草稿仍未保存”，不能继续单称“已同步”。
- API 接受省略 lockVersion 的无条件写入
  （[workflows.ts:336](/home/my/workspace/ainfra/zira/frontend/src/features/admin/workflow-designer/api/workflows.ts:336)）。
  mybot 不应把省略版本作为冲突恢复方法；首次创建也应有唯一约束/不存在前置条件。

### 3.3 静态校验、元数据和函数表单

[types.ts:674](/home/my/workspace/ainfra/zira/frontend/src/features/admin/workflow-designer/types.ts:674)
检查 meta 名称/key、至少一个 step、step/transition id 形状与唯一性、目标 step 存在、
函数 typeKey 形状；先收集 step ID 再检查引用。缺 statusId 和非整数 screenId 仅警告，
不能把“静态无 error”称为可发布。源码注释声明服务端还会严格验证，本轮未实测。

条件/校验器/后置动作共享
[function-ref-fields.tsx:23](/home/my/workspace/ainfra/zira/frontend/src/features/admin/workflow-designer/components/function-ref-fields.tsx:23)
的列表与行编辑器。后端函数目录给 `typeKey/kind/params`；数字/布尔/文本控件由参数规格
驱动，未知参数保留可见，避免编辑已知键时把插件参数静默丢掉。
`order/negate/onError` 体现“参数”和“执行策略”不是同一字段。

但目录的 `allowed` 只拼成说明文字，`required` 主要是标注；
该编辑器没有完成约束校验器。布尔控件取消勾选写 `undefined` 而非显式 `false`
（`function-ref-fields.tsx:286`），两者可能不是同一领域语义。typeKey 改变也不会清理或
重新验证旧 params。未知目录、参数或函数引用必须在 mybot 的真实 schema 合同中判定，
不能用自由输入声称插件能力已经可执行。
实际小编辑器向共享控件传 `functions.data ?? null`
（[workflow-condition-editor.tsx:40](/home/my/workspace/ainfra/zira/frontend/src/features/admin/workflow-designer/components/workflow-condition-editor.tsx:40)），
未传递 query error/loading，因而加载中或读取失败也可能显示静态候选，
不能只依据“旧部署回退”的注释认定其只在 404/405/501 降级。

### 3.4 影响、发布与回滚

发布对话框先展示静态问题、草稿提示、影响与发布说明，然后 await onConfirm，
失败保留 note/error。
[workflow-publish-dialog.tsx:72](/home/my/workspace/ainfra/zira/frontend/src/features/admin/workflow-designer/components/workflow-publish-dialog.tsx:72)。
API 只发送 `{note}`，不是当前本地 definition，因此发布目标是已经保存的草稿。
前端类型区分 `published:true` 与 `published:false/reason:NO_CHANGE`，
但当前页面不使用响应区分“产生新版本”和“无变化”。

影响组件
[workflow-impact-notice.tsx:67](/home/my/workspace/ainfra/zira/frontend/src/features/admin/workflow-designer/components/workflow-impact-notice.tsx:67)
读取方案/项目/看板/过滤器/漂移报告，展示 `blocking/severity`；
旧部署只显示目录引用和第一个方案的量级参考，明确无漂移检测。这种不把局部引用数
冒充完整影响的区分可采用，但其中未知统计 `?? 0` 不适合 mybot 的安全判定。

**发布按钮的实际门禁比说明弱：**
`dirty` 与 `!hasDraft` 只警告；确认按钮仅禁 `pending || blockingStaticIssues`
（[publish-dialog:159](/home/my/workspace/ainfra/zira/frontend/src/features/admin/workflow-designer/components/workflow-publish-dialog.tsx:159)）。
影响读取 pending/error/报告 blocking 不会反馈给按钮，最终依赖服务端拒绝。
影响请求只有 workflowId，没有客户端声明的 saved draft revision/hash；确认也不绑定
看过的影响版本。mybot 应要求保存版本、校验、影响、确认同一候选，候选或依赖变化即失效。

回滚对话框读取版本列表、预选非当前版本，再读取指定版本的定义/step/转换/hash，
最后传 `{version,note}`。
[workflow-rollback-dialog.tsx:81](/home/my/workspace/ainfra/zira/frontend/src/features/admin/workflow-designer/components/workflow-rollback-dialog.tsx:81)。
界面声明回滚是以旧内容再发新版本、保留历史，这可作为 mybot 的版本化原则，
但本轮没有证明服务端确实如此。
版本列表/预览读取失败仍允许手工版本号提交；确认只禁 pending/非法数字
（`rollback-dialog:245`），影响组件也未带目标版本。因此不能称为“已核对目标影响后回滚”。

**mybot 建议：** 危险发布/回滚必须对准确候选 fail closed；未知影响、缺版本、
不支持的函数/字段、权限变化不能被展示 fallback 变成可执行。回滚生成新记录，不删旧版本，
也不更改既有 RunSnapshot 或把运行历史重标成功。

### 3.5 真实写与示例回退

[workflows.ts:102](/home/my/workspace/ainfra/zira/frontend/src/features/admin/workflow-designer/api/workflows.ts:102)
对读的 404/405/501 返回 null，其余抛出；写的同类状态转成
`WorkflowEndpointUnavailableError`，不返回保存成功。Abort 原样抛出；
403/409/422 不当成示例。
[use-workflow-mutations.ts:40](/home/my/workspace/ainfra/zira/frontend/src/features/admin/workflow-designer/hooks/use-workflow-mutations.ts:40)
在 USE_MOCK 下明确拒写。

但
[use-workflow-definition.ts:79](/home/my/workspace/ainfra/zira/frontend/src/features/admin/workflow-designer/hooks/use-workflow-definition.ts:79)
也会把“成功响应但没有任何定义片段”变成 endpoint-unavailable 示例，
因此回退不只发生于 HTTP 缺能力。404 又同时可能是目标不存在。
更重要的是
[workflow-toolbar.tsx:62](/home/my/workspace/ainfra/zira/frontend/src/features/admin/workflow-designer/components/workflow-toolbar.tsx:62)
只以 locked 禁写，sample 不禁写。非 mock 环境若读不到真实定义却能访问写端点，
保存可能把编辑后的示例发往当前 workflowId。这不是 mybot 应采用的故障降级。

统一写错误组件按端点缺失、403、409、其他错误分类，并提示不要盲目重复提交：
[workflow-write-error.tsx:26](/home/my/workspace/ainfra/zira/frontend/src/features/admin/workflow-designer/components/workflow-write-error.tsx:26)。
不过所有 409 都提示拉取最新草稿，不一定适合锁定、仍被引用或影响阻断。mybot 应解析
稳定 error code，而非只靠 HTTP 409 猜恢复动作。

### 3.6 导入的预演与报告

[workflow-import-dialog.tsx:54](/home/my/workspace/ainfra/zira/frontend/src/features/admin/workflow-designer/components/workflow-import-dialog.tsx:54)
默认 dryRun=true，JSON 解析失败显式报错；策略区分 NEW_VERSION/SKIP/OVERWRITE/RENAME，
缺失状态创建为额外选项。响应逐项展示 applied/imported/missing/warnings/errors/impact，
而非统一“导入完成”。这是可迁移的“预演与真实应用分开”结构。

但未见文件大小上限、预演报告绑定输入 hash、预演后必须确认才能应用的门禁；
用户可直接取消 dryRun。文本改变也未总是清掉旧报告。mybot 后续导入、计划变更、资源变化
应把预演作为候选版本的结果，输入/策略/权限变化必须清除报告与 consent。

## 4. 字段、屏幕与元数据依赖

不是一个“大表单配置”对象，而是多条引用链：

```text
FieldDefinition（稳定 API 名、类型、能力）
  ├─ FieldOption（可停用选项、顺序、父选项）
  ├─ FieldConfigurationItem（required/hidden/sequence/renderer）
  │    → FieldConfigScheme（issueType → configuration）
  │    → Project binding
  └─ ScreenTabItem → ScreenTab → Screen
       → ScreenScheme（create/view/edit/transition/workflow → screen）
       → IssueTypeScreenScheme（issueType → screenScheme）
       → Project binding

WorkflowTransition.screenId → Screen
WorkflowStep.statusId → 全局 Status
Permission/Security 的 user_cf/group_cf → 类型匹配的 Field
```

来源：
[fields.ts:54](/home/my/workspace/ainfra/zira/frontend/src/features/admin/fields/api/fields.ts:54)、
[field-configurations.ts:9](/home/my/workspace/ainfra/zira/frontend/src/features/admin/field-configurations/api/field-configurations.ts:9)、
[screens.ts:34](/home/my/workspace/ainfra/zira/frontend/src/features/admin/screens/api/screens.ts:34)。
屏幕项的 required/hidden 是字段配置派生值，不能在屏幕调序 UI 偷改为另一份规则。
字段类型/API 名在编辑态不提供修改，
[field-form-dialog.tsx:98](/home/my/workspace/ainfra/zira/frontend/src/features/admin/fields/components/field-form-dialog.tsx:98)
只提交 name/description/active/sequence；新建才提交 fieldType 和能力开关。
字段 schema 存在不代表用户界面支持了所有类型、完整 schema 或类型迁移。

屏幕页签字段调序使用相邻交换后提交完整 itemIds，删除带 screenId/tabId/itemId，
区别“解除引用”与“删除字段”：
[screen-tab-items.tsx:80](/home/my/workspace/ainfra/zira/frontend/src/features/admin/screens/components/screen-tab-items.tsx:80)。
API 注释声明服务端拒绝不完整排列，本轮仅证明前端提交整份列表，未验证服务端并发保护。
映射编辑器每次选择立即 PUT，不是本地草稿：
[screen-scheme-entries-editor.tsx:28](/home/my/workspace/ainfra/zira/frontend/src/features/admin/screens/components/screen-scheme-entries-editor.tsx:28)、
[field-config-scheme-mappings-editor.tsx:33](/home/my/workspace/ainfra/zira/frontend/src/features/admin/field-configurations/components/field-config-scheme-mappings-editor.tsx:33)。
二者空选项都 `if (!value) return`，因此“未绑定/不映射”选项不等于实现了解绑。

**本轮确认的前端缺口：**

- 字段配置列表只展示字段数，弹窗只改名称/描述。注释所称字段页“加入配置”，在本轮
  `rg src` 查到的 `useAssociateFieldConfiguration/useAssociateFieldScreen` 仅有 API/hooks 定义，
  没有 TSX 调用。
- `useUpdateTypeScreenMapping` 同样没有 TSX 消费；
  [screen-schemes-page.tsx:237](/home/my/workspace/ainfra/zira/frontend/src/features/admin/screens/screen-schemes-page.tsx:237)
  明确说当前界面只提供问题类型屏幕方案的新建/删除。
- 字段和 Screen 的辅助目录常用 `data ?? []`；
  [screen-tab-items.tsx:45](/home/my/workspace/ainfra/zira/frontend/src/features/admin/screens/components/screen-tab-items.tsx:45)
  对主 items 显示加载/错误，却没有相同地保护 fieldsQuery；
  [screen-schemes-page.tsx:50](/home/my/workspace/ainfra/zira/frontend/src/features/admin/screens/screen-schemes-page.tsx:50)
  的 screens/issueTypes 依赖也可能被当空目录。

**mybot 建议：** 在加入动态元数据前先定义依赖图和服务端 schema revision；区分字段定义、
显示布局、校验规则、权限规则、项目绑定。缺必需目录不能提交一个被静默缩减的表单；
稳定 ID 引用不能仅因名称调整而重写；改变项目/类型/角色/模型/发送范围后，旧选择、
校验、影响分析与 consent 按依赖失效。排序用准确归属和版本，不把空选项当解除关联。

## 5. 权限、项目与系统配置

### 5.1 分开的授权面

权限方案定义 `permissionKey + granteeType + typed subject`，
全局权限按单个 permissionKey 整体替换授予，
项目角色成员将用户/组连到角色；应用访问决定可登录主体；
问题安全方案/级别/成员是另一层可见性配置。它们不能互相代替。
来源：
[permission-schemes.ts:32](/home/my/workspace/ainfra/zira/frontend/src/features/admin/permission-schemes/api/permission-schemes.ts:32)、
[global-permission-edit-dialog.tsx:67](/home/my/workspace/ainfra/zira/frontend/src/features/admin/global-permissions/components/global-permission-edit-dialog.tsx:67)、
[application-access.ts:43](/home/my/workspace/ainfra/zira/frontend/src/features/admin/application-access/api/application-access.ts:43)。

新增权限授予时切换 user/group/project_role 会清空旧 subject，避免把 userId 当 groupId：
[permission-grant-dialog.tsx:108](/home/my/workspace/ainfra/zira/frontend/src/features/admin/permission-schemes/components/permission-grant-dialog.tsx:108)。
目录不可用有手工 ID/静态键的显式回退。这是录入方式变化，不是授权被扩大或主体已验证。

共享权限方案编辑先查询受影响项目并要求勾选确认：
[permission-scheme-form-dialog.tsx:38](/home/my/workspace/ainfra/zira/frontend/src/features/admin/permission-schemes/components/permission-scheme-form-dialog.tsx:38)。
但 `project_count ?? 0` 决定是否共享、详情失败未阻断确认；confirmed 也不随
name/description/影响集变化清除，handleSubmit 未再次检查 confirmed。
不能直接作为 mybot 的安全确认实现。

全局权限整体替换显式提醒遗漏主体会移除；但未知 granteeType 被转换为 user，
并仅告警而非阻断
（[global-permission-edit-dialog.tsx:45](/home/my/workspace/ainfra/zira/frontend/src/features/admin/global-permissions/components/global-permission-edit-dialog.tsx:45)）。
mybot 必须保留未知字段/授权的 round-trip 数据，或将含未知语义的对象只读/阻断保存，
不能“降级为已知类型”后提交完整替换。

### 5.2 配置不等于生效

问题安全的方案、级别、成员和项目绑定都可维护，但 enforcement 是独立只读配置：
[issue-security-page.tsx:79](/home/my/workspace/ainfra/zira/frontend/src/features/admin/issue-security/issue-security-page.tsx:79)。
已绑定和生效是不同状态；无法读取开关也不应说已经开启。
API 将部分缺能力状态和 403 返回为带 status 的 unavailable：
[issue-security.ts:631](/home/my/workspace/ainfra/zira/frontend/src/features/admin/issue-security/api/issue-security.ts:631)。
页面对 403 明确写“无法确认”，比假造 enabled 更可靠；
但 `normalizeSettings` 缺值默认 false 仍不适合 mybot 的安全读模型。

目录管理体现另一个重要影响面：停用目录会影响登录、同步和会话，而不是仅改变列表颜色；
该页面有危险确认和启用目录计数：
[directories-page.tsx:57](/home/my/workspace/ainfra/zira/frontend/src/features/admin/identity/directories-page.tsx:57)。
注释声称不能停用最后目录，但按钮 `disabled` 实际只检查 pending，`isOnlyActive`
只用于 title（`directories-page:178`）。因此“写了保护说明”不是“已实施保护”的证据。
服务端是否拒绝，本轮未知。

### 5.3 项目是配置汇合点

[project-settings-page.tsx:42](/home/my/workspace/ainfra/zira/frontend/src/features/admin/projects/project-settings-page.tsx:42)
分别读取项目详情和角色成员，前者失败不伪造项目，后者失败独立展示。
页面汇总六个方案并指向所有者页面，不复制六套换绑表单；
角色成员可在当前页单独增删。
`ProjectSchemesCard` 的“解绑回默认”与安全方案“置 null”是不同领域语义，
不能在 generic select 里统一推断。

**消费断点：** 该总览的注释列出 Screen/字段配置等六个写端点，但本轮
`screens/api/screens.ts` 没有项目绑定包装函数，对应 ScreenSchemesPage 也无绑定表；
API 注释或总览链接并不能证明每个入口已接通。权限方案写成功调用
`invalidateAdmin`，项目总览却读取非 admin 的 `queryKeys.project(key)`；
在
[use-permission-schemes.ts:61](/home/my/workspace/ainfra/zira/frontend/src/features/admin/permission-schemes/hooks/use-permission-schemes.ts:61)
所见链中未显式刷新该项目读模型。mybot 应按影响对象建立跨域失效，不只刷新管理表。

项目角色写 hooks 和权限方案 hooks 在 USE_MOCK 下直接 return，随后照常 onSuccess；
与工作流 mock 拒写不同：
[use-project-role-members.ts:31](/home/my/workspace/ainfra/zira/frontend/src/features/admin/projects/hooks/use-project-role-members.ts:31)、
[use-permission-schemes.ts:85](/home/my/workspace/ainfra/zira/frontend/src/features/admin/permission-schemes/hooks/use-permission-schemes.ts:85)。
这可触发关闭表单等成功路径，不能照搬到 mybot。

### 5.4 系统配置与敏感值

系统配置表单对 JSON 字面量执行 `JSON.parse`，不手工拼 JSON；
字段错误与 mutation error 保留在弹窗：
[system-config-edit-dialog.tsx:27](/home/my/workspace/ainfra/zira/frontend/src/features/admin/system-config/components/system-config-edit-dialog.tsx:27)。
但“敏感项”勾选与列表掩码只是显示层；
[system-config-table.tsx:46](/home/my/workspace/ainfra/zira/frontend/src/features/admin/system-config/components/system-config-table.tsx:46)
会掩码，而编辑器又从 entry.value 初始化。仅此不能证明网络响应、缓存、调试器、
审计或导出没有敏感值。

mybot 的凭证应写入专用服务端合同，返回 only configured/redacted metadata；
空值、不变、清除、替换是不同命令。不能以浏览器掩码代替不回传秘密、权限检查和脱敏。
本轮没有读取任何真实配置值。

## 6. Dashboard 配置体系

```text
DashboardPage → useDashboard / useDashboards → API → adaptDashboard
  → Gadget（外壳/操作）→ GadgetBody（数据/失败）
  → LayoutEditor（本地顺序、列宽、移除）
  → replaceGadgets → invalidateDashboard
  → 单 Gadget edit / create / delete
  → SubscriptionEditorApi → endpoint 或 local preference
```

[DashboardPage.tsx:49](/home/my/workspace/ainfra/zira/frontend/src/pages/DashboardPage.tsx:49)
仅当数字 ID 且非 degraded 时允许布局编辑，示例/别名不写。
[dashboard-layout-editor.tsx:89](/home/my/workspace/ainfra/zira/frontend/src/features/dashboard/components/dashboard-layout-editor.tsx:89)
保存单独维护的 draft；拖动排序/列宽/移除不立即写，添加小工具却由 picker 单独 POST。
保存把既有 ID、type、title、config、position、width、height 发回，而不是重建一个
只含屏幕可见字段的空对象。键盘拖动使用既有 dnd-kit sensor 与播报，不必为学习而复制 UI。

**草稿合并的价值与缺口：**

- refetch 时保留本地顺序/列宽，刷新标题/config，新项追加；这比整体 setDraft 更接近编辑需求。
- 但无 revision/冲突检测。已从本地 draft 移除、尚未保存的 Gadget 仍在服务端 incoming，
  会被当“新出现”重新追加（`layout-editor:100`）。不能笼统称“所有修改不会丢失”。
- reset/退出编辑/页头编辑切换没有 dirty 确认；
  [gadget-edit-dialog.tsx:40](/home/my/workspace/ainfra/zira/frontend/src/features/dashboard/components/gadget-edit-dialog.tsx:40)
  也会在打开期间随服务器 title/width 变化重新回填，未保护本地脏输入。
- API 同一文件顶部及 `replaceGadgets` 注释称整体删除重建 ID，而请求体注释与编辑器称
  保留 ID 的增量更新
  （[dashboard.ts:126](/home/my/workspace/ainfra/zira/frontend/src/features/dashboard/api/dashboard.ts:126)、
  [dashboard.ts:183](/home/my/workspace/ainfra/zira/frontend/src/features/dashboard/api/dashboard.ts:183)）。
  本轮只能确认客户端携带 ID，不能决定服务端真实语义或订阅是否存活。
- [use-dashboard-mutations.ts:48](/home/my/workspace/ainfra/zira/frontend/src/features/dashboard/hooks/use-dashboard-mutations.ts:48)
  的 USE_MOCK 写直接 return；这与工作流拒绝 mock 写的合同不一致。

**读取与订阅不是可无条件采用的降级：**

- [use-dashboard.ts:34](/home/my/workspace/ainfra/zira/frontend/src/features/dashboard/hooks/use-dashboard.ts:34)
  catch 所有异常为 degradedDashboard，未重新抛 Abort/403。UI 虽有 diagnostics，
  但 query success 不能代表读取成功；mybot 必须保留错误类别和对象缺失状态。
- 订阅 API 明确将 `{subscription:null}` 视为正常“无订阅”，缺路由才 unavailable，
  是可借鉴的三态合同。
- [use-dashboard-subscriptions.ts:63](/home/my/workspace/ainfra/zira/frontend/src/features/dashboard/hooks/use-dashboard-subscriptions.ts:63)
  除 403 外的读取异常均回退本机；query 无 data 时 mode 又默认 local。401、Abort、
  短暂网络失败不应被自动转换为一种可写能力。端点模式也不等于调度投递已验证。
- [subscription-mode-notice.tsx:33](/home/my/workspace/ainfra/zira/frontend/src/features/dashboard/components/subscription-mode-notice.tsx:33)
  将 endpoint 模式直接描述为“已保存到后端”，即使当前没有订阅；mybot 不采用这种
  以存储模式推导保存事实的文案。
- 本机订阅持久化包含 recipients/cron，按 dashboard ID 而非账号命名，写失败静默忽略：
  [subscription-storage.ts:89](/home/my/workspace/ainfra/zira/frontend/src/features/dashboard/utils/subscription-storage.ts:89)。
  mybot 仅保存获准的外观偏好，不因为这是“偏好”便持久化用户/收件人/项目数据。
- [subscription-form.tsx:55](/home/my/workspace/ainfra/zira/frontend/src/features/dashboard/components/subscription-form.tsx:55)
  只在序列化服务端值变化时回填，避免相同值 refetch 打断编辑，但不同值变化仍覆盖 dirty；
  这是部分保护，不是冲突合并。其 cron 校验也只是字符/最少段数，不是调度语义解析器。

**mybot 建议：** 先提供基于真实任务/Run/Call 的只读视图，不把 Gadget 编辑器变成
通用工作流执行器。未来布局可保存非敏感展示设置，但必须明确草稿、立即写和批量应用，
保留对象 ID/未知配置，使用 revision、删除 tombstone 和冲突提示；配置已保存、
订阅已创建、调度已执行、投递已送达分开。

## 7. 可合并到 AGENTS.md 的规则建议

1. 编辑器状态必须以 `objectId + baselineRevision/hash + draft` 为作用域；换对象、
   refetch、主题/语言切换不得覆盖 dirty。离页、显式重载、关闭、重置须确认；旧请求结果
   不能落到新对象，409 不通过省略版本或自动重试解除。
2. 本地编辑、已保存草稿、不可变发布版本、运行快照分离。发布/回滚作用于准确已保存候选，
   校验、影响报告与 consent 绑定同一 revision/hash 和依赖集；变化即失效。
3. 缺真实定义/必需目录/权限/目标版本/影响结果时危险操作 fail closed。示例、mock、
   本机偏好和 fallback 不能进入真实写路径或 success 回调；404 不默认等于旧部署。
4. 元数据定义、布局、显示/校验规则、权限和项目绑定是不同模型。未知字段/授权/配置必须
   round-trip 保留或阻断，不可静默丢弃、转成已知类型或补零；不支持必填字段应明确报错。
5. 配置、绑定、生效、权限、显式测试和执行证据分开。敏感值不因 UI 掩码就视为受保护，
   不回传或持久化到 UI 偏好；清除/不变/替换需有明确合同。
6. 整体替换、逐项立即写、布局草稿提交应明确；未知影响、未完成预演、共享范围变化和
   dirty 输入不能被“确认”永久覆盖。危险确认在 handler/API 层再次验证，而非只禁按钮。
7. 成功后按真实依赖刷新所有读模型，必要时等待权威回读；区分“请求已确认”与
   “投影已刷新”。取消、401/403、缺能力、对象缺失、失败、空态和 unknown 分开。

这些规则保持 React 19 + Astryx、项目自有封装与单一 token/业务组件树，不引入
Zira 的 React 18/Radix/CVA/Tailwind 组件库，也不把 Zira 的 Jira 领域/接口当 mybot 能力。

## 8. 分阶段落地与验收

| 阶段 | mybot 落点 | 必须证明 |
| --- | --- | --- |
| A：当前表单可靠性 | 现有项目/任务/模型/后端/确认 Wizard，不新增任意 DAG | dirty 输入跨主题/语言/refetch 保留；换对象与离页确认；403/409/422/网络失败保留输入；重复点击/Enter 只提交一次 |
| B：配置依赖与版本合同 | 优先补真实身份/角色/字段或资源目录、revision、稳定错误码与跨域刷新 | 缺目录/未知字段/过期版本拒绝提交；依赖变化清除旧 consent；成功后列表/详情/总览同源；401 清私有投影与在途结果 |
| C：工作流草稿试点 | 新 ADR/工作项定义 Draft/Version/RunSnapshot、校验与影响，不先做执行画布 | 双客户端并发 409；预演精确绑定 hash；dirty/缺草稿/影响未知不能发布；回滚产生新版本，既有 Run 历史不变 |
| D：受控发布与执行 | 另有权限/能力/预算/幂等/超时/未知结果合同后才接执行 | 无示例或 fallback 写；服务端重复提交安全；超时不自动重放；发布、启动、暂停/取消/重试各自合法转换并留审计 |
| E：可选布局配置 | 同一业务读模型与 Astryx 页面，仅保存许可的非敏感展示设置 | refetch 不恢复本地删除或覆盖宽度；并发有冲突；既有 ID 和未知 config 保留；布局保存不启动模型、不改变 Run 状态 |

每阶段需要单元/合同测试加真实浏览器交互，包含窄屏、键盘、焦点返回、
长中文/英文标签、明暗/多样式与 reduced motion；新运行能力另走隔离 fixture 与显式授权。
本研究没有执行这些验收，不将其计入现有测试数、119 项台账完成数或已集成模板数。

文档检查：本文件的本地 Markdown 目标均存在，带行号的源码链接未超出文件边界；
新增文件 whitespace 检查无诊断。这些只是文档完整性检查，不是 Zira 或 mybot 运行测试。

后续研究缺口：后端授权/CAS/发布事务/版本不可变性、影响分析与目标版本关系、
字段必填隐藏冲突、动态表单消费者、目录停用的会话失效、跨账号订阅隔离、
整体替换真实 ID 语义、审计完整性、无障碍/手机运行表现均需独立证据，不能由本篇推定。
