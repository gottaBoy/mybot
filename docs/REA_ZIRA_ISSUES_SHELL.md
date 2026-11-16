# Zira Issues 壳层与几何研究

日期：2026-11-14（Asia/Singapore）。仅研究用户新提供的 Issues 截图与已授权的本地
Zira 前端源码；没有新增 mybot 页面实现。本报告供主 Agent 整合新的界面方向，
不替代既有业务合同或宣称用户已接受设计。

## 1. 证据边界

| 证据 | 本轮实际取得 | 不据此推断 |
| --- | --- | --- |
| 用户截图 | 已用图像工具查看 `/home/my/Downloads/Pasted image (5).png`，1853×963 RGBA PNG | 真实交互、DOM、浏览器缩放、响应式、暗色、权限或服务端能力 |
| 截图身份 | SHA-256 `3ff3cc22a009c6a55e62fbc1542b04f127d2aa6bc2240ecf1ae5dfc9b1b3bd93` | 截图一定来自下述 commit；截图内业务记录是 mybot 数据 |
| 本地源码 | `/home/my/workspace/ainfra/zira/frontend`，HEAD 实际核对 `1ce0d0510cb590f3a79ca498f7239ff0852ed0d7` | 源码声明等于截图实现、运行验证或 mybot 集成完成 |
| 工作区 | 定向检查 layout、IssueNavigatorPage、index.css、Tailwind 配置，无工作树改动 | 整个 Zira 仓库均已审计或运行安全 |
| 既有结构索引 | [625 文件结构研究](ZIRA_FRONTEND_STUDY.md) 作为查找地图 | 625 文件全部逐行人工审计、真实运行或权限验收 |

没有启动 Zira、调用其后端、读取 `.env`、凭证、数据库或运行日志，没有修改兄弟项目。
截图中的品牌、头像、人员、项目、过滤器名称、记录数与问题内容均不转入 mybot 数据。
下方截图尺寸是人工图像观察的近似值，不是 CSS 来源，也不是 Playwright 计算值。

## 2. 截图的空间责任

截图首先是一个可连续工作的结果页，不是“搜索框 + 列表”的孤立拼接。

| 区域 | 截图观察 | 作用 |
| --- | --- | --- |
| 全局顶栏 | 约 54px 高，横跨全宽；品牌靠左，中间搜索约 560px，创建和账户相关入口靠右 | 全局导航与快速查找，不承载当前结果条件 |
| 全局导航 | 从顶栏下延伸至底，约 230px；分组导航、收藏与近期入口，底部设置/帮助 | 稳定的产品空间与跨页面上下文 |
| Filters 栏 | 紧邻全局导航，约 248px，从 y≈54 到底；标题、目录搜索、分组列表、计数和新增入口 | 当前 Issues 页的视图/条件目录，不是第二套全局导航 |
| 页头 | 主区从 x≈478 开始；标题与未保存状态同排，右侧 Save/Save as/下载/更多 | 当前视图身份、保存状态与页级动作 |
| 查询带 | 页头下浅灰背景；左侧结果内搜索、Project/Type/Status/Assignee；右侧查询模式、List/Detail、Group/Columns | 修改结果范围与呈现方式，主行基线一致 |
| 次级条件行 | More conditions、Field、Clear 在查询主行下方 | 增加条件和清理，不把低频动作挤成独立大区块 |
| 结果工具 | 外围约 24px 内边距，边框约 8px 圆角；约 x=503、y=215 至 y=938 | 一个真正有边界的表格工具，不是整页浮动卡片 |
| 表格内部 | 表头、可滚动数据区和底部分页连成整体；Key/Summary/Status/Assignee/Priority/Updated 对齐 | 数据优先；复选、行激活、字段比较互不混淆 |
| 行与页脚 | 数据行人工观察约 40–44px；页脚约 50–56px，计数靠左、每页/翻页靠右 | 紧凑但可扫描，持续可见的结果范围 |
| Type 浮层 | 锚定 Type 触发器，约 224px 宽；小标题、内部值搜索、选项列表 | 条件编辑在局部完成，不推开整个结果布局 |

这些尺寸用来识别比例关系，不作为逐像素还原合同。尤其不能把“数据行约 42px”的
图像观察写成上游 CSS `height:42px`，也不能从一张图证明全部行/字体/缩放完全一致。

### 关键层级

1. 顶栏属于全局，左一栏属于产品导航，左二栏属于当前查询目录。
2. 标题行、查询带、结果工具分别有明确责任，横向边界连续，不互相套卡片。
3. 搜索结果内文本条件与全局搜索分开，右侧呈现工具与左侧范围条件分组。
4. 列头/正文/分页在同一结果工具里；只有数据区出现滚动条，不能借扩大文档横滚容纳表格。
5. Type 浮层使用轻边框与小阴影表达层级，没有大面积装饰或重复背景卡片。

截图能证明当前打开了一个 Type 选项浮层，但不能证明多选提交、筛选语言、保存视图、
自然语言查询、Columns 配置或每页大小实际生效。图上的人数、通知和计数也不是 mybot
需要补造的展示元素。

## 3. 固定源码对应与差异

路径均相对 Zira 的 `frontend/`。下述行号是此次固定 HEAD 的源码位置。

| 本轮已读路径 | 源码事实 | 与截图的关系 |
| --- | --- | --- |
| `src/components/layout/AppShell.tsx:18-27` | TopBar → ContextBar → main/Outlet；页面组织局部导航 | 有责任分层，但没有截图的常驻全局左导航 |
| `src/components/layout/TopBar.tsx:45-58` | sticky、h-topbar；内层 max-w-content，主导航在桌面顶栏 | 截图是全宽顶栏及左侧主导航，不能直接复用此 JSX 当截图还原 |
| `TopBar.tsx:118-133` | 中部命令入口，md 起显示、max-w-md；小屏独立搜索图标 | 有全局搜索的原则，但声明宽度与截图约 560px 不同 |
| `TopBar.tsx:189-219` | 窄屏主导航使用 Dialog | 仅为源码提供的窄屏参考，截图没有移动端证据 |
| `src/components/layout/ContextBar.tsx:7-17` | 项目/看板上下文才出现；/issues 不出现 ContextBar | 不应给 Issues 再机械加一条上下文横栏 |
| `src/components/layout/PageHeader.tsx:35-57` | 页头边框/白底、16/24px 横边距、标题/动作与可选说明 | 可学共用页头责任，不等于截图的单行 Issues/Unsaved query/Save 排列 |
| `src/pages/IssueNavigatorPage.tsx:174-241` | PageHeader、JqlBar 在过滤树之前，过滤树位于内容下层；宽度来自 rail | 与截图 Filters 自 y≈54 开始满高明显不同 |
| `IssueNavigatorPage.tsx:245-305` | 结果条含计数、List/Detail、独立排序 Select、每页 Select | 截图查询带右侧出现 Group/Columns；不能声称本地源码已实现截图的工具组织 |
| `src/features/issues/components/jql-bar.tsx:60-75` | 一行 JQL 输入/搜索，另一行已保存过滤器/保存/导出 | 不是截图的 Basic 字段条件带；模式与字段组件需另做合同 |
| `src/features/issues/components/filter-sidebar.tsx:23-37` | 滚动分组列表和底部新增入口，没有截图中 Filters 标题与目录搜索 | 可学目录滚动/分组，不虚称完整目录已经复刻 |
| `src/features/issues/components/issue-table.tsx:62-88` | grid 语义、页内全选、aria-sort、表头排序按钮 | 是表格交互语义证据；没有 Columns 菜单或截图固定高度滚动容器 |
| `src/components/ui/table.tsx:11-12,46,70` | 容器仅 overflow-x-auto，行 h-row，单元格 px-3/py-2 | 截图内部垂直滚动及固定页脚不能由这些类名直接推出 |
| `src/components/ui/toolbar.tsx:12-25` | 工具条真实类名是 flex-wrap、gap-2、border/padding | 注释提及横向滚动，但本组件类名没有 overflow-x-auto；以实际源码为准 |

**结论：截图的空间结构应独立建模，旧版本地页面只能提供若干工程原则。**
不能为了“学习完整”把旧源码的布局、截图的颜色和新造的交互拼在一起，再称为
“Zira 原样实现”。

### 不能当作可移植行为的部分

- `IssueNavigatorPage.tsx:52` 默认 DMS 查询是 Zira 域样例，不是 mybot 当前项目。
- `:294-298` 每页 Select 使用 defaultValue，未连接 `PAGE_SIZE=20` 的真实查询状态。
  不能把有下拉框写成“分页尺寸已可用”。
- `:373-374` 页内全选与 all-matching 都只取当前页键；mybot 必须继续保持本页和全量
  结果范围的语义，不借截图按钮声称全量选择。
- 截图中的 Assignee Me、Type、ZQL、Natural language、保存过滤器、通知与用户头像
  要有 mybot 自己的身份、字段、查询、费用和持久化合同；不因视觉参考而取得能力。
- 数据与 fallback 的专题限制仍见 [ZIRA_STUDY_DATA.md](ZIRA_STUDY_DATA.md)，不能把
  旧目录回落示例、静态最近项、失败归零或权限缺省随壳层一起迁入。

## 4. 颜色、尺寸与主题

固定源码的颜色来源是 `src/index.css`，Tailwind 只映射语义变量
（`tailwind.config.ts:20-65`），不是业务页各自写一套 palette。

| 语义 | 固定源码浅色 | 固定源码深色 | 位置 |
| --- | --- | --- | --- |
| Canvas / Surface | `#f7f8fa` / `#ffffff` | `#0e1116` / `#161a22` | `index.css:20-24,125-129` |
| 正文 / 次级文字 | `#172b4d` / `#5e6c84` | `#e6e9ef` / `#a6aebb` | `:28-30,133-135` |
| 默认 / 强边框 | `#dfe1e6` / `#c1c7d0` | `#2a3140` / `#3a4354` | `:34-36,139-141` |
| Accent | `#3568e8` | `#5b87f5` | `:40,144` |
| Hover / Selected | 低透明中性 / 蓝色背景 | 白色透明 / 蓝色透明背景 | `:25-26,130-131` |

截图显示浅白/灰底、细分隔线、浅蓝选中，以及深青色 Create 按钮；这里只作视觉观察，
没有从图像量化出准确 hex。**截图强调色不能被当成上述蓝色源码 token 的直接证据。**
截图主题/版本/运行来源未知，应分别记录，不能覆盖 mybot 已有可选 Zira Token 的来源。

固定源码几何：`tailwind.config.ts:109-151` 声明正文 14/20、辅助 13/18、
caption 12/16、H1 24/32；控件 24/32/40，TopBar 56、ContextBar 48、行 40/32、
rail 240、内容上限 1440。它们与截图约 54、230、248、42 等观察不同。
`index.css:92-103` 的边框圆角/小阴影层级可以借鉴，但不是要求所有控件统一变圆卡片。

主题能力的源码边界：

- `src/lib/theme.ts:30-38` 以 data-theme/color-scheme 应用 light/dark，system 解析为实际模式；
  `:41-62` 仅持久化主题偏好，不涉及业务状态。
- `src/stores/ui-store.ts:30-32,71-73` 声明 density 舒适/紧凑并切换 store；
  表格原语分别提供 h-row 和 TableRowCompact。源码存在这两种行类，
  **不等于 Issues 页已把所有控件和表格绑定为动态密度**。
- `index.css:208-237` 含限制 body 横向滚动、全局 focus-visible 与 reduced motion。
  这些是源规则，不是已经通过浏览器无障碍或全路径响应式验收。

## 5. mybot/Astryx 适配建议

以下是建议，不是本轮实现或接受要求。继续 Python/FastAPI、React 19 与 Astryx，
单一业务树，不导入 Zira React/Radix/Tailwind 组件、品牌或业务数据。

| 责任 | mybot 应保留的原则 | Astryx / 项目落点 |
| --- | --- | --- |
| 全局框架 | 顶栏、产品导航与页面上下文的几何责任分离 | 项目 Shell + 现有 Button/CommandPalette；布局 CSS 只负责 grid/尺寸 |
| 第二栏 | 仅当前页需要时呈现范围目录，不复制一份全局导航 | 真实项目/状态/已有视图目录；尚无保存视图时不列虚构名称/计数 |
| 页头 | 名称/当前范围/保存状态与页级动作一排，不堆说明卡片 | 项目 PageHeader 组合；保存状态必须来自真实 API 或明确 dirty draft |
| 查询带 | 一条主行：文本与受支持条件在左，模式/视图/结果呈现工具在右 | 项目 QueryToolbar，使用 Astryx 输入/Selector/Segments/Menu |
| 条件浮层 | 定宽、锚定、内部搜索/可选状态与明确提交范围 | 已有 Astryx Selector/ComplexSelector 等受支持包装；缺字段不伪造条件 |
| 结果工具 | 表格头、数据滚动区与分页共享一个边界 | 现有 AppTable/列工具/分页；不把整个页面装入浮动卡片 |
| 主题与主色 | surface/text/border/status/interactive 各有角色 | `themes.ts` 单一 token 注册；style、mode、accent、density 独立 |
| 密度 | 同一屏控件基线、表格行、菜单项与边距成套变化 | 现有 DensityContext；不能只缩表格、不改按钮或靠缩小字体塞屏幕 |
| 窄屏 | 不让双左栏宽度挤压正文；目录与导航分别收为抽屉 | 已有 Dialog/Inspector；仅结果区横滚，焦点返回原触发器 |

建议先以截图的**空间关系**做一张 mybot-owned 审阅图：顶栏全宽、稳定产品导航、
可选范围栏、单行页头/查询区和连续结果工具。宽屏比例可参考 230/248/余量，
但窄屏需真正重排；不以 viewport 字号缩放或两套页面实现达到“看起来相似”。

当前 mybot 的 Task、Run、Call、Agent 是不同对象。截图的 Issue 并不能直接改名
成 Run；列表应继续每任务最新 Run 投影，历史记录有独立入口，人工接受不等于执行成功。
Sorting、Columns、Group 的归属应先在新的几何图上确认，再对照用户指定交互补证据，
不能因旧源码有一个独立排序下拉就否定用户截图的工具组织。

## 6. 下一轮验收与空白

1. 先明确是采用“截图双左栏骨架”还是沿用旧源码壳层；不能同时声称两者完全一致。
2. 保留截图标注、固定源码路径、mybot 适配图、实际浏览器截图四层证据。
3. 浏览器测全宽顶栏、两栏起止线、页头/查询/结果边界、控件基线、滚动区与分页；
   记录计算尺寸和视口，不只做无横向溢出检查。
4. 测量任务标题/项目名/中英文长文本、三档密度、至少三种样式与明暗；比较实际
   computed colors/font/control/row dimensions，切换不能丢查询、选择、草稿或 consent。
5. 浮层验键盘、Escape、焦点、碰撞边缘、菜单内滚动；查询草稿/提交/URL/后退互相一致。
6. 排序与列配置的入口/子菜单需按最新用户参考确认；未支持的 Assignee、Type、
   Natural language、保存视图、Grouping 不伪装可用，更不能借自然语言查询自动付费。

本轮没有 Zira 运行、手机/暗色截图、真实权限或查询能力证据，也没有新 mybot
浏览器/生产构建验收。所列尺寸、颜色与壳层建议必须在下一切片通过实际 Astryx 渲染
验证；报告完成不改变原 119 项台账，也不把前一轮 WUI 安全改动的测试算成新界面验收。
