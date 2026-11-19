# Zira 前端排版观察

日期：2026-11-13。用户明确允许只读学习 `/home/my/workspace/ainfra/zira/frontend`。
此授权不覆盖其他兄弟项目，不代表可以修改 Zira、读取凭证或复用业务 API。

后续“全前端结构 + 核心链路深读”见
[ZIRA_FRONTEND_STUDY.md](ZIRA_FRONTEND_STUDY.md)：625 文件、79,264 行结构覆盖，
15 个 feature 域、35 个顶层显式 path Route。该数值不是逐行审计或联调验收。

## 来源

- 本地仓库：`/home/my/workspace/ainfra/zira`。
- 读取时 Git HEAD：`1ce0d0510cb590f3a79ca498f7239ff0852ed0d7`。
- 已阅读路径：
  - `frontend/src/components/layout/{AppShell,TopBar,PageHeader,ContextBar}.tsx`
    的布局/页头代表实现。
  - `frontend/src/pages/{IssueNavigatorPage,DashboardPage}.tsx` 的代表排版与状态组织。
  - `frontend/src/index.css` 的语义变量、密度、明暗分支。
  - `frontend/src/lib/theme.ts`、`frontend/src/stores/ui-store.ts` 的外观偏好边界。
- 未运行 Zira、未读取 `.env`、账号、数据库、Cookie 或运行日志；没有修改该仓库。
  用户后续明确允许同配色：已将读到的背景/文字/强调/边框/状态色重建为 Astryx 的
  `zira` Token 预设，保留 mybot 自有预设。没有复制组件源码、品牌、图标或业务数据。

## 观察与采用

| 观察 | mybot 本地适配 |
| --- | --- |
| TopBar、上下文、页面内容分层，标题/操作/筛选有固定顺序 | 保留 mybot 侧栏，但收紧页头，固定顶栏；视图切换与过滤栏分开 |
| 列表/详情使用一致标题尺度与响应式信息密度 | 页面标题 24px，紧凑/舒适偏好；手机不靠缩小正文容纳全部面板 |
| 颜色由语义变量提供，业务页不按主题各写一套 | `--wb-*` 映射 Astryx Token，所有业务页面共用一个组件树 |
| UI 偏好与服务器状态分离 | style/mode/density/locale 本地保存；Run/调用/项目仍由 API 决定 |
| 列表、详情和筛选围绕同一业务来源组织 | 列表/表格/看板与总览/待处理共享 task/run 投影，不复制样例数据 |
| 加载、空态、错误与可编辑状态区分 | Skeleton 仅在读取中；未知成本不填零；SSO/同步未验收不展示为可用 |

没有采用 Zira 的技术栈或服务端接口。其 mock 回退、JQL、团队权限、动态 Dashboard
等能力不是 mybot 的已实现事实。本轮采用的是排版和状态组织原则，而非整站复制。
同配色是用户明确要求的可选外观适配，不是把 Zira UI 库引入 mybot。

## 验证边界

本地改动与浏览器证据记在 [模板整合](ASTRYX_TEMPLATE_INTEGRATION.md) 和
[进度日志](PROGRESS_LOG.md)。Zira 源码中写明“已实现/已验收”的内容不视为 mybot
测试证据；本轮也未单独验证 Zira 的真实运行效果。

## 搜索与结果链路复核（2026-11-14）

用户再次否定 `5173/#workbench` 的搜索/列表体验，要求认真对照 Zira。此前仅把多层
页面缩成一行筛选，并未形成完整的查询、结果工具栏和可恢复列表状态，本轮明确修订。

源码 HEAD 再核对仍为 `1ce0d0510cb590f3a79ca498f7239ff0852ed0d7`。额外逐段阅读：

- `src/pages/IssueNavigatorPage.tsx`：已提交查询与 draft、URL 状态、结果计数、工具栏、
  侧栏折叠、表格/详情/手机列表的组合。
- `src/features/issues/components/jql-bar.tsx`、`jql-input.tsx` 的查询提交和模式边界。
- 同目录 `issue-table.tsx`、`issue-row.tsx`、`issue-columns.ts`、`issue-cell.tsx`、
  `issue-card-list.tsx`、`pagination.tsx`、`filter-sidebar.tsx`、`results-state.tsx`。
- `src/components/ui/toolbar.tsx` 及 PageHeader/ContextBar/TopBar 的间距和层级。

采用与不采用：

| 本轮核实的原则 | mybot 实现与边界 |
| --- | --- |
| 输入草稿不等于已提交查询 | Basic 同样用搜索/Enter 提交；草稿、已提交 `q`、结果明确分开；IME 不提交 |
| 页头、查询区和结果工具栏是独立全宽带 | 工作台使用紧凑全宽带；不再将多个下拉、查询模式和结果操作挤在同一行 |
| 常用范围与结果可组合，侧栏不应挤占手机 | 实际状态/项目导航可折叠，窄屏打开同份 Astryx Dialog；没有假保存过滤器 |
| 工具栏包含当前计数、视图、排序和容量 | Tasks 排序/分页是真实受控状态；Board/Run history 不展示不会生效的容量控件 |
| 编号与摘要各有稳定列，长摘要不撑高行 | mybot 任务 ID 单列，标题单行截断，详情保留完整目标/历史；手机允许换行 |
| 分享/返回应恢复同一结果集 | `q/filter/project/order/page/pageSize` 与既有 JQL/视图一起进 URL，非法值校验 |

不照搬 JQL 服务端、Jira 负责人/优先级、假最近项、API 不可达时的示例过滤器、
未接通的订阅/批量控制。Zira 源码的容量选择没有本地 onChange、全量选择实际只有本页
等问题仍不采用。mybot 继续使用 Astryx；没有复制 Zira 组件、样式表或品牌，没有启动
或修改 Zira、读取账号/数据库，也没有为这次界面评审发送真实模型请求。

新浏览器/单测结果以进度日志的“搜索与列表链路重做”条目为准；上一轮 36 项浏览器
检查只代表上一轮，不替代本次提交式搜索的验证。用户尚未接受本次新视觉。

## 筛选折叠、列菜单与统一尺寸（2026-11-14）

用户补充截图后明确：折叠放在 Filters 标题处；排序属于表格右上角列工具，不应
单独占页头。再次只读核对的 Zira HEAD 仍为
`1ce0d0510cb590f3a79ca498f7239ff0852ed0d7`，检查路径为
`IssueNavigatorPage.tsx`、`filter-sidebar.tsx`、`components/ui/toolbar.tsx`。
**此提交的导航器仍有独立排序 select，与用户截图并不完全一致**；因此本轮位置依据
用户最新要求，不能声称从该源码找到了截图的完整列菜单实现。

mybot 本地采用：

- `FocusedWorkbench` 的 Filters 标题内收起，折叠后原处保留展开入口；不在查询输入
  旁再放一份桌面折叠命令，手机沿用同源筛选 Dialog。
- 表格右上 `列设置` 使用项目封装的 Astryx DropdownMenu，包含既有单排序的子菜单、
  真实列显隐和重置。摘要列不可隐藏。仅保存非敏感列键，不保存任务正文。
- `DensityContext` 在包装层统一 Button/Input/Selector/Number/Segments 与 Table 的
  默认密度；保持显式局部覆盖可用，不通过复制页面达到紧凑效果。
- 八种样式外增加独立强调色和触控密度，仍由同一 Astryx Token 注册表控制。
  样式、强调色、明暗、语言、密度独立，不触发模型或修改 Run。

列顺序、多字段排序、分组和大数据虚拟化仍未完成；本轮代码实现/定向测试不等于
完整生产浏览器回归，更不代表用户已经接受视觉效果。最终验收见进度日志。

## 项目目录范围与数据边界适配（2026-11-18）

沿用此前固定Zira HEAD `1ce0d0510cb590f3a79ca498f7239ff0852ed0d7`及
`IssueNavigatorPage.tsx`、`filter-sidebar.tsx`、`components/ui/toolbar.tsx`的观察：
Filters目录搜索与结果查询分工、局部滚动、总数来源必须明确。本轮没有重新读取或运行
Zira，不将用户截图、旧源码观察与mybot的新分页实现混为同一证据。

mybot的本地适配是ADR-0015：全局项目侧栏/任务范围共用Astryx项目目录；独立Search与
20项分页、selected跨页补齐、Task/历史Run计数、全工作区totals及错误重试。
数字通过发布包Button.endContent对齐，不复制Zira组件/样式；901px仅挂当前可见导航。
最终1199前端/710Python/build、生产37/8/58/15项及82PNG见
`frontend/evidence/project-references-2026-11-18/README.md`。
原4180未启用新cap；完整Project消费者和Bootstrap传输仍待迁移，面板重挂可重置本栏草稿，
不把运行验收扩大成用户视觉接受、全部Zira功能或全局性能结论。

## 主查询候选与项目目录分工适配（2026-11-19）

沿此前Zira HEAD `1ce0d0510cb590f3a79ca498f7239ff0852ed0d7`及
IssueNavigatorPage、filter-sidebar、query-keys和数据/交互专题的固定源码观察：
目录搜索和结果查询分工、草稿独立、引用错误不等同missing。本轮只复用已有研究，
未重新读取或运行Zira，用户截图仍不是该源码版本的功能证明。

mybot ADR-0016本地实现主查询项目分页多选和committed引用确认；Search提交Basic候选，
目录Search/翻页/Done不改任务URL。用项目自有Astryx领域组件，不复制Zira源码/样式。
SavedView加载先fresh项目校验，绑定draft/table baseline，异步阶段不偷改已应用内容。
手机nested Filters/Dialog与焦点已验；保留legacy scope导航取消、失败/401及未知写入合同。
1245前端/build与生产44/32/58/5项、96PNG见本轮证据。
完整Project消费者/Bootstrap减量与主服务启用仍待后续，不把该局部闭环当全站接受。

## 完整项目对象与表单引用适配（2026-11-20）

沿此前固定Zira HEAD `1ce0d0510cb590f3a79ca498f7239ff0852ed0d7`及已读
项目/Issue列表、query-keys和创建表单的观察：摘要/详情/引用应有独立合同，dirty表单不得
被refetch替换，分页总数不由当前页推断。本轮没有新读取/运行Zira；固定源码、截图、
mybot实现及测试仍分别记录，不复制Zira品牌/组件/样式。

mybot ADR-0017新增明确cap的完整项目detail与bounded摘要query；复用现有Astryx原项目页面/
列表外观，Task form用封装RadioList做真实单选。项目依赖先验证、fresh GET不替代最终POST检查。
sameID临时失败保留有stale反馈的已验对象和querydraft；missing/forbidden/401优先清理。
真实APIfixture明确新增1Task及preview而非模型执行，原任务/Run/项目/模型均比对。
1314前端/787Python/build及最终37/44/58/4项、81PNG见本轮证据；
其他视图仍用Bootstrap、主4180未加载新cap，不把局部运行通过当整体减量或视觉接受。
