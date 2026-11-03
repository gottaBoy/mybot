/* Presentation-only review. All data is fictional; no service or executor is connected. */
const screens = [
  ["workbench", "工作台", "工作台", "Run 02 / 测试失败后的工作总览"],
  ["project", "研发项目", "支付服务", "项目上下文与任务"],
  ["task", "任务工作区", "重试策略调整", "Run 02 / 执行结束，测试未通过"],
  ["super-agent", "Super-agent", "Super-agent", "支付服务 / 任务协调，未发起新运行"],
  ["control", "Control Panel", "Control Panel", "支付服务 / 下一次运行的本地草稿，未应用"],
  ["control-review", "配置调整预览", "Control Panel", "支付服务 / 草稿差异，未应用到执行器"],
  ["dispatch", "任务依赖", "重试策略调整", "Run 02 / 计划 v2"],
  ["delegation", "Agent 委派", "重试策略调整", "Run 02 / 按需协作"],
  ["calls", "调用分析", "重试策略调整", "Run 02 / 调用片段"],
  ["call-detail", "调用详情", "重试策略调整", "Run 02 / 失败尝试 mc-023"],
  ["artifacts", "代码成果", "重试策略调整", "Run 02 / 候选变更 d4e5f6"],
  ["tests", "验证证据", "重试策略调整", "Run 02 / 2 项通过，1 项失败"],
  ["approval", "审批", "重试策略调整", "Run 03 / 独立快照，修复后等待授权"],
  ["recovery", "结果核查", "重试策略调整", "Run 04 / 独立快照，写入结果未知"],
  ["audit", "操作审计", "重试策略调整", "Run 02 / 决策与执行证据"],
  ["setup", "连接能力", "连接能力", "所有模型均未连接"],
  ["new-task", "发起工作", "发起工作", "草稿 / 尚未执行"],
  ["empty", "首次使用", "工作台", "没有项目或任务"],
  ["queued", "等待资源", "重试策略调整", "Run 01 / 独立快照，任务排队"],
  ["offline", "连接中断", "重试策略调整", "Run 01 / 独立快照，状态待同步"],
  ["budget", "预算暂停", "重试策略调整", "Run 01 / 独立快照，停止新增调用"],
];
const $ = (selector) => document.querySelector(selector);
const icon = (name, extra = "") => `<img src="../review-v1/assets/icons/${name}.svg" class="icon ${extra}" alt="" />`;
const pill = (label, tone = "neutral") => `<span class="status status-${tone}"><i></i>${label}</span>`;
const link = (route, label, name = "", cls = "button button-secondary") => `<a class="${cls}" href="#${route}">${name ? icon(name) : ""}<span>${label}</span></a>`;
const inert = (label, name = "", cls = "button button-secondary") => `<button type="button" disabled class="${cls}" title="静态设计稿，不执行操作">${name ? icon(name) : ""}<span>${label}</span></button>`;
const iconLink = (route, name, label) => `<a href="#${route}" class="icon-button" aria-label="${label}" title="${label}">${icon(name)}</a>`;
const section = (title, action = "", caption = "") => `<div class="section-heading"><div><h2>${title}</h2>${caption ? `<p>${caption}</p>` : ""}</div>${action}</div>`;
const avatar = (label, tone = "blue", name = "") => `<span class="agent-avatar agent-${tone}">${name ? icon(name) : label}</span>`;
const versions = `<span class="version mono">a1b2c3</span>${icon("arrow-right")}<span class="version mono">d4e5f6</span>`;
const planData = [
  ["研究调用点", "研究 Agent", "推理模型 B", "只读", "已完成", "green", "file-search"],
  ["设计验证条件", "测试 Agent", "推理模型 B", "只读", "已完成", "green", "file-check-2"],
  ["修改与自测", "开发 Agent", "代码模型 A", "隔离写入", "已完成", "green", "code-xml"],
  ["验证扣款幂等性", "测试 Agent", "代码模型 A", "运行测试", "失败", "red", "circle-x"],
  ["审查成果", "评审 Agent", "推理模型 B", "只读", "等待修复", "neutral", "circle-help"],
];
const callData = [
  ["mc-021", "研究", "推理模型 B", "完成", "green", "12.4s", "1,840", "930", "10:16:01", "1"],
  ["tc-022", "研究", "read_file", "完成", "green", "0.2s", "不适用", "不适用", "10:16:14", "1"],
  ["mc-022", "开发", "代码模型 A", "完成", "green", "42.1s", "3,600", "1,400", "10:18:12", "1"],
  ["mc-023", "测试", "代码模型 A", "失败", "red", "30.0s", "未返回", "未返回", "10:22:03", "1"],
  ["mc-024", "测试", "代码模型 A", "完成", "green", "18.6s", "2,120", "760", "10:22:35", "2"],
];
const modelChoices = [["reasoning-b", "推理模型 B"], ["coding-a", "代码模型 A"]];
const roleDefinitions = [
  ["coordinator", "Super-agent", "计划与汇总", "command", "neutral", "reasoning-b"],
  ["researcher", "研究 Agent", "读取限定资料", "file-search", "blue", "reasoning-b"],
  ["developer", "开发 Agent", "隔离工作区写入", "code-xml", "green", "coding-a"],
  ["tester", "测试 Agent", "执行验证", "file-check-2", "amber", "coding-a"],
];
const initialDraft = {
  models: Object.fromEntries(roleDefinitions.map(([id, , , , , model]) => [id, model])),
  parallel: 2,
  calls: 12,
  minutes: 20,
  stopOnFailure: true,
};
const draftLimits = [
  ["parallel", "只读并行上限", 1, 2],
  ["calls", "模型调用上限", 1, 24],
  ["minutes", "运行时间上限", 1, 60],
];
const freshDraft = () => ({ ...initialDraft, models: { ...initialDraft.models } });
const uiState = {
  evidence: "code",
  studio: "work",
  callFilter: "all",
  details: {},
  scroll: {},
  draft: freshDraft(),
};
let currentScreen = null;
const modelLabel = (id) => modelChoices.find(([value]) => id === value)?.[1] || "未选择";
function draftChanges() {
  const changes = roleDefinitions.flatMap(([id, label]) => uiState.draft.models[id] === initialDraft.models[id] ? [] : [{
    name: `${label} 模型`, before: modelLabel(initialDraft.models[id]), after: modelLabel(uiState.draft.models[id]),
  }]);
  for (const [field, name, unit] of [["parallel", "只读并行上限", "个"], ["calls", "模型调用上限", "次"], ["minutes", "运行时间上限", "分钟"]]) {
    if (Number(uiState.draft[field]) !== initialDraft[field]) changes.push({ name, before: `${initialDraft[field]} ${unit}`, after: `${uiState.draft[field]} ${unit}` });
  }
  if (uiState.draft.stopOnFailure !== initialDraft.stopOnFailure) changes.push({ name: "验证失败后停止", before: "开启", after: "关闭" });
  return changes;
}
function draftErrors() {
  const errors = [];
  for (const [name, label, minimum, maximum] of draftLimits) {
    const value = Number(uiState.draft[name]);
    if (!Number.isInteger(value) || value < minimum || value > maximum) errors.push(`${label}须为 ${minimum}–${maximum} 的整数`);
  }
  return errors;
}

function navigation(active) {
  const routes = [["workbench", "layout-dashboard", "工作台"], ["super-agent", "command", "Super-agent"], ["project", "folder-git-2", "项目"], ["artifacts", "files", "成果"]];
  return `<a class="brand" href="#task"><span class="brand-mark">${icon("command")}</span><strong>Workbench<span class="brand-version">AI</span></strong></a>
    <div class="workspace-switch"><span class="workspace-avatar">研</span><span>研发工作空间<small>个人试点</small></span>${icon("chevron-down")}</div>
    <a class="nav-new" href="#new-task">${icon("plus")}<span>发起工作</span></a>
    <nav class="primary-nav">${routes.map(([route, glyph, title]) => `<a class="nav-item ${active === route ? "is-active" : ""}" href="#${route}" ${active === route ? 'aria-current="page"' : ""}>${icon(glyph)}<span>${title}</span>${route === "workbench" ? '<span class="nav-count">2</span>' : ""}</a>`).join("")}</nav>
    <div class="nav-projects"><div class="nav-section-heading"><span>项目</span>${iconLink("new-task", "plus", "新建项目草稿")}</div>
      <a class="nav-project" href="#project"><span class="project-monogram">P</span><span>支付服务</span><i class="attention-dot"></i></a>
      <span class="nav-project muted" aria-disabled="true"><span class="project-monogram">D</span><span>发布工具</span></span>
    </div>
    <div class="nav-bottom"><a class="nav-item ${active === "control" ? "is-active" : ""}" href="#control" ${active === "control" ? 'aria-current="page"' : ""}>${icon("sliders-horizontal")}<span>Control Panel</span></a><div class="scope-note">${icon("shield-check")}<div>受控工作空间<small>仅访问已授权的项目范围</small></div></div>
      <a class="nav-item" href="#setup">${icon("settings-2")}<span>连接与设置</span></a>
      <div class="identity"><span class="person-avatar">林</span><span><strong>林然</strong><small>项目所有者</small></span>${icon("chevron-down")}</div>
    </div>`;
}

function header(title, isProject) {
  return `<div class="header-leading"><button class="icon-button mobile-menu" type="button" data-open-navigation aria-label="打开导航" title="打开导航">${icon("menu")}</button>
    <nav class="breadcrumbs" aria-label="当前位置"><a href="#workbench">${icon("layout-dashboard")}<span>工作空间</span></a>${icon("chevron-right")}${isProject ? `<a href="#project">支付服务</a>${icon("chevron-right")}` : ""}<span>${title}</span></nav></div>
    <div class="header-trailing"><div class="review-label"><span class="sample-dot"></span><strong>静态设计 V2</strong></div><label class="screen-picker"><span class="sr-only">选择设计画面</span><select id="screen-picker" aria-label="选择设计画面">${screens.map(([id, name]) => `<option value="${id}">${name}</option>`).join("")}</select></label>${iconLink("workbench", "inbox", "待处理事项")}</div>`;
}

function heading(title, sub, actions = "", eyebrow = "") {
  return `<div class="page-heading"><div>${eyebrow ? `<div class="eyebrow">${eyebrow}</div>` : ""}<h1>${title}</h1>${sub ? `<p>${sub}</p>` : ""}</div><div class="heading-actions">${actions}</div></div>`;
}

function notice(tone, title, detail, action = "") {
  return `<div class="notice notice-${tone}">${icon(tone === "red" ? "circle-x" : tone === "amber" ? "circle-alert" : "circle-help")}<div><strong>${title}</strong><p>${detail}</p></div>${action ? `<div class="notice-action">${action}</div>` : ""}</div>`;
}

function taskHeader(active, scenario = "normal") {
  const spec = {
    normal: ["02", "执行结束", "neutral", "2 通过 / 1 失败", "red", "待审查"],
    approval: ["03", "待授权", "amber", "3 项验证通过", "green", "待决定"],
    recovery: ["04", "核查中", "amber", "验证未完成", "neutral", "未提交"],
    queued: ["01", "等待资源", "neutral", "尚未执行", "neutral", "未提交"],
    offline: ["01", "状态待同步", "amber", "最后确认：研究中", "neutral", "未提交"],
    budget: ["01", "预算暂停", "amber", "尚未执行", "neutral", "未提交"],
  }[scenario];
  const [run, execution, tone, validation, qualityTone, decision] = spec;
  const action = scenario === "normal" ? link("new-task", "要求修改", "pencil", "button button-primary")
    : scenario === "approval" ? inert("批准本次", "check", "button button-primary")
      : inert(scenario === "recovery" ? "取消已请求" : "暂停", "pause");
  const tabs = [["task", "工作", "blocks"], ["super-agent", "协调", "command"], ["dispatch", "调度", "git-branch"], ["calls", "调用", "network"], ["audit", "审计", "shield-check"]];
  return `<div class="task-heading"><div><div class="task-eyebrow"><span class="project-symbol-small">P</span><a href="#project">支付服务</a><span class="eyebrow-divider">/</span><span class="mono">RUN ${run}</span></div><h1>重试策略调整</h1><p class="task-description">限制重试次数，验证扣款幂等性，保持现有接口。</p></div><div class="heading-actions">${scenario === "normal" ? iconLink("control", "sliders-horizontal", "打开 Control Panel") : ""}${action}${inert("更多", "ellipsis", "button button-icon-text")}</div></div>
    <div class="fact-axes"><div><span>执行</span>${pill(execution, tone)}</div><div><span>验证</span>${pill(validation, qualityTone)}</div><div><span>人工决定</span>${pill(decision)}</div><a class="run-version" href="#project">${icon("git-branch")}<code>a1b2c3</code>${scenario === "normal" ? '<span>基线未变更</span>' : ""}</a></div>
    ${scenario === "normal" ? `<nav class="task-tabs" aria-label="任务视图">${tabs.map(([route, label, glyph]) => `<a class="${active === route ? "is-active" : ""}" href="#${route}" ${active === route ? 'aria-current="page"' : ""}>${icon(glyph)}<span>${label}</span>${route === "calls" ? '<span class="tab-count">5</span>' : ""}</a>`).join("")}${link("artifacts", "查看成果", "arrow-up-right", "task-result-link")}</nav>` : `<div class="snapshot-stage"><span>${scenario === "approval" ? "应用候选变更 f7a8b9" : scenario === "recovery" ? "核查工作区 ws-04 的写入结果" : "本次运行状态"}</span>${link("project", "返回项目", "arrow-up-right", "text-link")}</div>`}`;
}

function coordinationHeader(title, description, active) {
  return `${heading(title, description, link("task", "返回任务", "arrow-right", "button button-secondary"), "支付服务 / 重试策略调整")}
    <div class="coordination-scope"><span>${icon("folder-git-2")}payment-service</span><span>${icon("git-branch")}<code>a1b2c3</code></span><span>Run 02 已结束</span><span class="scope-sample">${icon("lock-keyhole")}示例工作空间 · 未连接执行器</span></div>
    <nav class="coordination-tabs" aria-label="协调与控制"><a href="#super-agent" ${active === "super-agent" ? 'aria-current="page"' : ""}>${icon("command")}Super-agent</a><a href="#control" ${active === "control" ? 'aria-current="page"' : ""}>${icon("sliders-horizontal")}Control Panel<span id="coordination-draft-dot" class="draft-indicator" ${draftChanges().length ? "" : "hidden"}></span></a></nav>`;
}

function superAgent() {
  return `<div class="page coordination-page">${coordinationHeader("Super-agent", "目标、委派和下一步决定。", "super-agent")}
    <div class="coordination-layout"><div class="coordination-main">
      <section class="coordinator-brief"><div class="coordinator-identity">${avatar("", "neutral", "command")}<div><h2>任务协调</h2><span>推理模型 B · 计划 v2 · Run 02</span></div>${pill("等待你决定", "amber")}</div>
      <p class="coordinator-goal">增加可控的重试，不让同一个请求重复扣款。</p>
      <div class="acceptance-strip"><span>${icon("check")}最多重试 3 次</span><span>${icon("check")}现有接口兼容</span><span class="tone-red-text">${icon("x")}请求扣款幂等</span></div></section>
      <section class="next-decision">${section("下一步建议", pill("未执行"))}<div class="recommendation"><span class="recommendation-symbol">${icon("pencil")}</span><div><h3>先修复幂等键，再重新验证</h3><p>测试证据显示幂等键在循环内重新生成。把标识移到重试循环外，保留现有接口，再检查三项验收条件。</p><div class="recommendation-source">${icon("file-check-2")}test-report · 候选 d4e5f6${link("tests", "查看依据", "arrow-up-right", "text-link")}</div></div></div>
      <div class="proposal-sequence"><div><span class="sequence-number">01</span><div><strong>开发修复</strong><small>代码模型 A · 独占隔离写入</small></div></div><span class="sequence-arrow">${icon("arrow-right")}</span><div><span class="sequence-number">02</span><div><strong>重新验证</strong><small>测试 Agent · 读取实际结果</small></div></div></div>
      <div class="panel-actions">${link("new-task", "准备修改要求", "pencil", "button button-primary")}${link("control", "调整下一次运行", "sliders-horizontal")}</div></section>
      <section class="delegation-roster">${section("本轮分工", link("delegation", "查看委派关系", "git-branch", "text-link"))}
      ${planData.slice(0, 4).map(([title, role, model, permission, state, tone, glyph], index) => `<a href="#${tone === "red" ? "tests" : "calls"}" class="delegation-roster-row">${avatar("", ["blue", "amber", "green", "red"][index], glyph)}<div><strong>${title}</strong><small>${role} · ${model}</small></div><span class="roster-permission">${permission}</span>${pill(state, tone)}${icon("arrow-up-right")}</a>`).join("")}</section>
    </div><aside class="coordination-aside"><section>${section("不能自动越过的边界")}<ul class="control-boundaries"><li>${icon("shield-check")}代码写入需要本次授权</li><li>${icon("lock-keyhole")}只有一个工作区写入者</li><li>${icon("circle-x")}验证失败不能应用变更</li><li>${icon("user-round")}提交、合并、发布由人决定</li></ul></section>
      <section class="coordination-history">${section("最近决定")}<div><span class="decision-time">10:24</span><p>验证失败，候选成果保留，等待修复。</p></div><div><span class="decision-time">10:18 · 林然</span><p>授权在限定目录中隔离写入。</p></div><div><span class="decision-time">10:15 · 林然</span><p>确认计划 v2，新增幂等性验证。</p></div>${link("audit", "检查完整记录", "arrow-up-right", "text-link")}</section>
      <div class="coordinator-footnote">${icon("circle-help")}模型提出建议；权限与执行状态不由自然语言决定。</div></aside></div></div>`;
}

function modelSelect(role, model) {
  return `<select id="model-${role}" data-draft-model="${role}" aria-label="${roleDefinitions.find(([id]) => id === role)[1]} 模型配置">${modelChoices.map(([value, label]) => `<option value="${value}" ${value === model ? "selected" : ""}>${label}</option>`).join("")}</select>`;
}

function controlPanel() {
  const { draft } = uiState;
  const changeCount = draftChanges().length;
  return `<div class="page coordination-page">${coordinationHeader("Control Panel", "调整下一次运行的模型、资源与边界。", "control")}
    <div class="draft-context"><div><span class="draft-version">草稿</span><strong>下一次运行</strong><span>不改写 Run 02 的历史配置</span></div><span id="draft-status" role="status" aria-live="polite">${changeCount ? `${changeCount} 项调整 · 未应用` : "无调整 · 未应用"}</span></div>
    <form id="control-form" class="control-layout" aria-label="下一次运行配置草稿" novalidate><div class="control-main">
      <section class="control-section">${section("模型分工", '<span class="control-section-note">样例配置 · 均未连接</span>')}
        <div class="routing-heading"><span>角色与职责</span><span>模型配置</span><span>权限范围</span></div>
        <div class="routing-list">${roleDefinitions.map(([id, title, duty, glyph, tone]) => `<div class="routing-row">${avatar("", tone, glyph)}<div class="routing-role"><label for="model-${id}">${title}</label><small>${duty}</small></div><div class="routing-select">${modelSelect(id, draft.models[id])}</div><span class="routing-permission">${id === "developer" ? "隔离写入" : id === "tester" ? "运行测试" : "只读"}</span></div>`).join("")}</div>
        <p class="control-inline-note">${icon("lock-keyhole")}切换模型不增加工具权限，也不自动扩大资料发送范围。</p>
      </section>
      <section class="control-section">${section("资源上限")}<div class="budget-fields">
        <label for="draft-parallel"><span>只读任务并行</span><div><input id="draft-parallel" data-draft-field="parallel" type="number" min="1" max="2" step="1" required aria-describedby="parallel-help parallel-error" value="${draft.parallel}" /><span>个</span></div><small id="parallel-help">1–2；代码写入保持独占</small><small class="field-error" id="parallel-error" aria-live="polite"></small></label>
        <label for="draft-calls"><span>模型调用上限</span><div><input id="draft-calls" data-draft-field="calls" type="number" min="1" max="24" step="1" required aria-describedby="calls-help calls-error" value="${draft.calls}" /><span>次</span></div><small id="calls-help">1–24；达到后停止新增调度</small><small class="field-error" id="calls-error" aria-live="polite"></small></label>
        <label for="draft-minutes"><span>运行时间上限</span><div><input id="draft-minutes" data-draft-field="minutes" type="number" min="1" max="60" step="1" required aria-describedby="minutes-help minutes-error" value="${draft.minutes}" /><span>分钟</span></div><small id="minutes-help">1–60；不含等待人工的时间</small><small class="field-error" id="minutes-error" aria-live="polite"></small></label>
      </div><div class="control-toggle-row"><div><label for="draft-stop">验证失败后暂停后续调度</label><p>关闭时只允许继续收集诊断证据；仍不能应用失败的变更。</p></div><label class="toggle" title="仅修改本地草稿"><input id="draft-stop" data-draft-toggle="stopOnFailure" type="checkbox" role="switch" ${draft.stopOnFailure ? "checked" : ""} /><span></span></label></div></section>
      <section class="control-section control-policy-section">${section("项目授权")}<dl class="control-policy"><div><dt>读取范围</dt><dd><code>src/retry/**</code><code>tests/retry/**</code></dd></div><div><dt>写入范围</dt><dd>上述路径的隔离工作区，需要单独授权</dd></div><div><dt>生产环境</dt><dd>${pill("不可访问")}</dd></div><div><dt>提交与发布</dt><dd>${pill("未授权")}</dd></div></dl></section>
      <div class="draft-actions"><p id="draft-error" class="draft-error" role="alert">${draftErrors().join("；")}</p><div><button class="button button-quiet" type="button" data-reset-draft ${changeCount ? "" : "disabled"}>${icon("refresh-cw")}撤销调整</button><button class="button button-primary" type="submit" id="preview-draft" ${changeCount && !draftErrors().length ? "" : "disabled"}>${icon("file-diff")}预览调整</button></div></div>
    </div><aside class="control-aside"><section>${section("本次配置的边界")}<div class="control-scope-item">${icon("folder-git-2")}<div><strong>payment-service</strong><small>项目固定，不能在这里跨项目授权</small></div></div><div class="control-scope-item">${icon("git-branch")}<div><strong>基线 a1b2c3</strong><small>执行前需要重新检查</small></div></div><div class="control-scope-item">${icon("shield-check")}<div><strong>授权不继承为永久允许</strong><small>模型、计划或成果变化要重新确认</small></div></div></section>
      <section class="budget-note">${section("用量与费用")}<dl><div><dt>Run 02 已返回 Token</dt><dd>10,650<span>仅调用片段</span></dd></div><div><dt>估算成本</dt><dd>未知<span>价格未配置</span></dd></div></dl><p>Token、调用数与时间可受限；金额未知时不保证精确费用上限。在途调用可能继续产生消耗。</p>${link("calls", "查看调用计量", "arrow-up-right", "text-link")}</section>
      <div class="local-draft-note">${icon("file-text")}本地草稿，刷新后重置。不会发送到模型或执行器。</div></aside></form></div>`;
}

function controlReview() {
  const errors = draftErrors();
  const changes = draftChanges();
  return `<div class="page coordination-page">${coordinationHeader("配置调整预览", "检查下一次运行的变更与影响。", "control")}
    <div class="draft-context"><div><span class="draft-version">草稿</span><strong>${changes.length} 项调整</strong><span>下一次运行 · 未应用</span></div>${link("control", "返回编辑", "pencil", "text-link")}</div>
    ${errors.length ? notice("amber", "草稿需要修正", errors.join("；"), link("control", "返回修正", "arrow-right", "text-link")) : ""}
    <div class="review-layout"><section>${section("配置差异")}<div class="draft-diff">${changes.length ? changes.map(({ name, before, after }) => `<div class="draft-diff-row"><strong>${name}</strong><span class="before-value">${before}</span>${icon("arrow-right")}<span class="after-value">${after}</span></div>`).join("") : '<div class="draft-no-change">没有配置调整。Run 02 的配置保持不变。</div>'}</div>
      <div class="draft-impact">${section("应用前仍需检查")}<ul><li>${icon("check")}确认模型连接、数据范围与必要能力</li><li>${icon("check")}检查代码基线和计划版本</li><li>${icon("check")}任何写入仍需单独授权</li></ul></div>
      <div class="draft-review-actions">${link("control", "继续编辑", "pencil")}${inert("应用配置", "check", "button button-primary")}</div><p class="unapplied-note">${icon("lock-keyhole")}未连接执行器，不能应用配置或开始新运行。</p>
    </section><aside class="review-unchanged">${section("未改变")}<p>${icon("shield-check")}项目权限与目录范围</p><p>${icon("git-branch")}Run 02 历史与成果</p><p>${icon("user-round")}人工审批与验证门槛</p>${link("super-agent", "返回任务协调", "arrow-up-right", "text-link")}</aside></div></div>`;
}

function home(empty = false) {
  if (empty) return `<div class="page">${heading("工作台", "所有项目，从这里开始。")}<div class="empty-state"><div class="empty-symbol">${icon("folder-git-2")}</div><h2>为下一个项目留一个位置</h2><p>关联代码或资料，再定义要完成的工作。</p><div class="panel-actions">${link("new-task", "创建第一项工作", "plus", "button button-primary")}${link("setup", "连接模型", "plug")}</div></div></div>`;
  return `<div class="page home-page">${heading("工作台", "你的项目、AI 协作和下一步决定。", link("new-task", "发起工作", "plus", "button button-primary"), "我的工作空间")}
    <div class="home-summary"><span><i class="live-dot"></i><strong>2</strong> 项工作进行中</span><span><i class="alert-dot"></i><strong>2</strong> 项需要你决定</span><span>${icon("files")}<strong>4</strong> 份项目成果</span></div>
    <div class="home-layout"><div class="home-main"><section class="attention-section">${section("需要我处理", '<span class="count-text">02</span>')}
      <a class="attention-row" href="#tests"><span class="attention-symbol tone-red">${icon("circle-x")}</span><div><div class="row-kicker">支付服务 <span>· Run 02</span></div><h3>重试策略调整</h3><p>重复扣款验证失败，候选变更等待修复。</p><div class="attention-meta">${pill("验证失败", "red")}<span>2 项通过 / 1 项失败</span></div></div><span class="round-arrow">${icon("arrow-up-right")}</span></a>
      <a class="attention-row" href="#new-task"><span class="attention-symbol tone-amber">${icon("circle-help")}</span><div><div class="row-kicker">支付服务 <span>· 草稿</span></div><h3>确认接口兼容范围</h3><p>继续研究前，需要明确旧版调用方的支持范围。</p><div class="attention-meta">${pill("等待输入", "amber")}<span>28 分钟前</span></div></div><span class="round-arrow">${icon("arrow-up-right")}</span></a>
    </section><section class="ongoing-section">${section("进行中的工作", link("project", "全部任务", "arrow-right", "text-link"))}
      <div class="work-item">${avatar("", "blue", "file-search")}<div><strong>分析扣款链路的依赖风险</strong><p>研究 Agent <span>·</span> 推理模型 B</p></div><div class="work-status">${pill("研究中", "blue")}<small>检查依赖清单</small></div>${iconLink("project", "arrow-up-right", "查看项目任务")}</div>
      <div class="work-item">${avatar("", "neutral", "terminal")}<div><strong>准备隔离工作区</strong><p>调度器 <span>·</span> 尚未调用模型</p></div><div class="work-status">${pill("等待资源")}<small>等待写入锁</small></div>${iconLink("queued", "arrow-up-right", "查看等待原因")}</div>
    </section></div><aside class="home-aside"><section>${section("最近项目", iconLink("new-task", "plus", "创建项目"))}<a class="project-entry" href="#project"><span class="project-initial">P</span><div><strong>支付服务</strong><small>payment-service</small></div>${icon("chevron-right")}</a><div class="project-entry muted"><span class="project-initial project-initial-secondary">D</span><div><strong>发布工具</strong><small>暂无进行中的工作</small></div></div></section>
      <section class="recent-deliverables">${section("最近成果")}<a href="#artifacts" class="deliverable-row">${icon("file-diff")}<div><strong>retry-policy.diff</strong><small>2 个文件 · Run 02</small></div>${icon("arrow-up-right")}</a><a href="#tests" class="deliverable-row">${icon("file-check-2")}<div><strong>幂等性验证报告</strong><small>1 项失败 · 10:24</small></div>${icon("arrow-up-right")}</a></section>
      <div class="context-boundary">${icon("shield-check")}<div><strong>工作区受限</strong><p>所有写入保留在隔离环境，主工作区未修改。</p>${link("project", "检查项目范围", "arrow-right", "text-link")}</div></div>
    </aside></div>
    <a class="quick-start" href="#new-task"><span class="quick-start-icon">${icon("command")}</span><span>描述下一项工作…</span><span class="quick-start-action">${icon("plus")}</span></a></div>`;
}

function project() {
  return `<div class="page">${heading("支付服务", "重试可靠性与接口兼容。", link("new-task", "发起工作", "plus", "button button-primary"), "项目 / PAYMENT SERVICE")}
    <div class="project-meta"><span>${icon("folder-git-2")}payment-service</span><span>${icon("git-branch")}<code>a1b2c3</code></span><span>${icon("shield-check")}限定项目范围</span></div>
    <nav class="local-tabs"><a class="is-active" href="#project">任务 <span>3</span></a><a href="#artifacts">成果 <span>4</span></a><a href="#new-task">上下文</a><a href="#setup">设置</a></nav>
    <div class="project-layout"><section>${section("项目任务", inert("筛选", "sliders-horizontal", "button button-quiet"))}
      ${[
        ["task", "重试策略调整", "为现有调用增加重试上限，验证扣款幂等性。", "需要处理", "amber", "Run 02", "2 项验证通过 · 1 项失败", "code-xml"],
        ["new-task", "接口兼容性研究", "评估调用方与新版错误码的兼容范围。", "草稿", "neutral", "尚未运行", "等待补充验收条件", "file-search"],
        ["artifacts", "重试链路调研", "调用链分析、边界约束和风险说明。", "已接受", "green", "Run 01", "方案 v1 · 昨天", "file-text"],
      ].map(([route, title, description, status, tone, run, meta, glyph]) => `<a href="#${route}" class="project-task-row">${avatar("", tone === "neutral" ? "neutral" : "blue", glyph)}<div><h3>${title}</h3><p>${description}</p><div class="row-bottom"><span>${run}</span><span>${meta}</span></div></div><div class="project-task-state">${pill(status, tone)}${icon("arrow-up-right")}</div></a>`).join("")}
    </section><aside class="project-context">${section("项目上下文")}<dl class="definition-list"><dt>代码基线</dt><dd><code>a1b2c3</code></dd><dt>允许访问</dt><dd><code>src/retry/**</code><br /><code>tests/retry/**</code></dd><dt>写入范围</dt><dd>上述路径，隔离工作区</dd><dt>执行约束</dt><dd>不改生产配置<br />不自动合并主分支</dd><dt>资料引用</dt><dd>${icon("file-text")}接口说明 v2</dd></dl><div class="context-boundary">${icon("lock-keyhole")}<p>资料不自动发送到其他模型连接。</p></div></aside></div></div>`;
}

function taskSidebar() {
  return `<aside id="inspector-pane" class="evidence-inspector" aria-label="成果检查">
    <div class="inspector-toolbar"><div class="evidence-tabs" role="tablist" aria-label="成果类型"><button id="evidence-code-tab" role="tab" aria-selected="true" aria-controls="evidence-code" tabindex="0" data-evidence-tab="code">${icon("file-diff")}代码变更<span>2</span></button><button id="evidence-tests-tab" role="tab" aria-selected="false" aria-controls="evidence-tests" tabindex="-1" data-evidence-tab="tests">${icon("file-check-2")}验证<span class="failed-count">1</span></button></div>${iconLink("artifacts", "arrow-up-right", "独立查看成果")}</div>
    <div class="evidence-version"><span>${icon("git-branch")}<code>a1b2c3</code>${icon("arrow-right")}<code>d4e5f6</code></span><span class="diff-stats">+5 <span>−2</span></span></div>
    <div id="evidence-code" role="tabpanel" aria-labelledby="evidence-code-tab" class="evidence-panel">
      <div class="editor-file">${icon("file-code-2")}<span>src / retry / <strong>policy.ts</strong></span><span class="language-tag">TS</span></div>
      ${studioCode()}
      <div class="inline-code-review">${avatar("T", "red")}<div><strong>幂等键没有在重试间复用</strong><p>每次循环创建新标识，导致同一请求重复扣款。</p>${link("tests", "检查测试证据", "arrow-up-right", "text-link")}</div></div>
    </div>
    <div id="evidence-tests" role="tabpanel" aria-labelledby="evidence-tests-tab" class="evidence-panel" hidden><div class="studio-tests">${testEvidence()}</div></div>
    <div class="inspector-settlement"><span>${icon("lock-keyhole")}候选变更未应用</span>${inert("应用变更", "git-merge")}</div>
  </aside>`;
}

function task() {
  return `<div class="task-page studio-page">${taskHeader("task")}
    <div class="studio-view-switch" role="tablist" aria-label="工作区面板"><button role="tab" aria-selected="true" aria-controls="work-pane" tabindex="0" data-studio-view="work">工作记录</button><button role="tab" aria-selected="false" aria-controls="inspector-pane" tabindex="-1" data-studio-view="evidence">成果检查<span>2</span></button></div>
    <div class="task-studio" data-view="work"><section id="work-pane" class="work-pane" aria-label="工作记录">
      <div class="work-pane-heading"><span class="pane-label">工作记录</span>${link("calls", "4 次模型调用", "network", "text-link")}</div>
      <div class="workstream">
        <details class="original-request"><summary><span>${icon("file-text")}原始目标</span><span>林然 · 10:15${icon("chevron-down")}</span></summary><div><p>为重试设置上限，保持接口兼容，并确保同一个请求只扣款一次。</p><div class="context-reference">${icon("folder-git-2")}payment-service<span>src/retry · tests/retry</span></div></div></details>
        <article class="activity-item">${avatar("", "neutral", "command")}<div class="activity-content"><div class="activity-heading"><a href="#super-agent" class="agent-profile-link">Super-agent${icon("arrow-up-right")}</a><span>推理模型 B</span><time>10:16</time></div><p>研究调用点与设计验证条件并行进行。代码修改由一个开发 Agent 在隔离工作区执行。</p>
          <div class="agent-assignment"><a href="#delegation">${avatar("R", "blue")}<span>研究</span></a><a href="#delegation">${avatar("D", "green")}<span>开发</span></a><a href="#delegation">${avatar("T", "amber")}<span>测试</span></a><a href="#calls" class="assignment-models">2 种模型${icon("arrow-up-right")}</a></div>
          <details class="compact-plan"><summary><span>${icon("git-branch")}执行计划 v2</span><span>3 / 5 完成${icon("chevron-down")}</span></summary><div class="compact-plan-rows">${planData.map(([title, role, model, permission, state, tone]) => `<a href="#${tone === "red" ? "tests" : "dispatch"}"><span>${icon(tone === "green" ? "check" : tone === "red" ? "x" : "minus")}${title}</span>${pill(state, tone)}</a>`).join("")}</div></details>
        </div></article>
        <article class="activity-item">${avatar("D", "green")}<div class="activity-content"><div class="activity-heading"><strong>开发 Agent</strong><span>代码模型 A</span><time>10:21</time></div><p>候选变更已保存，正在交给测试 Agent 验证。</p><a href="#artifacts" class="inline-artifact">${icon("file-diff")}2 个文件变更<span>+5 −2</span>${icon("arrow-up-right")}</a></div></article>
        <article class="activity-item verification-activity">${avatar("T", "red")}<div class="activity-content"><div class="activity-heading"><strong>测试 Agent</strong><span>代码模型 A</span><time>10:24</time></div><p>重试上限与接口兼容验证通过，但<strong class="tone-red-text">重复扣款保护未通过</strong>。</p><a href="#tests" class="verification-result"><span class="verification-count"><strong>2</strong> 通过<span></span><strong class="tone-red-text">1</strong> 失败</span><span>查看证据${icon("arrow-up-right")}</span></a><p class="failure-explanation">幂等键在每次重试时重新生成。修复后需要重新执行验证，当前变更尚未应用。</p></div></article>
      </div>
      <div class="composer"><label for="task-follow-up" class="sr-only">补充任务要求</label><textarea id="task-follow-up" readonly rows="2" placeholder="补充要求，或要求 Agent 修复这次结果…"></textarea><div class="composer-actions"><span>${icon("paperclip")}项目上下文</span><span class="composer-mode">${icon("shield-check")}写入前确认</span>${inert("发送", "arrow-up", "button button-primary")}</div></div>
    </section>${taskSidebar()}</div>
    <div class="workspace-status"><span>${icon("shield-check")}ws-02 · 隔离工作区</span><span>${icon("git-branch")}候选 d4e5f6</span><span>主工作区未修改</span></div></div>`;
}

function studioCode() {
  return `<pre class="studio-code" tabindex="0" aria-label="候选代码变更"><code><span class="editor-line"><i>18</i><span><b class="syntax-violet">export async function</b> <b class="syntax-blue">retryPayment</b>(request) {</span></span>
<span class="editor-line code-add"><i>19</i><span>  <b class="syntax-violet">const</b> maxAttempts = <b class="syntax-amber">3</b>;</span></span>
<span class="editor-line code-add"><i>20</i><span>  <b class="syntax-violet">for</b> (<b class="syntax-violet">let</b> attempt = <b class="syntax-amber">0</b>;</span></span>
<span class="editor-line code-add"><i>21</i><span>       attempt &lt; maxAttempts; attempt++) {</span></span>
<span class="editor-line"><i>22</i><span>    <b class="syntax-violet">try</b> {</span></span>
<span class="editor-line code-add line-selected"><i>23</i><span>      <b class="syntax-violet">const</b> key = <b class="syntax-blue">createIdempotencyKey</b>();</span></span>
<span class="editor-line code-add"><i>24</i><span>      <b class="syntax-violet">return await</b> <b class="syntax-blue">charge</b>(request, key);</span></span>
<span class="editor-line"><i>25</i><span>    } <b class="syntax-violet">catch</b> (error) {</span></span>
<span class="editor-line code-add"><i>26</i><span>      <b class="syntax-violet">if</b> (!<b class="syntax-blue">shouldRetry</b>(error)) {</span></span>
<span class="editor-line"><i>27</i><span>        <b class="syntax-violet">throw</b> error;</span></span>
<span class="editor-line"><i>28</i><span>      }</span></span>
<span class="editor-line"><i>29</i><span>    }</span></span>
<span class="editor-line"><i>30</i><span>  }</span></span>
<span class="editor-line"><i>31</i><span>}</span></span></code></pre>`;
}

function node(title, subtitle, state, tone = "green", route = "calls", glyph = "bot") {
  return `<a class="graph-node graph-node-${tone}" href="#${route}"><div class="node-top">${avatar("", tone === "red" ? "red" : tone === "neutral" ? "neutral" : "blue", glyph)}${pill(state, tone)}</div><strong>${title}</strong><span>${subtitle}</span><div class="node-footer">${icon("network")}<span>检查执行记录</span>${icon("arrow-up-right")}</div></a>`;
}

function dispatch(delegation = false) {
  const graph = delegation
    ? `<div class="delegation-diagram"><div class="tree-root">${node("协调 Agent", "推理模型 B · 计划与汇总", "执行结束", "neutral", "calls", "command")}</div><div class="tree-trunk"></div><div class="tree-children">${node("研究 Agent", "推理模型 B · 只读", "完成", "green", "calls", "file-search")}${node("开发 Agent", "代码模型 A · ws-02 写入", "完成", "green", "artifacts", "code-xml")}${node("测试 Agent", "代码模型 A · 测试", "验证失败", "red", "tests", "file-check-2")}</div></div>`
    : `<div class="dependency-diagram"><div class="parallel-stage">${node("研究调用点", "研究 · 推理模型 B", "完成", "green", "calls", "file-search")}${node("设计验证条件", "测试 · 推理模型 B", "完成", "green", "calls", "file-check-2")}</div><div class="graph-join"><svg viewBox="0 0 48 360" preserveAspectRatio="none" aria-hidden="true"><path d="M0 85H22V180H48M0 275H22V180" /></svg></div>${node("修改与自测", "开发 · 代码模型 A", "完成", "green", "artifacts", "code-xml")}<span class="graph-arrow">${icon("arrow-right")}</span>${node("验证幂等性", "测试 · 代码模型 A", "失败", "red", "tests", "file-check-2")}</div>`;
  return `<div class="task-page">${taskHeader("dispatch")}<div class="view-toolbar"><nav class="segmented" aria-label="调度关系"><a href="#dispatch" ${!delegation ? 'aria-current="page"' : ""}>任务依赖</a><a href="#delegation" ${delegation ? 'aria-current="page"' : ""}>Agent 委派</a></nav><span class="view-timestamp">${icon("git-branch")}计划 v2 <span>·</span> 最后确认 10:24</span></div>
    <div class="graph-surface">${graph}<div class="graph-legend"><span><i class="legend-dot dot-green"></i>已完成</span><span><i class="legend-dot dot-red"></i>失败</span><span><i class="legend-dot dot-neutral"></i>等待</span><span class="graph-pending">下一步：审查成果，等待修复</span></div></div>
    <div class="mobile-dependency-list">${planData.map(([title, role, model, permission, state, tone, glyph], index) => `<a href="#${tone === "red" ? "tests" : "calls"}" class="dependency-list-row">${avatar("", tone === "red" ? "red" : "neutral", glyph)}<div><strong>${delegation ? role : title}</strong><small>${model} · ${permission}</small></div>${pill(state, tone)}</a>`).join("")}</div>
    <section class="selection-panel"><div><div class="eyebrow">当前检查的步骤</div><h2>验证扣款幂等性</h2><p>同一请求的重试必须复用幂等键。</p></div><dl class="selection-facts"><div><dt>负责 Agent</dt><dd>测试 Agent</dd></div><div><dt>模型配置</dt><dd>代码模型 A</dd></div><div><dt>候选版本</dt><dd><code>d4e5f6</code></dd></div><div><dt>验证结果</dt><dd class="tone-red-text">重复扣款保护失败</dd></div></dl><div class="panel-actions">${link("tests", "查看验证证据", "arrow-up-right", "button button-primary")}${link("calls", "关联调用", "network")}</div></section></div>`;
}

function callRows(filter = "all") {
  return callData.filter(([id, , , , tone]) => filter === "failed" ? tone === "red" : filter === "model" ? id.startsWith("mc") : filter === "tool" ? id.startsWith("tc") : true)
    .map(([id, role, model, status, tone, duration, input, output]) => `<tr class="${tone === "red" ? "row-failed" : ""}"><td>${id === "mc-023" ? `<a href="#call-detail" class="mono text-link">${id}${icon("arrow-up-right")}</a>` : `<span class="mono">${id}</span>`}</td><td>${role}</td><td><span class="model-cell">${icon(id.startsWith("tc") ? "terminal" : "blocks")}${model}</span></td><td>${pill(status, tone)}</td><td class="mono">${duration}</td><td class="mono">${input}</td><td class="mono">${output}</td></tr>`).join("");
}

function calls(detail = false) {
  return `<div class="task-page">${taskHeader("calls")}<div class="call-layout ${detail ? "has-inspector" : ""}"><div class="calls-primary">
    <div class="metric-band"><div><span>运行耗时</span><strong>8<span>m</span> 12<span>s</span></strong><small>墙钟时间</small></div><div><span>本页模型调用</span><strong>4 <span>次</span></strong><small><i class="alert-dot"></i>1 次失败</small></div><div><span>本页已返回 Token</span><strong>10,650</strong><small>未包含用量缺失请求</small></div><div><span>估算成本</span><strong class="metric-unknown">未知</strong><small>价格未配置</small></div></div>
    <section class="timeline-section">${section("Agent 执行时间线", '<span class="subtle">样例时间 / UTC+8</span>')}<div class="time-ruler"><span>10:16</span><span>10:18</span><span>10:20</span><span>10:22</span><span>10:24</span></div>
    <div class="swimlane"><span><i class="legend-dot dot-blue"></i>研究 Agent</span><div class="lane-track"><span class="time-bar bar-blue" style="--start:2%;--length:19%">研究</span></div></div>
    <div class="swimlane"><span><i class="legend-dot dot-neutral"></i>测试 Agent</span><div class="lane-track"><span class="time-bar bar-neutral" style="--start:3%;--length:18%">测试设计</span><a href="#call-detail" title="mc-023 请求超时" class="time-bar bar-red" style="--start:74%;--length:10%">失败</a><span class="time-bar bar-amber" style="--start:86%;--length:12%">验证</span></div></div>
    <div class="swimlane"><span><i class="legend-dot dot-green"></i>开发 Agent</span><div class="lane-track"><span class="time-bar bar-green" style="--start:24%;--length:44%">修改与自测</span></div></div></section>
    <div class="table-toolbar">${section("调用明细", '<span class="count-text" id="call-count">5 条</span>')}<div class="call-filters" role="group" aria-label="筛选调用">${[["all", "全部"], ["failed", "失败"], ["model", "模型"], ["tool", "工具"]].map(([value, label]) => `<button type="button" data-call-filter="${value}" aria-pressed="${value === "all"}">${label}</button>`).join("")}</div></div>
    <div class="table-scroll" tabindex="0" aria-label="调用明细，可横向滚动"><table class="calls-table"><thead><tr><th>调用 ID</th><th>Agent</th><th>模型 / 工具</th><th>状态</th><th>耗时</th><th>输入</th><th>输出</th></tr></thead><tbody>${callRows()}</tbody></table></div>
    <p class="table-footnote">${icon("circle-help")}当前为调用片段；只汇总已返回的叶子调用，不重复计入 Agent 汇总值。</p></div>${detail ? callInspector() : ""}</div></div>`;
}

function callInspector() {
  return `<aside class="call-inspector"><div class="inspector-title"><span class="mono">mc-023</span>${iconLink("calls", "x", "关闭调用详情")}</div><div class="inspector-model">${avatar("", "red", "blocks")}<div><h2>代码模型 A</h2><p>测试 Agent · 尝试 1</p></div></div>${pill("请求超时", "red")}
    <dl class="definition-list"><dt>所属步骤</dt><dd>验证扣款幂等性</dd><dt>请求配置</dt><dd><code>coding-a</code></dd><dt>返回模型</dt><dd>未知 · Provider 未返回</dd><dt>调用开始</dt><dd class="mono">10:22:03</dd><dt>耗时</dt><dd class="mono">30.0s</dd><dt>错误类别</dt><dd><code>provider_timeout</code></dd><dt>Token 用量</dt><dd>未返回</dd><dt>关联重试</dt><dd><code>mc-024</code> · 尝试 2</dd></dl>
    <section class="inspector-section"><h3>输入摘要</h3><p>根据候选变更检查重复请求与重试边界，引用允许范围内的测试文件。</p><span class="privacy-note">${icon("lock-keyhole")}原始内容未采集</span></section><div class="panel-actions">${link("dispatch", "所属步骤", "git-branch")}${link("tests", "验证证据", "file-check-2")}</div></aside>`;
}

function artifacts(tests = false) {
  return `<div class="task-page">${taskHeader("task")}<div class="artifact-heading"><div><div class="eyebrow">候选成果 / RUN 02</div><h2>${tests ? "验证证据" : "代码变更"}</h2><p>变更保留于隔离工作区，尚未应用到主工作区。</p></div>${inert("应用变更", "git-merge", "button button-primary")}</div><nav class="local-tabs"><a class="${!tests ? "is-active" : ""}" href="#artifacts">代码变更 <span>2</span></a><a class="${tests ? "is-active" : ""}" href="#tests">验证证据 <span>3</span></a><a href="#audit">审查记录</a></nav>
    ${tests ? testEvidence() : diffEvidence()}<div class="outcome-footer"><span>${icon("lock-keyhole")}验证未通过，应用变更被阻止。</span>${link("new-task", "要求修改", "pencil", "button button-primary")}</div></div>`;
}

function diffEvidence() {
  return `<div class="artifact-context">${versions}<span>2 个文件</span><span class="diff-stats">+5 <span>−2</span></span></div><div class="diff-layout"><aside class="file-list"><div class="file-list-heading">文件变更 <span>2</span></div><a class="is-active" href="#artifacts">${icon("file-code-2")}<span>src/retry/policy.ts</span><b>M</b></a><a href="#tests">${icon("file-check-2")}<span>tests/retry/policy.test.ts</span><b>M</b></a></aside><div class="diff-content"><div class="code-title">${icon("file-code-2")}<span>src/retry/policy.ts</span><span class="mono">TypeScript</span></div><pre class="code-preview" tabindex="0" aria-label="代码变更示例"><code><span class="code-line"><i>18</i>  export async function retryPayment(request) {</span>
<span class="code-line code-remove"><i>19</i>−   while (shouldRetry(error)) {</span>
<span class="code-line code-add"><i>19</i>+   const maxAttempts = 3;</span>
<span class="code-line code-add"><i>20</i>+   for (let attempt = 0; attempt &lt; maxAttempts; attempt++) {</span>
<span class="code-line"><i>21</i>      try {</span>
<span class="code-line code-remove"><i>22</i>−       return await charge(request);</span>
<span class="code-line code-add"><i>22</i>+       const key = createIdempotencyKey();</span>
<span class="code-line code-add"><i>23</i>+       return await charge(request, key);</span>
<span class="code-line"><i>24</i>      } catch (error) {</span>
<span class="code-line code-add"><i>25</i>+       if (!shouldRetry(error)) throw error;</span>
<span class="code-line"><i>26</i>      }</span>
<span class="code-line"><i>27</i>    }</span>
<span class="code-line"><i>28</i>  }</span></code></pre><div class="code-finding">${icon("circle-x")}<div><strong>幂等键在每次重试时重新生成</strong><p>同一请求没有复用相同标识，验证中发生重复扣款。</p>${link("tests", "查看失败证据", "arrow-up-right", "text-link")}</div></div></div></div>`;
}

function testEvidence() {
  return `<div class="test-summary"><div><span class="test-big-count">02<span>/ 03</span></span><div><strong>2 项通过，1 项失败</strong><p>候选 d4e5f6 · Run 02</p></div></div>${pill("未达到应用门槛", "red")}</div><div class="test-list">${[
    ["重试次数不超过上限", "retry-limit.test", "0.3s", true],
    ["相同请求仅扣款一次", "idempotency.test", "0.4s", false],
    ["现有接口保持兼容", "compatibility.test", "0.2s", true],
  ].map(([title, file, time, passed]) => `<div class="test-row ${passed ? "" : "test-row-failed"}"><span class="test-result-icon ${passed ? "tone-green" : "tone-red"}">${icon(passed ? "circle-check" : "circle-x")}</span><div><strong>${title}</strong><small>${file}</small></div><span class="mono test-duration">${time}</span>${pill(passed ? "通过" : "失败", passed ? "green" : "red")}</div>`).join("")}</div><section class="evidence-section">${section("执行证据", link("calls", "关联调用", "arrow-up-right", "text-link"))}<dl class="evidence-facts"><div><dt>执行命令</dt><dd><code>npm test -- --run tests/retry</code></dd></div><div><dt>环境</dt><dd>ws-02 · Node 22 · 测试环境</dd></div><div><dt>退出码</dt><dd><code>1</code></dd></div><div><dt>执行时间</dt><dd class="mono">10:23:58 – 10:24:00</dd></div></dl><div class="terminal-header">${icon("terminal")}<span>测试输出</span><span class="terminal-error">exit 1</span></div><pre class="test-output" tabindex="0" aria-label="失败测试输出示例"><code><span>FAIL</span> tests/retry/idempotency.test.ts

  Expected charge count: 1
  Received charge count: 2

  2 passed · 1 failed</code></pre></section>`;
}

function approval() {
  return `<div class="task-page">${taskHeader("task", "approval")}<div class="decision-layout"><section class="review-action-page"><div class="decision-heading">${avatar("", "blue", "shield-check")}<div><div class="eyebrow">单次授权 / AP-003</div><h2>将候选变更应用到工作区</h2><p>不包含提交、合并或部署。</p></div></div><dl class="action-facts">${[
    ["目标", "payment-service / 目标工作区"],
    ["授权主体", "林然 · 项目所有者"],
    ["代码版本", '<code>a1b2c3</code> → <code>f7a8b9</code>'],
    ["成果与计划", "retry-policy.diff v3 · 计划 v3 · Run 03"],
    ["影响范围", "2 个文件，仅限 src/retry 与 tests/retry"],
    ["前置检查", `${pill("3 项验证通过", "green")}目标基线未变化`],
    ["授权有效期", "到 11:30；目标或内容变化后立即失效"],
  ].map(([key, value]) => `<div><dt>${key}</dt><dd>${value}</dd></div>`).join("")}</dl><details class="approval-diff"><summary>${icon("file-diff")}查看实际变更摘要${icon("chevron-down")}</summary><div><code>src/retry/policy.ts</code><p>幂等键移到重试循环外，同一请求复用标识。</p><code>tests/retry/policy.test.ts</code><p>补充重复请求验证，3 项测试通过。</p></div></details><div class="approval-actions">${inert("拒绝", "x")}${inert("要求修改", "pencil")}${inert("批准本次", "check", "button button-primary")}</div></section><aside class="decision-aside">${section("授权边界")}<div class="boundary-item">${icon("check")}仅本次指定变更</div><div class="boundary-item">${icon("check")}应用前保存目标状态</div><div class="boundary-item">${icon("x")}不授权其他目录</div><div class="boundary-item">${icon("x")}不自动提交或部署</div><div class="decision-note">${icon("circle-help")}<p>批准后另行检查执行结果。版本变化会使旧授权失效；回退需要再次确认。</p></div></aside></div></div>`;
}

function recovery() {
  return `<div class="task-page">${taskHeader("task", "recovery")}<div class="recovery-page">${notice("amber", "取消已请求，写入结果待核查", "已停止新增调度。一次写入命令未返回，不能确认是否存在部分修改。")}<div class="recovery-facts"><section>${section("已确认", icon("check"))}<ul class="plain-checks"><li>${icon("circle-check")}模型调用已中断</li><li>${icon("circle-check")}两个只读子任务已结束</li><li>${icon("circle-check")}已有成果与日志保留</li></ul></section><section>${section("待核查", icon("circle-help"))}<ul class="plain-checks"><li>${icon("circle-help")}文件写入是否全部完成</li><li>${icon("circle-help")}工作区是否存在部分修改</li></ul></section></div><section class="evidence-section">${section("关联动作")}<dl class="evidence-facts"><div><dt>工具调用</dt><dd><code>tc-041</code></dd></div><div><dt>执行环境</dt><dd>隔离工作区 ws-04</dd></div><div><dt>写入目标</dt><dd><code>src/retry/policy.ts</code></dd></div><div><dt>最后确认</dt><dd>请求已发出，退出状态未返回</dd></div></dl></section><div class="recovery-actions"><div>${avatar("", "blue", "search")}<div><h3>只读核查工作区</h3><p>比对文件与基线，确认上次动作的实际结果。</p></div>${inert("开始核查", "search", "button button-primary")}</div><div>${avatar("", "neutral", "user-round")}<div><h3>由我接管</h3><p>保留现状和证据，停止后续 Agent 操作。</p></div>${inert("人工接管", "user-round")}</div></div><p class="blocked-action">${icon("lock-keyhole")}重试已禁用：先确认上一次动作的实际结果。</p></div></div>`;
}

function audit() {
  const rows = [["10:24:00", "工具", "验证执行结束", "退出码 1，2 项通过，1 项失败。", "tests", "file-check-2", "red"], ["10:22:35", "调度器", "创建第 2 次调用尝试", "mc-024 关联失败调用 mc-023。", "calls", "network", "blue"], ["10:22:33", "Provider", "模型请求超时", "mc-023 未返回 Token 用量。", "call-detail", "circle-alert", "amber"], ["10:21:04", "开发 Agent", "保存候选成果", "d4e5f6，仅在隔离工作区保存，未应用。", "artifacts", "file-diff", "green"], ["10:18:12", "林然", "授权隔离写入", "指定目录，计划 v2，仅本次运行。", "dispatch", "shield-check", "neutral"], ["10:15:42", "林然", "确认计划 v2", "新增幂等性验证要求，保留 v1 历史。", "task", "check", "neutral"]];
  return `<div class="task-page">${taskHeader("audit")}<div class="audit-toolbar">${section("操作记录", '<span class="count-text">06</span>')}<span class="privacy-note">${icon("lock-keyhole")}普通审计记录，非防篡改证明</span></div><div class="audit-list">${rows.map(([time, actor, title, detail, route, glyph, tone]) => `<a href="#${route}" class="audit-row"><time class="mono">${time}</time>${avatar("", tone, glyph)}<div><div class="audit-title"><strong>${title}</strong><span>${actor}</span></div><p>${detail}</p></div>${icon("arrow-up-right")}</a>`).join("")}</div></div>`;
}

function setup() {
  return `<div class="page narrow-page">${heading("连接能力", "按项目授权模型、工具和环境。", "", "工作空间 / CONNECTIONS")}<nav class="local-tabs"><a class="is-active" href="#setup">模型连接</a><a href="#new-task">项目工具</a><a href="#project">访问范围</a></nav><div class="connection-summary">${avatar("", "neutral", "plug")}<div><strong>尚未连接模型</strong><p>选择连接后，再为项目指定可使用的模型。</p></div>${pill("未连接")}</div><form class="design-form"><label>连接名称<input readonly value="我的研发模型" /></label><label>API 地址<input readonly type="url" placeholder="https://your-provider.example/v1" /></label><label>API Key<input readonly type="password" placeholder="未配置" /></label><label>模型标识<input readonly placeholder="选择或输入模型标识" /></label><p class="privacy-note">${icon("lock-keyhole")}密钥不进入任务对话和普通日志。</p><div class="form-actions">${inert("测试连接", "plug")}${inert("保存连接", "check", "button button-primary")}</div></form></div>`;
}

function newTask() {
  return `<div class="page narrow-page">${heading("发起工作", "定义目标，AI 将生成可审查的执行计划。", iconLink("project", "x", "返回项目"), "支付服务 / NEW TASK")}<form class="design-form"><label>希望完成什么<textarea readonly rows="3">为重试设置上限，保持接口兼容，确保相同请求只扣款一次。</textarea></label><label>验收条件<textarea readonly rows="3">最多重试 3 次；重复请求只扣款一次；现有接口测试通过。</textarea></label><fieldset><legend>引用上下文</legend><label class="check-field"><input type="checkbox" checked disabled /><span>${icon("folder-git-2")}payment-service <small>a1b2c3</small></span></label><label class="check-field"><input type="checkbox" checked disabled /><span>${icon("file-text")}接口说明 v2</span></label></fieldset><div class="form-split"><label>执行范围<select disabled><option>先分析，写入前确认</option></select></label><label>调用上限<input readonly type="number" value="12" /></label></div><details class="advanced-settings"><summary>模型与委派${icon("chevron-down")}</summary><div class="form-split"><label>开发与测试<select disabled><option>代码模型 A</option></select></label><label>研究与审查<select disabled><option>推理模型 B</option></select></label></div><p>最多两个只读子任务并行，代码工作区仅一个写入者。</p></details><p class="privacy-note">${icon("shield-check")}限定 src/retry 与 tests/retry，不修改生产配置。</p><div class="form-actions">${inert("保存草稿", "file-text")}${inert("生成计划", "arrow-right", "button button-primary")}</div></form></div>`;
}

function stateScreen(state) {
  const spec = {
    queued: ["clock-3", "neutral", "等待隔离工作区", "工作区仍由前一项写入任务持有。模型尚未调用，本次没有产生模型用量。", [["进入队列", "10:12:05"], ["等待资源", "ws-01 写入锁"], ["可并行工作", "只读资料检查"], ["下一个步骤", "研究现有调用点"]]],
    offline: ["unplug", "amber", "连接中断，状态待同步", "最后确认于 10:18:02。浏览器断线不代表任务已取消，新的结果需要在重连后确认。", [["最后状态", "研究 Agent 正在读取文件"], ["最后事件", "event-018"], ["新事件", "尚未同步"], ["控制请求", "当前无法确认送达"]]],
    budget: ["pause", "amber", "调用上限已达到", "已停止新增调度。已有成果保留，不会自动切换模型继续执行；在途调用仍可能产生用量。", [["调用上限", "12 次"], ["已完成", "11 次"], ["在途调用", "1 次，用量待返回"], ["金额成本", "未知，价格未配置"]]],
  }[state];
  const [glyph, tone, title, detail, facts] = spec;
  return `<div class="task-page">${taskHeader("task", state)}<div class="state-page"><div class="state-symbol ${tone === "amber" ? "tone-amber" : "tone-blue"}">${icon(glyph)}</div><h2>${title}</h2><p class="state-description">${detail}</p><dl class="state-facts">${facts.map(([key, value]) => `<div><dt>${key}</dt><dd>${value}</dd></div>`).join("")}</dl><div class="panel-actions">${inert(state === "offline" ? "重新同步" : state === "budget" ? "调整本次上限" : "取消排队", state === "offline" ? "refresh-cw" : state === "budget" ? "sliders-horizontal" : "square", "button button-primary")}${inert("查看已有成果", "files")}</div></div></div>`;
}

const renderers = { workbench: () => home(), project, task, "super-agent": superAgent, control: controlPanel, "control-review": controlReview, dispatch: () => dispatch(false), delegation: () => dispatch(true), calls: () => calls(false), "call-detail": () => calls(true), artifacts: () => artifacts(false), tests: () => artifacts(true), approval, recovery, audit, setup, "new-task": newTask, empty: () => home(true), queued: () => stateScreen("queued"), offline: () => stateScreen("offline"), budget: () => stateScreen("budget") };

function rememberView() {
  if (!currentScreen) return;
  uiState.details[currentScreen] = Array.from(document.querySelectorAll("main details"), (element) => element.open);
  uiState.scroll[currentScreen] = {
    page: window.scrollY,
    work: $(".workstream")?.scrollTop || 0,
    code: $("#evidence-code")?.scrollTop || 0,
    tests: $("#evidence-tests")?.scrollTop || 0,
  };
}

function selectEvidence(selected) {
  uiState.evidence = selected;
  document.querySelectorAll("[data-evidence-tab]").forEach((tab) => {
    const active = tab.dataset.evidenceTab === selected;
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  });
  if ($("#evidence-code")) $("#evidence-code").hidden = selected !== "code";
  if ($("#evidence-tests")) $("#evidence-tests").hidden = selected !== "tests";
}

function selectStudio(selected) {
  uiState.studio = selected;
  if ($(".task-studio")) $(".task-studio").dataset.view = selected;
  document.querySelectorAll("[data-studio-view]").forEach((tab) => {
    const active = tab.dataset.studioView === selected;
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  });
}

function filterCalls(selected) {
  uiState.callFilter = selected;
  document.querySelectorAll("[data-call-filter]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.callFilter === selected)));
  if ($(".calls-table tbody")) {
    $(".calls-table tbody").innerHTML = callRows(selected);
    $("#call-count").textContent = `${$(".calls-table tbody").children.length} 条`;
  }
}

function updateDraftStatus() {
  const changes = draftChanges();
  const errors = draftErrors();
  if ($("#draft-status")) $("#draft-status").textContent = changes.length ? `${changes.length} 项调整 · 未应用` : "无调整 · 未应用";
  if ($("#draft-error")) $("#draft-error").textContent = errors.join("；");
  if ($("#preview-draft")) $("#preview-draft").disabled = !changes.length || errors.length > 0;
  if ($("[data-reset-draft]")) $("[data-reset-draft]").disabled = !changes.length;
  if ($("#coordination-draft-dot")) $("#coordination-draft-dot").hidden = !changes.length;
  document.querySelectorAll("[data-draft-field]").forEach((input) => {
    const invalid = !input.checkValidity();
    input.setAttribute("aria-invalid", String(invalid));
    const [name, , minimum, maximum] = draftLimits.find(([name]) => name === input.dataset.draftField);
    $(`#${name}-error`).textContent = invalid ? `请输入 ${minimum}–${maximum} 的整数` : "";
  });
}

function render() {
  const route = location.hash.slice(1);
  if (route === "main") { $("#main").focus(); return; }
  rememberView();
  const id = Object.hasOwn(renderers, route) ? route : "task";
  const [, name, title, context] = screens.find(([screen]) => screen === id);
  const active = ["workbench", "empty"].includes(id) ? "workbench" : id === "super-agent" ? "super-agent" : ["control", "control-review"].includes(id) ? "control" : id === "setup" ? "setup" : ["artifacts", "tests"].includes(id) ? "artifacts" : "project";
  $("#app-nav").innerHTML = navigation(active);
  $("#mobile-navigation").innerHTML = navigation(active);
  $("#app-header").innerHTML = header(title, !["workbench", "empty", "project", "setup"].includes(id));
  $("#main").innerHTML = renderers[id]();
  $("#screen-picker").value = id;
  $("#review-footer").innerHTML = `<span><strong>${name}</strong> <i>·</i> ${context}</span><span>${icon("lock-keyhole")}静态示例 · 无真实调用或操作</span>`;
  document.title = `${name} · Workbench 视觉提案 V2`;
  document.body.dataset.screen = id;
  currentScreen = id;
  selectEvidence(uiState.evidence);
  selectStudio(uiState.studio);
  filterCalls(uiState.callFilter);
  updateDraftStatus();
  document.querySelectorAll("main details").forEach((element, index) => { element.open = uiState.details[id]?.[index] || false; });
  const savedScroll = uiState.scroll[id] || {};
  if ($(".workstream")) $(".workstream").scrollTop = savedScroll.work || 0;
  if ($("#evidence-code")) $("#evidence-code").scrollTop = savedScroll.code || 0;
  if ($("#evidence-tests")) $("#evidence-tests").scrollTop = savedScroll.tests || 0;
  $("#navigation-dialog").close();
  $("#main").focus({ preventScroll: true });
  window.scrollTo(0, savedScroll.page || 0);
}
window.addEventListener("hashchange", render);
document.addEventListener("change", (event) => {
  if (event.target.id === "screen-picker") location.hash = event.target.value;
  if (event.target.matches("[data-draft-model]")) {
    uiState.draft.models[event.target.dataset.draftModel] = event.target.value;
    updateDraftStatus();
  }
  if (event.target.matches("[data-draft-toggle]")) {
    uiState.draft[event.target.dataset.draftToggle] = event.target.checked;
    updateDraftStatus();
  }
});
document.addEventListener("input", (event) => {
  if (event.target.matches("[data-draft-field]")) {
    uiState.draft[event.target.dataset.draftField] = event.target.value;
    updateDraftStatus();
  }
});
document.addEventListener("click", (event) => {
  if (event.target.closest("[data-open-navigation]")) $("#navigation-dialog").showModal();
  if (event.target.closest("[data-close-navigation]")) $("#navigation-dialog").close();
  const evidenceTab = event.target.closest("[data-evidence-tab]");
  if (evidenceTab) selectEvidence(evidenceTab.dataset.evidenceTab);
  const studioTab = event.target.closest("button[data-studio-view]");
  if (studioTab) selectStudio(studioTab.dataset.studioView);
  const callFilter = event.target.closest("[data-call-filter]");
  if (callFilter) filterCalls(callFilter.dataset.callFilter);
  if (event.target.closest("[data-reset-draft]")) {
    uiState.draft = freshDraft();
    $("#control-form").reset();
    for (const [id, model] of Object.entries(uiState.draft.models)) $(`[data-draft-model="${id}"]`).value = model;
    document.querySelectorAll("[data-draft-field]").forEach((input) => { input.value = uiState.draft[input.dataset.draftField]; });
    $("[data-draft-toggle]").checked = uiState.draft.stopOnFailure;
    updateDraftStatus();
  }
});
document.addEventListener("keydown", (event) => {
  const tab = event.target.closest('button[role="tab"]');
  if (!tab || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const list = tab.closest('[role="tablist"]');
  const tabs = Array.from(list.querySelectorAll('button[role="tab"]'));
  const index = tabs.indexOf(tab);
  const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
    : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
  event.preventDefault();
  tabs[next].click();
  tabs[next].focus();
});
document.addEventListener("submit", (event) => {
  event.preventDefault();
  if (event.target.id === "control-form") {
    updateDraftStatus();
    if (draftChanges().length && !draftErrors().length) location.hash = "control-review";
  }
});
render();
