# REA：Zira Issues 深度学习与 mybot 适配

日期：2026-11-14。最新需求：按用户提供的 Issues 截图深度学习。
本轮先研究并记录，不将截图控件直接扩张为 mybot 的业务能力。
上一批 mybot UI 代码的综合验证另行记录，不是 Zira 运行证据。

## 1. 结论

mybot 应学习的是 **查询工作台的区域责任、状态合同和信息密度**，
不是把 Agent 工作台改成 Jira，也不是只换一个配色。

采用顺序：

1. 先统一壳层、Filters、单行主查询、右上表格工具、结果滚动及唯一分页。
2. 再形成可复用的字段目录、查询状态、列设置和列表/详情合同。
3. 最后补保存视图、复杂查询、团队身份、批量操作等有后端依赖的能力。

继续保持 React 19 + Astryx 0.7.13、同一业务树、多样式/明暗/强调色/语言/密度独立。
不引入 Zira 的组件库，不更换执行器或为研究调用模型。

## 2. 证据与分工

| 证据 | 身份与限制 |
| --- | --- |
| 用户截图 | `/home/my/Downloads/Pasted image (5).png`，1853 × 963；SHA-256 `3ff3cc22a009c6a55e62fbc1542b04f127d2aa6bc2240ecf1ae5dfc9b1b3bd93`；只证明可见布局，不能证明控件背后的接口 |
| 本地源码 | `/home/my/workspace/ainfra/zira`，HEAD `1ce0d0510cb590f3a79ca498f7239ff0852ed0d7`；本次检查的 Issues/Filters/layout 路径工作树无差异 |
| 壳层专题 / 数据 Agent | [REA_ZIRA_ISSUES_SHELL.md](REA_ZIRA_ISSUES_SHELL.md)：空间、尺寸、Token、响应式 |
| 查询专题 / 管理 Agent | [REA_ZIRA_ISSUES_QUERY.md](REA_ZIRA_ISSUES_QUERY.md)：草稿、URL、过滤器、请求与保存 |
| 结果专题 / 交互 Agent | [REA_ZIRA_ISSUES_RESULTS.md](REA_ZIRA_ISSUES_RESULTS.md)：表格、列、排序、分页、详情与键盘 |
| 主 Agent | 对照截图与真实路由入口，整合 mybot 领域映射、采用顺序与验收门槛 |

这是源码观察和设计建议。没有启动 Zira、读取它的凭证/数据库、验证其实际服务端，
也没有修改该项目。此前 625 文件结构扫描不能代替本次链路深读。

### 重要差异

截图与当前检出的 `IssueNavigatorPage.tsx` 并不一致：

- 截图的 Filters 从全局顶栏下开始，右侧标题与其同层；源码先渲染页头/JqlBar，
  再渲染内部侧栏和结果工具栏。
- 截图有 Basic、ZQL、Natural language、Type 多选和 Columns；
  当前路由源码使用 JqlBar，不能据此确认截图这些控件的完整实现。
- 截图中的列菜单布局不是从本地独立排序 select 推导出来的。
- 截图底部同时可见 “1–20 of 20” 与 “50 per page”，不能把可见数值当成
  后端分页已生效的证据。

因此：**截图是用户指定的体验参考；源码是另一份可核查实现，两者分别记录。**
不能假设截图就是这个 commit 的浏览器运行结果。

## 3. 从上到下拆截图

以下尺寸是图像近似观察，不是从源码提取的 CSS 值；响应式不能照搬固定像素。

| 层级 | 截图表现 | 真正解决的问题 | mybot 采用 |
| --- | --- | --- | --- |
| 全局顶栏 | 约54px高；左品牌，中间搜索，右新建/通知/账户 | 不离开当前上下文就能找对象/去别处 | 保留顶部 Quick find；不和结果搜索合并 |
| 全局导航 | 约230px宽，工作入口、收藏、近期访问分组 | 跨页面导航，不受当前查询影响 | 任务/待处理/项目/资料；无真实近期数据就不编造 |
| Filters | 约248px宽，标题内折叠、局部搜索、分组与计数 | 快速换查询范围，不是第二份结果搜索 | 状态/项目范围；收藏/共享须先有保存视图与权限 |
| 页面上下文 | Issues、未保存状态、Save/Save as/更多 | 说明当前对象及查询是否已保存 | 任务与项目范围；未有保存合同先不放假保存按钮 |
| 主查询行 | 结果搜索、项目/类型/状态/负责人；右侧模式/视图/列 | 左侧决定匹配哪些记录，右侧决定如何呈现 | 首先支持真实已有字段；Basic/JQL 与列/单排序同源 |
| 次级条件行 | More conditions、Field、Clear | 收纳低频条件，不挤占主查询 | 按需出现；不是再添加一条全局搜索 |
| 结果工具区 | 表格约24px内边距、细边框、约8px圆角 | 明确数据操作和滚动范围 | 仅结果工具可有边界；不把整页分成浮动卡片 |
| 表头与行 | 表头约36px、普通行约40–44px，摘要占剩余宽度 | 反复扫描、比较、定位 | 同一密度配置；舒适/紧凑/触控真正改变计算尺寸 |
| 页脚 | 范围/总数在左；容量/页码在右 | 结果集位置与查询容量明确 | 只保留一份，排序/筛选变化后校正页码 |

### 三种搜索不可混淆

- 顶部全局搜索：查任务、项目、运行和导航，选择后定位对象。
- Filters 搜索：只过滤本栏的范围/保存视图目录，不修改已选查询。
- Search in results：改变当前结果集；文本草稿不等于已提交条件。

### 四种状态必须分开

- 查询草稿：尚未执行的文字/条件。
- 已提交查询：确定结果来源和 URL 的状态。
- 列表展示：列、排序、分组、分页、列表/详情。
- 对象交互：选中集合、活动行、详情对象、表单草稿。

主题切换不能清空查询；切列表/详情不能改变统计单位；
选中本页不能冒充选中全部匹配项。

## 4. 实际源码链路

入口：`frontend/src/App.tsx:69,94` 把项目范围与全局 `/issues` 都指向
`IssueNavigatorPage`；`pages/IssuesPage.tsx:7` 只是兼容导出，不是另一套实现。

```text
IssueNavigatorPage
  URL: jql / view / order / page / filter
  + jqlDraft
  + FilterSidebar -> SavedFilter.jql
  + JqlBar -> 显式提交
       |
       v
  useIssueSearch -> queryKeys.search
       |
       + production: searchIssues -> POST /api/v1/search -> mapIssue
       + mock: evaluateMockJql -> sortIssues -> slice
       |
       v
  loading / error / permission / empty / results
       |
       + IssueTable / IssueCardList
       + DetailPreview
       + Pagination
```

可核查路径：

- `IssueNavigatorPage.tsx:52`：默认查询、URL、草稿与内部选择状态。
- `features/search/hooks/use-issue-search.ts:44`：查询缓存键、取消 signal、生产/mock 分叉。
- `features/search/api/search.ts:61`：请求体、分页、排序覆盖与 DTO 映射。
- `lib/query-keys.ts:27`：查询内容、offset、capacity、排序和字段一起构成缓存身份。
- `features/issues/components/results-state.tsx:30`：错误、403、权限裁剪、真空结果分开。

读取这些前端路径不等于已验证服务端的 JQL、权限或分页。

## 5. 借鉴与不照搬

| 借鉴机制 | 已发现限制 / mybot 约束 |
| --- | --- |
| 项目页复用同一查询导航器 | mybot 固定项目作用域，不能靠默认 query 冒充权限隔离 |
| draft 与 committed 分离 | 多参数更新必须一次提交；源码 `runSearch` 连续 setParam 的闭包状态可能互相覆盖，属静态风险而非本轮运行重现 |
| 查询键集中、读取可取消 | 不为模仿而强行引入状态库；若保留旧结果，必须标正在刷新/旧结果，不能给旧数据套新条件标签 |
| 明确 permission/empty/error | mybot 没有团队身份与 ACL 时不显示“我的任务”是假过滤 |
| 可排序列注册、固定列宽 | 源码 `?cols=`/虚拟化仍有 TODO，截图有 Columns 不等于源码已实现列配置 |
| 本页选择与批量栏 | `onSelectAllMatching` 实际仍取当前 issues；mybot 无真实批量命令先不加执行型多选 |
| 单一分页区域 | 源码 `PAGE_SIZE=20` 固定，容量 select 无 onChange；mybot 已有真实受控容量，不退化 |
| 保存过滤器有版本号 | Save 与 Save as 需不同语义；冲突不能自动覆盖，权限与共享不能从名称推断 |
| API/字段元数据分离 | filter API 的示例回退与容错空数组不能作为生产默认；401/403/Abort/schema错误须保留 |
| 结果重试入口 | 查询读取可重试不代表模型、控制命令、邮件发送也可同策略重放 |

## 6. Astryx 与领域映射

| Zira Issues 概念 | mybot 落点 | Astryx / 项目边界 |
| --- | --- | --- |
| Issue / Summary | Task、目标、最新Run事实 | `AppDataTable`、`AppBadge`、任务投影 |
| Filters | 项目/执行状态/后续保存视图 | 项目自有范围栏；已有状态可用，不造共享对象 |
| Type / Assignee / Priority | 不能直接映射Agent角色/所有者/调度优先级 | 有真实字段与后端语义后再开放 |
| Basic 条件 | 项目、状态、结果搜索 | `AppInput`、`AppSelect`；多选语义成立后再采用 MultiSelector |
| ZQL/JQL | 当前仅兼容有限ORDER BY | 仍明确拒绝完整表达式/currentUser，不宣称完整查询语言 |
| 搜索值下拉 | 搜索+多选+选择状态+空/加载/错误 | 优先 Astryx ComplexSelector/PowerSearch，经项目封装；先核对本地类型和真实字段 |
| Columns / Sort | 列显隐、顺序、单/多字段排序 | Astryx DropdownMenu/Table；排序贯穿URL和分页后才能开放 |
| List / Detail | 同一Task集合与按需Inspector | Table/Resizable/Dialog；Run history是另一统计单位，不混为展示模式 |
| Saved filter | 服务器持久保存查询；完整SavedView另立合同 | 名称+查询+版本+归属；列/布局/容量偏好和执行授权分开 |
| Status transition | 不能直接变成Run拖动改状态 | 独立权限、合法转换、预算、请求ID和审计 |

本表是采用方案，不代表高级控件或领域能力已集成。

## 7. 后续实施清单

以下为本次研究的交叉整改视图，**不与119项原台账或WUI/BP重复计数**。
本轮不把“研究完成”当“实现完成”。

| 顺序 | 切片 | 交付与验收 |
| --- | --- | --- |
| IZ-01 | 定版区域与尺寸合同 | 全局/Filters/页头/主查询/结果/分页职责固定；1440/1024/768/390/320验证 |
| IZ-02 | 字段目录和查询状态 | 仅真实字段；草稿/提交/URL分离；一次事务改多个参数；刷新/前进后退一致 |
| IZ-03 | 条件交互 | 字段检索、多选、清除与已选状态；按需次级行；失败保留条件，不空数组伪装成功 |
| IZ-04 | 列与排序深化 | 补列顺序/键盘移动、多字段排序；URL/隐藏列排序/分页一体，未做分组不留假入口 |
| IZ-05 | 列表与详情连续性 | 选中ID、滚动、焦点、回到列表位置；窄屏同源详情，历史Run另算 |
| IZ-06 | 保存视图 | 明确保存/另存为/删除及版本冲突；先单用户私有，不提前做团队共享 |
| IZ-07 | 数据规模化 | 服务端过滤/分页合同后再虚拟化；测量数据量、响应时间、读取量和初始bundle |
| IZ-08 | 统一验收 | 中英文、主题/强调色/密度、弹层焦点、长文本、空/错误/权限、无模型副作用 |

实施前先验收当前 WUI/BP 批次；原生恢复跨刷新未知结果仍需服务端操作意图/回执合同，
不能为了“UI清单全绿”用浏览器内存锁代替持久保障。

## 8. 下一轮阅读入口

先读本报告和三份专题，再对照 `TODO_INDEX.md`、`PRODUCT_UI_AUDIT.md` 与
`LAYOUT_BLUEPRINT.md`。实现时每个切片写明：

1. 截图依据与已核查源码。
2. 本地适配/不采用理由。
3. 真实动作和数据合同。
4. 定向测试、浏览器证据与未验证边界。

没有用户视觉接受前，不把“技术检查通过”写成“已经达到Zira效果”。

## 9. 本批 mybot 实测补记

研究与实施证据分开：本批已有mybot整改最终通过367项前端、265项Python、生产构建
及57项完整浏览器检查，60份截图见[本地证据](../frontend/evidence/issues-rea-2026-11-14/README.md)。
实测查询控件外框为28/32/40px；修复导航恢复URL却卸载草稿的缺陷。
这些结果不证明Zira运行效果、截图版全新布局、完整JQL或保存视图已实现。
WUI-01/06/11仍部分未完成，下一批IZ切片和原110项业务待办不因此自动关闭。
