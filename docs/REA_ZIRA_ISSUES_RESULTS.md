# Zira Issues 结果区研究

日期：2026-11-14（Asia/Singapore）。本专题只研究 Issues 结果区，不替代
[全前端结构研究](ZIRA_FRONTEND_STUDY.md) 或
[交互链研究](ZIRA_STUDY_INTERACTIONS.md)。用户最新截图与本地固定源码有明显差异，
必须分别使用，不能把其中一份当成另一份的运行证明。

## 1. 来源与证据等级

| 标记 | 来源 | 本轮可以证明什么 |
| --- | --- | --- |
| S | 用户授权截图：`/home/my/Downloads/Pasted image (5).png`，1853×963，SHA-256 `3ff3cc22a009c6a55e62fbc1542b04f127d2aa6bc2240ecf1ae5dfc9b1b3bd93` | 此帧可见的排版、控件、文本、选中和弹出状态；不能证明按钮、分页、查询或权限合同 |
| C | `/home/my/workspace/ainfra/zira`，HEAD `1ce0d0510cb590f3a79ca498f7239ff0852ed0d7`，下列精确前端源码路径 | 固定版本的消费链、样式约束与未接通部分；不能证明后端行为或浏览器通过 |
| M | mybot 当前 React/Astryx 包装与工作台源码 | 本地已写入的实现；本专题没有将并发修改中的源码标成已完成浏览器验收 |
| T | mybot 各独立 evidence 目录的 verification.json | 只证明该记录、夹具和版本下实际执行的检查；本专题不重跑、不外推到 Zira |

本轮只读 Zira 源码、查看上述用户截图和已存在的 mybot 截图。没有启动 Zira、
读取账号/凭证/数据库/会话内容、调用其 API 或运行其测试；没有模型、部署或生产动作。
没有修改 Zira，也没有复制其组件、品牌、图标、业务数据或图片到产品。
mybot 仍使用 React 19 + Astryx 0.7.13，不引入 Zira 的 React 18/Radix/CVA/Tailwind UI。
625 文件索引仍只是定位工具，不是逐行审计或本专题的运行证据。

## 2. 用户截图真正表达的结果区

以下都是 **S：图像观察**，坐标/尺寸为单帧近似值，不是 DOM computed-style 测量：

- 全局顶栏约 54px；全局导航约 230px；Filters 是另一条约 248px 的独立导航轨。
  Issues 页上下文、查询和结果共同位于右侧工作区，而不是先铺一张概览或项目卡片。
- Filters 标题与 Issues 标题位于同一顶层横带；收起符号属于 Filters 标题区，
  不应因复用方便搬到结果列表的独立工具条。
- 查询位于浅底横带。搜索、项目/类型/状态/经办人条件在左；Basic/ZQL/Natural language、
  List/Detail、Group、Columns 在右。截图中 Type 多选面板已展开。
  “有一个 Type 选项面板”不证明其过滤结果、键盘多选或服务器语义。
- Columns 位于右上 query tools 尾端，是表格设置入口，不是页标题旁独立的 Sort 图标。
  图像未展示 Columns 的内部菜单，因此不能由此推断列重排、固定列、多排序或持久化。
- 结果框相对工作区约有 24px inset、约 8px 圆角；表头约 36px。
  可见普通行边界约 40–44px，Key 与 Summary 不上下堆成两行。
  Summary 占剩余宽度；状态、经办人、优先级和更新时间形成稳定窄列。
- 截图类型图标与 Key 相邻，Summary 独立，长摘要按行截断；
  小型状态条与姓名/头像不抢占标题层级。右侧列表滚动条只属于结果框，
  页脚仍留在可见区域，不把分页推到几十行之后。
- 页脚同时显示 `1–20 of 20` 和 `50 per page`。这只证明当前文本，
  **不证明已用 50 请求、成功取完结果或每页选择已生效**。
- Save、Save as、下载和更多按钮位于页上下文区；截图中的保存状态/筛选名称、
  头像、数量、未读数、Issue key 都不是 mybot 的业务数据。

mybot 的历史
[45 行完整页面截图](../frontend/evidence/focused-workbench-2026-11-14/pagination-45-readonly.png)
曾把 ID 放在标题下、页面随全部结果增长、分页位于整页底部。
它适合解释用户为何觉得“没有 Zira 效果”，但它是保留的历史夹具图，
不是当前并发中的布局实现或最新验收结果。最新实测应由 root 的独立 evidence 记录覆盖。

## 3. 固定源码的真实消费链

```text
URL jql/view/order/page
  -> IssueNavigatorPage committed query + separate jqlDraft
  -> useIssueSearch(query key, AbortSignal)
  -> production POST /search or explicit mock evaluation
  -> issues + total + visibility + warnings
  -> IssueTable / IssueCardList / DetailPreview
  -> Pagination + selectedKeys batch input
```

### 3.1 列、单元格与行

| C：源码定位 | 固定版本实际行为 | 对 mybot 的启示 |
| --- | --- | --- |
| [issue-columns.ts:25](/home/my/workspace/ainfra/zira/frontend/src/features/issues/components/issue-columns.ts:25) | 默认 7 列：type/key/summary/status/assignee/priority/updated；Summary 没有 sortable。列定义是纯数据 | 列目录与渲染分离；mybot 使用 Task ID/标题/项目/最近 Run 状态/时间/历史，不能复制负责人和优先级 |
| [issue-columns.ts:26](/home/my/workspace/ainfra/zira/frontend/src/features/issues/components/issue-columns.ts:26) | 窄列由 w-20/w-24/w-28/w-32 约束；Summary 无固定宽 | 主信息弹性，辅助列有预算；不能每列平均分宽，也不能把 ID 塞到标题第二行来腾宽 |
| [issue-cell.tsx:23](/home/my/workspace/ainfra/zira/frontend/src/features/issues/components/issue-cell.tsx:23) | Summary 单行 truncate，title 保留原文；小屏可重复 Key。Assignee 也截断，更新时间不换行 | 单行扫描与完整信息检查分开；title 原文不是手机/键盘可访问预览的替代品 |
| [issue-row.tsx:37](/home/my/workspace/ainfra/zira/frontend/src/features/issues/components/issue-row.tsx:37) | Checkbox 选择、双击打开、焦点索引和行内动作独立；不是“整行链接包所有按钮” | 任务打开、历史 Inspector、将来批量选择应分别有可访问目标；不能嵌套交互元素 |
| [issue-row.tsx:55](/home/my/workspace/ainfra/zira/frontend/src/features/issues/components/issue-row.tsx:55) | 行尾动作在 hover/focus-within 显示 | 不只给鼠标提供操作；手机需要可见替代入口，不能照抄 hover-only 信息 |
| [ui/table.tsx:11](/home/my/workspace/ainfra/zira/frontend/src/components/ui/table.tsx:11) | 横向滚动局限 TableContainer；行高使用 h-row，单元格 px-3/py-2 | 结果区可横滚不等于 document 可横滚；滚动所有权与列宽必须一起验收 |
| [tailwind.config.ts:121](/home/my/workspace/ainfra/zira/frontend/tailwind.config.ts:121) | 源 token 为普通行 40px、紧凑行 32px；控件 24/32/40px | 这是 C 的定义，不是 S 的逐像素值；mybot 用自己的 Astryx density 映射，不能盲目写死截图估算行高 |

截图没有独立的 Type 表头，而固定源码默认有 Type 列；这是可见差异，不能宣称
该 HEAD 已完整复刻此截图。`IssueTable.columns` 可接外部定义，但当前页面
[IssueNavigatorPage.tsx:320](/home/my/workspace/ainfra/zira/frontend/src/pages/IssueNavigatorPage.tsx:320)
没有传列配置，因此消费的是默认数组。

### 3.2 排序与查询

- [IssueNavigatorPage.tsx:52](/home/my/workspace/ainfra/zira/frontend/src/pages/IssueNavigatorPage.tsx:52)
  从 URL 读已提交查询、view、order、page；`:62` 独立保存输入草稿。
  不能每个按键改变结果，更不能每个按键发模型请求。
- [issue-table.tsx:74](/home/my/workspace/ainfra/zira/frontend/src/features/issues/components/issue-table.tsx:74)
  表头显示 aria-sort 与箭头，通过 onToggleSort 回调提交字段。
  [issue-columns.ts:39](/home/my/workspace/ainfra/zira/frontend/src/features/issues/components/issue-columns.ts:39)
  只展示排序串第一个字段的方向。
- [IssueNavigatorPage.tsx:329](/home/my/workspace/ainfra/zira/frontend/src/pages/IssueNavigatorPage.tsx:329)
  点击同列在升/降间切换，写 `order`；这里没有多字段排序编辑器或 Columns 菜单。
- [use-issue-search.ts:38](/home/my/workspace/ainfra/zira/frontend/src/features/search/hooks/use-issue-search.ts:38)
  查询键含 jql/startAt/maxResults/order，传 AbortSignal；生产走服务器，
  mock 才先 `sortIssues` 再 slice。服务器分页场景不能只对一页做客户端排序。
- [order-by.ts:7](/home/my/workspace/ainfra/zira/frontend/src/features/search/utils/order-by.ts:7)
  将 UI 串转为 `field:direction`；其注释明确 JQL 内 ORDER BY 优先。
  默认 JQL 已含 `ORDER BY Rank ASC`，因此工具栏的 order 可能被服务器忽略；
  一个已选 radio 或表头箭头，不足以证明当前结果按它排列。
- [sort-issues.ts:18](/home/my/workspace/ainfra/zira/frontend/src/features/issues/utils/sort-issues.ts:18)
  是 mock 纯函数：只取首字段、复制后排序、未知字段降为 key。
  优先级升序为 Lowest→Highest，降序为 Highest→Lowest；
  [sort-issues.test.ts:72](/home/my/workspace/ainfra/zira/frontend/src/features/issues/utils/sort-issues.test.ts:72)
  写明该口径。**本轮只读测试源码，未运行它。**
  不能将这个 mock 排序器或静默未知字段 fallback 移入 mybot 生产查询。

### 3.3 分页与选择

- [IssueNavigatorPage.tsx:30](/home/my/workspace/ainfra/zira/frontend/src/pages/IssueNavigatorPage.tsx:30)
  的 PAGE_SIZE 固定 20；`:76`、`:79` 用它发检索与算页数。
  [IssueNavigatorPage.tsx:294](/home/my/workspace/ainfra/zira/frontend/src/pages/IssueNavigatorPage.tsx:294)
  每页 20/50/100 控件没有 onChange。不能把此控件存在视为容量切换已接通。
- [pagination.tsx:12](/home/my/workspace/ainfra/zira/frontend/src/features/issues/components/pagination.tsx:12)
  只有上一页/下一页和第 x/y 页；边界禁用正确表达本地 page/pageCount，
  但它本身不加载数据、不读取 nextPageToken，也没有证明页码合法性。
- [IssueNavigatorPage.tsx:60](/home/my/workspace/ainfra/zira/frontend/src/pages/IssueNavigatorPage.tsx:60)
  直接 Number 转换 URL 页码；`:81` 的 setParam 从闭包 params 克隆且默认 replace。
  `runSearch` 连续调用两个 setter。此处没有本轮运行的前进/后退或原子组合更新证据。
  mybot 应保留自己的规范化、原子 URL patch、刷新/后退/前进合同。
- [issue-table.tsx:58](/home/my/workspace/ainfra/zira/frontend/src/features/issues/components/issue-table.tsx:58)
  全选/半选按本页 issues 计算，标签为“全选本页问题”；
  [IssueNavigatorPage.tsx:374](/home/my/workspace/ainfra/zira/frontend/src/pages/IssueNavigatorPage.tsx:374)
  所谓 onSelectAllMatching 仍只取本页 keys。mybot 不借用“选择全部结果”主文案，
  除非有真实全结果范围、排除项、确认和执行合同。

### 3.4 预览、空态与手机

- [detail-preview.tsx:28](/home/my/workspace/ainfra/zira/frontend/src/features/issues/components/detail-preview.tsx:28)
  active 直接取 `issues[focusIndex]`。点击左列表改变预览，双击或显式链接才打开详情；
  预览消费列表已有 Issue，不额外读取完整对象。
- `detail-preview.tsx:32` 窄屏上下排列、lg 后左右排列；左列表有独立滚动，
  右正文可滚动。这个源码不是手机 Drawer，也不是完整详情编辑页。
- [IssueNavigatorPage.tsx:346](/home/my/workspace/ainfra/zira/frontend/src/pages/IssueNavigatorPage.tsx:346)
  md 以上表格、以下卡片；两者共享 issues/selectedKeys。用户截图只有宽屏一帧，
  不证明这种切换就是截图产品的手机行为。
- [issue-card-list.tsx:25](/home/my/workspace/ainfra/zira/frontend/src/features/issues/components/issue-card-list.tsx:25)
  保留 Checkbox、Key、摘要打开、状态、经办人和优先级；不能为了手机窄而丢掉
  选择与打开的区别，也不能复制其领域字段来填满 mybot。
- [results-state.tsx:30](/home/my/workspace/ainfra/zira/frontend/src/features/issues/components/results-state.tsx:30)
  区分 403、其他读取失败、被权限裁剪到零、真正未命中，并显示原查询；
  不将失败变成空数组。mybot 还需保留刷新旧数据、对象缺失和未支持能力状态。
- [use-issue-search.ts:73](/home/my/workspace/ainfra/zira/frontend/src/features/search/hooks/use-issue-search.ts:73)
  placeholderData 保留上一结果，页面主要依据 isPending；不能据此声称
  “新查询正在刷新且结果仍旧”已被清晰标识。

## 4. 键盘与无障碍：不能照抄注释

| 源码观察 | 风险/验收要求 |
| --- | --- |
| `IssueNavigatorPage.tsx:111` 注册 j/k/o/Enter/x/t/y/[ /f/u | j/k 只改索引，`IssueRow` 改 tabIndex；未看到对应 focus()，需实测 activeElement，不称完整 roving focus |
| `IssueNavigatorPage.tsx:110` 注释包含 i，但注册表无 i | 文档/帮助表不是已实现快捷键清单 |
| `DetailPreview` 注释说 y 改排列，页面 y 实际只设 detail | 截图、注释、实际 handler 三层要对齐 |
| [use-hotkeys.ts:122](/home/my/workspace/ainfra/zira/frontend/src/hooks/use-hotkeys.ts:122) 检查 defaultPrevented/IME，`:95` 识别可编辑目标 | 可以学习机制；mybot 还应阻止活动 Dialog/Menu 背景快捷键、尊重文字编辑与顶层 Escape |
| `issue-table.tsx:38` 注释称 aria-multiselectable，实际 Table JSX 未设 | 不用注释证明可访问树 |
| `aria-colcount=columns.length+1`，行尾 rowActions 另增单元格且未增表头 | 当前页面传 rowActions 时声明列数与实际单元格不一致；mybot 交给正确配置的 Astryx Table，不复制该手写 grid |
| focusIndex/selectedKeys 不随新查询/页自动复核 | 必须定义稳定 ID 的保留/清空策略，不能让旧索引指向新记录 |

上述是静态消费链风险，不是本轮浏览器复现过的 Zira 缺陷。

## 5. Astryx 本地映射与领域边界

已安装 Core 0.7.13 的
[Table/index.ts:44](/home/my/workspace/ainfra/mywork/mybot/frontend/node_modules/@astryxdesign/core/src/Table/index.ts:44)
实际导出 selection、sortable、pagination、column settings、resize、sticky columns、
grouped rows、row expansion、tree 和 virtualization。存在 API 不等于 mybot 都已启用。

| 截图/源码原则 | mybot 可用入口 | 仍需明确的合同 |
| --- | --- | --- |
| Key 与 Summary 分列、主列弹性 | `AppDataTable` 的 pixel/proportional；Task ID 与 title 列目录 | 每密度/宽度的列预算、长标题完整访问、隐藏列不能影响身份 |
| Columns 尾端入口、显示列 checkbox | [TableControls.tsx:53](../frontend/src/components/ui/TableControls.tsx:53) 使用 Astryx DropdownMenu；mandatory title、可选列、Reset | 列显隐不是保存查询；只保存 nonsensitive 列偏好，不扩展第二套 UI |
| 一份受控排序供表头/菜单/手机 | [DataTable.tsx:78](../frontend/src/components/ui/DataTable.tsx:78)、`useAppTableRows` | URL order、全数据先排序后分页、JQL 优先时禁用冲突入口；不宣称多排序 |
| 稳定 Task ID、当前 Run 状态、历史次数 | taskItems/filterTaskItems 与单一 WorkItem 投影 | Issue 不等于 Run；历史失败不覆盖最近成功；数量必须注明 task/run/call |
| 列表到 Inspector，手机 Dialog | FocusedWorkbench 同一 TaskInspector、AppDialog | focus/selection/navigation 分开，关闭回可见触发点；不靠屏幕截图宣称焦点合格 |
| 分页始终可见、结果独立滚动 | `.wf-list-body` 与 `.wf-pagination` 的布局方案 | 20/50/100 真切片、URL 与总量、滚动所有权要测 computed rect 与真实行 ID |
| 表格选择 | Astryx selection state/plugin，若未来确有批量产品需求再封装 | 当前没有授权的批量执行合同，不为外观加可点击空 Checkbox |
| List/Detail/Group 与查询模式 | 项目 wrapper + 一个业务组件树 | Group、Natural language、ZQL 不能从图像直接变成 mybot 已支持能力 |

`task-table-config.ts` 现有白名单为 id/title/projectName/status/updated/attempts/created_at，
title 必需；`TableControls` 排序是单选 radio。它们是 **M：本地源码**，不是此专题新增
或完成测试的内容。mybot 当前不具备 Zira 的 Issue type、assignee、currentUser、
优先级、多人头像、子任务进度、共享 Filter、订阅或其权限模型，不能复制 UI 时补造事实。
Natural language 若未来涉及模型解析，必须另有明确调用授权、预算和可核查查询结果。

## 6. 建议验收

### P0：先还原结果区秩序

1. 以完整首屏截图评审全局顶栏/导航、Filters、页头、查询、表格与页脚，不只截主列表。
   Filters 标题与 Issues/Tasks 标题同层；收起按钮确在 Filters header，收起后真实回收宽度。
2. 1440px 的查询控件、模式、视图与 Columns 在同排，Columns 位于右端；
   不再新增标题 Sort 图标或重复排序条。1024/390px 不强行塞成一行，document 不横滚。
3. Task ID 与标题分列、辅助列稳定；长中英文不增加普通桌面行高、不遮 Badge/历史数。
   以 compact/comfortable/touch 的实际 row/control heights 验收，不只查选中 radio。
4. 用至少 45 个不同 ID 验证全数据排序后分页、20→50、上一/下一、刷新/前进/后退；
   页脚仍在 viewport，只有结果 body 纵向滚动。不能用截图的每页文案代替请求/切片断言。
5. 图像中未展示或业务未实现的保存、分组、自然语言、全结果选择不以活按钮冒充支持。

### P1：再完善交互合同

1. 列显隐/重置/持久化不改 q/filter/project/order/page/pageSize，不调用模型；
   Columns 菜单的键盘、单选/复选状态、Escape 和触发点焦点返回均实测。
2. 查询草稿与提交分开；IME Enter 不提交，未知条件 fail closed；
   排序元数据与实际首尾行一致。服务器分页时不能重复排序单页造成全局乱序。
3. 选择、Inspector、打开详情、当前页独立；换查询/排序/页后按稳定 ID 复核。
   手机与宽屏往返不把焦点还给 display:none 的旧按钮。
4. 测试加载、刷新旧数据、403、网络错误、404、真空和未支持，而不是只保存正常截图。
5. 记录截图观察、源码路径、本地采用与实际运行证据四列；只有 root 的最终独立浏览器
   结果可以将本轮 mybot 实现提升为 T。不会因此改变119项台账计数或宣布用户已接受视觉。

本专题未验证 Zira 后端、截图对应的源码版本、截图 Columns 内部行为、真机、
Safari 或读屏器。没有将字面上的 `ZQL` 标签解释成已接通的查询语言，也没有把图中
的 20 条、50 per page、头像和计数借作 mybot 的验收数据。
