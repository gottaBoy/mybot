/* Static design review only. No model, tool, task, approval, or network execution. */
const screens = [
  ["workbench", "W01 工作台", "工作台", "Run 02 / 测试失败后的工作总览"],
  ["project", "W02 研发项目", "支付服务", "项目与工作范围"],
  ["task", "W03 任务工作区", "重试策略调整", "Run 02 / 执行结束，测试未通过"],
  ["dispatch", "W04 任务依赖", "重试策略调整", "Run 02 / 任务依赖图"],
  ["delegation", "W04 Agent 委派", "重试策略调整", "Run 02 / 委派关系"],
  ["calls", "W05 调用分析", "重试策略调整", "Run 02 / 调用与用量"],
  ["call-detail", "W05 调用详情", "重试策略调整", "Run 02 / 失败尝试 mc-023"],
  ["artifacts", "W06 代码成果", "重试策略调整", "Run 02 / 候选变更，测试未通过"],
  ["tests", "W06 验证证据", "重试策略调整", "Run 02 / 2 项通过，1 项失败"],
  ["approval", "W07 审批", "重试策略调整", "独立快照：Run 03 / 修复并验证后，等待授权"],
  ["recovery", "W07 结果核查", "重试策略调整", "独立快照：Run 04 / 取消后存在未确认写入"],
  ["audit", "W08 审计", "重试策略调整", "Run 02 / 计划、授权与实际结果"],
  ["setup", "S01 首次进入", "连接能力", "首次使用 / 无真实连接"],
  ["new-task", "S02 发起任务", "发起工作", "草稿 / 尚未开始执行"],
  ["empty", "S03 空工作台", "工作台", "首次使用 / 无项目"],
  ["queued", "S04 排队", "重试策略调整", "独立快照：Run 01 / 等待工作区"],
  ["offline", "S05 断线", "重试策略调整", "独立快照：Run 01 / 仅保留最后确认状态"],
  ["budget", "S06 预算不足", "重试策略调整", "独立快照：Run 01 / 停止新增调度"],
];

const $ = (selector) => document.querySelector(selector);
const icon = (name, extra = "") => `<img class="icon ${extra}" src="assets/icons/${name}.svg" alt="" />`;
const pill = (text, tone = "neutral", name = "") => `<span class="status status-${tone}">${name ? icon(name) : '<span class="status-point"></span>'}${text}</span>`;
const link = (to, text, name = "", className = "button button-secondary") => `<a href="#${to}" class="${className}">${name ? icon(name) : ""}<span>${text}</span></a>`;
const inert = (text, name = "", className = "button button-secondary", reason = "静态设计稿，不执行操作") => `<span class="disabled-control" title="${reason}"><button type="button" class="${className}" disabled>${name ? icon(name) : ""}<span>${text}</span></button></span>`;
const iconLink = (to, name, label) => `<a href="#${to}" class="icon-button" aria-label="${label}" title="${label}">${icon(name)}</a>`;

let currentScreen = "workbench";

function navigation(active) {
  const primary = [
    ["workbench", "layout-dashboard", "工作台"],
    ["project", "folder-git-2", "项目"],
    ["artifacts", "files", "成果"],
    ["setup", "blocks", "能力"],
  ];
  return `<a class="brand" href="#workbench">${icon("command")}<span>AI Workbench<small>研发工作空间</small></span></a>
    <nav class="primary-nav">${primary.map(([route, name, title]) => `<a href="#${route}" class="nav-item ${active === route ? "is-active" : ""}" ${active === route ? 'aria-current="page"' : ""}>${icon(name)}<span>${title}</span>${route === "workbench" ? '<span class="nav-count">2</span>' : ""}</a>`).join("")}</nav>
    <div class="nav-projects"><div class="nav-section-label">项目</div>
      <a href="#project" class="nav-project">${icon("folder")}<span>支付服务</span><span class="tiny-dot"></span></a>
      <span class="nav-project" aria-disabled="true">${icon("folder")}<span>发布工具</span></span>
    </div>
    <div class="nav-bottom"><div class="boundary-note">${icon("shield-check")}<span>单人试点<small>仅限定项目范围</small></span></div>
      <a href="#setup" class="nav-item">${icon("settings-2")}<span>连接与设置</span></a>
      <div class="identity"><span class="avatar">林</span><span>林然<small>项目所有者</small></span></div>
    </div>`;
}

function header(title, project = false) {
  return `<div class="header-leading"><button type="button" class="icon-button mobile-menu" data-open-navigation aria-label="打开导航" title="打开导航">${icon("menu")}</button>
    <nav class="breadcrumbs" aria-label="当前位置"><a href="#workbench">工作空间</a>${icon("chevron-right")}${project ? `<a href="#project">支付服务</a>${icon("chevron-right")}` : ""}<span>${title}</span></nav></div>
    <div class="header-trailing">${inert("搜索", "search", "button button-quiet search-control")}${iconLink("workbench", "inbox", "待处理事项")}<span class="header-avatar" aria-label="林然">林</span></div>`;
}

function pageHeading(title, subtitle, action = "") {
  return `<div class="page-heading"><div><h1>${title}</h1>${subtitle ? `<p class="page-subtitle">${subtitle}</p>` : ""}</div><div class="heading-actions">${action}</div></div>`;
}

function sectionHeading(title, trailing = "") {
  return `<div class="section-heading"><h2>${title}</h2>${trailing}</div>`;
}

function taskHeader(active, scenario = "normal") {
  const isApproval = scenario === "approval";
  const isRecovery = scenario === "recovery";
  const run = isApproval ? "03" : isRecovery ? "04" : ["queued", "offline", "budget"].includes(scenario) ? "01" : "02";
  const axes = isApproval
    ? [pill("待授权", "amber", "shield-check"), pill("3 项验证通过", "green", "circle-check"), pill("待决定", "neutral", "circle-help")]
    : isRecovery
      ? [pill("核查中", "amber", "circle-alert"), pill("验证未完成", "neutral", "minus"), pill("未提交", "neutral", "minus")]
      : scenario === "queued"
        ? [pill("排队", "neutral", "clock-3"), pill("尚未执行", "neutral", "minus"), pill("未提交", "neutral", "minus")]
        : scenario === "offline"
          ? [pill("状态待同步", "amber", "unplug"), pill("最后确认：研究中", "neutral", "clock-3"), pill("未提交", "neutral", "minus")]
          : scenario === "budget"
            ? [pill("预算暂停", "amber", "pause"), pill("尚未执行", "neutral", "minus"), pill("未提交", "neutral", "minus")]
            : [pill("执行结束", "neutral", "square"), pill("2 通过 / 1 失败", "red", "circle-x"), pill("待审查", "amber", "circle-help")];
  const actions = isRecovery ? inert("取消已请求", "square")
    : isApproval ? inert("批准本次", "check", "button button-primary")
      : ["queued", "offline", "budget"].includes(scenario) ? inert("暂停", "pause")
        : link("new-task", "要求修改", "pencil", "button button-primary");
  const tabs = [["task", "工作"], ["dispatch", "调度"], ["calls", "调用"], ["audit", "审计"]];
  const viewNavigation = scenario === "normal"
    ? `<nav class="task-tabs" aria-label="任务视图">${tabs.map(([route, name]) => `<a href="#${route}" class="${active === route ? "is-active" : ""}" ${active === route ? 'aria-current="page"' : ""}>${name}${route === "calls" ? `<span class="tab-counter">${callData.length}</span>` : ""}</a>`).join("")}<a href="#artifacts" class="task-result-link">${icon("file-check-2")}<span>查看成果</span>${icon("arrow-up-right")}</a></nav>`
    : `<div class="snapshot-stage"><span>${isApproval ? "应用变更 · 候选 f7a8b9" : isRecovery ? "核查写入 · 工作区 ws-04" : "当前运行状态"}</span>${link("project", "项目任务", "arrow-up-right", "text-link")}</div>`;
  return `<div class="task-heading"><div><div class="run-label">${icon("git-branch")}<span>支付服务</span><span class="mono">RUN ${run}</span></div><h1>重试策略调整</h1></div><div class="heading-actions">${actions}${inert("更多", "ellipsis", "button button-quiet")}</div></div>
    <div class="fact-axes"><div><span class="axis-label">执行</span>${axes[0]}</div><div><span class="axis-label">验证</span>${axes[1]}</div><div><span class="axis-label">人工决定</span>${axes[2]}</div></div>
    ${viewNavigation}`;
}

function notice(tone, heading, detail, action = "", name = "circle-alert") {
  return `<div class="notice notice-${tone}">${icon(name)}<div><strong>${heading}</strong><p>${detail}</p>${action ? `<div class="notice-action">${action}</div>` : ""}</div></div>`;
}

function home(empty = false) {
  if (empty) return `<div class="page">${pageHeading("工作台", "从一个明确的研发目标开始。")}${emptyState("folder-git-2", "还没有项目", "关联资料或代码仓库，保留后续任务的上下文。", link("new-task", "发起第一项工作", "plus", "button button-primary") + link("setup", "连接模型", "plug"))}</div>`;
  return `<div class="page">${pageHeading("工作台", "两项工作需要你决定。", link("new-task", "发起工作", "plus", "button button-primary"))}
    <section class="page-section">${sectionHeading("需要我处理", '<span class="muted small">2 项</span>')}
      <a href="#tests" class="attention-row">${icon("circle-x", "attention-icon")}<div><strong>重试策略调整</strong><p>重复扣款验证未通过，需要修改实现。</p><span class="row-meta">支付服务 · Run 02 · 12 分钟前</span></div>${pill("测试失败", "red")}${icon("arrow-up-right")}</a>
      <a href="#new-task" class="attention-row">${icon("circle-help", "attention-icon")}<div><strong>接口兼容性研究</strong><p>需要确认旧版接口的兼容范围。</p><span class="row-meta">支付服务 · 草稿 · 28 分钟前</span></div>${pill("等待输入", "amber")}${icon("arrow-up-right")}</a>
    </section>
    <section class="page-section">${sectionHeading("进行中的工作", link("project", "全部任务", "arrow-right", "text-link"))}
      <div class="work-list"><div class="work-item"><div class="work-item-main">${icon("file-search")}<div><strong>分析扣款链路的依赖风险</strong><p>支付服务 · 研究 Agent · 推理模型 B</p></div></div><span class="work-item-state">${pill("研究中", "blue")}<small>当前：检查依赖清单</small></span>${iconLink("project", "arrow-up-right", "查看项目任务")}</div>
      <div class="work-item"><div class="work-item-main">${icon("terminal")}<div><strong>准备隔离工作区</strong><p>支付服务 · 调度器 · 尚未调用模型</p></div></div><span class="work-item-state">${pill("等待资源", "neutral")}<small>当前：等待写入锁</small></span>${iconLink("queued", "arrow-up-right", "查看等待原因")}</div></div>
    </section>
    <section class="page-section">${sectionHeading("最近项目")}
      <div class="project-list"><a href="#project" class="project-list-item"><div class="project-symbol">${icon("folder-git-2")}</div><div><strong>支付服务</strong><p>重试可靠性与接口兼容</p><small>1 项待处理 · 4 份成果</small></div>${icon("chevron-right")}</a>
      <div class="project-list-item" aria-disabled="true"><div class="project-symbol">${icon("folder")}</div><div><strong>发布工具</strong><p>构建与验证流程研究</p><small>暂无进行中的工作</small></div></div></div>
    </section></div>`;
}

function project() {
  return `<div class="page">${pageHeading("支付服务", "改进重试可靠性，避免重复扣款。", link("new-task", "发起工作", "plus", "button button-primary"))}
    <div class="project-context-line"><span>${icon("git-branch")}<code>a1b2c3</code></span><span>${icon("folder-git-2")}payment-service</span><span>${icon("shield-check")}限定访问范围</span></div>
    <nav class="local-tabs"><a href="#project" class="is-active">任务 <span>3</span></a><a href="#artifacts">成果 <span>4</span></a><a href="#new-task">上下文</a><a href="#setup">项目设置</a></nav>
    <div class="two-region"><section class="wide-region">${sectionHeading("项目任务", inert("筛选", "sliders-horizontal", "button button-quiet"))}
      <a href="#task" class="task-list-item"><div class="task-list-heading"><strong>重试策略调整</strong>${pill("需要处理", "amber")}</div><p>限制重试次数，并验证扣款幂等性。</p><div class="task-list-meta"><span>Run 02</span><span>2 项验证通过 · 1 项失败</span><span>12 分钟前</span></div><div class="task-list-bottom"><span class="agent-inline">${icon("bot")}开发 / 测试 / 研究</span><span class="text-link">打开任务 ${icon("arrow-up-right")}</span></div></a>
      <a href="#new-task" class="task-list-item"><div class="task-list-heading"><strong>接口兼容性研究</strong>${pill("草稿")}</div><p>评估现有调用方与新版错误码的兼容范围。</p><div class="task-list-meta"><span>尚未运行</span><span>等待补充验收条件</span></div></a>
      <a href="#artifacts" class="task-list-item"><div class="task-list-heading"><strong>重试链路调研</strong>${pill("已接受", "green")}</div><p>已保存调用链分析与风险说明。</p><div class="task-list-meta"><span>Run 01</span><span>方案 v1</span><span>昨天</span></div></a>
    </section><aside class="context-region">${sectionHeading("项目上下文")}
      <dl class="definition-list"><dt>代码仓库</dt><dd class="mono">payment-service</dd><dt>基线版本</dt><dd><code>a1b2c3</code></dd><dt>允许读取</dt><dd><code>src/retry/**</code><br /><code>tests/retry/**</code></dd><dt>允许修改</dt><dd>仅隔离工作区中的上述路径</dd><dt>约束</dt><dd>不改生产配置<br />不自动合并主分支</dd><dt>资料</dt><dd>${icon("file-text")}接口说明 v2</dd></dl>
      <div class="context-footnote">${icon("lock-keyhole")}项目资料不自动发送到其他模型连接。</div>
    </aside></div></div>`;
}

const planRows = [
  ["01", "研究调用点", "研究 Agent", "推理模型 B", "只读", "完成", "green", "check"],
  ["02", "设计验证条件", "测试 Agent", "推理模型 B", "只读", "完成", "green", "check"],
  ["03", "修改与自测", "开发 Agent", "代码模型 A", "隔离写入", "完成", "green", "check"],
  ["04", "验证扣款幂等性", "测试 Agent", "代码模型 A", "仅运行测试", "失败", "red", "x"],
  ["05", "审查成果", "评审 Agent", "推理模型 B", "只读", "等待修复", "neutral", "minus"],
];

function plan() {
  return `<section class="task-section">${sectionHeading("计划", '<span class="inline-meta">v2 · 由你确认</span>')}
    <div class="plan-list">${planRows.map(([id, title, role, model, permission, state, tone, glyph]) => `<a class="plan-row ${tone === "red" ? "plan-row-failed" : ""}" href="#${tone === "red" ? "tests" : "dispatch"}"><span class="step-marker step-marker-${tone}">${icon(glyph)}</span><div><strong>${title}</strong><span>${role}<span class="meta-dot">·</span>${model}</span></div><span class="permission-label">${permission}</span>${pill(state, tone)}</a>`).join("")}</div></section>`;
}

function task() {
  return `<div class="task-page">${taskHeader("task")}
    <div class="task-columns"><div class="task-primary">
      ${notice("red", "需要修改：扣款幂等性验证未通过", "同一请求重试后出现重复扣款。当前候选变更不能应用。", link("tests", "检查验证证据", "arrow-up-right", "text-link"))}
      <section class="task-section">${sectionHeading("目标与验收")}<p class="goal-text">为重试设置明确上限，同时保持现有接口，确保相同请求不会重复扣款。</p><div class="criteria"><span>${icon("check")}最多重试 3 次</span><span>${icon("x")}同一请求仅扣款一次</span><span>${icon("check")}现有接口保持兼容</span></div></section>
      ${plan()}
      <section class="task-section">${sectionHeading("最近工作记录", link("audit", "完整记录", "arrow-right", "text-link"))}
        <div class="event-item"><div class="event-avatar">${icon("bot")}</div><div><div class="event-heading"><strong>测试 Agent</strong><time>10:24</time></div><p>执行了 3 项验证。重试上限和接口兼容通过；重复扣款保护未通过。</p><a href="#tests" class="artifact-inline">${icon("file-check-2")}test-report / Run 02 ${icon("arrow-up-right")}</a></div></div>
        <div class="event-item"><div class="event-avatar">${icon("code-xml")}</div><div><div class="event-heading"><strong>开发 Agent</strong><time>10:21</time></div><p>候选变更已保存于隔离工作区，主工作区未修改。</p><a href="#artifacts" class="artifact-inline">${icon("file-diff")}retry-policy.diff · 2 个文件 ${icon("arrow-up-right")}</a></div></div>
      </section>
      <div class="composer"><div class="composer-input">补充要求，或说明希望怎样修改…</div><div class="composer-actions">${inert("引用资料", "paperclip", "button button-quiet")}${inert("发送", "arrow-up", "button button-primary")}</div></div>
    </div><aside class="task-context"><h2>本次运行</h2><dl class="definition-list"><dt>目标仓库</dt><dd>payment-service</dd><dt>代码基线</dt><dd><code>a1b2c3</code></dd><dt>候选版本</dt><dd><code>d4e5f6</code></dd><dt>模型配置</dt><dd>代码模型 A<br />推理模型 B</dd><dt>工作区</dt><dd>${icon("lock-keyhole")}隔离工作区 ws-02</dd><dt>运行耗时</dt><dd>8 分 12 秒</dd><dt>成本</dt><dd>未知 <span class="muted small">价格未配置</span></dd></dl><a href="#calls" class="text-link">查看调用与用量 ${icon("arrow-up-right")}</a></aside></div></div>`;
}

function graphNode(title, role, state, tone, target = "calls") {
  return `<a href="#${target}" class="graph-node graph-node-${tone}"><div>${pill(state, tone)}</div><strong>${title}</strong><span>${role}</span></a>`;
}

function dispatch(delegation = false) {
  const graph = delegation ? `<div class="delegation-diagram" role="img" aria-label="协调 Agent 将受限工作委派给研究、测试与开发 Agent；角色不是模型">
    <div class="tree-root">${graphNode("协调 Agent", "推理模型 B · 统筹与汇总", "执行结束", "neutral")}</div>
    <div class="tree-stem"></div>
    <div class="tree-children">${graphNode("研究 Agent", "推理模型 B · 只读", "完成", "green")}${graphNode("开发 Agent", "代码模型 A · ws-02 独占写入", "完成", "green")}${graphNode("测试 Agent", "代码模型 A · 运行测试", "验证失败", "red", "tests")}</div></div>`
    : `<div class="dependency-diagram" role="img" aria-label="研究调用点和设计验证条件可并行，之后修改并自测，再验证，最后审查">
      <div class="graph-stage graph-stage-parallel">${graphNode("研究调用点", "研究 · 推理模型 B", "完成", "green")}${graphNode("设计验证条件", "测试 · 推理模型 B", "完成", "green")}</div>
      <div class="graph-join"><svg viewBox="0 0 34 260" preserveAspectRatio="none" aria-hidden="true"><path d="M0 67H14V130H34M0 193H14V130" /></svg></div>
      <div class="graph-stage">${graphNode("修改与自测", "开发 · 代码模型 A", "完成", "green", "artifacts")}</div>
      <div class="graph-arrow">${icon("arrow-right")}</div>
      <div class="graph-stage">${graphNode("验证幂等性", "测试 · 代码模型 A", "失败", "red", "tests")}</div>
    </div>`;
  return `<div class="task-page">${taskHeader("dispatch")}
    <div class="view-toolbar"><nav class="segmented" aria-label="调度关系"><a href="#dispatch" ${!delegation ? 'aria-current="page"' : ""}>任务依赖</a><a href="#delegation" ${delegation ? 'aria-current="page"' : ""}>Agent 委派</a></nav><span class="muted small">计划 v2 · 最后确认 10:24</span></div>
    <div class="graph-surface">${graph}<div class="graph-key"><span><i class="key-dot green"></i>完成</span><span><i class="key-dot red"></i>失败</span><span><i class="key-dot neutral"></i>等待</span><span class="muted">审查成果：等待修复后继续</span></div></div>
    <div class="mobile-dependency-list">${sectionHeading(delegation ? "委派清单" : "依赖清单")}
      ${planRows.map(([id, title, role, model, permission, state, tone]) => `<a href="#${tone === "red" ? "tests" : "calls"}" class="dependency-list-row"><span class="mono muted">${id}</span><div><strong>${delegation ? role : title}</strong><small>${model} · ${permission}</small></div>${pill(state, tone)}</a>`).join("")}</div>
    <div class="selection-panel"><div>${sectionHeading("验证扣款幂等性", pill("失败", "red"))}<p class="muted">同一请求的重试必须复用幂等键。</p></div><dl class="selection-facts"><div><dt>负责</dt><dd>测试 Agent</dd></div><div><dt>模型</dt><dd>代码模型 A</dd></div><div><dt>输入</dt><dd>候选 d4e5f6 · 计划 v2</dd></div><div><dt>证据</dt><dd>test-report / Run 02</dd></div></dl><div class="panel-actions">${link("tests", "查看证据", "file-check-2", "button button-primary")}${link("calls", "关联调用", "network")}</div></div></div>`;
}

const callData = [
  ["mc-021", "研究", "推理模型 B", "完成", "green", "12.4s", "1,840", "930", "10:16:01", "1"],
  ["tc-022", "研究", "read_file", "完成", "green", "0.2s", "不适用", "不适用", "10:16:14", "1"],
  ["mc-022", "开发", "代码模型 A", "完成", "green", "42.1s", "3,600", "1,400", "10:18:12", "1"],
  ["mc-023", "测试", "代码模型 A", "失败", "red", "30.0s", "未返回", "未返回", "10:22:03", "1"],
  ["mc-024", "测试", "代码模型 A", "完成", "green", "18.6s", "2,120", "760", "10:22:35", "2"],
];

function calls(detail = false) {
  return `<div class="task-page">${taskHeader("calls")}<div class="call-layout ${detail ? "has-inspector" : ""}"><div class="calls-primary">
    <div class="metric-band"><div><span>运行耗时</span><strong>8m 12s</strong><small>墙钟时间</small></div><div><span>本页模型调用</span><strong>4</strong><small>含 1 次失败</small></div><div><span>本页已返回 Token</span><strong>10,650</strong><small>不含未返回的调用</small></div><div><span>估算成本</span><strong>未知</strong><small>价格未配置</small></div></div>
    <section class="timeline-section">${sectionHeading("执行时间线", '<span class="muted small">时间均为静态样例</span>')}
      <div class="time-ruler"><span>10:16</span><span>10:18</span><span>10:20</span><span>10:22</span><span>10:24</span></div>
      <div class="swimlane"><span>研究 Agent</span><div class="lane-track"><span class="time-bar bar-blue" style="--start: 2%; --length: 19%;">研究</span></div></div>
      <div class="swimlane"><span>测试 Agent</span><div class="lane-track"><span class="time-bar bar-neutral" style="--start: 3%; --length: 18%;">设计</span><a href="#call-detail" class="time-bar bar-red" style="--start: 74%; --length: 10%;" title="mc-023 超时">失败</a><span class="time-bar bar-amber" style="--start: 86%; --length: 12%;">验证</span></div></div>
      <div class="swimlane"><span>开发 Agent</span><div class="lane-track"><span class="time-bar bar-green" style="--start: 24%; --length: 44%;">修改与自测</span></div></div>
    </section>
    <div class="table-toolbar">${sectionHeading("调用明细")}<div>${inert("全部步骤", "chevron-down", "button button-quiet")}${inert("全部状态", "chevron-down", "button button-quiet")}</div></div>
    <div class="table-scroll" tabindex="0" aria-label="调用明细，可横向滚动"><table class="calls-table"><thead><tr><th>调用</th><th>Agent</th><th>模型 / 工具</th><th>状态</th><th>耗时</th><th>输入</th><th>输出</th></tr></thead><tbody>${callData.map(([id, role, model, status, tone, duration, input, output]) => `<tr class="${id === "mc-023" ? "row-failed" : ""}"><td>${id === "mc-023" ? `<a href="#call-detail" class="mono text-link">${id}</a>` : `<span class="mono">${id}</span>`}</td><td>${role}</td><td>${model}</td><td>${pill(status, tone)}</td><td class="mono">${duration}</td><td class="mono">${input}</td><td class="mono">${output}</td></tr>`).join("")}</tbody></table></div>
    <div class="table-footnote">${icon("circle-help")}当前为调用片段，只汇总本页已返回的叶子调用，不再重复计入 Agent 汇总值。</div>
    </div>${detail ? callInspector() : ""}</div></div>`;
}

function callInspector() {
  return `<aside class="call-inspector"><div class="inspector-title"><span class="mono">mc-023</span>${iconLink("calls", "x", "关闭调用详情")}</div>${pill("请求超时", "red", "circle-x")}<h2>代码模型 A</h2><p class="muted small">测试 Agent · 尝试 1</p>
    <dl class="definition-list"><dt>所属步骤</dt><dd>验证扣款幂等性</dd><dt>请求配置</dt><dd><code>coding-a</code></dd><dt>返回模型</dt><dd>未知 · Provider 未返回</dd><dt>调用开始</dt><dd class="mono">10:22:03</dd><dt>耗时</dt><dd>30.0 秒</dd><dt>错误类别</dt><dd><code>provider_timeout</code></dd><dt>输入 / 输出 Token</dt><dd>未返回</dd><dt>关联重试</dt><dd><code>mc-024</code> · 尝试 2</dd></dl>
    <section class="inspector-section"><h3>输入摘要</h3><p>根据候选变更检查重复请求与重试边界。引用限定路径中的测试文件。</p><span class="muted small">${icon("lock-keyhole")}原始内容未采集</span></section>
    <div class="panel-actions">${link("dispatch", "所属步骤", "git-branch")}${link("tests", "验证证据", "file-check-2")}</div>
  </aside>`;
}

function artifacts(tests = false) {
  return `<div class="task-page">${taskHeader("task")}
    <div class="artifact-heading"><div><h2>候选成果</h2><p>主工作区未修改，候选变更保留在 ws-02。</p></div>${inert("应用变更", "git-merge", "button button-primary", "验证门槛未满足，不能应用")}</div>
    <nav class="local-tabs"><a href="#artifacts" class="${!tests ? "is-active" : ""}">代码变更 <span>2</span></a><a href="#tests" class="${tests ? "is-active" : ""}">验证证据 <span>3</span></a><a href="#audit">审查与记录</a></nav>
    ${tests ? testEvidence() : diffEvidence()}
    <div class="outcome-footer"><span>${icon("lock-keyhole")}验证失败，应用变更被阻止。</span>${link("new-task", "要求修改", "pencil", "button button-primary")}</div></div>`;
}

function diffEvidence() {
  return `<div class="artifact-context"><span>基线 <code>a1b2c3</code></span>${icon("arrow-right")}<span>候选 <code>d4e5f6</code></span><span>Run 02 · 计划 v2</span></div>
    <div class="diff-layout"><aside class="file-list"><a class="is-active" href="#artifacts">${icon("file-code-2")}<span>src/retry/policy.ts</span><small>M</small></a><a href="#tests">${icon("file-check-2")}<span>tests/retry/policy.test.ts</span><small>M</small></a></aside>
    <div class="diff-content"><div class="code-title">${icon("file-code-2")}<span>src/retry/policy.ts</span><span class="diff-count">+5 −2</span></div><pre class="code-preview" tabindex="0" aria-label="代码变更示例"><code><span class="code-line">  18  export async function retryPayment(request) {</span>
<span class="code-line code-remove">- 19    while (shouldRetry(error)) {</span>
<span class="code-line code-add">+ 19    const maxAttempts = 3;</span>
<span class="code-line code-add">+ 20    for (let attempt = 0; attempt &lt; maxAttempts; attempt++) {</span>
<span class="code-line">  21      try {</span>
<span class="code-line code-remove">- 22        return await charge(request);</span>
<span class="code-line code-add">+ 22        const key = createIdempotencyKey();</span>
<span class="code-line code-add">+ 23        return await charge(request, key);</span>
<span class="code-line">  24      } catch (error) {</span>
<span class="code-line code-add">+ 25        if (!shouldRetry(error)) throw error;</span>
<span class="code-line">  26      }</span>
<span class="code-line">  27    }</span>
<span class="code-line">  28  }</span></code></pre><div class="code-finding">${icon("circle-x")}幂等键在循环内重新生成，重复请求未复用相同标识。<a href="#tests" class="text-link">查看失败证据 ${icon("arrow-up-right")}</a></div></div></div>`;
}

function testEvidence() {
  return `<div class="test-summary"><div><strong>2 项通过，1 项失败</strong><p>验证报告 · Run 02 · 候选 d4e5f6</p></div>${pill("未达到应用门槛", "red")}</div>
    <div class="test-list"><div class="test-row">${icon("circle-check")}<div><strong>重试次数不超过上限</strong><small>retry-limit.test · 0.3s</small></div>${pill("通过", "green")}</div>
    <div class="test-row test-row-failed">${icon("circle-x")}<div><strong>相同请求仅扣款一次</strong><small>idempotency.test · 0.4s</small></div>${pill("失败", "red")}</div>
    <div class="test-row">${icon("circle-check")}<div><strong>现有接口保持兼容</strong><small>compatibility.test · 0.2s</small></div>${pill("通过", "green")}</div></div>
    <section class="evidence-section">${sectionHeading("实际执行证据")}<dl class="evidence-facts"><div><dt>命令</dt><dd><code>npm test -- --run tests/retry</code></dd></div><div><dt>环境</dt><dd>ws-02 · Node 22 · 测试环境</dd></div><div><dt>退出码</dt><dd><code>1</code></dd></div><div><dt>执行时间</dt><dd>10:23:58 – 10:24:00</dd></div></dl>
      <pre class="test-output" tabindex="0" aria-label="失败测试输出示例"><code>FAIL tests/retry/idempotency.test.ts

Expected charge count: 1
Received charge count: 2

2 passed · 1 failed</code></pre>
      <div class="panel-actions">${link("artifacts", "关联代码变更", "file-diff")}${link("calls", "关联调用", "network")}</div>
    </section>`;
}

function approval() {
  return `<div class="task-page">${taskHeader("task", "approval")}
    <div class="review-action-page"><div class="action-heading">${icon("shield-check")}<div><h2>将候选变更应用到工作区</h2><p>仅授权下面这一项动作，不包含提交、合并或部署。</p></div></div>
    <dl class="action-facts"><div><dt>目标</dt><dd>payment-service / 目标工作区</dd></div><div><dt>授权主体</dt><dd>林然 · 项目所有者</dd></div><div><dt>代码版本</dt><dd><code>a1b2c3</code> ${icon("arrow-right")} <code>f7a8b9</code></dd></div><div><dt>成果与计划</dt><dd>retry-policy.diff v3 · 计划 v3 · Run 03</dd></div><div><dt>影响范围</dt><dd>2 个文件，仅限 src/retry 与 tests/retry</dd></div><div><dt>前置检查</dt><dd>${pill("3 项验证通过", "green")}<span class="small">目标基线未变化</span></dd></div><div><dt>有效期</dt><dd>到 11:30；目标版本或内容变化后立即失效</dd></div><div><dt>回退条件</dt><dd>仅本次隔离变更；应用前保存目标状态，回退需重新确认</dd></div></dl>
    <details class="approval-diff"><summary>${icon("file-diff")}查看实际变更摘要 ${icon("chevron-down")}</summary><div><code>src/retry/policy.ts</code><p>将幂等键移到重试循环外，复用同一请求标识。</p><code>tests/retry/policy.test.ts</code><p>补充重复请求验证，3 项测试均通过。</p></div></details>
    ${notice("neutral", "批准不代表动作已经完成", "授权后还需要检查实际执行结果。目标状态变化时，将重新请求确认。", "", "circle-help")}
    <div class="approval-actions">${inert("拒绝", "x")}${inert("要求修改", "pencil")}${inert("批准本次", "check", "button button-primary")}</div></div></div>`;
}

function recovery() {
  return `<div class="task-page">${taskHeader("task", "recovery")}
    <div class="recovery-page">${notice("amber", "取消请求已收到，写入结果尚未确认", "未继续派发新任务。一次文件写入命令在返回前断开连接，需要核查实际工作区。", "", "circle-help")}
    <div class="recovery-facts"><section>${sectionHeading("已经确认")}<ul class="plain-checks"><li>${icon("check")}模型调用已中断</li><li>${icon("check")}两个只读子任务已结束</li><li>${icon("check")}已有成果与日志保留</li></ul></section>
    <section>${sectionHeading("尚未确认")}<ul class="plain-checks"><li>${icon("circle-help")}tc-041 的文件写入是否全部完成</li><li>${icon("circle-help")}工作区是否存在部分修改</li></ul></section></div>
    <section class="evidence-section">${sectionHeading("需要核查的动作")}<dl class="evidence-facts"><div><dt>调用</dt><dd><code>tc-041</code></dd></div><div><dt>执行环境</dt><dd>隔离工作区 ws-04</dd></div><div><dt>目标</dt><dd><code>src/retry/policy.ts</code></dd></div><div><dt>最后确认</dt><dd>写入请求已发出，工具未返回退出状态</dd></div></dl></section>
    <div class="recovery-action-list"><div><strong>核查工作区状态</strong><p>只读比对文件与基线，确认是否存在部分写入。</p>${inert("开始只读核查", "search", "button button-primary")}</div><div><strong>由我接管</strong><p>保留现状与证据，停止 Agent 的后续操作。</p>${inert("人工接管", "user-round")}</div></div>
    <div class="blocked-action">${icon("lock-keyhole")}重试已禁用：先确认上一次动作的实际结果。</div></div></div>`;
}

function audit() {
  const rows = [
    ["10:24:00", "工具 / 测试环境", "验证执行结束", "退出码 1，2 项通过，1 项失败", "tests"],
    ["10:22:35", "调度器", "创建调用尝试 2", "mc-024 关联失败调用 mc-023", "calls"],
    ["10:22:33", "Provider", "模型请求超时", "mc-023；未返回 Token 用量", "call-detail"],
    ["10:21:04", "开发 Agent", "保存候选成果", "d4e5f6；仅隔离工作区，未应用", "artifacts"],
    ["10:18:12", "林然", "授权隔离写入", "限定目录；计划 v2；本次运行", "dispatch"],
    ["10:15:42", "林然", "确认计划 v2", "替代 v1；新增幂等性验证要求", "task"],
  ];
  return `<div class="task-page">${taskHeader("audit")}<div class="audit-toolbar">${sectionHeading("操作与结果记录")}<span class="muted small">${icon("lock-keyhole")}普通审计记录 · 非防篡改证明</span></div>
    <div class="audit-list">${rows.map(([time, who, title, detail, route]) => `<a href="#${route}" class="audit-row"><time class="mono">${time}</time><div><span class="audit-who">${who}</span><strong>${title}</strong><p>${detail}</p></div>${icon("arrow-up-right")}</a>`).join("")}</div></div>`;
}

function emptyState(name, title, detail, actions = "") {
  return `<div class="empty-state"><div class="empty-symbol">${icon(name)}</div><h2>${title}</h2><p>${detail}</p><div class="panel-actions">${actions}</div></div>`;
}

function setup() {
  return `<div class="page narrow-page">${pageHeading("连接能力", "先连接一个模型，再逐步开放项目工具。")}
    <nav class="local-tabs"><a href="#setup" class="is-active">模型连接</a><a href="#new-task">项目工具</a><a href="#project">工作范围</a></nav>
    <section class="connection-status">${icon("plug")}<div><strong>还没有模型连接</strong><p>连接信息只在保存后供指定项目使用。</p></div>${pill("未连接")}</section>
    <form class="design-form" aria-label="模型连接设计表单"><label>连接名称<input readonly value="我的研发模型" /></label><label>接口地址<input readonly placeholder="https://your-provider.example/v1" type="url" /></label><label>API Key<input readonly placeholder="未配置" type="password" /></label><label>模型标识<input readonly placeholder="选择或输入模型标识" /></label>
    <div class="field-note">${icon("lock-keyhole")}密钥不进入任务对话或普通日志。</div><div class="form-actions">${inert("测试连接", "plug")}${inert("保存连接", "check", "button button-primary")}</div></form>
    <section class="connection-next">${sectionHeading("下一步")}<p>创建项目时，确认资料与代码能否发送给这个连接。</p>${link("new-task", "查看项目与任务", "arrow-right", "text-link")}</section></div>`;
}

function newTask() {
  return `<div class="page narrow-page">${pageHeading("发起工作", "支付服务 / 新任务", iconLink("project", "x", "返回项目"))}
    <form class="design-form" aria-label="任务创建设计表单"><label>希望完成什么<textarea readonly rows="3">为重试设置上限，保持接口兼容，确保相同请求只扣款一次。</textarea></label>
    <label>验收条件<textarea readonly rows="3">最多重试 3 次；重复请求只扣款一次；现有接口测试通过。</textarea></label>
    <fieldset><legend>项目上下文</legend><label class="check-field"><input type="checkbox" checked disabled /><span>payment-service <small>基线 a1b2c3</small></span></label><label class="check-field"><input type="checkbox" checked disabled /><span>接口说明 v2</span></label></fieldset>
    <div class="form-split"><label>执行范围<select disabled><option>先分析，写入前确认</option></select></label><label>调用上限<input readonly type="number" value="12" /></label></div>
    <details class="advanced-settings"><summary>模型与委派 ${icon("chevron-down")}</summary><div class="form-split"><label>开发与测试<select disabled><option>代码模型 A</option></select></label><label>研究与审查<select disabled><option>推理模型 B</option></select></label></div><p class="muted small">最多两个只读子任务并行。代码工作区只有一个写入者。</p></details>
    <div class="field-note">${icon("shield-check")}允许读取 src/retry 与 tests/retry；不得修改生产配置。</div><div class="form-actions">${inert("保存草稿", "file-text")}${inert("生成计划", "arrow-right", "button button-primary")}</div></form></div>`;
}

function stateScreen(state) {
  const content = {
    queued: {
      name: "clock-3", tone: "neutral", title: "等待隔离工作区",
      detail: "当前工作区仍由前一项写入任务持有。模型尚未调用，不产生本次模型用量。",
      facts: [["进入队列", "10:12:05"], ["等待资源", "ws-01 写入锁"], ["可以并行", "只读资料检查"], ["将要执行", "研究现有调用点"]],
    },
    offline: {
      name: "unplug", tone: "amber", title: "连接中断，执行状态待同步",
      detail: "最后确认在 10:18:02。浏览器断线不代表任务已取消；恢复连接前不会显示新的执行结果。",
      facts: [["最后状态", "研究 Agent 正在读取文件"], ["最后事件", "event-018"], ["新事件", "尚未同步"], ["任务控制", "当前不可确认请求已送达"]],
    },
    budget: {
      name: "pause", tone: "amber", title: "调用上限已达到，停止新增调度",
      detail: "已使用 12 次调用额度，其中 1 次仍在返回途中。已有成果保留，不会自动更换模型继续执行。",
      facts: [["调用上限", "12 次"], ["已完成", "11 次"], ["在途调用", "1 次，结果与用量待返回"], ["金额成本", "未知，价格未配置"]],
    },
  }[state];
  return `<div class="task-page">${taskHeader("task", state)}<div class="state-page">${notice(content.tone, content.title, content.detail, "", content.name)}
    <section class="state-detail">${sectionHeading("当前确认的信息")}<dl class="evidence-facts">${content.facts.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join("")}</dl></section>
    <div class="panel-actions">${state === "offline" ? inert("重新同步", "refresh-cw", "button button-primary") : state === "budget" ? inert("调整本次上限", "sliders-horizontal", "button button-primary") : inert("取消排队", "square")}${inert("查看已有成果", "files")}</div>
    </div></div>`;
}

const renderers = {
  workbench: () => home(),
  project,
  task,
  dispatch: () => dispatch(false),
  delegation: () => dispatch(true),
  calls: () => calls(false),
  "call-detail": () => calls(true),
  artifacts: () => artifacts(false),
  tests: () => artifacts(true),
  approval,
  recovery,
  audit,
  setup,
  "new-task": newTask,
  empty: () => home(true),
  queued: () => stateScreen("queued"),
  offline: () => stateScreen("offline"),
  budget: () => stateScreen("budget"),
};

function render() {
  const requested = location.hash.slice(1);
  if (requested === "main") {
    $("#main").focus();
    return;
  }
  currentScreen = Object.hasOwn(renderers, requested) ? requested : "workbench";
  const [, title, headerTitle, context] = screens.find(([id]) => id === currentScreen);
  const projectScreen = !["workbench", "project", "setup", "empty"].includes(currentScreen);
  const activeNav = currentScreen === "workbench" || currentScreen === "empty" ? "workbench" : currentScreen === "setup" ? "setup" : ["artifacts", "tests"].includes(currentScreen) ? "artifacts" : "project";
  $("#app-nav").innerHTML = navigation(activeNav);
  $("#mobile-navigation").innerHTML = navigation(activeNav);
  $("#app-header").innerHTML = header(headerTitle, projectScreen);
  $("#main").innerHTML = renderers[currentScreen]();
  $("#screen-picker").value = currentScreen;
  $("#review-footer").innerHTML = `<span><strong>${title}</strong> · ${context}</span><span>所有内容均为设计样例，操作未执行</span>`;
  document.title = `${title} | AI Workbench 低保真设计`;
  document.body.dataset.screen = currentScreen;
  $("#navigation-dialog").close();
  window.scrollTo(0, 0);
}

$("#screen-picker").innerHTML = screens.map(([id, title]) => `<option value="${id}">${title}</option>`).join("");
$("#screen-picker").addEventListener("change", (event) => { location.hash = event.target.value; });
window.addEventListener("hashchange", render);
document.addEventListener("click", (event) => {
  if (event.target.closest("[data-open-navigation]")) $("#navigation-dialog").showModal();
  if (event.target.closest("[data-close-navigation]")) $("#navigation-dialog").close();
});
document.addEventListener("submit", (event) => event.preventDefault());
render();
