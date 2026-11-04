/* Live single-user client. Rendering never treats model or user text as HTML. */
const $ = (selector) => document.querySelector(selector);
const esc = (value = "") => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const icon = (name) => `<img src="/icons/${name}.svg" class="icon" alt="" />`;
const btn = (text, glyph, attrs = "", primary = false) => `<button class="button button-${primary ? "primary" : "secondary"}" ${attrs}>${glyph ? icon(glyph) : ""}${esc(text)}</button>`;
const link = (href, text, glyph = "") => `<a href="${href}" class="text-link">${esc(text)}${glyph ? icon(glyph) : ""}</a>`;
const labels = {
  queued: "排队", running: "运行中", pause_requested: "等待安全暂停", paused: "已暂停",
  cancel_requested: "取消中", canceled: "已取消", succeeded: "执行完成", failed: "执行失败",
  interrupted: "服务中断，待处理", pending: "未开始", review_pending: "待审查", accepted: "已接受",
  changes_requested: "要求修改", coordinator: "Super-agent", researcher: "研究 Agent", reviewer: "汇总 Agent",
};
const activeStatuses = new Set(["queued", "running", "pause_requested", "cancel_requested"]);
const tone = (status) => status === "succeeded" || status === "accepted" ? "green"
  : status === "failed" ? "red" : ["running", "queued"].includes(status) ? "blue" : "neutral";
const pill = (status, custom) => `<span class="status status-${tone(status)}"><i></i>${esc(custom || labels[status] || status)}</span>`;
const when = (value) => value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "—";
const duration = (value) => value === null || value === undefined ? "未知" : value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${value}ms`;
let data = { projects: [], models: [], tasks: [], runs: [] };
let detail = null;
let routeKey = "";
let polling = false;
let refreshing = false;
let latestEvent = 0;
let authenticated = false;
let authRequired = false;
let selectedArtifact = "";
let mobilePane = "work";
let taskTab = "work";
let callFilter = "all";
const requestId = () => crypto.randomUUID?.() || Array.from(
  crypto.getRandomValues(new Uint8Array(16)), (value) => value.toString(16).padStart(2, "0")
).join("");

async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      ...options, headers: { "Content-Type": "application/json", "X-Workbench-Request": "1", ...options.headers },
    });
  } catch { throw new Error("无法连接服务器，稍后可重新同步。"); }
  if (response.status === 401) {
    authenticated = false;
    data = { projects: [], models: [], tasks: [], runs: [] };
    detail = null;
    if (path !== "/auth") loginScreen();
  }
  const body = await response.json();
  if (!response.ok) {
    const message = Array.isArray(body.detail) ? body.detail.map((item) => `${item.loc?.slice(1).join(".")}: ${item.msg}`).join("；") : body.detail;
    throw new Error(message || `请求失败 (${response.status})`);
  }
  return body;
}

function notify(text, error = false) {
  const toast = $("#toast");
  toast.textContent = text;
  toast.dataset.error = String(error);
  toast.classList.add("show");
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => toast.classList.remove("show"), 5000);
}

function modal(title, content) {
  const dialog = $("#form-dialog");
  dialog.innerHTML = `<div class="model-dialog-head"><h2 id="dialog-title">${esc(title)}</h2><button type="button" class="icon-button" data-close-modal aria-label="关闭">${icon("x")}</button></div>${content}`;
  if (!dialog.open) dialog.showModal();
}

function field(name, label, value = "", extra = "") {
  return `<label>${esc(label)}<input name="${name}" value="${esc(value)}" ${extra} /></label>`;
}

function showLogin() {
  modal("登录工作空间", `<form data-form="login" class="live-form"><p>使用服务端设置的访问令牌。令牌不会保存在浏览器存储中。</p>${field("token", "访问令牌", "", 'type="password" required autocomplete="current-password"')}<p class="form-error" role="alert"></p><div class="form-actions">${btn("登录", "lock-keyhole", 'type="submit"', true)}</div></form>`);
}

function loginScreen() {
  shell("登录工作空间");
  $("#main").innerHTML = `<div class="page"><h1>连接你的研发工作空间</h1><p>使用服务端访问令牌登录。</p>${btn("登录", "lock-keyhole", 'data-action="login"', true)}</div>`;
  showLogin();
}

function navigation() {
  const route = location.hash.slice(1) || "home";
  return `<a class="brand" href="#home"><span class="brand-mark">${icon("command")}</span><strong>Workbench<span class="brand-version">AI</span></strong></a>
    <div class="workspace-switch"><span class="workspace-avatar">研</span><span>研发工作空间<small>单用户 · 只读执行</small></span></div>
    <button class="nav-new" data-action="new-task">${icon("plus")}发起工作</button>
    <nav class="primary-nav"><a class="nav-item ${route === "home" ? "is-active" : ""}" href="#home">${icon("layout-dashboard")}工作台</a><a class="nav-item ${route === "models" ? "is-active" : ""}" href="#models">${icon("sliders-horizontal")}模型与控制</a></nav>
    <div class="nav-projects"><div class="nav-section-heading"><span>项目</span><button class="icon-button" data-action="new-project" aria-label="创建项目">${icon("plus")}</button></div>${data.projects.map((p) => `<a class="nav-project ${route === `project/${p.id}` ? "is-active" : ""}" href="#project/${p.id}"><span class="project-monogram">${esc(p.name.slice(0, 1))}</span><span>${esc(p.name)}</span></a>`).join("") || '<p class="nav-empty">尚未创建项目</p>'}</div>
    <div class="nav-bottom"><div class="scope-note">${icon("shield-check")}<div>只读调研<small>仅显式选择的资料会发送给模型</small></div></div><a class="nav-item" href="#models">${icon("settings-2")}连接与设置</a><div class="identity"><span class="person-avatar">我</span><span><strong>项目所有者</strong><small>本机/私有工作空间</small></span></div></div>`;
}

function shell(title) {
  $("#app-nav").innerHTML = navigation();
  $("#app-header").innerHTML = `<div class="header-leading"><button class="icon-button mobile-menu" data-action="nav" aria-label="打开导航">${icon("menu")}</button><nav class="breadcrumbs" aria-label="当前位置"><a href="#home">工作空间</a>${icon("chevron-right")}<span>${esc(title)}</span></nav></div><div class="header-trailing"><span class="connection-state" id="connection-state">${authenticated ? "<i></i>已连接" : "未登录"}</span><span class="live-access">只读执行</span>${authRequired && authenticated ? '<button class="icon-button" data-action="logout" aria-label="退出登录" title="退出登录">' + icon("lock-keyhole") + "</button>" : ""}</div>`;
}

function heading(title, sub = "", actions = "") {
  return `<div class="page-heading"><div><h1>${esc(title)}</h1><p>${esc(sub)}</p></div><div class="heading-actions">${actions}</div></div>`;
}

function home() {
  shell("工作台");
  const active = data.runs.filter((r) => activeStatuses.has(r.status));
  return `<div class="page">${heading("工作台", data.projects.length ? `${data.projects.length} 个项目 · ${data.tasks.length} 项任务` : "个人研发空间", btn("创建项目", "plus", 'data-action="new-project"', true))}
    <div class="home-summary"><span><i class="live-dot"></i><strong>${active.length}</strong> 项运行中</span><span>${icon("files")}<strong>${data.tasks.length}</strong> 项任务</span><span>${icon("blocks")}<strong>${data.models.length}</strong> 个模型配置</span></div>
    ${!data.projects.length ? `<div class="empty-state"><div class="empty-symbol">${icon("folder-git-2")}</div><h2>尚未创建项目</h2><div class="panel-actions">${btn("创建项目", "plus", 'data-action="new-project"', true)}<a href="#models" class="button button-secondary">${icon("plug")}连接模型</a></div></div>`
      : `<section>${sectionHeading("最近运行")}${data.runs.slice(0, 10).map((r) => runRow(r)).join("") || '<p class="empty-message">还没有运行。先在项目里发起任务。</p>'}</section><section class="page-section">${sectionHeading("项目")}${data.projects.map((p) => `<a href="#project/${p.id}" class="project-entry">${icon("folder-git-2")}<div><strong>${esc(p.name)}</strong><small>${esc(p.goal || "尚未填写项目目标")}</small></div>${icon("arrow-up-right")}</a>`).join("")}</section>`}</div>`;
}

function sectionHeading(title, action = "") {
  return `<div class="section-heading"><h2>${esc(title)}</h2>${action}</div>`;
}

function runRow(run) {
  const task = data.tasks.find((t) => t.id === run.task_id);
  const project = data.projects.find((p) => p.id === task?.project_id);
  return `<a href="#run/${run.id}" class="live-run-row"><span class="agent-avatar agent-neutral">${icon("command")}</span><div><strong>${esc(task?.title || "任务")}</strong><small>${esc(project?.name || "")} · ${when(run.created_at)}</small></div>${pill(run.status)}${icon("arrow-up-right")}</a>`;
}

function projectView(id) {
  const project = data.projects.find((p) => p.id === id);
  if (!project) return missing();
  shell(project.name);
  const tasks = data.tasks.filter((t) => t.project_id === id);
  return `<div class="page">${heading(project.name, project.goal, btn("发起工作", "plus", `data-action="new-task" data-project="${id}"`, true))}
    <div class="project-meta"><span>${icon("folder-git-2")}${esc(project.directory)}</span><span>${icon("shield-check")}只读上下文</span></div>
    <div class="project-layout"><section>${sectionHeading("项目任务")}${tasks.map((t) => {
      const runs = data.runs.filter((r) => r.task_id === t.id);
      return `<div class="project-task-row"><span class="agent-avatar agent-blue">${icon("file-search")}</span><div><h3>${esc(t.title)}</h3><p>${esc(t.goal)}</p><div class="row-bottom"><span>${t.files.length} 个显式文件</span><span>${runs.length} 次运行</span></div><div class="panel-actions">${btn("检查并运行", "arrow-right", `data-action="prepare" data-task="${t.id}"`)}${runs[0] ? link(`#run/${runs[0].id}`, "最近运行", "arrow-up-right") : ""}</div></div></div>`;
    }).join("") || '<p class="empty-message">项目下暂无任务。</p>'}</section><aside class="project-context">${sectionHeading("上下文边界")}<dl class="definition-list"><dt>目录</dt><dd>${esc(project.directory)}</dd><dt>项目资料</dt><dd class="pre-wrap">${esc(project.notes || "无额外资料")}</dd><dt>执行权限</dt><dd>没有 Shell、代码写入、浏览器或部署工具。仅分析发送前确认的文本快照。</dd></dl></aside></div></div>`;
}

function modelsView() {
  shell("模型与控制");
  return `<div class="page">${heading("模型与控制", "模型配置保存在服务端，密钥从环境变量读取。", btn("添加模型", "plus", 'data-action="new-model"', true))}
    <div class="notice notice-neutral">${icon("shield-check")}<div><strong>明确操作才会发起模型请求</strong><p>保存配置不调用模型；“测试连接”会发送一条小请求，可能产生费用。运行时使用启动时的配置快照，不自动回退到其他 Provider。</p></div></div>
    <section class="page-section">${sectionHeading("模型连接")}${data.models.map((m) => `<div class="model-row">${icon("blocks")}<div><h3>${esc(m.name)}</h3><p><code>${esc(m.model)}</code></p><small>${esc(m.endpoint)}</small><p class="model-key">密钥：${m.key_env ? `${esc(m.key_env)} · ${m.key_available ? "服务端已提供" : "未提供"}` : "无（本地或免密端点）"}</p></div><div>${pill(m.test_status === "reachable" ? "succeeded" : "pending", m.test_status === "reachable" ? "可达，能力未验证" : m.test_status || "未测试")}${btn("测试连接", "plug", `data-action="test-model" data-model="${m.id}"`)}</div></div>`).join("") || '<div class="empty-state"><h2>尚未配置模型</h2><p>支持本地或远程的 OpenAI-compatible Chat Completions 接口。</p></div>'}</section>
    <section class="page-section">${sectionHeading("当前执行边界")}<div class="control-boundaries"><p>${icon("check")}单机一个后台 Worker，每次最多两个只读研究 Agent 并行</p><p>${icon("check")}规划、研究和汇总可以指定不同模型</p><p>${icon("x")}代码写入、Shell、部署和生产权限未实现</p><p>${icon("circle-help")}成本未知时不会填零；测试连接不证明工具能力</p></div></section></div>`;
}

function missing() {
  return '<div class="page"><h1>找不到这个对象</h1><p>可能已删除或当前工作空间不包含此对象。</p><a class="text-link" href="#home">返回工作台</a></div>';
}

function runView(value) {
  const { run, task, project, agents, calls, artifacts, events } = value;
  shell(task.title);
  const active = activeStatuses.has(run.status);
  const controls = active ? `${["running", "queued"].includes(run.status) ? btn("暂停", "pause", 'data-action="control" data-control="pause"') : ""}${btn("取消", "square", 'data-action="control" data-control="cancel"')}`
    : ["paused", "interrupted", "failed"].includes(run.status) ? `${btn("继续运行", "arrow-right", 'data-action="control" data-control="resume"', true)}${btn("结束此运行", "square", 'data-action="control" data-control="cancel"')}` : "";
  const final = artifacts.find((a) => a.kind === "report");
  let artifact = artifacts.find((a) => a.id === selectedArtifact) || final || artifacts[0];
  if (artifact?.decision === "pending") artifact = { ...artifact, decision: "review_pending" };
  const tabs = [["work", "工作", "blocks"], ["agents", "调度", "git-branch"], ["calls", "调用", "network"], ["audit", "审计", "shield-check"]];
  return `<div class="task-page studio-page"><div class="task-heading"><div><div class="task-eyebrow"><a href="#project/${project.id}">${esc(project.name)}</a><span class="mono">RUN ${esc(run.id.slice(0, 6))}</span></div><h1>${esc(task.title)}</h1><p class="task-description">${esc(task.goal)}</p></div><div class="heading-actions">${controls}</div></div>
    <div class="fact-axes"><div><span>执行</span>${pill(run.status)}</div><div><span>验证</span>${pill("pending", "未执行测试")}</div><div><span>人工决定</span>${pill(final?.decision || "pending", final?.decision === "accepted" ? "已接受方案" : final?.decision === "changes_requested" ? "要求修改" : "待审查")}</div><span class="run-version">${icon("shield-check")}只读运行</span></div>
    ${run.error ? `<div class="notice notice-${run.status === "failed" ? "red" : "amber"}">${icon("circle-alert")}<div><strong>${esc(errorLabel(run.error))}</strong><p>已完成的调用和成果仍保留。继续前检查预算；未完成请求重跑可能再次产生费用。</p></div></div>` : ""}
    ${run.status === "pause_requested" ? '<p class="control-pending">已请求暂停：当前只读阶段和在途调用结束后暂停，不表示立即停止 Provider。</p>' : ""}
    <nav class="task-tabs">${tabs.map(([id, label, glyph]) => `<button type="button" data-tab="${id}" class="${taskTab === id ? "is-active" : ""}" aria-pressed="${taskTab === id}">${icon(glyph)}${label}${id === "calls" ? `<small>${calls.length}</small>` : ""}</button>`).join("")}<span class="live-sync">事件 ${events.length} · ${when(events.at(-1)?.created_at)}</span></nav>
    ${taskTab === "work" ? `<div class="studio-view-switch" role="group" aria-label="工作区面板"><button data-pane="work" aria-pressed="${mobilePane === "work"}">工作记录</button><button data-pane="evidence" aria-pressed="${mobilePane === "evidence"}">成果 <small>${artifacts.length}</small></button></div><div class="task-studio" data-view="${mobilePane}"><section class="work-pane"><div class="work-pane-heading"><span>工作记录</span><span>${calls.length} / ${run.config.max_calls} 次调用</span></div><div class="workstream">
      <details class="original-request" data-state-key="context"><summary>已确认的发送范围 ${icon("chevron-down")}</summary><p>项目资料与任务目标 + ${run.context.evidence.length} 个显式文件</p>${run.context.evidence.map((f) => `<p><code>${esc(f.path)}</code> · ${f.bytes} bytes</p>`).join("")}<p>${esc(task.acceptance)}</p></details>
      ${agents.slice().reverse().map((a) => `<article class="activity-item"><span class="agent-avatar agent-${a.role === "coordinator" ? "neutral" : a.role === "reviewer" ? "amber" : "blue"}">${icon(a.role === "coordinator" ? "command" : "file-search")}</span><div class="activity-content"><div class="activity-heading"><strong>${esc(labels[a.role])}</strong>${pill(a.status)}<time>${when(a.ended_at || a.started_at)}</time></div><h3>${esc(a.title)}</h3><p>${esc(a.objective)}</p>${a.output ? `<details class="agent-output" data-state-key="${a.id}"><summary>查看输出${icon("chevron-down")}</summary><div class="pre-wrap">${esc(a.output)}</div></details>` : ""}</div></article>`).join("") || '<p class="empty-message">等待 Worker 接收任务。</p>'}
    </div><div class="run-footer-info">${icon("lock-keyhole")}模型仅接收到已确认快照。没有外部工具执行。</div></section><aside class="evidence-inspector"><div class="inspector-toolbar"><strong>工作成果</strong><span>${artifacts.length} 份</span></div>${artifact ? `<div class="artifact-picker">${artifacts.map((a) => `<button data-artifact="${a.id}" class="${artifact.id === a.id ? "is-active" : ""}">${icon(a.kind === "report" ? "file-check-2" : "file-text")}${esc(a.title)}</button>`).join("")}</div><div class="live-artifact"><div class="artifact-live-header"><h2>${esc(artifact.title)}</h2>${pill(artifact.decision)}</div><p class="artifact-provenance">来自 ${esc(agents.find((a) => a.id === artifact.agent_id)?.title || "Agent")} · ${when(artifact.created_at)}</p><div class="artifact-content pre-wrap">${esc(artifact.content)}</div></div><div class="artifact-decisions">${btn("接受方案", "check", `data-action="decide" data-id="${artifact.id}" data-decision="accepted"`)}${btn("要求修改", "pencil", `data-action="decide" data-id="${artifact.id}" data-decision="changes_requested"`)}${btn("下载", "files", `data-action="download" data-id="${artifact.id}"`)}</div>` : '<div class="empty-state"><span class="empty-symbol">' + icon("files") + '</span><h2>等待研究成果</h2></div>'}</aside></div>` : taskTab === "agents" ? agentsView(value) : taskTab === "calls" ? callsView(value) : auditView(value)}
    </div>`;
}

function agentsView({ run, agents }) {
  return `<section class="live-agents">${sectionHeading("委派与执行", '<span>计划 v1 · 最多 2 个只读子任务</span>')}<div class="live-plan">${run.plan.map((item, index) => `<div><span class="mono">0${index + 1}</span><div><strong>${esc(item.title)}</strong><p>${esc(item.objective)}</p></div></div>`).join("") || '<p>尚未生成有效计划。</p>'}</div>${agents.slice().reverse().map((a) => `<div class="live-agent-row ${a.parent_id ? "child-agent" : ""}">${icon(a.parent_id ? "git-branch" : "command")}<div><strong>${esc(a.title)}</strong><p>${esc(run.context.models[a.model_id]?.name)} · ${esc(run.context.models[a.model_id]?.model)}</p><small>${a.parent_id ? `委派来源 ${esc(a.parent_id.slice(0, 6))}` : "主协调 Agent"}</small></div>${pill(a.status)}</div>`).join("")}<p class="table-footnote">任务阶段：规划 → 只读研究（有限并行）→ 汇总。不是任意 DAG 编辑器。</p></section>`;
}

function callsView({ calls, agents, run }) {
  const filtered = calls.filter((c) => callFilter !== "failed" || ["failed", "canceled", "interrupted"].includes(c.status));
  const input = calls.reduce((n, c) => n + (c.input_tokens || 0), 0);
  const output = calls.reduce((n, c) => n + (c.output_tokens || 0), 0);
  const unknown = calls.filter((c) => c.input_tokens === null || c.output_tokens === null).length;
  return `<div class="metric-band"><div><span>调用数量</span><strong>${calls.length} <span>/ ${run.config.max_calls}</span></strong><small>所有尝试均计数</small></div><div><span>已返回 Token</span><strong>${input + output}</strong><small>${unknown} 次用量不完整</small></div><div><span>失败 / 中断</span><strong>${calls.filter((c) => ["failed", "canceled", "interrupted"].includes(c.status)).length}</strong><small>不覆盖历史</small></div><div><span>金额成本</span><strong class="metric-unknown">未知</strong><small>未配置价格快照</small></div></div>
    <div class="table-toolbar">${sectionHeading("模型调用")}<div class="call-filters"><button data-filter="all" aria-pressed="${callFilter === "all"}">全部</button><button data-filter="failed" aria-pressed="${callFilter === "failed"}">失败 / 中断</button></div></div>
    <div class="table-scroll" tabindex="0" aria-label="模型调用"><table class="calls-table"><thead><tr><th>调用</th><th>Agent</th><th>模型</th><th>状态</th><th>耗时</th><th>输入</th><th>输出</th><th>尝试</th></tr></thead><tbody>${filtered.map((c) => `<tr class="${c.status === "failed" ? "row-failed" : ""}"><td>${btn(c.id.slice(0, 7), "", `data-action="call" data-id="${c.id}"`, false)}</td><td>${esc(labels[agents.find((a) => a.id === c.agent_id)?.role] || "Agent")}</td><td>${esc(c.requested_model)}</td><td>${pill(c.status)}</td><td class="mono">${duration(c.duration_ms)}</td><td class="mono">${c.input_tokens ?? "未知"}</td><td class="mono">${c.output_tokens ?? "未知"}</td><td>${c.attempt}</td></tr>`).join("")}</tbody></table></div><p class="table-footnote">只累加逐调用用量；缺失不等于零。返回模型名称是 Provider 自报，不是物理后端鉴定。</p>`;
}

function auditView({ events }) {
  return `<div class="audit-list">${events.map((e) => `<article class="audit-row"><time class="mono">${new Date(e.created_at).toLocaleTimeString("zh-CN", { hour12: false })}</time><span class="agent-avatar agent-neutral">${icon(e.actor === "user" ? "user-round" : "network")}</span><div><div class="audit-title"><strong>${esc(e.kind)}</strong><span>${esc(e.actor)}</span></div><p>${esc(JSON.stringify(e.payload))}</p><span class="mono">#${e.seq}</span></article>`).join("")}</div><p class="table-footnote">事件追加记录用于追溯，不宣称防篡改。没有保存密钥或模型内部思维链。</p>`;
}

function errorLabel(code) {
  const map = {
    missing_api_key: "服务端模型密钥未提供", planner_invalid_json: "规划输出不符合计划契约",
    output_truncated: "模型输出被截断，结果未记为成功",
    provider_timeout_outcome_unknown: "模型请求超时，用量可能未知",
    run_time_budget_exhausted: "运行时间上限已达到", research_failed: "研究子任务失败",
    "Model call budget exhausted": "调用次数上限已达到",
  };
  return map[code] || code;
}

async function refresh(full = true) {
  if (!authenticated) return;
  if (refreshing) return;
  refreshing = true;
  const requestedRoute = location.hash.slice(1) || "home";
  try {
    const nextData = full ? await api("/bootstrap") : data;
    if (!authenticated || requestedRoute !== (location.hash.slice(1) || "home")) return;
    const route = requestedRoute;
    if (route.startsWith("run/")) {
      const id = route.split("/")[1];
      const nextDetail = await api(`/runs/${encodeURIComponent(id)}`);
      if (!authenticated || route !== (location.hash.slice(1) || "home")) return;
      data = nextData;
      detail = nextDetail;
      latestEvent = detail.events.at(-1)?.seq || 0;
      draw(() => runView(detail));
    } else {
      data = nextData;
      if (route === "models") draw(modelsView);
      else if (route.startsWith("project/")) draw(() => projectView(route.split("/")[1]));
      else draw(home);
    }
    routeKey = route;
  } catch (error) { notify(error.message, true); }
  finally {
    refreshing = false;
    if (authenticated && requestedRoute !== (location.hash.slice(1) || "home")) setTimeout(() => refresh(), 0);
  }
}

function draw(renderer) {
  const sameRoute = routeKey === (location.hash.slice(1) || "home");
  const y = window.scrollY;
  const scroll = $(".workstream")?.scrollTop || 0;
  const artifactScroll = $(".live-artifact")?.scrollTop || 0;
  const openDetails = new Set(sameRoute ? Array.from(
    document.querySelectorAll("#main details[open][data-state-key]"), (node) => node.dataset.stateKey
  ) : []);
  $("#main").innerHTML = renderer();
  document.querySelectorAll("#main details[data-state-key]").forEach((node) => {
    node.open = openDetails.has(node.dataset.stateKey);
  });
  if (sameRoute) {
    if ($(".workstream")) $(".workstream").scrollTop = scroll;
    if ($(".live-artifact")) $(".live-artifact").scrollTop = artifactScroll;
    window.scrollTo(0, y);
  }
}

async function poll() {
  if (polling || refreshing || !authenticated || document.hidden || !location.hash.startsWith("#run/") || !detail) return;
  polling = true;
  try {
    const result = await api(`/runs/${detail.run.id}/events?after=${latestEvent}`);
    if (result.events.length) await refresh(false);
    const status = $("#connection-state");
    if (status) status.innerHTML = "<i></i>已同步";
  } catch {
    const status = $("#connection-state");
    if (status) status.textContent = "连接中断 · 状态待同步";
  } finally { polling = false; }
}

function projectForm() {
  modal("创建研发项目", `<form data-form="project" class="live-form">${field("name", "项目名称", "", "required maxlength=100")}${field("directory", "相对目录", ".", "required maxlength=400")}<p class="field-hint">服务端工作区：${esc(data.workspace)}。只能选择其中的非隐藏目录。</p><label>项目目标<textarea name="goal" rows="2" maxlength="4000"></textarea></label><label>项目资料<textarea name="notes" rows="3" maxlength="16000" placeholder="只填写允许发送给模型的资料，不要粘贴密钥。"></textarea></label><p class="form-error" role="alert"></p><div class="form-actions">${btn("创建项目", "plus", 'type="submit"', true)}</div></form>`);
}

function taskForm(projectId) {
  if (!data.projects.length) return projectForm();
  modal("发起只读工作", `<form data-form="task" class="live-form"><label>项目<select name="project_id">${data.projects.map((p) => `<option value="${p.id}" ${p.id === projectId ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label>${field("title", "任务名称", "", "required maxlength=160")}<label>目标<textarea name="goal" rows="3" required minlength="8" maxlength="8000"></textarea></label><label>验收要求<textarea name="acceptance" rows="2" maxlength="4000"></textarea></label><label>明确选择的源码文件<textarea name="files" rows="3" placeholder="README.md&#10;src/example.py"></textarea></label><p class="field-hint">相对项目目录，每行一个文件，最多 10 个。不会扫描目录；隐藏文件、凭证路径、符号链接和大文件会拒绝。</p><p class="form-error" role="alert"></p><div class="form-actions">${btn("创建任务并检查", "arrow-right", 'type="submit"', true)}</div></form>`);
}

function modelForm() {
  modal("添加模型配置", `<form data-form="model" class="live-form">${field("name", "配置名称", "", "required maxlength=80")}${field("endpoint", "API 基础地址", "", 'type="url" required placeholder="http://127.0.0.1:11434/v1"')}${field("model", "请求模型标识", "", "required maxlength=150")}${field("key_env", "密钥环境变量名称（可留空）", "", 'placeholder="WORKBENCH_MODEL_REMOTE_KEY" pattern="WORKBENCH_MODEL_[A-Z0-9_]+_KEY"')}<p class="field-hint">只填变量名。密钥在服务启动前设置，不通过浏览器输入。远程 API 需 HTTPS；本机推理可用 HTTP。</p><p class="form-error" role="alert"></p><div class="form-actions">${btn("保存配置", "check", 'type="submit"', true)}</div></form>`);
}

async function prepare(taskId) {
  if (!data.models.length) { location.hash = "models"; notify("先添加至少一个模型配置。"); return; }
  const preview = await api(`/tasks/${taskId}/preview`, { method: "POST", body: "{}" });
  const options = data.models.map((m) => `<option value="${m.id}">${esc(m.name)} · ${esc(m.model)}</option>`).join("");
  modal("检查发送内容与运行上限", `<form data-form="run" data-task="${taskId}" data-context="${preview.context_hash}" data-request="${requestId()}" class="live-form"><div class="preview-boundary">${icon("shield-check")}只读分析；不运行命令、不改代码</div><label>Super-agent 模型<select name="coordinator_model">${options}</select></label><label>研究 Agent 模型<select name="researcher_model">${options}</select></label><label>汇总 Agent 模型<select name="reviewer_model">${options}</select></label><div class="send-targets" id="send-targets"></div><div class="form-split">${field("max_calls", "调用总上限", "4", 'type="number" required min="3" max="8"')}${field("parallel", "只读并行数", "2", 'type="number" required min="1" max="2"')}</div><div class="form-split">${field("minutes", "本次执行时间上限（分钟）", "10", 'type="number" required min="1" max="30"')}${field("max_output_tokens", "每次输出 Token 上限", "1800", 'type="number" required min="256" max="4096"')}</div><details class="send-preview"><summary>检查实际资料快照 · ${preview.bytes} bytes${icon("chevron-down")}</summary><pre>${esc(JSON.stringify(preview, null, 2))}</pre></details><label class="consent-label"><input type="checkbox" name="consent" required /><span>我确认将任务、项目资料与选定文件快照发送给上述模型。会产生实际请求，费用由 Provider 决定；金额未知不等于免费。</span></label><p class="form-error" role="alert"></p><div class="form-actions">${btn("开始只读运行", "arrow-right", 'type="submit"', true)}</div></form>`);
  updateTargets();
}

function updateTargets() {
  const form = document.querySelector('[data-form="run"]');
  if (!form) return;
  const ids = new Set(Array.from(form.querySelectorAll("select"), (select) => select.value));
  $("#send-targets").innerHTML = `<strong>资料发送位置</strong>${data.models.filter((model) => ids.has(model.id)).map((model) => `<p>${esc(model.name)}<span>${esc(model.endpoint)}</span></p>`).join("")}`;
}
document.addEventListener("change", (event) => {
  if (event.target.closest('[data-form="run"]') && event.target.tagName === "SELECT") {
    updateTargets();
    document.querySelector('[name="consent"]').checked = false;
  }
});

document.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  const values = Object.fromEntries(new FormData(form));
  const submit = form.querySelector('[type="submit"]');
  if (!submit || submit.disabled) return;
  submit.disabled = true;
  form.querySelector(".form-error").textContent = "";
  try {
    if (form.dataset.form === "login") {
      await api("/auth", { method: "POST", body: JSON.stringify(values) });
      authenticated = true;
      $("#form-dialog").close();
      await refresh();
    } else if (form.dataset.form === "project") {
      const result = await api("/projects", { method: "POST", body: JSON.stringify(values) });
      $("#form-dialog").close();
      data = await api("/bootstrap");
      location.hash = `project/${result.id}`;
    } else if (form.dataset.form === "model") {
      await api("/models", { method: "POST", body: JSON.stringify(values) });
      $("#form-dialog").close(); await refresh();
      notify("模型配置已保存，尚未发起请求。");
    } else if (form.dataset.form === "task") {
      values.files = values.files.split("\n").map((v) => v.trim()).filter(Boolean);
      const result = await api("/tasks", { method: "POST", body: JSON.stringify(values) });
      data = await api("/bootstrap");
      $("#form-dialog").close();
      await refresh();
      await prepare(result.id);
    } else if (form.dataset.form === "run") {
      for (const key of ["max_calls", "parallel", "minutes", "max_output_tokens"]) values[key] = Number(values[key]);
      values.consent = values.consent === "on";
      values.request_id = form.dataset.request;
      values.context_hash = form.dataset.context;
      const run = await api(`/tasks/${form.dataset.task}/runs`, { method: "POST", body: JSON.stringify(values) });
      $("#form-dialog").close();
      taskTab = "work"; selectedArtifact = ""; mobilePane = "work";
      data = await api("/bootstrap");
      location.hash = `run/${run.id}`;
    }
  } catch (error) {
    form.querySelector(".form-error").textContent = error.message;
    submit.disabled = false;
  }
});

document.addEventListener("click", async (event) => {
  const el = event.target.closest("[data-action], [data-tab], [data-pane], [data-filter], [data-artifact], [data-close-modal]");
  if (!el) return;
  if (el.matches("[data-close-modal]")) { $("#form-dialog").close(); return; }
  try {
    if (el.dataset.tab) { taskTab = el.dataset.tab; draw(() => runView(detail)); }
    if (el.dataset.pane) { mobilePane = el.dataset.pane; draw(() => runView(detail)); }
    if (el.dataset.filter) { callFilter = el.dataset.filter; draw(() => runView(detail)); }
    if (el.dataset.artifact) { selectedArtifact = el.dataset.artifact; draw(() => runView(detail)); }
    const action = el.dataset.action;
    if (action === "nav") {
      $("#nav-dialog").innerHTML = `<button type="button" class="icon-button close-nav" aria-label="关闭导航" data-action="close-nav">${icon("x")}</button>${navigation()}`;
      $("#nav-dialog").showModal();
    } else if (action === "close-nav") $("#nav-dialog").close();
    else if (action === "login") showLogin();
    else if (action === "logout") {
      await api("/logout", { method: "POST", body: "{}" });
      authenticated = false;
      data = { projects: [], models: [], tasks: [], runs: [] };
      detail = null;
      loginScreen();
    }
    else if (action === "new-project") projectForm();
    else if (action === "new-task") taskForm(el.dataset.project);
    else if (action === "new-model") modelForm();
    else if (action === "prepare") await prepare(el.dataset.task);
    else if (action === "test-model") {
      if (!confirm("将发送一条最小模型请求，可能产生费用。继续？")) return;
      el.disabled = true;
      const result = await api(`/models/${el.dataset.model}/test`, { method: "POST", body: "{}" });
      notify(result.status === "reachable" ? "连接可达，尚未验证工具能力。" : errorLabel(result.status), result.status !== "reachable");
      await refresh();
    } else if (action === "control") {
      const acknowledge = el.dataset.control === "resume" && ["failed", "interrupted"].includes(detail.run.status);
      if (acknowledge && !confirm("只读运行将从已完成的阶段继续；未完成模型请求可能重跑并再次产生费用，历史调用会保留。确认？")) return;
      el.disabled = true;
      await api(`/runs/${detail.run.id}/${el.dataset.control}`, { method: "POST", body: JSON.stringify({ acknowledge_replay: acknowledge }) });
      await refresh();
    } else if (action === "decide") {
      await api(`/artifacts/${el.dataset.id}/decision`, { method: "POST", body: JSON.stringify({ decision: el.dataset.decision }) });
      await refresh(false);
      notify("审查决定已记录，不代表代码或测试已执行。");
    } else if (action === "download") {
      const artifact = detail.artifacts.find((a) => a.id === el.dataset.id);
      const url = URL.createObjectURL(new Blob([artifact.content], { type: "text/plain;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = `report-${artifact.id.slice(0, 8)}.md`; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } else if (action === "call") {
      const c = detail.calls.find((call) => call.id === el.dataset.id);
      modal("模型调用详情", `<dl class="definition-list"><dt>调用 ID</dt><dd><code>${c.id}</code></dd><dt>请求模型 / 返回模型</dt><dd>${esc(c.requested_model)} / ${esc(c.returned_model || "未知")}</dd><dt>状态</dt><dd>${pill(c.status)}</dd><dt>耗时</dt><dd>${duration(c.duration_ms)}</dd><dt>输入 / 输出 Token</dt><dd>${c.input_tokens ?? "未知"} / ${c.output_tokens ?? "未知"}</dd><dt>错误</dt><dd>${esc(c.error ? errorLabel(c.error) : "无")}</dd><dt>归属 Agent</dt><dd><code>${c.agent_id}</code></dd><dt>尝试</dt><dd>${c.attempt}</dd></dl><p class="field-hint">没有存储密钥、模型内部思维链或原始响应头。</p>`);
    }
  } catch (error) { notify(error.message, true); if (el.tagName === "BUTTON") el.disabled = false; }
});

window.addEventListener("hashchange", () => {
  $("#nav-dialog").close();
  $("#form-dialog").close();
  refresh();
});
document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
setInterval(poll, 1500);

async function init() {
  try {
    const auth = await api("/auth/state");
    authenticated = auth.authenticated;
    authRequired = auth.required;
    if (!authenticated) {
      loginScreen();
    } else await refresh();
  } catch (error) { $("#main").textContent = error.message; }
}
init();
