(function () {
  "use strict";
  const F = window.RuntimeFixtures;
  const $ = (selector) => document.querySelector(selector);
  const icon = (name) => `<img src="../review-v1/assets/icons/${name}.svg" alt="" />`;
  const escape = (text) => String(text).replace(/[&<>"']/g, (value) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[value]);
  const state = {
    selected: new Set(F.adapters.map(row => row.id)), runs: {}, inspector: "codex",
    tab: "events", pane: "comparison", speed: 1, generation: 0, playing: false,
    timer: null, tick: 0, playlist: {}, playback: 0, summary: "尚未播放",
  };
  const research = [
    { name: "Codex", code: "CLI / App Server", note: "独立单次文本请求已验证；API Key 认证由 CLI 保管。",
      gap: "工作台接入、工具权限、取消与恢复未验收；上次单次调用授权已用完。", file: "CODEX_ACCOUNT_SMOKE.md" },
    { name: "Pi", code: "085c84e · SDK / RPC", note: "轻量 Harness 候选；研究资源、工具、会话与 agent_settled。",
      gap: "未运行上游。agent_end 不能单独作为最终完成证据。", file: "REA_PI.md" },
    { name: "DeepSeek Harness", code: "fcc0ad4 · Cordis / profiles", note: "插件运行时、session 事实与工具管线候选。",
      gap: "开发者预览，安全声明不等于隔离认证；未运行上游。", file: "REA_DEEPSEEK_HARNESS.md" },
    { name: "HuLa", code: "1687154 · Tauri / Rust / Vue", note: "多端壳、消息与通知机制参考，不是 Agent 执行器。",
      gap: "上游 Web 暂不支持；未做消息、通知或设备实测。", file: "REA_HULA.md" },
    { name: "OpenMausBot", code: "0.1.146 · P0 / 权限 v4", note: "受控空服务与配置路径已测，Ask 模板可以被覆盖或跳过。",
      gap: "不采用为当前底座；工作流与原生工具尚未验收。", file: "OPENMAUSBOT_PERMISSION_RESEARCH.md" },
    { name: "Cindy / nanoMuse", code: "Device Link / Hub / Sync", note: "设备连接、重连、同步与渠道机制参考。",
      gap: "与 mybot 的接续、执行迁移和真实账号均未集成。", file: "MULTI_DEVICE_AGENT_PLAN.md" },
  ];

  function toast(message) {
    $("#toast").textContent = message;
    $("#toast").classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => $("#toast").classList.remove("show"), 2600);
  }
  function empty(title, detail, symbol = "inbox") {
    return `<div class="inspector-empty">${icon(symbol)}<strong>${escape(title)}</strong><p>${escape(detail)}</p></div>`;
  }
  function runFor(id) {
    return state.runs[id] || F.createRun(id, "not-played");
  }
  function initialize() {
    $("#scenario").innerHTML = F.scenarios.map(row => `<option value="${row.id}">${escape(row.name)}</option>`).join("");
    $("#lanes").innerHTML = F.adapters.map(row => `
      <article class="lane" data-adapter="${row.id}" data-status="idle" data-selected="${row.id === state.inspector}">
        <header class="lane-heading"><div class="lane-top"><span class="adapter-mark ${row.color}">${row.id === "pi" ? "P" : row.id === "dsh" ? "D" : "C"}</span><button class="lane-name" data-inspect="${row.id}" title="检查 ${escape(row.name)} 的夹具事件"><h2>${escape(row.name)}</h2></button><input type="checkbox" class="adapter-checkbox" data-select="${row.id}" aria-label="选择 ${escape(row.name)} 夹具" checked /></div><div class="lane-interface">${escape(row.interface)}</div></header>
        <div class="lane-status-row"><span class="state-dot"></span><span class="state-text">待播放</span><span class="event-count">0 evt</span></div>
        <div class="lane-phases" aria-hidden="true"><span></span><span></span><span></span></div>
        <ul class="lane-events"><li class="empty">本地夹具尚未播放</li></ul>
        <div class="lane-facts"><div><small>真实模型请求</small><strong>0</strong></div><div><small>模型 Token</small><strong>未调用</strong></div></div>
        <footer class="lane-source"><strong>${escape(row.evidence)}</strong><small>${escape(row.qualification)}</small></footer>
      </article>`).join("");
    $("#research-list").innerHTML = research.map(row => `
      <article class="research-row"><div><h2>${escape(row.name)}</h2><code>${escape(row.code)}</code></div><div><p>${escape(row.note)}</p><small>${escape(row.gap)}</small></div><a class="text-link" href="../../docs/${row.file}" target="_blank" rel="noopener">研究记录${icon("arrow-up-right")}</a></article>`).join("");
    update();
    route();
  }
  function update() {
    for (const adapter of F.adapters) {
      const lane = $(`[data-adapter="${adapter.id}"]`);
      const run = runFor(adapter.id);
      lane.dataset.status = run.status;
      lane.dataset.selected = String(adapter.id === state.inspector);
      lane.classList.toggle("disabled", !state.selected.has(adapter.id));
      lane.querySelector(".adapter-checkbox").disabled = state.playing;
      lane.querySelector(".state-text").textContent = state.selected.has(adapter.id) ? F.names[run.status] : "未选择";
      lane.querySelector(".event-count").textContent = `${run.events.length} evt`;
      lane.querySelector(".lane-events").innerHTML = run.events.length ? run.events.slice(-4).map(event => `
        <li>${icon(event.kind === "policy.denied" || event.kind === "run.failed" ? "circle-x" :
    event.kind === "run.succeeded" ? "circle-check" : event.kind === "run.interrupted" ? "unplug" : "check")}
          <div><code>${escape(event.kind)}</code></div></li>`).join("") : `<li class="empty">本地夹具尚未播放</li>`;
      lane.querySelectorAll(".lane-phases span").forEach((node, index) => {
        node.classList.toggle("on", index === 0 ? run.events.length > 0 : index === 1 ?
          run.events.some(event => event.kind === "run.running") : F.terminal.has(run.status));
      });
    }
    $("#comparison-state").textContent = state.summary;
    $("#comparison-count").textContent = `${state.selected.size} 个夹具已选`;
    $("#run-button").disabled = state.playing || state.selected.size === 0;
    $("#cancel-button").disabled = !state.playing;
    $("#reset-button").disabled = state.playing;
    $("#scenario").disabled = state.playing;
    $("#task").disabled = state.playing;
    renderInspector();
  }
  function renderInspector() {
    const adapter = F.adapters.find(row => row.id === state.inspector);
    const run = runFor(adapter.id);
    $("#inspector-name").textContent = adapter.name;
    $("#inspector-content").setAttribute("aria-labelledby", `tab-${state.tab}`);
    document.querySelectorAll("[data-tab]").forEach(button => {
      button.setAttribute("aria-selected", String(button.dataset.tab === state.tab));
      button.tabIndex = button.dataset.tab === state.tab ? 0 : -1;
    });
    let content;
    if (state.tab === "events") {
      content = run.events.length ? `<ol class="event-list">${run.events.map(event => `
        <li><span>${String(event.seq).padStart(2, "0")}</span><div><code>${escape(event.kind)}</code><p>${escape(event.detail)}</p><small>${escape(event.nativeId)}</small></div></li>`).join("")}</ol>` :
        empty("暂无夹具事件", "真实执行器未接入", "network");
    } else if (state.tab === "native") {
      content = run.events.length ? `<div class="native-block"><div>MOCK JSON · ${adapter.id === "dsh" ? "DSH 示意封装，非上游认证" : "选定协议形状"}</div><pre>${escape(JSON.stringify(run.events.map(row => ({
        fixtureOnly: true, nativeId: row.nativeId, native: row.native,
      })), null, 2))}</pre></div>` : empty("暂无原始夹具", "播放记录仅留在浏览器内存", "code-xml");
    } else {
      content = run.artifact ? `<article class="result-block"><span class="fact">预设演示文本 · 非模型产物</span><p>${escape(run.artifact)}</p></article>` :
        empty("没有可交付结果", run.status === "interrupted" ? "模拟流已中断；不自动重试" :
          run.status === "rejected" ? "模拟工具请求已拒绝；未执行工具" :
            run.status === "canceled" ? "夹具已取消；未提交模拟成果" : "须等夹具终态收敛", "file-text");
    }
    $("#inspector-content").innerHTML = content;
  }
  function play() {
    if (state.playing || !state.selected.size) return;
    if (!$("#task").value.trim()) {
      $("#task").setAttribute("aria-invalid", "true");
      $("#task").focus();
      toast("任务目标不能为空");
      return;
    }
    $("#task").removeAttribute("aria-invalid");
    state.playback++;
    state.generation++;
    state.runs = {};
    state.playlist = {};
    state.tick = 0;
    state.playing = true;
    state.summary = `Mock 播放中 · 演示 #${String(state.playback).padStart(2, "0")}`;
    for (const id of state.selected) {
      state.runs[id] = F.createRun(id, `demo-${state.playback}-${id}`);
      state.playlist[id] = F.fixtures(id, $("#scenario").value, $("#task").value);
    }
    if (!state.selected.has(state.inspector)) state.inspector = state.selected.values().next().value;
    const generation = state.generation;
    function tick() {
      if (!state.playing || state.generation !== generation) return;
      for (const id of state.selected) {
        const record = state.playlist[id][state.tick];
        if (record && !F.terminal.has(state.runs[id].status)) F.apply(state.runs[id], record);
      }
      state.tick++;
      if ([...state.selected].every(id => F.terminal.has(state.runs[id].status))) {
        state.playing = false;
        state.summary = `Mock 已收敛 · ${state.selected.size}/${state.selected.size} 终态`;
        state.timer = null;
      } else state.timer = setTimeout(tick, 460 / state.speed);
      update();
    }
    tick();
  }
  function cancel() {
    if (!state.playing) return;
    clearTimeout(state.timer);
    state.timer = null;
    state.playing = false;
    state.generation++;
    for (const run of Object.values(state.runs)) F.cancel(run);
    state.summary = "Mock 已停止 · 未调用上游取消接口";
    update();
  }
  function reset() {
    if (state.playing) return;
    state.generation++;
    clearTimeout(state.timer);
    state.timer = null;
    state.runs = {};
    state.summary = "尚未播放";
    update();
    toast("本地 Mock 记录已重置");
  }
  function snapshot() {
    return {
      schema: "mybot.runtime-preview.fixture.v1", fixtureOnly: true,
      upstreamDriversExecuted: false, productionConfigurationChanged: false,
      scenario: $("#scenario").value, task: $("#task").value,
      playing: state.playing, selectedAdapters: [...state.selected],
      modelRequests: 0, toolExecutions: 0, usage: null,
      provenance: "Predefined local protocol-shaped fixtures, not upstream compatibility evidence",
      runs: JSON.parse(JSON.stringify(state.runs)),
    };
  }
  function exportRecords() {
    const blob = new Blob([JSON.stringify(snapshot(), null, 2) + "\n"], { type: "application/json" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = "mybot-runtime-mock.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("已导出本地 Mock 记录");
  }
  function route() {
    const view = ["compare", "capabilities", "research"].includes(location.hash.slice(1)) ? location.hash.slice(1) : "compare";
    for (const name of ["compare", "capabilities", "research"]) $(`#${name}-view`).hidden = name !== view;
    document.querySelectorAll("[data-view]").forEach(link => {
      if (link.dataset.view === view) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    $("#breadcrumb-title").textContent = { compare: "执行器对比", capabilities: "能力与边界", research: "研究证据" }[view];
  }
  $("#run-button").addEventListener("click", play);
  $("#cancel-button").addEventListener("click", cancel);
  $("#reset-button").addEventListener("click", reset);
  $("#export-button").addEventListener("click", exportRecords);
  $("#scope-button").addEventListener("click", () => $("#scope-dialog").showModal());
  $("#close-dialog").addEventListener("click", () => $("#scope-dialog").close());
  $("#scope-dialog").addEventListener("click", event => {
    if (event.target === $("#scope-dialog")) {
      const rect = $("#scope-dialog").getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $("#scope-dialog").close();
    }
  });
  $("#lanes").addEventListener("click", event => {
    const button = event.target.closest("[data-inspect]");
    if (!button) return;
    state.inspector = button.dataset.inspect;
    if (matchMedia("(max-width: 599px)").matches) {
      state.pane = "inspector";
      $(".lab-layout").dataset.pane = state.pane;
      document.querySelectorAll("[data-pane]").forEach(node => {
        if (node.tagName === "BUTTON") node.setAttribute("aria-pressed", String(node.dataset.pane === state.pane));
      });
    }
    update();
    if (matchMedia("(max-width: 599px)").matches) $(".inspector").scrollIntoView({ block: "start" });
  });
  $("#lanes").addEventListener("change", event => {
    const id = event.target.dataset.select;
    if (!id || state.playing) return;
    if (event.target.checked) state.selected.add(id);
    else state.selected.delete(id);
    update();
  });
  document.querySelectorAll("[data-speed]").forEach(button => button.addEventListener("click", () => {
    state.speed = Number(button.dataset.speed);
    document.querySelectorAll("[data-speed]").forEach(node => node.setAttribute("aria-pressed", String(node === button)));
  }));
  document.querySelectorAll("[data-pane]").forEach(button => {
    if (button.tagName !== "BUTTON") return;
    button.addEventListener("click", () => {
      state.pane = button.dataset.pane;
      $(".lab-layout").dataset.pane = state.pane;
      document.querySelectorAll("button[data-pane]").forEach(node => node.setAttribute("aria-pressed", String(node === button)));
    });
  });
  const tabButtons = [...document.querySelectorAll("[data-tab]")];
  function activateTab(button) { state.tab = button.dataset.tab; renderInspector(); }
  tabButtons.forEach(button => {
    button.addEventListener("click", () => activateTab(button));
    button.addEventListener("keydown", event => {
      const index = tabButtons.indexOf(button);
      let next;
      if (event.key === "ArrowRight") next = (index + 1) % tabButtons.length;
      if (event.key === "ArrowLeft") next = (index - 1 + tabButtons.length) % tabButtons.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = tabButtons.length - 1;
      if (next === undefined) return;
      event.preventDefault();
      activateTab(tabButtons[next]);
      tabButtons[next].focus();
    });
  });
  window.addEventListener("hashchange", route);
  window.addEventListener("pagehide", () => clearTimeout(state.timer));
  window.__runtimeLab = { getSnapshot: snapshot };
  initialize();
})();
