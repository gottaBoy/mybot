# Zira 全前端结构与核心链路研究

研究开始：2026-11-13；多 Agent 专题与规则整理：2026-11-14。
范围仅为用户授权的 `/home/my/workspace/ainfra/zira/frontend`。
结论用于 mybot 的产品工程规则；mybot 继续采用 React 19 + Astryx，不导入 Zira 的
React 18、Radix/CVA/Tailwind 组件实现。

## 1. 覆盖与证据

- 来源 HEAD：`1ce0d0510cb590f3a79ca498f7239ff0852ed0d7`。
- 相关 `frontend/src` 与 Tailwind 配置的 Git 工作区检查未发现改动。
- 全量结构扫描覆盖 **625 个 TS/TSX/CSS 文件、79,264 行、15 个 feature 域**；
  顶层 `App.tsx` 识别 35 个显式 path Route。嵌套路由不是只靠这个数字就能全部计完。
- 对所有 TS/TSX 使用 TypeScript AST 提取 imports、声明、hooks、JSX 标签和文件 hash；
  CSS 只记录元数据。解析诊断为 0，**不是类型检查、运行测试或安全验收**。
- 结构证据：[完整索引](research/zira-frontend-2026-11-13.json)；
  复现：`frontend/` 中执行 `node scripts/research-zira.mjs`。该脚本只读指定源码树，
  输出写在 mybot，不读取 `.env`、数据库、凭证、日志、依赖目录或图片资产。
- 人工源码深读覆盖下列主要消费链。不能将“625 文件结构扫描”表述成“79,264 行逐行审计”。
  没有启动 Zira、调用其后端或运行其测试。

用户明确要求多 Agent 后，分工完成三份独立专题，再由主 Agent 合并根规则：

| 分工 | 产物 | 重点 |
| --- | --- | --- |
| 交互 Agent | [ZIRA_STUDY_INTERACTIONS.md](ZIRA_STUDY_INTERACTIONS.md) | 动作真实性、列表/搜索/详情、看板/Backlog、移动/键盘及 Astryx 映射 |
| 数据 Agent | [ZIRA_STUDY_DATA.md](ZIRA_STUDY_DATA.md) | 身份/权限、错误信封、缓存/失效、JQL/分页、unknown/统计/导出及测试边界 |
| 管理 Agent | [ZIRA_STUDY_ADMIN.md](ZIRA_STUDY_ADMIN.md) | 草稿/版本/候选 hash、发布/影响/回滚、元数据依赖和配置写入 |
| 主 Agent | 根 AGENTS.md、本文、进度/交接与 mybot 回归 | 取舍、去重规则、当前实现和未完成边界 |

专题中的风险是带路径/行号的源码观察与推论，不冒称运行故障或完整安全审计。

## 2. 目录地图

| 域 | 文件数 | 行数 | 本轮理解范围 |
| --- | ---: | ---: | --- |
| admin | 205 | 32,106 | 全结构；重点深读工作流目录/定义/草稿/校验/发布/冲突；其他管理子域需专项 |
| issues | 157 | 15,268 | 导航器、表格、详情、创建、批量操作、状态转换及错误 |
| boards | 40 | 5,341 | 列/卡片、可达转换、拖动/键盘、排名、数据刷新 |
| reports | 34 | 4,819 | 参数驱动、多报表、导出、未知值和权限错误 |
| dashboard | 29 | 3,236 | 页面与 Gadget 分工、布局跨度、编辑/订阅/删除及状态来源 |
| identity | 21 | 1,628 | 会话门禁、登录退出缓存清理、用户/权限引用边界 |
| projects | 19 | 2,336 | 概览来源、项目结构、统计缺口 |
| filters | 14 | 1,892 | 保存/更新/收藏及旧部署 fallback 标识 |
| backlog | 9 | 1,270 | Sprint/Epic/问题合并与失败路径 |
| notifications | 6 | 402 | 列表/未读数/已读后的失效刷新，未据此声称 SSE |
| catalog | 6 | 534 | 公共只读目录与权限/失败不降级原则 |
| search | 3 | 269 | 提交查询、排序参数、服务器分页和权限元数据 |
| activity | 2 | 94 | 按对象作用域查询，不是虚构活动 |
| ping | 2 | 218 | 结构与探活查询入口 |
| help | 1 | 83 | 结构、快捷键说明入口；不能凭说明推断每个快捷键已实现 |

其余结构包括 pages、layout、ui、markup、lib、store、hooks。完整路径与声明在 JSON，
没有把目录存在当成业务闭环完成。

## 3. 追踪的主要链路

### Shell 与全局入口

`App.tsx → AppShell → TopBar / ContextBar → PageHeader → 页面`

- 登录在 Shell 外；保护路由统一门禁，页面不各自发明登录逻辑。
- 页头保持“上下文/面包屑 → 标题与主要操作 → 搜索/筛选 → 结果”的层级。
- 全局快速查找位于顶栏，移动端可打开同一面板；页面搜索与全局搜索是不同作用域。
- `GlobalHotkeys → use-hotkeys` 将全局/列表/详情/看板快捷键分开，尊重输入框、IME 和
  已处理事件；不把每个页面的快捷键泄漏到全局。

mybot：保留自己的侧栏组织，使用 Astryx Button/CommandPalette/Group/Dialog；
不要照搬 Zira 菜单和整个应用壳，也不复制静态“最近项”。

### 搜索与列表

`IssueNavigatorPage → URLSearchParams → JqlBar(draft/committed) → useIssueSearch
→ search API → DTO/visibility → IssueTable / DetailPreview → Pagination`

- 输入草稿与已提交查询分开，不在每个字符变化时触发服务器查询。
- 查询、排序、分页、视图属于可分享 URL；主题/密度是 UI 偏好，不能混在一个全局 store。
- 多选与打开详情是独立动作；本页全选不等于全量结果集全选。
- 列表与详情预览共用同一结果集、焦点与排序，而非两份硬编码数据。
- `ResultsState` 区分错误、403、权限裁剪、真空态。
- 真正 JQL 语义在 Zira 后端，前端 mock 求值不是生产解析器。

mybot：基本筛选、受支持排序和 URL 参数先成立；没有负责人/身份模型时，
`assignee/currentUser()` 必须报未支持，不能默认匹配所有任务。

### 详情与编辑

`IssueDetailPage → issue + extras + neighbours + transitions → IssueHeader /
内容模块 / FieldRail → mutation → invalidateIssueRelated`

- 详情由页头、相邻项、主内容、字段栏组成；窄屏将字段栏收为抽屉。
- 字段级权限、对象不可见和归档只读分开，不把只读等同接口缺失。
- 创建从项目/类型/字段元数据级联，字段错误来自明确提交键。
- 状态转换走合法 transition，不直接修改状态字段。

mybot：Run、Agent、Call、Artifact、Event 是不同对象；代码执行、测试结果和人工审查
不可互相替代。Run 动作由后端状态机和资源/发送合同决定。

### 看板与 Backlog

`BoardPage → useBoard → 服务端列配置 → BoardCanvas → 可达转换/排名 → mutation`

- 跨列移动代表领域转换；同列排序属于排名，不是完成任务。
- 拖动与键盘操作都有可达性、候选转换选择和播报。
- 列内滚动不应让 document 横向溢出。
- Backlog 将 Sprint/Epic/问题统一为引用表，避免详情逐条请求，但读取失败也需要显式状态。

mybot：当前看板是事实投影。不能把拖动到“已完成”变成 `run.succeeded`，也不能将
移动卡片直接变成模型请求。将来执行型拖动须先有状态转换、授权、幂等、预算和失败恢复。

### 数据同步、会话与错误

`api → ApiError/DTO → query key → query hooks → mutation → 命名失效策略`

- 401 统一清缓存与引用数据；登录后的前一账号缓存不能保留。
- 4xx 和 Abort 不自动读重试；mutation 默认不自动重试。
- 状态变更后关联列表、详情、看板、活动等同步失效，而不是只有本页显示“已保存”。
- API 边界消化响应封装差异，页面不解析不同后端的原始异常字符串。

mybot：可借鉴这一分层和失效合同，但不为借鉴直接增加 TanStack Query/Zustand。
尤其不能将任何通用请求重试策略施加到模型启动、重试、健康检查或外部写动作。

### 工作流设计器

`目录 → 定义/草稿/版本 → 本地编辑与 baseline → 校验 → 保存草稿(lockVersion)
→ 影响检查 → 发布确认 → 不可变版本`

- 未保存编辑不被后台 refetch 覆盖；显式重新加载才能丢弃本地修改。
- 草稿、发布版本、当前编辑和运行中实例分开。
- 403、409、端点未提供各自展示，不把 fallback 写入伪装成成功。
- 发布作用于已保存草稿，有影响面和阻断条件；不是一个画布上的“运行”按钮。

mybot：未来可借鉴 WorkflowDraft/Version/RunSnapshot 的生命周期，但不能宣称当前
固定阶段工作图已有任意 DAG、发布、回滚或执行工具权限。

### 报表、通知与其他域

- Report 页拥有当前类型/范围/Sprint/版本参数，各面板负责数据/错误/导出；
  空值格式器会保留未知，不应在图表里变成零。
- Gadget 负责外壳/操作，Body 负责数据；真实订阅与仅本机偏好明确区分。
- 通知未读数与列表使用同一失效前缀；标已读不是打开详情的必然副作用。
- Public catalog 将只读查询、公开可见性与管理写操作分开。

mybot：先做逐调用真实用量/失败/耗时/unknown，再考虑图表和报表；不搬运
Sprint 速度、逾期数、订阅铃铛或团队成员作为假业务数据。

## 4. 不照搬的部分

| 源码观察 | mybot 规则 |
| --- | --- |
| README 仍有大量早期“脚手架/占位”描述，与后续页面源码不完全同步 | 文档、源码、执行证据分层，逐条核查，不凭 README 判断完整度 |
| `components/command/CommandPalette.tsx` 的 ITEMS 包含静态最近项，注释说明远程/模糊能力待补 | 只列真实导航/项目/运行；不复制假历史或声称已接通远程搜索 |
| `projects/hooks/use-project-overview.ts:55` 为未完成统计默认填 0 | 请求失败或缺数据是 unknown，不变成健康/零成本/零异常 |
| `backlog/hooks/use-backlog.ts:56` 的子查询异常回退 `[]` | 403、断网、超时、真正无数据必须区分 |
| `boards/components/board-canvas.tsx` 有本地乐观移动；观察到的消费链不能证明所有失败都回滚 | 需要 rollback/refetch/unknown 证据；不可将本地移卡当状态事实 |
| 批量操作包含前端扇出 fallback | mybot 不自动扇出模型调用，必须逐项范围、预算、并发和结果确认 |
| UI 为 Radix/CVA/Tailwind、React 18 | 学习产品原则，控件继续 Astryx/React 19；缺能力另记决策，不混入第二套 UI |

这些是有边界的源观察和采用限制，不是对 Zira 全站运行效果或完整安全性的判定。

## 5. mybot 后续采用顺序

1. 已实现切片：顶栏快速查找、共享数据投影、八种样式/明暗/密度、基础 URL 状态、
   多种视图与加载/错误/空态，仍以本地最终测试结果为准。
2. 下一体验增量：统一 PageHeader/ResultToolbar、保持列表返回位置、详情侧预览、
   调用筛选/列状态共享和跨页面更新策略。
3. 查询能力：先建立身份/负责人/字段目录，再引入可靠解析器和服务器查询合同，
   实现完整 JQL/分组/保存视图；不扩展前端正则白名单冒充解析器。
4. 运行可靠性：将重试与资源迁入 Astryx，保留历史、明确复用、确认未知成本。
5. 工作流设计：先草稿/版本/影响/校验/授权合同，再考虑执行型画布和拖动。

admin 的 205 文件和全部业务边角尚未逐项人工审计；真实联调、完整测试、真机与权限
行为仍未验证。后续专题研究应沿本索引继续，不重新开始无边界的项目浏览。
