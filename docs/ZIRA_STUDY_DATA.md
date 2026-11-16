# Zira 数据、身份与证据专题

日期：2026-11-14（Asia/Singapore）。本专题用于完善 mybot 工程规则，不是 Zira
缺陷修复单，也不是已在 mybot 实施的功能清单。

## 1. 来源与方法

- 只读来源：`/home/my/workspace/ainfra/zira/frontend`，仓库 HEAD 实际核对为
  `1ce0d0510cb590f3a79ca498f7239ff0852ed0d7`。
- 延续 [ZIRA_FRONTEND_STUDY.md](ZIRA_FRONTEND_STUDY.md) 及
  [625 文件结构索引](research/zira-frontend-2026-11-13.json)。结构索引的 15 feature
  覆盖不等于本专题逐文件审计；本文只对下列代表链路进行人工源码深读。
- 已读 mybot 当前 `AGENTS.md`、`CONTINUE.md`、ADR-0006、模板整合、UI 迭代与 Zira
  布局记录；工作树已有大量未提交改动。本专题仅新增此文件，不修改 Zira 或业务源码。
- 未读取 `.env`、凭证、Cookie、数据库或运行日志；未启动 Zira、其后端或外部服务，
  未安装依赖、运行 Zira 测试、发起模型调用或进行真实权限联调。
- 下文路径均相对 Zira 的 `frontend/`。源码注释提及的 Java controller、数据库列和
  “已核实/已实现”不是本专题独立验证；未越界读取 Zira 后端来替它们背书。
- 证据等级：**源码观察**指本轮实际读到的代码；**风险推论**指由该消费链推导的边界；
  **建议/验收**指 mybot 后续门槛，不是已通过测试。

## 2. 代表链路与取舍

### API 边界与错误

链路：`lib/api.ts → 资源 API/DTO → query hook → 页面状态/字段错误`。

- `src/lib/api.ts:58` 将 `errorCode/status/fieldErrors/details/traceId` 收口为
  `ApiError`；`:181` 同时兼容两种错误外壳；`:345` 将 Abort 和网络失败分开。
  `:315` 接受 `signal`，`:341` 的 Cookie 会话与 mybot 当前认证并不是同一协议。
- **采用**：错误码稳定、显示文案可本地化，HTTP 状态、字段错误与追踪标识在 API
  边界规整；页面不解析原始后端字符串，取消不显示成表单校验失败。
- **不照搬**：`:370-374` 的成功响应仅 `raw as T`，不验证 DTO；`:432-435`
  的 `unwrap` 遇 `success:false` 也只取 `data`，可能得到 `undefined`。
  这是源码观察，不代表真实后端正在返回错误的 200 响应。
- **mybot 规则**：JSON 业务接口收到非 JSON、错误信封或缺必需字段时应明确失败。
  TypeScript 类型断言不是运行时验证；容错不得将异常响应降为成功空集合。
  下载/流式端点应有自己的显式响应合同，不强行按 JSON 解码。

### 会话、取消与缓存生命周期

链路：`useSession/useMyself → QueryCache/MutationCache → resetReference → login`。

- `src/lib/query-client.ts:13-19` 在未吞掉的 401 上清 Query 缓存、清引用表并跳登录；
  `:50-60` 对查询的 4xx/Abort 不重试，mutation 默认不自动重试。
  `src/features/identity/hooks/use-session.ts:25-39` 传递 signal，并关闭会话查询重试；
  `:64-79` 登录清查询、退出在 settled 时清查询和引用表。
- **采用**：身份失效有统一落点；安全的只读请求和写动作使用不同重试合同；
  缓存清理不仅清列表，也清同步引用数据和身份投影。
- **风险推论**：统一 `onError` 仅能处理最终抛出的错误，底层 `catch → []/undefined`
  会让它看不到 401。源码未提供“所有写请求均可中止、旧账号响应绝不回填”的完整
  生命周期证据；不能把 `queryClient.clear()` 表述成所有网络副作用已被取消。
- `src/features/identity/components/require-auth.tsx:27` 将任意会话查询错误都跳登录，
  `data` 缺失但没有 error 时也采用宽松认证表达式。mybot 应把登录失效、网络故障、
  服务故障和 malformed identity 分开；受保护内容与执行权限均不得因身份未知而放行。
- **mybot 规则**：401/退出递增会话世代并清私有投影，取消可取消读取，丢弃晚到响应；
  已发出的 mutation 仍须记录 confirmed/failed/unknown，不假称取消网络就撤销了业务。
  不将查询自动重试套到启动 Run、Provider 测试、恢复/重试或外部写操作。

### 当前用户、目录与权限

链路：`session/myself/permissions → reference hydrator → 同步名字查找/所属分组`。

- `src/features/identity/api/session.ts:32-64` 将精简会话、完整 Myself 和作用域权限位
  分开；权限包含 `havePermission/maybe/grantedBy` 与 visibility。
  `src/features/identity/api/users.ts:21-46` 区分 loginable、directory 和 assignable。
  这些是有价值的语义分层，不是 mybot 已有团队/负责人模型。
- `src/features/identity/hooks/use-reference-data.ts:61-64` 对 global-state、Myself、
  boards 广泛 catch；`:87-90` 对后备用户/项目/状态也 catch。部分失败会成为成功快照，
  当前用户可能未知。此链路没有保留每个维度的失败/来源/完整性。
- `src/features/filters/api/global-state.ts:305-306` 和
  `src/features/filters/api/statuses.ts:87-106` 实际捕获所有错误，而不是注释声称的
  仅网络/404；因此 401/403/Abort 也可进入 fallback。
- `src/lib/api/reference.ts:88-114` 在未找到真实对象时直接回落 mock 用户、项目、
  看板与默认状态，没有 `USE_MOCK` 守卫；`:66` 的空值合并还会保留旧 currentUserId。
  `src/features/filters/api/filters.ts:215` 在当前用户未知时用 `!shared` 推断“我的”。
  **不采用**这些兼容策略：展示名可回落为原始 ID，不能回落为虚构身份或另一份目录；
  identity unknown 不等于 owner。
- `src/features/identity/api/user-detail.ts:100-120` 首层确实保留 401/403，但其他错误
  进入列表后备，列表再次 catch 任意错误为 `undefined`，最终可返回 `null`。
  因此“详情为空”不能独立证明用户不存在。该模块的 `source/groupsUnavailable/
  fallbackReason` 是可借鉴的来源表达，但不能抵消后备链吞错。
- `src/features/issues/api/issue-permissions.ts:22` 明示缺少 operations 元数据时不隐藏
  入口；`:98` 缺 visible 默认可见。`utils/field-permission.ts:12` 则明确仅翻译、
  服务端判权。**mybot 取舍**：UI 提示不是授权；模型/代码执行等高风险动作在缺权限、
  capability 或 consent 元数据时必须拒绝，不迁入宽松旧部署兼容默认。
- **mybot 规则**：单用户试点仍使用真实认证主体；未建立 assignee/owner 模型前不提供
  `currentUser()` 语义。公开目录、可登录用户、可分配对象和管理员目录不可混用。
  缺身份/权限/字段数据必须保留 unknown，不能用样例人名、默认状态或本地推断补齐。

### Query Key 与失效合同

链路：`lib/query-keys.ts → feature query → mutation → lib/invalidation.ts`。

- `src/lib/query-keys.ts:27-35` 将查询、页、排序、字段集纳入 key；`:59-61`
  用统一通知前缀；`:139` 将项目报表和一般项目实体分开。
  `src/features/reports/hooks/use-project-reports.ts:30-35` 明确避免同 key 不同 DTO/
  queryFn 相互污染。
- `src/lib/invalidation.ts:17-27` 将问题变化关联到详情、搜索、板、Backlog、活动、
  通知、报表，是比散落页面刷新更可复核的领域失效图。
- **风险推论**：集中函数也需要测试，不能只看名字。`:60` 的
  `['reports', boardId]` 与 `query-keys.ts:112-137` 的
  `['reports', reportType, boardId, ...]` 不构成对应前缀；本轮搜索未见此函数消费者，
  因而记录为潜在失效合同缺口，不宣称当前页面已发生 stale bug。
  `:74-78` 项目结构失效未包含 `['reports','project',key,...]`；
  版本/组件与报表的联动须专项证明。
- **mybot 规则**：每种 mutation 列出受影响实体与投影，测试 key 匹配和跨视图更新；
  不同 DTO 不共享同一缓存身份。标记 stale 不等于刷新完成；需要一致读回才能关闭的
  表单应等待刷新，读回失败则明确“写入已确认，展示刷新失败”，不伪称写失败或重发。
  是否采用 Query 库由 mybot 规模决定，不因 Zira 使用就增加依赖。

### 表单与 Mutation

链路：`create/edit metadata → 本地 draft/validation → API mutation → 关联失效`。

- `src/features/issues/hooks/use-edit-form.ts:72-85` 不让 refetch 覆盖 dirty 草稿；
  `:102-124` 本地校验、只提交差异、成功后重设基线，失败保留输入；
  `:128-135` 合并字段错误。这些可转为 mybot 表单规则。
- 创建弹窗 `src/features/issues/components/create-issue-dialog.tsx:170-195` 在项目/
  类型变化时清除依赖值；`:117` 校验已支持字段的 required；
  `:124-128` 仅成功后清空/关闭，`:248-259` 展示服务器错误。
- **不照搬**：`:87` 跳过无法推导控件的 metadata，可能连必填字段一起省略；
  `:219-222` 字段查询错误未单独分支，可能呈现为“没有自定义字段”。
  `:106` 的 submit 无 pending 守卫，但 `:139-141` 快捷键仍可调用它；
  只禁用按钮 `:274-278` 不是完整重复提交保护。
- `src/features/issues/hooks/use-issue-votes.ts:39-57` 包含取消读取、快照、乐观更新、
  错误回滚、settled 失效，可作为**需要完整证明**的生命周期例子。其 `:35` 从 cache
  决定 POST/DELETE，而 onMutate 又翻转该 cache，读值时序需要专项测试；本文未运行，
  不把它当作已验证样板，更不用于模型启动/审批/Run 状态乐观提交。
- **mybot 规则**：API 端仍独立验证；必需但不支持的 metadata 阻断提交；
  所有入口共用 pending/idempotency 检查。依赖资源、模型、发送快照变化后废除旧 consent。
  写入错误、409 冲突、confirmed 但刷新失败与 unknown outcome 各自表达。

### JQL、分页与可见性

链路：`URL query/draft → useIssueSearch → POST /search → DTO/visibility → ResultsState`。

- `src/features/search/hooks/use-issue-search.ts:15-16` 和 `:61-69` 将生产解析、权限裁剪、
  排序、分页委托服务器；本地 evaluate 仅在 `USE_MOCK` 分支。
  `src/features/search/api/search.ts:55-80` 传递查询、分页、字段/展开、排序与校验模式。
- `src/lib/api/pagination.ts:13-42` 保留 `isLast/nextPageToken/approximateTotal` 与
  visibility；`:49` 提供全被权限裁剪的判定。
  `src/features/issues/components/results-state.tsx:31-80` 区分错误/403、权限裁空与真空。
  **采用**状态区分；mybot 是否披露隐藏数须由自己的安全策略决定，不能从 Zira 推定。
- `src/features/search/hooks/use-issue-search.ts:73` 保留上一页作 placeholder；
  `src/pages/IssueNavigatorPage.tsx:76` 只取 `isPending/error`，未消费
  `isFetching/isPlaceholderData`。新查询尚未完成时旧行如何标 stale、是否可被批量操作，
  本专题没有运行证据，后续验收应覆盖它。
- API 已定义 metadata/autocomplete/validate，不等于输入器已经使用：
  `src/features/issues/components/jql-input.tsx:15-20` 仍为 TODO，`:38-54`
  使用静态建议，包含 `currentUser()`。不应把静态补全项当后端能力证明。
- **mybot 规则**：URL 支持不是 JQL 支持；先有实际身份/字段/权限/解析器合同再开放语法。
  不支持的表达式明确失败。分页元数据不能在 wrapper 丢弃；游标不解析，截断目录不称
  全部，页内全选不称全量。stale rows 与 committed query 必须可区分。

### 统计、图表与导出

- `src/features/reports/utils/format.ts:18-20` 保留 null/undefined/NaN 为 `-`；
  `components/report-error-note.tsx:20-44` 对 403 与请求错误分开；
  报表维度 key 包含 board/sprint/date，属于可借鉴的展示和缓存边界。
- **反例核实**：`src/features/projects/hooks/use-project-overview.ts:50-57` 捕获子查询
  错误，open 缺失变 0，本周完成/逾期固定 0，recent/activity 为空。
  `src/features/backlog/hooks/use-backlog.ts:51-56` Epic/Sprint 子读取失败变空集合。
  均不可被 mybot 解释成真实零值或无工作。
- 新增深读发现：`src/features/reports/hooks/use-project-reports.ts:101-123`
  每项 count 捕获任意错误，再变 0，仅保留总级 `partial`；
  `:200` 缺 counts 时假定 resolved=0、unresolved=total。
  `components/project-summary-stats.tsx:64-77` 仍以这些值计算完成率并导出 CSV；
  `:156-159` 虽展示 partial 警告，导出并未携带每项失败/unknown 状态。
- `src/features/reports/api/reports.ts:65-71` 与 `api/project-reports.ts:56-78`
  将非法数值、缺字段转换为 0，展示层的 unknown 格式器无法恢复丢失的语义。
  因此不能概括“Zira 所有报表保留未知”。
- **mybot 规则**：指标应携带 value/unknown、来源、单位、对象、分母、范围、时间窗和
  完整性；部分失败应按项标识。缺数据不填零、无样本不报 0% 成功率；已知零与未知分开，
  图表和 CSV 使用同一口径。历史失败尝试与恢复后的任务状态分开，token 用量和金额
  不互推，服务器裁剪/分页与全量聚合不混算。

### 通知与实时声明

链路：`notifications API → list/unread query → mark-read → notificationsRoot 失效`。

- `src/features/notifications/hooks/use-notifications.ts:39-56` 成功后同时失效列表/
  未读数，是清晰且可采用的关联更新。标已读是写操作，不是“打开详情”本身的读取。
- `src/features/notifications/api/notifications.ts:43-54` 对缺字段回落 0/[]，并未保留
  CollectionMeta 的 visibility；hook `:22-23` 只返回数组，丢失 total/isLast 等元数据。
  页面 `notifications-page.tsx:31` 只取前 50 条，无分页消费链；不应称全部历史可见。
- `components/notification-bell.tsx:18` 在加载/失败时默认读数 0，不区分 unknown；
  dropdown 不展示 mark-read/all-read 的 mutation 错误，主页面只展示单条 markRead.error。
  这些状态缺口不应随铃铛布局一起迁入。
- `notification-bell.tsx:14-15` 明确 SSE 未接；API 文件的 stream 注释不构成 SSE、
  重连、replay 或跨设备实时能力证据。mybot 先有事件来源/游标/补拉/去重合同再宣称实时。

## 3. 测试证据分层

- `package.json:15-17` 有 Vitest 命令，`vitest.config.ts:20-29` 使用 jsdom，
  include 仅 `src/**/*.test.{ts,tsx}`。本轮在 `src/` 枚举到 13 个 test 文件，
  不能据此推算案例数、通过率或真实后端覆盖。
- 实际深读 `src/lib/api.test.ts`、报表 `format.test.ts/csv.test.ts`、表单
  `create-field-values.test.ts/edit-field-values.test.ts`。API 测试构造 Response，
  覆盖错误解析/字段错误/URL/unwrap，不是 fetch、会话失效或后端认证测试；
  `api.test.ts:188` 还明确断言 `success:false` 被 unwrap 为 undefined。
- 格式化测试 `format.test.ts:45-49` 证明的是 formatter 预期，不证明上游 mapper 没把
  unknown 先变 0；CSV 测试模拟 URL/anchor click，不证明浏览器下载与真实导出语义。
  表单纯函数测试覆盖值编码、差异/字段错误，不证明 dirty refetch、重复快捷键提交、
  权限变化和表单 focus 的实际浏览器行为。
- 本轮未在已枚举的测试中发现 query-key/invalidation、401/Abort 生命周期、
  reference fallback、React hook/mutation 或报表部分失败的交互测试。
  这仅限定于本次检查范围；未审计整个 Zira 仓库的其他测试工具或手工证据。
- **mybot 验收分层**：源码存在、纯函数测试、API fixture/MockTransport、浏览器隔离
  fixture、真实后端/真实权限分别记录。构建通过、测试通过或上游注释均不等于业务
  闭环；本轮没有重跑 mybot 或 Zira 测试。

## 4. mybot P0/P1 验收建议

以下为后续工作门槛，不是本轮已完成项目，不改变 119 项台账计数。

| 优先级 | 验收场景 | 必须可观察的结果 |
| --- | --- | --- |
| P0 | API 返回 200 HTML、错误信封、缺必需字段 | 明确 contract error，无成功空数组/零指标 |
| P0 | 任意目录/统计子读取 401/403/Abort | 401 进入统一失效；403 保留权限状态；Abort 不 fallback/重试 |
| P0 | 退出后晚到旧响应、再登录另一主体 | 私有 Query/引用表/选择器清空，旧世代响应不能回填身份或对象 |
| P0 | 身份/权限/capability 缺失 | 不推 owner/currentUser，不放行模型或执行动作 |
| P0 | 慢 mutation 下按钮、Enter、快捷键重复提交 | 一条领域请求；成本动作有稳定请求 ID、明确 consent 与 unknown outcome |
| P0 | 改项目/模型/发送快照及字段 metadata 失败 | 输入保留但旧 consent 失效，必需未知字段阻断提交 |
| P0 | 用量/金额/耗时部分缺失及统计失败 | 页面、图表、CSV 按项标 unknown；无零成本/零异常/0% 假象 |
| P1 | 每个 mutation 的列表/详情/总览/调用/成果联动 | 用真实 key/投影测试覆盖失效图；读回失败不重发已确认写入 |
| P1 | 新查询慢于旧查询、换页、刷新、后退 | stale 可识别、晚到结果被丢弃；批量动作绑定正确 committed query/选择范围 |
| P1 | 空集合、403、裁剪、近似 total、不透明游标 | 元数据端到端保留；不冒称全部目录/全部结果/全部通知 |
| P1 | 通知错误与增量事件重连 | 未读 unknown 与 0 分开，全部写失败可见；无 replay 证据不称实时可靠 |
| P1 | dirty 表单叠加 refetch/主题/语言切换 | 不覆盖输入、不重挂表单、不触发模型请求，键盘/焦点浏览器验证 |

## 5. 可合并到 AGENTS 的简明规则

1. 生产读取不得用 mock 记录、默认身份/状态、空数组或零指标掩盖读取失败；fallback
   必须有明确 capability 条件、来源和不完整状态，401/403/Abort 不得被 fallback 吞掉。
2. 身份、目录可见性、字段元数据、可执行 capability 与 consent 是不同合同；unknown
   不等于 owner、空集合或授权，高风险动作缺信息时拒绝。
3. API 边界验证错误信封和必需 DTO 字段；稳定 code/field errors/trace 分离于本地化文案。
   取消读取不等于撤销 mutation，超时/退出后的成本动作保留 unknown outcome。
4. 缓存身份包含资源、作用域、查询、排序、分页与 DTO；mutation 有命名影响图及测试，
   不同 DTO 不复用同 key。401/退出清私有投影并拒绝旧会话晚到响应。
5. 表单在所有入口阻止重复提交，保留失败输入和 dirty 草稿；必需未知字段不静默省略，
   依赖/资源变化废除旧 consent；不把乐观展示当已执行或已保存事实。
6. 查询语言能力由服务器解析/身份/字段/权限合同证明；静态补全与 URL 参数不是支持
   证据。分页/裁剪/近似总数保留到 UI，旧结果必须标 stale。
7. 统计和导出共享 unknown、来源、单位、分母、范围、时间窗；按项标部分失败，
   不从缺值制造零、成功率、成本或团队事实。
8. 分开记录源码观察、结构扫描、单元测试、隔离浏览器和真实后端证据；前端 API 函数、
   注释及 mock 测试不能证明身份、权限、SSE、真实模型或全部业务已接通。

mybot 继续使用 Python/FastAPI 后端、React 19 + Astryx 和项目自有包装层。
本专题没有建议替换为 Zira 的 Spring 会话、React 18、Radix/CVA/Tailwind UI、
TanStack Query 或 Zustand；采用的是合同与验证原则，不是依赖和接口的整体迁移。
