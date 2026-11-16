# Zira 交互链专题研究

日期：2026-11-14（Asia/Singapore）。保留 2026-11-13 总体结构研究的历史日期；
本文件是其交互链补充，不重算结构覆盖或工作项完成数。

## 1. 范围与证据

- 用户授权范围：只读 `/home/my/workspace/ainfra/zira/frontend` 的前端交互结构。
  来源仓库 `/home/my/workspace/ainfra/zira`，本轮核对 HEAD 为
  `1ce0d0510cb590f3a79ca498f7239ff0852ed0d7`。
- 先读 mybot 的 `AGENTS.md`、`CONTINUE.md`、ADR-0006、
  `ASTRYX_TEMPLATE_INTEGRATION.md`、`UI_ITERATIONS.md`、
  `ZIRA_FRONTEND_STUDY.md` 和 `REA_ZIRA_LAYOUT.md`。现有工作区有未提交改动，
  本专题只新增本文件，不调整产品代码或其他记录。
- 625 文件索引见 [2026-11-13 结构索引](research/zira-frontend-2026-11-13.json)；
  它用于定位文件，**不等于逐行审计、类型检查、业务联调或浏览器通过**。
  本轮人工深读下列代表消费链，没有逐项审计全部业务边角。
- **没有运行 Zira、调用其 API、运行其测试或连接后端。** 没有读取 `.env`、
  凭证、数据库、Cookie、会话数据或运行日志，没有修改 Zira，没有模型调用。
  下文“观察”是固定版本源码证据；“风险/待验收”不冒充复现过的运行缺陷。
- 只学习交互分层和产品工程约束。mybot 继续 React 19 + Astryx；
  不导入 Zira 的 React 18、Radix/CVA/Tailwind UI 实现，不复制品牌、资产或示例业务记录。
  Astryx 对应关系以当前 mybot 包装层与安装源码为边界，不表示所有建议已实现。

## 2. 导航与命令入口

### 消费链

`App 路由/会话门禁 → AppShell → TopBar + ContextBar → 页面 PageHeader`

`TopBar/移动导航/GlobalHotkeys → ui-store 开关 → CommandPalette → navigate 或本地动作`

| 源码定位 | 观察 | mybot 采用边界 |
| --- | --- | --- |
| [App.tsx:53](/home/my/workspace/ainfra/zira/frontend/src/App.tsx:53)、[App.tsx:138](/home/my/workspace/ainfra/zira/frontend/src/App.tsx:138) | Router 挂全局快捷键，业务路由在 RequireAuth/AppShell 内；命令面板与创建弹窗统一挂载在路由外层 | 借鉴全局入口单一来源，不在每页复制弹层；这不是 Zira 全局浮层权限已审计的证据 |
| [AppShell.tsx:18](/home/my/workspace/ainfra/zira/frontend/src/components/layout/AppShell.tsx:18) | SkipLink、TopBar、ContextBar、main/Outlet 分层；引用数据水合与页面布局分开 | mybot 保留自己的信息架构；导航、页上下文和结果区不各自成为一个大卡片 |
| [TopBar.tsx:57](/home/my/workspace/ainfra/zira/frontend/src/components/layout/TopBar.tsx:57)、[TopBar.tsx:118](/home/my/workspace/ainfra/zira/frontend/src/components/layout/TopBar.tsx:118) | 桌面主导航、创建命令、全局搜索分区；窄屏显示图标入口 | 学习“搜索作用域稳定”，不是照搬菜单或默认业务分类 |
| [TopBar.tsx:39](/home/my/workspace/ainfra/zira/frontend/src/components/layout/TopBar.tsx:39)、[TopBar.tsx:189](/home/my/workspace/ainfra/zira/frontend/src/components/layout/TopBar.tsx:189) | 移动导航使用同一 NAV_MENUS；从导航进入搜索先关闭导航，再打开同一命令面板 | 同一命令源服务桌面和手机，避免两个独立搜索实现；需要真实焦点交接测试 |
| [ContextBar.tsx:14](/home/my/workspace/ainfra/zira/frontend/src/components/layout/ContextBar.tsx:14) | 路径解析生成上下文 Tabs，导航容器自己横向滚动 | 页内上下文不与全局导航混合；不照搬其 `aria-disabled` 即视作阻止导航，实际阻止行为仍须核验 |
| [PageHeader.tsx:25](/home/my/workspace/ainfra/zira/frontend/src/components/layout/PageHeader.tsx:25) | 面包屑、标题/leading、主操作、说明为稳定槽位，支持 sticky | 在 mybot 的项目封装中复用页头布局；标题尺寸不能随着每页装饰性卡片变化 |

### 命令面板的实际边界

[CommandPalette.tsx:37](/home/my/workspace/ainfra/zira/frontend/src/components/command/CommandPalette.tsx:37)
定义的是静态 ITEMS。`:59` 只做 label 的小写 includes；
`:65` 的 run 仅支持创建、换肤和已配置的导航。
`:45`、`:46` 的“最近”条目没有 `to`/`action`，点击只关闭面板并清空查询，
不是读取真实历史。`:96` 输入 Enter 运行第一条可见项；这条消费链没有方向键活动项/
listbox 导航实现，不能称为完整远程搜索或完整命令选择器。
输入提示里出现问题 key/JQL 也不等于具备它们的解析、补全或跳转能力。

mybot 应继续使用已有
[AppCommands](../frontend/src/components/ui/Commands.tsx) 对 Astryx
CommandPalette/Typeahead 的包装，不复制这套 Dialog + input + button 列表。
命令必须来自真实可用导航/对象/动作；无实现项移除或明确禁用，不展示假“最近”。
全局入口打开搜索不得调用模型、测试连接或改变运行状态。

## 3. 搜索、URL 与列表状态

### 消费链

`IssueNavigatorPage URL → committed jql/order/page → useIssueSearch query key`

`JqlInput draft → 显式提交 → URL → POST /search → mapIssue + visibility/warnings`

`同一 issues → IssueTable / IssueCardList / DetailPreview → Pagination`

| 源码定位 | 观察 | 可借鉴点与限制 |
| --- | --- | --- |
| [IssueNavigatorPage.tsx:52](/home/my/workspace/ainfra/zira/frontend/src/pages/IssueNavigatorPage.tsx:52) | 从 URL 读 filter/jql/view/order/page；project 路由可提供默认 JQL | 查询与分享状态归 URL；默认领域条件不能复制进 mybot |
| [IssueNavigatorPage.tsx:62](/home/my/workspace/ainfra/zira/frontend/src/pages/IssueNavigatorPage.tsx:62)、[jql-bar.tsx:62](/home/my/workspace/ainfra/zira/frontend/src/features/issues/components/jql-bar.tsx:62) | jqlDraft 独立于 committed jql；回车/搜索按钮/u 才提交 | 编辑不等于执行，草稿变化不应触发服务器检索或模型动作；提交/丢弃/返回语义必须明确 |
| [use-issue-search.ts:38](/home/my/workspace/ainfra/zira/frontend/src/features/search/hooks/use-issue-search.ts:38) | query key 含 jql/startAt/maxResults/order；AbortSignal 传入 API；mock 分支才本地求值 | 查询契约和取消信号比“引入相同状态库”更重要；不把 mock 求值器当生产解析器 |
| [search.ts:55](/home/my/workspace/ainfra/zira/frontend/src/features/search/api/search.ts:55) | 搜索使用 POST body，结果映射集中返回分页/visibility/warnings | 页面消费统一 read model；不能将缺失字段默认值当成服务端保证 |
| [order-by.ts:7](/home/my/workspace/ainfra/zira/frontend/src/features/search/utils/order-by.ts:7)、[jql-bar.tsx:57](/home/my/workspace/ainfra/zira/frontend/src/features/issues/components/jql-bar.tsx:57) | UI 排序串转为后端 orderBy；注释声明 JQL ORDER BY 优先；警告区受“JQL 含 ORDER BY 且 warnings 非空”条件控制 | 必须显示实际生效排序和未支持条件；转换字符串不是 JQL 解析器，警告不能只凭数量推断原因 |
| [results-state.tsx:30](/home/my/workspace/ainfra/zira/frontend/src/features/issues/components/results-state.tsx:30) | 分开错误、403、权限裁剪至零、真空态；只对读查询提供重试入口 | mybot 保留初次加载、刷新旧数据、失败、无权限、缺失、真空、未支持的独立状态，不向模型动作套用读重试 |

### 不应照搬的 URL/分页实现细节

- [IssueNavigatorPage.tsx:81](/home/my/workspace/ainfra/zira/frontend/src/pages/IssueNavigatorPage.tsx:81)
  的 setParam 从闭包 params 克隆；`:91` 的 runSearch 连续调用两次 setParam，
  selectFilter `:144` 又会组合多个调用，默认 `replace=true`。
  **本轮未运行，不能宣布回退历史已通过。** mybot 应一次原子提交查询、重置页码、
  filter/view/sort 的组合变更；单测和浏览器验证后退/前进、刷新及快速连续操作，
  不能机械搬运多个基于旧 URL 快照的 setter。
- `page` 在 `:60` 直接 Number 转换，view 在 `:58` 直接类型断言；
  本层没有完整 URL 范围校验。mybot 需要规范化非法页码、未知视图/排序，
  说明拒绝或修正结果，不让不受信 URL 状态进入越界索引。
- `PAGE_SIZE` 在 `:30` 固定为 20。`:294` 的“每页条数”只有 defaultValue，
  没有 onChange；选择 50/100 不会改变传给 hook 的 pageSize。
  这是源码可见的无业务联动控件，不把“有选项”记为分页能力。
- [use-issue-search.ts:73](/home/my/workspace/ainfra/zira/frontend/src/features/search/hooks/use-issue-search.ts:73)
  保留前次 placeholderData，而页面主要检查 isPending；
  这不证明已有“正在刷新/旧结果”可见反馈。mybot 查询变化时必须表明数据所属查询，
  不能把旧数据伪装为新查询的确定结果。

### 选择、激活、预览和全选

[IssueNavigatorPage.tsx:72](/home/my/workspace/ainfra/zira/frontend/src/pages/IssueNavigatorPage.tsx:72)
分别保存 selectedKeys 和 focusIndex；选择、打开详情、当前预览是不同动作。
[issue-table.tsx:58](/home/my/workspace/ainfra/zira/frontend/src/features/issues/components/issue-table.tsx:58)
计算全选/半选；`:71` 的名称明确是“本页”。
[issue-row.tsx:37](/home/my/workspace/ainfra/zira/frontend/src/features/issues/components/issue-row.tsx:37)
将 aria-selected、tabIndex、双击打开与 Checkbox 分开，行内操作在 hover 或
focus-within 时出现。手机
[issue-card-list.tsx:25](/home/my/workspace/ainfra/zira/frontend/src/features/issues/components/issue-card-list.tsx:25)
消费同一 issues 和 selectedKeys，而不是第二份假数据。

限制不能从注释中消失：

- [IssueNavigatorPage.tsx:374](/home/my/workspace/ainfra/zira/frontend/src/pages/IssueNavigatorPage.tsx:374)
  的 onSelectAllMatching 仍只取当前页 issue keys。
  [batch-operation-bar.tsx:135](/home/my/workspace/ainfra/zira/frontend/src/features/issues/components/batch-operation-bar.tsx:135)
  按钮可显示“选择全部 total 项”，但 title 和 `:190` 提示说明仅当前已持有 keys。
  mybot 不采用这种含糊主文案：只支持本页就只显示“全选本页”；全结果集操作必须有
  服务端范围标识、快照/排除项、确认范围和逐项结果，不能靠一个 Set 假装成立。
- 当前 selectedKeys 没有在 `jql/page/order` 变化时重新核对；focusIndex 也不是稳定对象 ID。
  [detail-preview.tsx:29](/home/my/workspace/ainfra/zira/frontend/src/features/issues/components/detail-preview.tsx:29)
  用 issues[focusIndex] 取对象。mybot 应分别定义换查询/换页/排序后的选择策略、
  保留或清空条件和活动 ID 回退，避免把旧索引映射到另一条记录。
- [issue-table.tsx:38](/home/my/workspace/ainfra/zira/frontend/src/features/issues/components/issue-table.tsx:38)
  注释声称 aria-multiselectable，当前 JSX `:63` 未设置该属性；
  行 tabIndex 随 focusIndex 变更，不等于 DOM 焦点已经移动。
  “roving tabindex”注释和快捷键清单不能代替 activeElement/可访问树实测。

### 补全、保存与批量动作

[jql-input.tsx:38](/home/my/workspace/ainfra/zira/frontend/src/features/issues/components/jql-input.tsx:38)
补全项是静态字段/函数列表；`:98` 实现 Ctrl+Space/上下/Tab/Enter/Escape，
`:140` 有 combobox/listbox 的结构化语义，但 `:15` 的远程元数据/值补全/诊断仍为 TODO。
[search.ts:122](/home/my/workspace/ainfra/zira/frontend/src/features/search/api/search.ts:122)
存在元数据和校验函数，不代表 JqlInput 已消费。输入事件本身没有统一 hook 的 IME 防护，
需单独验收输入法组合中的 Enter 不误提交。

[jql-bar.tsx:97](/home/my/workspace/ainfra/zira/frontend/src/features/issues/components/jql-bar.tsx:97)
“保存”和“另存为”调用同一 onSaveFilter；页面
[IssueNavigatorPage.tsx:399](/home/my/workspace/ainfra/zira/frontend/src/pages/IssueNavigatorPage.tsx:399)
均打开 CreateFilterDialog，不能推断“保存”已更新当前过滤器；
`:120` 的订阅是明确禁用项。mybot 不展示未实现的保存语义、查询语言或订阅能力。

[batch-operation-bar.tsx:79](/home/my/workspace/ainfra/zira/frontend/src/features/issues/components/batch-operation-bar.tsx:79)
保留上次动作参数供失败项重试，结果面板区分部分结果；`:104` 删除需确认。
其 `:44` 声明的后端不可用时前端并发扇出是 Zira 领域策略，**不适用于 mybot 模型调用**。
未知结果、成本、幂等、授权变化和预算必须先成立，不因“重试这些”按钮而自动再消费。

## 4. 详情预览、完整详情与动作

### 消费链

`结果页同一 issues + 活动项 → DetailPreview → 显式打开详情`

`IssueDetailPage → useIssue/extras/neighbours/transitions → IssueHeader/OpsBar +
内容模块 + FieldRail → mutation → 关联查询失效`

- [detail-preview.tsx:28](/home/my/workspace/ainfra/zira/frontend/src/features/issues/components/detail-preview.tsx:28)
  左列表点击只变活动项；双击/打开详情才路由跳转。窄屏上下排列，桌面左右排列；
  预览消费列表的 Issue，未独立请求完整详情。这是“快速检查”而非完整编辑页。
- [IssueDetailPage.tsx:53](/home/my/workspace/ainfra/zira/frontend/src/pages/IssueDetailPage.tsx:53)
  主对象、extras、相邻项、可达转换、关注/投票、工时等分别查询；
  `:149`、`:160`、`:172` 分别处理主对象失败、加载和不存在。
  子查询结果被缺省为数组的地方不代表其失败已可见；须逐模块区分数据缺失与空内容。
- [issue-header.tsx:82](/home/my/workspace/ainfra/zira/frontend/src/features/issues/components/issue-header.tsx:82)
  组合面包屑、摘要编辑、相邻项、次要工具与 OpsBar。
  [ops-bar.tsx:90](/home/my/workspace/ainfra/zira/frontend/src/features/issues/components/ops-bar.tsx:90)
  先展示前三个转换，其他进菜单，不前端重新排序。
  [transition-button.tsx:20](/home/my/workspace/ainfra/zira/frontend/src/features/issues/components/transition-button.tsx:20)
  处理 blockedReason 与说明。mybot 的 Run 操作也应由后端合法状态/能力驱动，
  不能依据按钮位置或前端状态字符串伪造可执行性。
- [IssueDetailPage.tsx:88](/home/my/workspace/ainfra/zira/frontend/src/pages/IssueDetailPage.tsx:88)
  转换提交 transitionId，不直接写 status；
  [use-transitions.ts:43](/home/my/workspace/ainfra/zira/frontend/src/features/issues/hooks/use-transitions.ts:43)
  成功后调用 invalidateIssueRelated。可以学习显式动作合同与受影响投影刷新，
  不借此认定转换界面、权限或服务端并发控制均已验收。
- [field-rail.tsx:70](/home/my/workspace/ainfra/zira/frontend/src/features/issues/components/field-rail.tsx:70)
  将归档与服务端字段只读元信息组合成原因；字段可见性、不可编辑和对象不存在不同。
  但 `:158` 起的一些字段仅接总体 readOnly，不能根据顶部注释假设所有字段权限一致覆盖。
- [IssueDetailPage.tsx:296](/home/my/workspace/ainfra/zira/frontend/src/pages/IssueDetailPage.tsx:296)
  大屏字段栏与 `:328` 的手机抽屉复用 FieldRail。mybot 可复用同一领域 Inspector，
  由 Astryx Dialog/adaptive presentation 承担窄屏，不另写手机业务逻辑。

### 需要作为规则反例保留

| 源码 | 实际链路/风险 | mybot 验收要求 |
| --- | --- | --- |
| [ops-bar.tsx:137](/home/my/workspace/ainfra/zira/frontend/src/features/issues/components/ops-bar.tsx:137)、[IssueDetailPage.tsx:191](/home/my/workspace/ainfra/zira/frontend/src/pages/IssueDetailPage.tsx:191) | 添加附件接可选 onAttach，但页面没有给 IssueHeader 传 onAttach；图标可点击不等于完成动作 | 每个可见命令从名称追踪到 handler；无实现必须移除/禁用并给正确原因 |
| [ops-bar.tsx:140](/home/my/workspace/ainfra/zira/frontend/src/features/issues/components/ops-bar.tsx:140)、[issue-header.tsx:140](/home/my/workspace/ainfra/zira/frontend/src/features/issues/components/issue-header.tsx:140) | “复制问题链接”接 onWatch，父层传 onToggleWatch；不是 Clipboard 链路 | 测试名称、图标、实际副作用一致；复制不能改变关注、授权或业务状态 |
| [IssueDetailPage.tsx:95](/home/my/workspace/ainfra/zira/frontend/src/pages/IssueDetailPage.tsx:95)、[IssueDetailPage.tsx:212](/home/my/workspace/ainfra/zira/frontend/src/pages/IssueDetailPage.tsx:212) | 多个 onError 也写入 notice，显示处固定 success tone | action status 结构化保存 pending/success/error/unknown；失败不得用成功色或成功播报 |
| [ops-bar.tsx:101](/home/my/workspace/ainfra/zira/frontend/src/features/issues/components/ops-bar.tsx:101) | focus ref 固定第一项，不是搜索第一个可用项；注释“第一个可用”不能当行为证明 | 菜单/toolbar 键盘路径要测禁用首项、无可用动作和关闭后焦点返回 |
| [use-issue-neighbours.ts:17](/home/my/workspace/ainfra/zira/frontend/src/features/issues/hooks/use-issue-neighbours.ts:17)、[neighbour-rail.tsx:8](/home/my/workspace/ainfra/zira/frontend/src/features/issues/components/neighbour-rail.tsx:8) | 相邻项从 key 前缀导出项目，最多取100条；栏名“我的问题”并不附加当前用户过滤 | 不将“相邻项”假装原搜索结果或个人范围；返回列表保存真实 query/排序/页/活动对象/滚动位置 |
| [IssueDetailPage.tsx:135](/home/my/workspace/ainfra/zira/frontend/src/pages/IssueDetailPage.tsx:135)、[IssueDetailPage.tsx:329](/home/my/workspace/ainfra/zira/frontend/src/pages/IssueDetailPage.tsx:329) | 分配快捷键/按钮打开 fieldSheet；抽屉在宽屏被 CSS hidden；实际焦点/可见性尚未测试 | 响应式改变展示容器时，所有入口必须指向当前可见 Inspector，而不是打开隐藏 overlay |

以上为本版本源码观察，不扩展成 Zira 全站不可用的结论。mybot 的 Task、Run、Agent、
Call、Artifact、Event 不等于 Issue 的字段/关注/投票/工时，不能为了采用版式而补造业务。

## 5. 看板与 Backlog

### 看板消费链

`BoardPage → useBoard(configuration + issues) → columnId 分桶 → BoardCanvas →
候选 transitions / rank mutation → invalidate`

- [use-board.ts:53](/home/my/workspace/ainfra/zira/frontend/src/features/boards/hooks/use-board.ts:53)
  并行读配置和前200项问题，按服务端 columnByKey 放入列。未在这条链中继续取完分页，
  列计数不能天然视为全部结果集的计数。
- [BoardPage.tsx:51](/home/my/workspace/ainfra/zira/frontend/src/pages/BoardPage.tsx:51)
  搜索/“仅我的”/更新排序是当前已加载数据的本地筛选，不是完整服务端查询；
  `:111` 可显示配置中的快捷过滤名，而实现只识别两个固定名称。
  mybot 不把可切换 chip 当任意筛选表达式已执行，也不把用户身份未知当“仅我的”已生效。
- [board-canvas.tsx:111](/home/my/workspace/ainfra/zira/frontend/src/features/boards/components/board-canvas.tsx:111)
  目标列候选依据 transition.to 与列状态名相交；`:148` 分为无候选拒绝、一个直接转换、
  多个弹选择器。`:187` 将同列排名与跨列转换分开，是值得借鉴的领域边界。
- [board-canvas.tsx:229](/home/my/workspace/ainfra/zira/frontend/src/features/boards/components/board-canvas.tsx:229)
  采用已有 dnd-kit 传感器、屏幕阅读说明/播报，`:238` 将横向滚动限制在画布区域。
  这只是源配置，不是触屏、读屏或 reduced-motion 已通过。

不直接采用的细节：

1. [board-canvas.tsx:121](/home/my/workspace/ainfra/zira/frontend/src/features/boards/components/board-canvas.tsx:121)
   先乐观移卡、`:142` 先播报“已移动”，随后 mutation；
   没有在本组件接 error/rollback。关联 hook
   [use-transitions.ts:48](/home/my/workspace/ainfra/zira/frontend/src/features/issues/hooks/use-transitions.ts:48)
   仅成功失效。不能称失败必回滚；mybot 当前只读看板不启用这种动作，
   将来写动作必须分 pending/confirmed/rejected/unknown 并有恢复路径。
2. `:160` 只在拖拽开始取 transitions，失败被 `:167` 变为 []；
   `:197` 的 Ctrl+左右复用候选，却不在该路径请求 transitions。
   网络失败与“合法但无可达转换”不能合并；拖动和键盘要走同一能力合同。
3. `:188`、`:225` 排名 mutation 只发 issueKeys；
   [rank.ts:16](/home/my/workspace/ainfra/zira/frontend/src/features/boards/api/rank.ts:16)
   契约支持 beforeKey/afterKey，但这些调用未提供目标锚点。
   不能依据本地换序或“排名已接后端”断言服务端目标位置已持久化。
4. `:98` 注释声称触屏长按200ms，实际 `:99` 是 PointerSensor distance=4。
   不用注释代替真实手势验证。动画 `:257` 固定320ms；本专题未核验全局减弱动画覆盖。
5. [board-card.tsx:73](/home/my/workspace/ainfra/zira/frontend/src/features/boards/components/board-card.tsx:73)
   背面信息仅 group-hover 显示，评论数 `:79` 硬编码0；手机/键盘的等价信息与真实计量
   都不能从该展示推断。
6. [BoardPage.tsx:226](/home/my/workspace/ainfra/zira/frontend/src/pages/BoardPage.tsx:226)
   页脚泳道/Epic开关是文字，不是实际可切换面板或查询能力的证据。

### Backlog 消费链与未完成动作

`useBacklog(backlog + sprint list + each sprint issues + epics) → issuesByKey →
Sprint/Backlog RankList → 本地覆盖列表 + rank mutation`

[use-backlog.ts:47](/home/my/workspace/ainfra/zira/frontend/src/features/backlog/hooks/use-backlog.ts:47)
将引用汇入 issuesByKey，避免页面逐个请求详情，可学习这种统一 read model。
但 Epic 失败 `:51`、每 Sprint 问题失败 `:56` 被回退成 []，不应移植为“成功空列表”；
Backlog 默认只取100条，不能把页面
[BacklogPage.tsx:266](/home/my/workspace/ainfra/zira/frontend/src/pages/BacklogPage.tsx:266)
“滚动到底加载更多”文字当已实现游标消费。

[BacklogPage.tsx:111](/home/my/workspace/ainfra/zira/frontend/src/pages/BacklogPage.tsx:111)
拖动先改本地 sprintKeysOverride/backlogOverride；跨组 `:146` 的 Sprint 归属 API
仍 TODO，随后只提交 rank。页面 `:250` 的开始、`:252` 的编辑以及 `:297` 完成确认
都只更新 announcement/关闭弹窗，不能视作 Sprint 生命周期动作。
`:206` 创建 Sprint 明确禁用。左侧 Sprint/Epic 区域 `:219` 在窄屏隐藏，
本页未提供同等手机面板入口，不能仅凭页面响应式类名宣称移动功能等价。

mybot 可以学习“分组读模型、排名与领域状态分离、局部滚动、可达动作解释”，不能引入
Sprint/Epic 假业务，也不能将移动任务卡直接变成 Run 成功、运行重试或模型调用。

## 6. 键盘、移动与组件组织

### 键盘机制与消费端要分别核验

[use-hotkeys.ts:122](/home/my/workspace/ainfra/zira/frontend/src/hooks/use-hotkeys.ts:122)
先检查 defaultPrevented、isComposing/keyCode229 和纯修饰键；
`:95` 识别 input/textarea/select/contenteditable，默认单键不侵入文本编辑；
`:191` 挂载/卸载 document 监听。页面挂载各自快捷键，较易收拢作用域。

但这不是所有快捷键已正确：

- [GlobalHotkeys.tsx:24](/home/my/workspace/ainfra/zira/frontend/src/app/GlobalHotkeys.tsx:24)
  将 `?` 标成 allowInInput，文本编辑时也可能触发导航；mybot 不默认继承这种例外。
- [IssueNavigatorPage.tsx:110](/home/my/workspace/ainfra/zira/frontend/src/pages/IssueNavigatorPage.tsx:110)
  注释含 `i` 分配给我，但实际注册列表无此键；
  [detail-preview.tsx:26](/home/my/workspace/ainfra/zira/frontend/src/features/issues/components/detail-preview.tsx:26)
  注释称 y 改排列，页面 `:137` 实际只是设置 detail 视图。
  帮助文案不能作为已实现键表。
- [board-column.tsx:57](/home/my/workspace/ainfra/zira/frontend/src/features/boards/components/board-column.tsx:57)
  自有 capture handler 只检查 ctrlKey/最近卡片，没有统一 hook 的 IME、editable、
  defaultPrevented 检查。所有局部键盘入口也要遵守同一策略。

mybot 验收必须覆盖“overlay 打开时背景单键不触发、IME输入不执行、普通文本编辑不跳页、
焦点不落到隐藏面板、Escape只关闭最上层、关闭返回触发点”，不只检查按键后状态值。

### 组织原则可学，运行时不可搬

| Zira 组织 | 具体来源 | mybot 对应 |
| --- | --- | --- |
| 通用视觉/交互原语在 components/ui，领域组件在 features/*/components | [button.tsx:1](/home/my/workspace/ainfra/zira/frontend/src/components/ui/button.tsx:1)、[dialog.tsx:1](/home/my/workspace/ainfra/zira/frontend/src/components/ui/dialog.tsx:1) | 不搬 CVA/Slot/Radix；Astryx 原语留在项目 ui 包装边界，Run/Task 语义留在领域组件 |
| 页头和工具栏统一槽位 | [PageHeader.tsx:6](/home/my/workspace/ainfra/zira/frontend/src/components/layout/PageHeader.tsx:6)、[toolbar.tsx:12](/home/my/workspace/ainfra/zira/frontend/src/components/ui/toolbar.tsx:12) | 新建或收拢项目自有 PageHeader/ResultToolbar，使用语义 token 与共享 density，不复制整页 |
| 数据 hooks、API、DTO 与页面组合分开 | [use-issue-search.ts:38](/home/my/workspace/ainfra/zira/frontend/src/features/search/hooks/use-issue-search.ts:38)、[search.ts:55](/home/my/workspace/ainfra/zira/frontend/src/features/search/api/search.ts:55) | 保留 mybot 现有 api/state/projections；需要时增加可测合同，不因参考项目使用 Query/Zustand 就新增依赖 |
| Desktop/phone 复用同一个领域块 | [IssueDetailPage.tsx:301](/home/my/workspace/ainfra/zira/frontend/src/pages/IssueDetailPage.tsx:301)、[IssueDetailPage.tsx:337](/home/my/workspace/ainfra/zira/frontend/src/pages/IssueDetailPage.tsx:337) | Inspector内容一份；显示适配复用 AppDialog/Astryx能力，不复制手机与桌面业务树 |

可用的 mybot/Astryx 对照（现有封装不等于建议功能已完成）：

| 需求 | 项目入口与 Astryx 能力 | 不应重做 |
| --- | --- | --- |
| 命令导航/分组/搜索 | `components/ui/Commands.tsx` 的 AppCommands → CommandPalette + Typeahead | 本地手写 Dialog/listbox 与假最近项 |
| 查询输入/过滤选项/视图模式 | `components/ui/index.tsx` 的 AppInput/AppSelect/AppSegments → TextInput/Selector/SegmentedControl | 另一套 Tailwind Input/Select/Tab 运行时 |
| 表格/排序/树/密度 | `components/ui/DataTable.tsx` 的 AppDataTable/AppTreeTable → Table plugins | 复制 Zira TableRow；受控 URL 排序/选择仍需扩展项目合同及测试 |
| 操作 pending/disabled/图标提示 | AppButton → Button | 页面散布 raw button 重新定义 loading/禁用行为 |
| Inspector/确认/手机弹层 | AppDialog → Dialog，必要时扩展受控 presentation | 同时维护自写焦点陷阱和供应商 Dialog |
| 领域状态/真实成员/读取状态 | AppBadge、Avatars、AppLoading（内用 Skeleton）包装 | 静态 online、默认零统计或把 Skeleton 当内容卡片 |
| 页头/结果条/结果状态/Inspector | 项目自有布局与领域组件组合上述原语 | 把页面布局误作新设计系统或按主题复制页面 |
| 将来需要的拖动/排名 | 先评估 Astryx 已有能力；缺失再记录成熟专用库/本地适配决策 | 当前未经授权直接加 dnd-kit 写动作，或手写一套拖动引擎 |

## 7. mybot 落地验收

以下是本研究导出的验收建议，不是已完成事项；不改变119项台账计数。

### P0：下一交互切片的门槛

1. **动作真实性台账**：每个可见按钮/菜单/快捷键记录
   `名称 → handler → API/本地动作 → 权限/前提 → pending → success/error/unknown →
   受影响投影`。禁用项有真实原因；没有 handler、错误 handler、只播报成功均不得通过。
   保存/读取/复制/换肤/预览不得意外启动模型或改变 Run。
2. **查询合同**：query draft 不发检索；一次原子提交更新查询并重置页码；
   合法 sort/view/page 可刷新/分享/前进后退恢复，非法值明确拒绝或规范化。
   未支持 JQL/身份/分组不得忽略后返回“全部匹配”。用请求计数确认未逐字发请求。
3. **选择合同**：row activation、checkbox selection、Inspector active ID、page 分开；
   定义换查询/换页/排序/刷新时策略；只支持本页就不显示“全结果集”命令。
   页大小选项必须实际改变请求与分页，不保留无动作控件。
4. **状态真实性**：初始加载、刷新旧数据、失败、403、404、真正空和未支持分别展示；
   子查询失败不能变空数组/零指标。失败/未知不得用成功色或“已完成”播报。
5. **浏览器主路径**：1440px与320/390px检查布局、长中文/英文、两种模式和至少三种样式；
   仅结果/画布可横向滚动。键盘/IME/overlay作用域、Tab顺序、真实焦点、Escape、
   关闭焦点返回与 reduced-motion 均留证据，不能只查 radio选中或CSS类。
6. **不扩权限**：当前看板维持事实投影，不允许拖动写 Run 状态；
   Provider/模型调用、重试/健康检查坚持显式授权，未知结果不自动重发。

### P1：交互闭环增强

1. **统一页头/结果条/状态块**：至少列表、项目、Run三个真实页面复用；切换样式/语言/
   密度不丢草稿、筛选、Inspector和活动Run，不为Zira风格创建第二棵业务树。
2. **列表到详情往返**：保留 query、sort、page、活动对象和滚动位置；
   预览与完整详情分别标识数据完整性。相邻项沿真实搜索范围，不伪称个人/全量结果。
   窄屏Inspector复用内容并可从同一入口打开。
3. **跨视图刷新**：成功 mutation 后列表/表格/看板/总览/详情共用投影并刷新；
   测试慢请求逆序完成、对象删除、权限失效与退出清缓存，不用本地换序证明持久化成功。
4. **未来排名/转换独立合同**：只有领域授权后才做可写拖动；
   排名必须提供稳定目标锚点、版本/冲突与失败恢复；转换需合法状态、能力/权限、
   幂等/预算/成本确认及confirmed结果。拖动、菜单、键盘是同一动作的不同入口，
   分别验证触屏滚动冲突、拒绝、失败、未知、读屏播报和重载后位置。
5. **真实查询能力再扩大**：身份/字段目录/服务器解析契约成立后再做补全、保存视图、
   分组和全结果集选择；测试实际消费者，不以 API函数存在或静态选项替代集成证据。

## 8. 建议写入 AGENTS 的精炼规则

- 所有可见命令和快捷键必须追踪“名称/图标→handler→实际副作用→结果/错误→关联刷新”；
  源注释、帮助文案、存在的 API 函数、可点击图标和成功播报都不是动作完成证据。
- URL组合变更一次提交，验证草稿/提交、分页归零、非法值、刷新和前进后退；
  当前页选择不得冒称全结果集，换页/排序/查询后按稳定ID核对选择和Inspector。
- 不继承参考项目的无动作控件、TODO生命周期、假最近项、默认零计量或“异常回退为空”。
  pending/success/error/unknown必须结构化，不能将失败正文放进成功提示。
- 拖动、快捷键、菜单必须走同一领域动作合同；本地移卡、播报和注释中的触屏行为
  不等于持久化、回滚、键盘或移动端已通过。mybot 当前只读看板不写Run状态。
- 共用Astryx项目封装、同一命令源和同一领域Inspector；源结构/人工观察/mybot实现/
  浏览器验收分开记录，不把参考项目的控件运行时引入mybot。
