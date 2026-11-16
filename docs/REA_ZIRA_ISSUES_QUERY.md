# Zira Issues 查询与保存过滤器研究

日期：2026-11-14（Asia/Singapore）。本专题只研究 Issues 的筛选、查询、保存过滤器、
请求与缓存合同；不是 Zira 全站验收，也不是 mybot 已有完整 JQL 或保存视图的声明。

## 1. 来源与证据

- 只读源码：`/home/my/workspace/ainfra/zira/frontend`。
- 本轮实际核对 HEAD：
  `1ce0d0510cb590f3a79ca498f7239ff0852ed0d7`。
- 对下述页面、Issues 查询控件、filters/search API 与 hooks、query keys/client、
  导出及相关类型进行了代表链人工深读。所读路径的 Git 状态未见改动。
- 延续 [全前端研究](ZIRA_FRONTEND_STUDY.md)、
  [数据专题](ZIRA_STUDY_DATA.md)与
  [交互专题](ZIRA_STUDY_INTERACTIONS.md)；625 文件结构索引不代表本专题逐行审计。
- 本轮没有启动 Zira、调用其后端、运行其测试、联网、读取 `.env`、凭证、数据库或日志，
  没有修改 Zira。本地搜索未发现以 jql/filter/search 命名的 src 测试文件，
  但这不能证明仓库其他位置没有相应测试。
- 下文“观察”是固定源码行为，“风险推论”是由控制流推导而未运行复现的边界，
  “mybot 待办”不是已经完成的能力。源码注释引用的 Java controller 和服务端能力
  未在本轮读取后端复核。

## 2. 截图与固定源码不是同一证据

本轮任务要求对照用户截图所示的 Basic/ZQL、Type 等查询组织。截图可表达期望的操作
层次，但不能据此认定截图对应本地 HEAD 或服务端能力。

| 对照点 | 此固定 HEAD 的实际源码 | 对 mybot 的含义 |
| --- | --- | --- |
| Basic/ZQL 模式 | `IssueNavigatorPage` 只组合 `JqlBar → JqlInput`，没有该模式状态或转换消费链 | 可研究“简单条件/表达式”分层；不能称已复刻可逆查询转换 |
| Type、Status、Assignee 等行内条件 | 此导航器没有这组基础查询 Selector；IssueType 图标是结果行展示，不是条件编辑器 | 必须先有实际字段与目录合同，不能照截图补假选项 |
| 输入补全 | 静态字段/函数候选，真实 metadata/autocomplete/validate 仍未接到输入器 | 补全菜单不证明解析、授权或函数已经可用 |
| 已保存视图 | 保存资源是 SavedFilter，主要持久化 JQL 与名称/描述/共享等元数据 | 保存查询不等于保存列、页容量、布局、分组和主题 |
| 左侧筛选分类 | 后端记录经当前用户引用数据推导为收藏/我的/共享；失败可回退样例分类 | 分类结构可学，身份与数量不能借用 |
| 全部 Issues | `/issues` 的缺省 JQL 实际是 `project = DMS ORDER BY Rank ASC` | 不把样例项目默认值迁入 mybot 的“全部项目” |

定位：
[IssueNavigatorPage.tsx:52](/home/my/workspace/ainfra/zira/frontend/src/pages/IssueNavigatorPage.tsx:52)、
[JqlBar:42](/home/my/workspace/ainfra/zira/frontend/src/features/issues/components/jql-bar.tsx:42)、
[JqlInput:15](/home/my/workspace/ainfra/zira/frontend/src/features/issues/components/jql-input.tsx:15)。
全 src 文本定位没有找到 ZQL/Basic 查询模式实现；这是当前源码范围内的缺口，
不对截图的来源或其他版本作推断。

mybot 保持 React 19 + 已安装 Astryx 0.7.13、项目包装层和单一业务组件树。
本专题不复制 Zira 的 React 18/Radix/CVA/Tailwind 控件，不升级 Astryx，
也不以截图作为引入第二套 UI 的依据。

## 3. 查询主链

```text
/issues 或 /projects/:key/issues
  → URLSearchParams(jql/filter/view/order/page)
  → saved-filter groups 解析 filterId
  → committed JQL / local jqlDraft
  → JqlBar → JqlInput → 搜索按钮、Enter 或 u
  → URL 更新
  → useIssueSearch(query key, startAt, page size, order)
  → POST /api/v1/search
  → mapIssue + pagination/visibility/warnings
  → ResultState / IssueTable / DetailPreview / mobile cards
```

### 3.1 URL、草稿与提交

[IssueNavigatorPage.tsx:43](/home/my/workspace/ainfra/zira/frontend/src/pages/IssueNavigatorPage.tsx:43)
从路由拿 projectKey，解析 `filter/jql/view/order/page`。
JQL 优先级为 **显式 URL jql → 已加载过滤器的 jql → 缺省 project JQL**；
草稿独立在 `jqlDraft`，只有提交回调修改 URL，普通输入不直接查询。
这是值得采用的“编辑与执行分开”边界。

但此链有以下源码边界，不能直接当已验证样板：

- `setParam` 每次由同一闭包的 params 构造完整新 URL，缺省 `replace=true`
  （[page:81](/home/my/workspace/ainfra/zira/frontend/src/pages/IssueNavigatorPage.tsx:81)）。
  `runSearch` 连续写 jql、再删除 page；`selectFilter` 又先写 filter 再调用 runSearch。
  第二/第三次写入可能覆盖前次修改。此为源码推论，未运行 React Router 复现。
  mybot 必须一次原子提交完整 query patch，不靠多次 setter 隐式合并。
- 所有状态默认 replace 当前历史项；注释中的“后退可还原”不等于每次搜索、选过滤器、
  排序或翻页都会形成可返回的历史。应明确哪些提交 push、哪些规范化 replace。
- `view` 是类型断言，page 直接 Number，没有合法枚举、正安全整数或范围验证。
  `page=abc` 会继续参与 startAt 计算；UI 不应仅靠 TS 类型假定外部 URL 有效。
- activeFilterId 有值但列表尚未加载时，页面会先用缺省 DMS 查询；过滤器到达后再切换。
  过滤器不在已取列表或不可见时，也没有“加载指定过滤器/缺失/无权限”独立状态。
  不能把 unresolved saved query 变成另一条成功查询。
- effect 在 committed JQL 改变时直接回填草稿
  （[page:63](/home/my/workspace/ainfra/zira/frontend/src/pages/IssueNavigatorPage.tsx:63)）。
  例如过滤器迟到、刷新或选择发生时，未提交输入如何保护需要额外验证。
- `/projects/:key/issues` 是 **预置** project 条件，用户可自由改写 JQL，并非固定项目
  授权边界。mybot 当前项目工作区若要求固定 scope，不能照搬成可被 query 逃逸的条件。

### 3.2 输入、补全与校验

[JqlInput:38](/home/my/workspace/ainfra/zira/frontend/src/features/issues/components/jql-input.tsx:38)
包含 project/status/summary/assignee/Sprint、currentUser/openSprints 等静态候选。
菜单具备 combobox/listbox/option、活动建议、方向键、接受与 Escape 的基本组织。
当前 token 实际由整个字符串末尾分词，而不是光标位置；在中间编辑时不能据此声称
具备语法感知补全。

[JqlInput:98](/home/my/workspace/ainfra/zira/frontend/src/features/issues/components/jql-input.tsx:98)
未检查 `isComposing/keyCode 229`，Enter 会提交或接受候选；不能将这一实现迁入 mybot
后再声称中文 IME-safe。输入框固定 `id="jql-input"`，多个实例时也需检查 ID 唯一性。

API 文件确实定义：
[search.ts:122](/home/my/workspace/ainfra/zira/frontend/src/features/search/api/search.ts:122)
的 metadata、
[search.ts:136](/home/my/workspace/ainfra/zira/frontend/src/features/search/api/search.ts:136)
的 autocomplete、
[search.ts:153](/home/my/workspace/ainfra/zira/frontend/src/features/search/api/search.ts:153)
的 validate，但全 src 定位只找到它们的声明，没有组件调用。
输入器 TODO 所写值建议路径与实际 API wrapper 的 `/search/autocomplete` 也不同；
不能由 TODO、接口类型或静态 currentUser 候选推导端到端能力。

mybot 采用 Astryx 输入/菜单/焦点行为，但查询的字段、运算符、值、函数、权限与诊断
必须来自自己的真实目录和解析合同。未实现条件必须显式拒绝，不增加前端正则来假装
完整 JQL，也不凭静态候选构造负责人/团队身份能力。

## 4. 请求、排序、缓存与结果状态

### 4.1 生产请求与 mock 分开

[use-issue-search.ts:38](/home/my/workspace/ainfra/zira/frontend/src/features/search/hooks/use-issue-search.ts:38)
将 page/pageSize 转为 startAt，并把 committed JQL、分页、order 放入 query key。
生产分支发送 POST search；只有 `VITE_USE_MOCK=true` 才使用本地 evaluator。
开关定义在
[api/config.ts:11](/home/my/workspace/ainfra/zira/frontend/src/lib/api/config.ts:11)。

[search.ts:55](/home/my/workspace/ainfra/zira/frontend/src/features/search/api/search.ts:55)
请求支持 jql/startAt/maxResults/nextPageToken/fields/expand/orderBy/validateQuery，
响应保留分页、visibility、warnings，问题字段由 mapper 规整。
本专题只确认了前端发送/消费形状，未验证后端支持的完整语法或权限效果。

mock evaluator 见
[mock-data.ts:513](/home/my/workspace/ainfra/zira/frontend/src/lib/mock-data.ts:513)：
仅少量 project/status/category/text AND 子句，未知条件被直接忽略。
因此 mock 搜索通过不证明 assignee/currentUser、OR、嵌套、函数或服务端解析成立。
mybot 不采用“少过滤”作为不支持条件的兼容策略。

### 4.2 排序优先级

UI `order=-updated` 经
[order-by.ts:7](/home/my/workspace/ainfra/zira/frontend/src/features/search/utils/order-by.ts:7)
转成 `updated:desc`。源码合同说 JQL 自带 ORDER BY 时 JQL 优先，外部 orderBy 被忽略并告警。
缺省 JQL 本来就带 Rank，因此结果工具栏“最近更新”不一定是实际生效排序。

[JqlBar:57](/home/my/workspace/ainfra/zira/frontend/src/features/issues/components/jql-bar.tsx:57)
以“含 ORDER BY 且有任何 warnings”判断显示告警，不按警告 code 判定：
非排序告警可能被误归入排序；没有 ORDER BY 时的其他 warnings 又不显示。
mybot 应显示服务端实际 effective sort/支持范围，按稳定 warning code 呈现，
不能同时展示两个互相覆盖但未解释的排序真源。

### 4.3 分页与 stale

[page:294](/home/my/workspace/ainfra/zira/frontend/src/pages/IssueNavigatorPage.tsx:294)
的每页 20/50/100 下拉只有 `defaultValue`，没有 onChange；实际请求始终使用
`PAGE_SIZE=20`。出现控件不等于其值已进入 URL、query key 或请求。
API 虽保留 nextPageToken，当前导航器使用数字分页，不消费不透明游标或 approximateTotal。

[use-issue-search.ts:71](/home/my/workspace/ainfra/zira/frontend/src/features/search/hooks/use-issue-search.ts:71)
将前一查询作为 placeholder，staleTime 为 5 秒。
[page:76](/home/my/workspace/ainfra/zira/frontend/src/pages/IssueNavigatorPage.tsx:76)
只取 isPending/error，没有读取 isFetching/isPlaceholderData；
新 URL 已提交但旧结果仍显示时，缺少明确的“正在刷新/旧数据”表达与批量动作保护。
工具栏 total 也使用缺值 0，读取未知不能被计成真实零。

查询 key 工厂在
[query-keys.ts:27](/home/my/workspace/ainfra/zira/frontend/src/lib/query-keys.ts:27)
包含 JQL/startAt/maxResults/order/fields，可借鉴其完整请求身份。
[query-client.ts:45](/home/my/workspace/ainfra/zira/frontend/src/lib/query-client.ts:45)
区分读取重试与 mutation 不重试；401 清 query/reference 后跳登录。
但只能处理最终抛出的错误，filters 自己吞掉 401 时不会触发此落点。
mybot 不需要为学习直接增加 TanStack Query，需先保持自己已实现的请求世代、取消、
私有投影清理与无自动付费重试合同。

### 4.4 错误、权限空态与选择范围

[ResultsState:30](/home/my/workspace/ainfra/zira/frontend/src/features/issues/components/results-state.tsx:30)
区分 403、一般失败、被权限裁到零、真空态，并可回显 committed JQL。
这是可采用的状态组织；mybot 是否披露不可见数量仍由自身安全策略决定。

页面的 selectedKeys/focusIndex 不随 query/page 变更重置。
[page:368](/home/my/workspace/ainfra/zira/frontend/src/pages/IssueNavigatorPage.tsx:368)
把“全匹配选择”和“本页选择”接到同一个当前 issues 数组；
[batch-operation-bar:135](/home/my/workspace/ainfra/zira/frontend/src/features/issues/components/batch-operation-bar.tsx:135)
显示“选择全部 N 项”但 title 才说明仅本页。mybot 不采用这类声明；
列表激活、检查器、当前页和选择集合独立，执行范围必须可复核，不扩成模型扇出。

## 5. 保存过滤器不是完整 Saved View

### 5.1 资源与动作链

```text
GET /filters(maxResults=200)
  → SavedFilter[] + page metadata
  → groupFilters(currentUser reference)
  → favourite / mine / shared groups
  → FilterSidebar → FilterGroup → FilterItem
  → selectFilter(id,jql) → URL → search

JqlBar 保存 / 另存为
  → 同一个 CreateFilterDialog(initialJql=committed jql)
  → POST /filters {name,description,jql,shared}
  → invalidate ['filters']

/filters 管理页
  → edit(version) / favourite / delete / subscription
```

SavedFilter 的完整前端形状见
[filters.ts:28](/home/my/workspace/ainfra/zira/frontend/src/features/filters/api/filters.ts:28)：
id/name/description/self/jql/owner/favourite/shared/version/viewUrl。
没有 columns、density、view mode、pageSize、group 或样式字段。
收藏属于用户引用关系，查询定义与结果统计不是同一对象。

[JqlBar:97](/home/my/workspace/ainfra/zira/frontend/src/features/issues/components/jql-bar.tsx:97)
的“保存”和“另存为”使用同一回调；
[page:399](/home/my/workspace/ainfra/zira/frontend/src/pages/IssueNavigatorPage.tsx:399)
只挂 CreateFilterDialog。即使 activeFilterId 已选，“保存”也不是更新这个记录。
未提交草稿不会自动带入新建：initialJql 是 committed JQL，不是 draft。
mybot 应明确“保存当前已应用查询/另存为/更新此视图”的不同命令与脏态。

[edit-filter-dialog:58](/home/my/workspace/ainfra/zira/frontend/src/features/filters/components/edit-filter-dialog.tsx:58)
在管理页 PUT 时带 version，并区分版本冲突与重名，这是可借鉴的 CAS 合同。
但 dirty refetch/关闭确认和 submit pending handler 仍需专项证明，禁用按钮不是完整幂等。
创建/修改成功会 invalidate filters，未等待所有重新读取；活动查询的 JQL 如何跟随更新
或保持原快照也没有独立版本绑定。

### 5.2 归组、目录截断与失败回退

[use-filters.ts:24](/home/my/workspace/ainfra/zira/frontend/src/features/filters/hooks/use-filters.ts:24)
只取首个 `maxResults=200`，缓存 5 分钟。
API 中 fetchFilterPage 有 isLast/startAt/maxResults，但 FiltersResult 只暴露 total，
调用链没有继续翻页；不能将首 200 个标为完整目录。
Navigator 没有调用已定义的 `getFilter(id)` 读取 URL 中未命中的条目，可能错误回落缺省 JQL。

[filters.ts:128](/home/my/workspace/ainfra/zira/frontend/src/features/filters/api/filters.ts:128)
实际 catch 所有失败为 FALLBACK_GROUPS，而不是注释所说仅网络/404：
401/403/Abort/服务故障均可能变成 query success + unavailable。
成功但畸形的响应也会在 `fetchFilterPage:94` 规整成空数组和 total 0。
mybot 不采用这种降级；缺能力、认证、权限、取消、畸形 DTO 与真实空集合分开。

[filters.ts:205](/home/my/workspace/ainfra/zira/frontend/src/features/filters/api/filters.ts:205)
以 reference.currentUserId 推导归属；身份未水合就以 `!shared` 猜“我的”。
这一同步引用变化不在 useFilters query key 中，也没有在该 hook 订阅重新分组。
“我的/共享给我的”必须依赖真实主体与服务端可见性，不能按 shared 布尔反推身份。

真记录的 count 固定设 0，FilterItem 为避免伪零不展示它；
但
[constants.ts:11](/home/my/workspace/ainfra/zira/frontend/src/features/filters/api/constants.ts:11)
的样例过滤器有 7/3/12 等虚构计数。
桌面 aside 有样例警告，移动 Sheet 的 FilterSidebar 没有同一说明。
移动端没传 onCreate，组件仍渲染可点“新建过滤器”按钮，动作可为空。
mybot 不将样例身份/条件/计数转成真实导航，也不显示无处理函数的业务命令。

同一 favourite filter 同时可在收藏与我的组出现；JqlBar 把全部 groups 平铺为 option，
会重复同 ID。分类允许重叠，不表示数据实体有多份；选择源需按稳定 ID 去重或用分组展示。

### 5.3 管理写、订阅与导出

[filters-page:33](/home/my/workspace/ainfra/zira/frontend/src/features/filters/filters-page.tsx:33)
在 unavailable 时不把样例放进可写管理表，写入口禁用，是值得保留的真实性边界。
但表格编辑/删除入口不以 isMine 禁用，仍依赖后端授权；分组标签不能当权限。

JqlBar 的订阅按钮禁用且 title 仍说后端没有管理写语义；同一 HEAD 的
[filter-subscriptions.ts:96](/home/my/workspace/ainfra/zira/frontend/src/features/filters/api/filter-subscriptions.ts:96)
与管理页却有 GET/POST/DELETE 包装与 Dialog。应记录为 **入口采用不一致/说明滞后**，
不能从旧 tooltip 判定所有订阅都不存在，也不能据 API 包装宣称投递已验证。
其 hook 的 USE_MOCK 写返回 null/void 后仍可走 success，mybot 不照搬。

导出实际路径是
[use-export-csv.ts:49](/home/my/workspace/ainfra/zira/frontend/src/features/issues/hooks/use-export-csv.ts:49)
的 `/search/export`，不是 JqlBar tooltip 的 `/search/export.csv`。
仅特定缺能力/网络失败回退本地分页，非法查询/401/403 不应回退；
本地上限 2,000，流式体积大时行数 unknown，均有来源/截断表达。
不过导航器只传 committed JQL，未把工具栏外部 order 或用户列设置带入导出，
两条路径列集也不同；不能称“导出当前可见表格的完全相同视图”。

## 6. mybot 的采用边界

本专题建议采用的是稳定的交互与数据分层：

| Zira 观察 | mybot/Astryx 映射 | 不能偷渡的能力 |
| --- | --- | --- |
| draft 与 committed query 分开 | 现有 AppInput/搜索命令/未应用状态，统一 URL patch | 完整 JQL、ZQL 或 Basic/表达式无损转换 |
| 搜索、条件、结果工具与列表分层 | 同一个 FocusedWorkbench + 项目包装控件/语义 token | 复制 Zira 控件库、第二套主题页面 |
| 分组的查询导航 | Astryx Button/Badge、真实 saved-query 对象 | 静态“我的”、假计数或示例 currentUser |
| 项目上下文与自由查询 | mybot contextProject 固定 scope + 同一任务/运行读模型 | 把 query 文本当授权/固定项目边界 |
| 版本化保存过滤器 | 项目自有 SavedQuery/SavedView 定义、明确 create/update/as-new | 仅 URL/本机偏好就称服务端保存完成 |
| 结果状态与警告 | Loading/refreshing/stale/forbidden/empty/unsupported 明确呈现 | 未知补零、fallback 成功、模型请求自动重试 |
| 真实搜索 API 的分页/可见性 | 自己的 query/read contract + 完整缓存键/会话世代 | 将 Zira 的接口、Jira 字段/权限视为现成能力 |

保存查询包含项目或用户输入，不能混入仅存样式/明暗/语言/密度等非敏感偏好的 storage。
列偏好、查询定义、分享权限、订阅执行与 Run 授权各有所有者；外观切换不得重新查询模型、
改变过滤授权或重置尚未提交文本。

## 7. 分阶段待办与验收

1. **查询状态先统一。** 一个 typed query state 同时驱动控件、URL、effective sort、
   分页与任务/运行单位。提交原子写回；测试刷新、Back/Forward、脏输入、IME、
   不合法 URL、项目固定 scope、晚到响应与清除筛选。继续保留不支持表达式明确错误。
2. **基础条件只开放真字段。** 先使用真实 Task/Run、Project、状态与创建时间，
   不从 Type/Assignee 截图生成业务字段。若要多条件 OR/函数/团队成员，先补身份、
   字段目录、服务端语法与权限合同，再采用可靠解析器；不继续扩前端正则当语法引擎。
3. **保存查询与保存视图区分。** 明确对象 ID、实体种类、query schema version、
   server revision、创建/更新/另存为、删除影响与加载单条记录。共享/owner 只能用真实主体；
   未实现时省略而不是给假选项。保存不调用模型，不默认创建通知订阅。
4. **补齐读取边界。** filters/search 失败不可转样例成功；未知 count 不补零；目录截断
   显示 denominator 与 isLast；placeholder 行明确 stale，危险动作不得作用于另一条 query。
   查询变化后的 selection、focus、inspector 与 page 各自有清楚的保留/失效策略。
5. **补全/校验独立验收。** metadata/autocomplete/diagnostic 必须有真实消费者、
   请求世代/取消、字段权限、光标位置与 IME 测试；纯候选菜单与接口定义分别留证。
6. **导出和订阅后置。** 导出声明范围/列/排序/截断/来源；保存与投递不能互相替代。
   订阅涉及调度与外发，需独立权限、显式授权、审计和失败/未知回执，不能由收藏按钮推导。

本专题本轮只产生研究文档，没有实现上述查询/保存视图扩展，没有增加依赖或改动
Astryx 0.7.13，也没有执行新的 Provider、服务端、浏览器或 Zira 测试。

## 8. mybot 查询草稿第一切片（2026-11-15）

本节是后续mybot实现记录，不改写前述2026-11-14固定Zira源码观察，也没有重新运行
Zira或引入其组件库。范围仅为现有Basic文本、项目与状态分类，不是完整字段目录、
多选条件、完整JQL或保存视图。

| 动作 | 已提交查询/结果 | 内存草稿 |
| --- | --- | --- |
| 主查询行编辑Text/Project/Status | 不变，URL不写入 | 更新对应候选，显示未应用 |
| Search/非IME Enter | 一次patch写入三个字段并回第1页 | 规范化文本，默认all从URL省略 |
| 侧栏范围push | 即时提交该范围字段 | 仅同步该变化字段，保留其他dirty字段 |
| 点击已激活的侧栏范围 | 不偷偷提交候选 | 已提交字段未变化时视为no-op，保留dirty候选 |
| 普通模式/视图/排序/分页push，换肤/语言/密度 | 按各自原合同变更 | 不提交或丢弃Basic/JQL草稿 |
| 浏览器Back/Forward traverse | 恢复目标entry已提交查询 | Basic/JQL整份恢复目标快照，不混合后续dirty字段 |
| 清除行内X | 清空查询/条件，保留固定项目及现有排序/容量 | 同时清空Basic/JQL；无内容时禁用 |
| 整页刷新 | 从URL恢复已提交值 | 未提交草稿不持久化 |

实现落点：`basic-query.ts`生成有限候选，固定route项目优先；
`FocusedWorkbench.tsx`使用Astryx项目包装输入/Selector/Button；
`Workbench.tsx`只消费经过admission的canonical事件；导航控制器只增加
`detail.kind=push/replace/traverse`，不把草稿放入history，也不靠独立popstate监听猜测。
未应用指原始编辑尚未提交，包括空格编辑；Search会trim，规范化后不再显示未应用。

窄屏继续隐藏主行项目/状态Selector，使用既有Filters即时范围入口；同树由桌面缩到
手机仍保留尚未提交候选，但不声称手机能操作隐藏控件。中文IME覆盖的是合成浏览器
事件，不是实际输入法或真机认证。完整生产证据与边界见
`frontend/evidence/query-drafts-2026-11-15/README.md`。

## 9. 多选目录与结构化合同落地（2026-11-15）

既有Zira来源/commit不变，以下是mybot后续实现与实测，不是重新核验Zira能力：
真实Project目录与五状态分类通过Astryx MultiSelector选择；字段内OR、跨字段AND，
Task最新状态与Run历史口径分开。旧project/filter链接兼容，多个值使用严格JSON的
projects/states，非法和不可用值明确错误；固定route项目优先并去掉冲突多项目参数。
手机实际候选编辑和Search已验，不再只有resize保留。

列顺序与三层Task排序采用同一Astryx Table hook，sorts JSON优先旧order、JQL排序仍锁定；
Run表独立排序未被假称等价。范围、writer与失败行为见ADR-0009。
634项单测、生产高级30项及完整回归报告在
`frontend/evidence/advanced-workbench-2026-11-15/`。IZ-02/03仅关闭现有字段范围；
更丰富字段/运算符、私有保存视图、服务端分页与完整JQL仍需各自真实合同。
