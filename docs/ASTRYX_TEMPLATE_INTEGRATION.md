# Astryx 模板整合与多样式

日期：2026-11-13。依据：用户逐条指定的 20 个模板、基础组件与“一套代码多种样式”要求。
保留 ADR-0006 的渐进迁移边界，不改变 Provider、设备权限或认证协议。

## 1. 一套产品，不是 20 个演示站

| 选定模板 | 产品落点 | 真实边界 |
| --- | --- | --- |
| login-sso | 独立登录页、会话入口 `#login` | 接现有令牌认证；SSO 仅标未配置，无伪造重定向 |
| shell-nav / shell-side-nav | Workbench 导航、页头、手机抽屉、快速查找 | 页面/项目/运行导航，不直接启动模型 |
| dashboard / dashboard-progress / dashboard-alert-rail | `#overview` 总览、项目进度、异常侧栏 | 每任务最近 Run；完成不等于测试/人工接受 |
| kanban-board | 工作台“看板”视图 | 真实任务与最近运行；无演示优先级/截止期，不拖动伪造状态 |
| table-filter | 任务优先工作台、独立“运行记录”视图 | 单条筛选、任务去重、排序后分页；运行记录保留列显隐/行距；不宣称完整 JQL/保存视图 |
| table-tree | `#hierarchy` 项目→任务→运行 | Bootstrap 投影，不扫描仓库文件 |
| table-inbox | `#inbox` 待处理双栏 | 未运行/异常/暂停任务，不是 IM/邮件已接入 |
| canvas-editor | Run “工作图” | 固定阶段、选择/缩放/检查器；不是图文编辑器或任意 DAG 执行 |
| work-item-detail | Run 工作/调用/成果/审计 | 来源、执行、测试、人工决定分开 |
| ai-chat | Run “对话” | 持久化目标与 Agent 正文，无新消息发送、无伪装工具调用 |
| ai-chat-landing | 任务目标入口与未运行空态 | 提交任务后先保存/检查，再单独确认调用；未接长期会话 |
| form-wizard / form-wizard-inline / form-wizard-dialog | 资料→模型资源→确认运行 | 一条共享确认流程；前两步不调用模型，返回修改清除 consent |
| settings-dialog | “偏好设置”与配置表单 | 样式/明暗/密度/语言本地保存；连接仍需显式测试 |
| documentation / documentation-technical | `#documents` 项目资料、任务验收与文件清单 | 只读已保存项目资料，不静默读取源码或自动远程图片 |

上表表示选定模式的适配落点，并不表示每个上游模板的全部交互已复刻。
完整原始模板仍是独立参考，不能把它们的假数据/假保存/无动作按钮导入业务。

## 2. 可复现来源

安装包及 CLI 固定 `0.7.13`。20 份 CLI 产物位于
`frontend/src/app/<id>/page.tsx`，保留上游 copyright 和 MIT 通知。未升级包、未运行
`astryx init`；重复的 canvas-editor 请求未覆盖现有副本。

用户命令在 `frontend/` 使用已安装 CLI 等价执行：

```bash
pnpm exec astryx template login-sso ./src/app/login-sso
pnpm exec astryx template kanban-board ./src/app/kanban-board
pnpm exec astryx template canvas-editor ./src/app/canvas-editor
# 其他 id 使用同一模板命令；不加 --overwrite 覆盖本地修改。
```

CLI 把远程演示媒体替换为占位。`table-tree` 和 `form-wizard` 的“安装 canvas-editor /
Next”提示来自示例字符串扫描，实际没有对应包导入，因此没有安装这些无关依赖。
`#templates?template=<id>` 仍可在原 opaque iframe 中查看参考，模板不直接进入产品入口。

## 3. 一套代码，多种样式

- 唯一产品组件树在 `frontend/src/workbench/`，不是按主题复制页面。
- `components/ui/themes.ts` 注册 Neutral/Zira/Gothic/Matcha/Stone/Butter/Chocolate/Y2K，
  主题包按需加载；Zira 是用户授权的配色 Token 适配，不是替换 Astryx。
  `AppTheme` 处理异步过期结果和失败保留。
- style ID、light/dark、comfortable/compact、zh/en 分开保存，切换不改业务数据。
- `--wb-*` 由 Astryx 语义 Token 映射；字体使用系统回退，不自动下载外部字体。
- 主题编辑器草稿与产品外观分离，不因产品换肤覆盖正在编辑的主题源码。
- 项目自有包装层使用 Badge、Avatar/AvatarStatusDot、AvatarGroup/Overflow、
  Skeleton、CommandPalette（按 group 自动使用 CommandPaletteGroup）及 Table 插件。

排版参考授权及阅读范围见 [REA_ZIRA_LAYOUT.md](REA_ZIRA_LAYOUT.md)，没有引入 Zira
运行时、组件 CSS 或账号数据；主配色按用户后续授权映射成 Token。
项目规则已更新到根 `AGENTS.md`，不另建大小写不同的规则副本。

## 4. 验证与未完成

最终类型/构建/单测和浏览器结果以 [PROGRESS_LOG.md](PROGRESS_LOG.md) 的本轮条目为准。
需核验多样式计算值、持久化、键盘选择、表格排序/列显隐、看板、树展开、收件箱、
文档、工作图、对话、Wizard consent、手机与深色，不以生成源码当成集成成功。

没有新增企业 SSO、动态 DAG、长期 Agent、IM/邮箱连接器、跨设备迁移、代码执行，
也没有自动重跑正式 Codex 历史任务。重试与资源仍需下一切片在 React 中实现。

## 5. URL 查询状态

用户给出的 `jql`、`mode`、`view`、`groupBy`、`group` 已纳入 URL 状态合同：
支持普通 query 和 hash query，视图切换保留它们，刷新/后退恢复。

当前只实现 `ORDER BY created ASC/DESC`、`ORDER BY summary ASC/DESC` 的有限排序兼容；
这不是完整 JQL 解析器。mybot 没有团队身份/assignee 字段，因此
`assignee = currentUser()` 保留原文并明确报错，不默默忽略条件返回全部结果。
非 none 分组或其他表达式同样拒绝执行。

完整 JQL 和 currentUser 负责人筛选属于已提出、尚未实现的需求，需要先确定真实身份/
负责人模型及查询引擎合同，不能把 Zira 的领域或接口当成现成能力。

## 6. 工作台排版再收敛

2026-11-14 用户否定整合后的密度。本屏改用 `FocusedWorkbench.tsx`，
不再同时常驻概览、项目侧栏、草稿卡片与历史运行列表。任务表共用 Astryx Table，
默认按任务归并；选中后才出现 Inspector，手机使用已有 AppDialog。
真实分页与 URL page/pageSize、任务 ID 查询、手机/桌面排序同源一并补齐。
未引入新的组件库或主题分支；旧集成截图保留，新证据单独记录，不将旧测试结果冒充
本次重新布局的验证。详见 UI_ITERATIONS 第 14 节和进度日志。

## 7. 搜索与结果导航器

2026-11-14 用户再次要求认真对照 Zira 的搜索/列表后，第 6 节的单条下拉筛选方向
不再作为当前视觉方案。`FocusedWorkbench` 改用紧凑全宽页头、提交式查询区、实际
状态/项目导航和结果工具栏；编号与摘要分列，标题/项目单行截断，详情保留完整内容。

查询用 Astryx TextInput/Button/SegmentedControl，经项目包装后实现 draft/committed；
结果工具栏用小号 Selector、Table 的受控排序与真实分页。`q/filter/project/order/
page/pageSize` 进入 URL，刷新/前进后退恢复，不表示已有完整 JQL 语法。
范围导航在桌面可折叠，手机使用同份 Astryx Dialog，不再把筛选隐藏后不留入口。
只在任务列表显示任务排序/容量控件，不给看板/运行记录添加无效果选项。

这仍是同一业务树/Token 注册，不引入 Zira 组件库、保存过滤器、示例 autocomplete
或假团队字段。最新证据见 `frontend/evidence/search-list-2026-11-14/`；
此前的模板整合与任务优先截图保留，但不能代表本轮体验已通过用户评审。

## 8. 蓝图第一执行包

2026-11-14已实施工作台范围/主内容区域重组，顶部通用查找不变；查询与视图控件
使用既有项目Astryx包装，容量和页码移动到底部，已有单排序转为按需Dialog。
`AppSegments iconOnly`映射安装包`isLabelHidden`，保留读屏名称，供窄屏视图切换。
没有新增列/多排序/分组或Natural language占位。

并行完成资料选择与调用详情刷新两个真实交互修正；组件模板存在仍不等于这些合同
天然成立。最终230项单测、构建、44项浏览器通过，证据
`frontend/evidence/blueprint-multiagent-2026-11-14/`；完整待办见TODO_INDEX。

## 9. 第二批整改与Issues专题

2026-11-14保留同一业务树、Astryx0.7.13与已有20份模板参考：

- table-filter模式由项目与任务工作台共用；真实列菜单使用DropdownMenu封装，
  单排序收在右上列工具，摘要列不可隐藏。列顺序/多排序仍不是已实现事实。
- shell导航的Quick find补全任务源，遵守活动Dialog/Menu的快捷键范围；
  table-tree使用受控展开，table-inbox手机详情用现有AppDialog。
- form-wizard增加字段错误、首错焦点、快照409显式重取与草稿离开确认。
  模型测试增加请求ID和持久回执，不把失败/unknown呈现为成功。
- 各包装默认使用DensityContext的舒适/紧凑/触控；八样式之外可独立选强调色，
  仍不是按样式复制页面。显式局部密度覆盖保持可用，需另行验收。
- work-item-detail迁移原生恢复/资源草稿与同页unknown锁；跨刷新持久恢复意图和
  精确回执仍缺失，WUI-06不能因此标完整完成。

本批最终运行结果另记PROGRESS_LOG。用户新截图的Issues研究为
`REA_ZIRA_ISSUES.md`及三份专题，截图与本地Zira源码不同；
IZ-01–08仅为下一轮适配顺序，不冒称新的模板能力已接通。

## 10. 2026-11-15 三项合同收尾

继续保持React19、Astryx0.7.13、项目包装层及同一组件树，没有升级或再生成CLI副本。

| 已采用模式 | 本轮真实接通/验收 | 未扩大为 |
| --- | --- | --- |
| table-filter / table-inbox | 项目固定scope、查询/分页/BackForward、手机同源详情与焦点专项 | 后端团队ACL、完整JQL或服务端分页 |
| work-item-detail / form-wizard-dialog | 持久恢复意图、显式执行、精确回执、GET恢复及新候选 | 任意外部命令恰好一次、费用已结算或执行迁移 |
| shell-nav / forms / AppDialog | 受管同文档导航、保留目的entry、busy/401/未保存决策 | Safari真机或跨文档绝对可取消 |

资源草稿与回执使用不同状态，不把模板里的禁用/示例控件当业务动作。applied回执可从
成功/运行中来源的只读历史入口查看；刷新不重发。外观仍可独立切样式、强调色、密度、
语言和明暗，不重挂表单或另建主题页面。

本轮418项前端、306项Python、构建及57/16/9/9生产浏览器报告通过，78截图在
`frontend/evidence/ui-closeout-2026-11-15/`。上节WUI-06“仍缺失”是11月14日历史状态，
已由ADR-0007/0008及本批结果取代；正式4180未重启、接口未启用。原119项计数不变，
长期Agent、IM/邮箱、任意DAG、设备接力与代码执行没有因此获得新权限或实现。

## 11. Basic查询候选第一切片

2026-11-15继续复用table-filter与shell模式，不重新生成模板、不升级依赖。
主查询行的既有AppInput/AppSelect形成Text/Project/Status内存草稿，AppButton的Search
一次提交候选；同一行X清除按钮有disabled/pending边界。没有引入第二套表单或查询控件。

状态合同与源码/研究区别记录在REA_ZIRA_ISSUES_QUERY第8节。canonical导航原因只区分
push/replace/traverse；前进后退恢复整份已提交查询，展示push保留草稿。
窄屏沿用既有AppDialog/Filters即时范围，而非假装隐藏的Selector仍可触控。

生产验收见`frontend/evidence/query-drafts-2026-11-15/README.md`。本项不等于
PowerSearch/ComplexSelector已接通、完整JQL/字段多选、私有保存视图或服务端查询完成。

## 12. 多选条件与任务表设置

2026-11-15沿用同一React/Astryx0.7.13业务树，未升级或重新生成模板：

- 新项目包装AppMultiSelect直接使用发布包MultiSelector，支持真实选项搜索、多选、清除、
  count触发器和adaptive呈现；可搜索模式trigger为button，combobox在popup搜索框内。
- table-filter对应真实项目/状态目录与OR/AND条件，JSON参数有严格验证和旧单值兼容。
  手机Filters复用同一候选，Search显式提交，不再只检查隐藏桌面控件的resize状态。
- Table/DropdownMenu/AppDialog模式承载列顺序、显隐与最多3层排序；现有显示列菜单/
  单排序入口保留。“管理列与排序”只从表格右上工具进入，不再新增单独页头排序按钮。
- 列顺序与显示偏好只存非敏感本机设置；排序是可分享URL，均不是SavedView。Title必显示，
  JQL仍锁排序，Task多排序/顺序不能冒充Run历史或Board的相同排序。

发布包类型和实际hook验证见OPEN_SOURCE_RESEARCH第26节；约束ADR-0009。
634项前端、构建、58/15/16/30/9/9生产报告及111截图见
`frontend/evidence/advanced-workbench-2026-11-15/`。未接新的模型/SSO/外部执行能力，
保存视图、服务端分页、Safari/真机和用户视觉评审仍是后续工作。

## 13. 可见排版整改

2026-11-15用户在“页面没变化”反馈后批准实际可见整改。继续使用同一业务树和发布包：

| 模式 | 本轮适配 |
| --- | --- |
| shell-nav / table-filter | 独立全局查找；两级页头；一行查询与独立结果工具带，视图左/列设置右 |
| Selector / SegmentedControl | 桌面查询模式保留Segments，手机用adaptive Selector；切换不提交/清除草稿 |
| table-filter / work-item-detail | Inspector打开时列工具仍属于表格；项目/编号、目标、验收、文件和历史分区 |
| settings-dialog / Table | 保留独立样式/强调色/明暗/密度/语言及列排序，触控英文分页增宽 |

没有重新生成模板或引入Zira组件/新依赖；不是保存视图、Agent执行或多端接力已启用。
前后对照与781项单测、生产布局/综合/高级/草稿/项目/连续性26/58/30/15/16/10项，
见`frontend/evidence/visible-workbench-2026-11-15/README.md`。视觉仍待用户评审。

## 14. 保存视图完整合同验收

2026-11-16继续沿table-filter、settings-dialog及AppActionMenu/AppDialog实现，不升级包：

- 保存/另存/更新/删除对应真实单用户workspace/project资源，不是模板的样例保存指示。
  捕获已提交查询和已应用列配置，加载复制快照；不是URL动态绑定或团队共享。
- 版本冲突保留原revision与草稿；丢响应锁原ID，不自动再写。GET当前资源不冒充原请求回执。
- 触控菜单采用Astryx的dialog/button形态，提交弹窗同时核验dialog/alertdialog；
  320px未知结果、390px中文保存、键盘与焦点在浏览器实际验证。
- 长反馈位于页头下方同主题反馈区，320/360px分页两行，查询仍一行；没有另建手机业务树。
- 修复实际project_unavailable映射、非JSON401清理，以及订阅建立前URL变化的初始化缺口；
  后者使用原canonical监听并补初始读取，不添加第二套原生导航器。

合同和限制见ADR-0010；证据`frontend/evidence/saved-views-2026-11-16/README.md`。
原4180未重启，主服务启用仍需独立确认；不是新的执行型Workflow、连接器或设备接力。

## 15. 服务端任务页接入

2026-11-17，IZ-07.2沿现有table-filter/Table模式接入bounded task-query，不重生模板、
不升级React/Astryx、不复制任务页或主题分支。既有单行查询、顶栏Quick find、表格右上列/
排序工具、密度与中英文保持同一业务树。

| 采用模式 | 本批适配 | 明确未扩大为 |
| --- | --- | --- |
| table-filter / query wrappers | 只从committed URL查询请求；能力明确准入，固定项目与SavedView保持合同 | 完整JQL、自动模型请求或未知backend静默回退 |
| Table / sort hooks | server页原序透传，表头仍可设置排序，提供全量行数/页起点ARIA坐标 | 在browser重排一页来冒充全局排序、跨页不可变快照 |
| Skeleton / result state | 不同query隐藏旧结果；同key刷新保留行并busy；失败显式GET重试 | Provider/写请求自动重试、错误归零或成功空态 |
| refresh / query state | explicit成功revision触发显式重读；poll只使ready页失效，不取消loading或重试error | 每次Bootstrap对象变化即重放、403/404后台无限重试 |
| shell / canonical navigation | Back/Forward保留请求页；clamped页只影响展示，不rewrite history | 全浏览器/真机导航认证或持久结果租约 |

严格DTO与请求绑定不在browser重算文本匹配/排序：JS与Python可能使用不同Unicode版本；
server算法标识不是Intl等价或冻结所有Unicode映射，有限15样例不构成全域证明。
合同ADR-0012；870前端（38文件）/499Python/typecheck/build通过；稳定生产专项35项/6PNG、
实际API6项/2PNG、高级30项/24PNG最终通过。包含真实6s poll不取消8s query、不重试403，
显式Retry只1GET及HTML401清理。最终综合58项/60PNG也已通过，共92PNG、无pageerror。
非空fixture的fresh guard失败保留，换只读确认空库的fixture.OaPiOM后重跑成功。采用证据见
`frontend/evidence/server-pagination-2026-11-17/README.md`。
Bootstrap及Quick find/侧栏计数/Inspector历史尚未减量，不宣称全站规模改进。
原4180/5173未重启，新能力未主环境启用；保存视图已启用事实不变。没有新增执行、
设备、连接器或真实模型调用，原119/110统计不变。临时4187/5176已停止，本批提交push另记。

## 16. 选中任务详情与历史按需读取

2026-11-17，IZ-07.3a继续使用work-item-detail、AppDialog、Badge、Button和Skeleton包装，
不重新生成模板，不复制桌面/手机业务树。新`TaskInspector.tsx`由原内联组件抽出，
保留标题/项目/目标/验收/明确文件/历史分层；仅新增独立历史分页和读取状态。

- capability.task_detail明确true后，选中才GET详情，默认20条历史；声明后错误不回退Bootstrap。
  页面与详情共用严格Task投影校验，后端一次只读快照保持latest/attempts/history一致。
- 列表页与详情历史页分开；换任务、关闭重开从第1页，外观/语言切换不读取或执行模型。
  同任务刷新保留有效内容并busy，旧任务/旧页响应丢弃，失败只提供显式GET重试。
- 继续沿Astryx状态与焦点约定，不用`:disabled`单独识别可用控件。
  末页Next的ARIA禁用曾导致真实键盘失败，现候选同时排除ARIA禁用，用户已移动焦点时不抢回。
- 跨桌面/手机容器切换会重挂Inspector，任务选择保留但历史页回1；未声明跨断点历史页持久化。

943前端（39文件）/562Python/typecheck/build通过；最终详情40/真实45Run详情6/查询35/
综合58项通过，77最终PNG，无pageerror。早期33/35项和末页焦点失败不是最终结果，
失败单独保留。合同ADR-0013，证据`frontend/evidence/task-detail-2026-11-17/README.md`。
Bootstrap、Quick find/计数/Board/Run历史等仍全量，不把模板接通写成IZ-07.3整体减量完成；
没有真实模型、凭证或正式DB写入，原119项计数不变。主4180未启用新能力，
已启动原本停止的5173并核验200；临时4187/5176已停。
