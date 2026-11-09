/* Local protocol-shaped fixtures. These are not upstream driver implementations. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RuntimeFixtures = api;
})(typeof window === "undefined" ? null : window, function () {
  "use strict";
  const adapters = [
    { id: "codex", name: "Codex", interface: "App Server · JSON-RPC", color: "green",
      evidence: "独立 CLI 文本请求已测", qualification: "工作台适配器未接入", source: "../../docs/CODEX_ACCOUNT_SMOKE.md" },
    { id: "pi", name: "Pi", interface: "RPC · JSONL", color: "cyan",
      evidence: "SDK / RPC 文档已读", qualification: "上游运行未验收", source: "../../docs/REA_PI.md" },
    { id: "dsh", name: "DeepSeek Harness", interface: "Session events · 示意封装", color: "amber",
      evidence: "架构与安全声明已读", qualification: "开发者预览 · 未运行", source: "../../docs/REA_DEEPSEEK_HARNESS.md" },
  ];
  const scenarios = [
    { id: "success", name: "正常完成", outcome: "succeeded" },
    { id: "cancel", name: "请求取消", outcome: "canceled" },
    { id: "disconnect", name: "协议流中断", outcome: "interrupted" },
    { id: "failure", name: "返回失败", outcome: "failed" },
    { id: "denied", name: "工具请求被拒绝", outcome: "rejected" },
  ];
  const terminal = new Set(["succeeded", "canceled", "interrupted", "failed", "rejected"]);
  const names = {
    idle: "待播放", accepted: "夹具已接收", running: "模拟运行中",
    cancel_requested: "模拟取消请求", succeeded: "夹具完成", canceled: "夹具已取消",
    interrupted: "夹具中断", failed: "夹具失败", rejected: "夹具请求被拒绝",
  };

  function fixtures(adapter, scenario, task) {
    if (!adapters.some(row => row.id === adapter) || !scenarios.some(row => row.id === scenario)) {
      throw new Error("Unknown fixture selection");
    }
    const text = `本地夹具结果：${String(task).slice(0, 500)}\n\n1. 控制端接续不等于执行节点迁移。\n2. Ask 默认不等于强制只读权限。\n3. 模型用量缺失时必须保持未知。\n\n未读取项目文件，未调用真实模型；此结果为预设演示文本。`;
    let result;
    if (adapter === "codex") {
      result = [
        { method: "thread/started", params: { thread: { id: "fixture-thread" } } },
        { method: "turn/started", params: { turn: { id: "fixture-turn" } } },
        { method: "item/agentMessage/delta", params: { delta: "本地夹具正在整理三条边界…" } },
        { method: "item/completed", params: { item: { type: "agentMessage", text } } },
        { method: "turn/completed", params: { turn: { status: "completed" } } },
      ];
    } else if (adapter === "pi") {
      result = [
        { type: "response", command: "prompt", success: true, data: { disposition: "started" } },
        { type: "agent_start" },
        { type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "本地夹具正在整理三条边界…" } },
        { type: "message_end", message: { role: "assistant", content: [{ type: "text", text }] } },
        { type: "agent_end" },
        { type: "agent_settled" },
      ];
    } else {
      result = [
        { fixtureEnvelope: true, event: { type: "turn/start" } },
        { fixtureEnvelope: true, event: { type: "step/start" } },
        { fixtureEnvelope: true, event: { type: "fixture/text-delta", text: "本地夹具正在整理三条边界…" } },
        { fixtureEnvelope: true, event: { type: "assistant/message", text } },
        { fixtureEnvelope: true, event: { type: "turn/end", fixtureOutcome: "completed" } },
      ];
    }
    if (scenario !== "success") {
      result = result.slice(0, 3);
      const signal = {
        cancel: { fixtureSignal: "cancel_requested" },
        disconnect: { fixtureSignal: "stream_lost" },
        failure: { fixtureSignal: "provider_failed" },
        denied: { fixtureSignal: "tool_requested", tool: "shell", effect: "execute" },
      }[scenario];
      result.push(signal);
      if (scenario === "cancel") result.push({ fixtureSignal: "cancel_acknowledged" });
    }
    return result.map((native, index) => ({ fixtureOnly: true, nativeId: `${adapter}-${index + 1}`, native }));
  }

  function normalize(adapter, record) {
    if (!record || record.fixtureOnly !== true || !record.nativeId || !record.native) {
      throw new Error("Only explicit local fixture records are accepted");
    }
    const raw = record.native;
    const signal = raw.fixtureSignal;
    const signals = {
      cancel_requested: ["run.cancel_requested", "演示控制端请求取消"],
      cancel_acknowledged: ["run.canceled", "夹具已确认停止；不自动重放"],
      stream_lost: ["run.interrupted", "模拟流中断；实际执行结果未知"],
      provider_failed: ["run.failed", "预设失败分支；未调用 Provider"],
      tool_requested: ["policy.denied", "夹具中的 shell 请求已拒绝；工具执行数为 0"],
    };
    if (signal && signals[signal]) return { kind: signals[signal][0], detail: signals[signal][1] };
    if (adapter === "codex") {
      if (raw.method === "thread/started") return { kind: "run.accepted", detail: "模拟线程已登记" };
      if (raw.method === "turn/started") return { kind: "run.running", detail: "模拟 turn 已开始" };
      if (raw.method === "item/agentMessage/delta") return { kind: "output.delta", detail: raw.params.delta };
      if (raw.method === "item/completed" && raw.params.item.type === "agentMessage") {
        return { kind: "artifact.draft", detail: "预设文本已组装，仍需等待 turn 结束", text: raw.params.item.text };
      }
      if (raw.method === "turn/completed") return { kind: "run.succeeded", detail: "模拟 turn 已结束" };
    } else if (adapter === "pi") {
      if (raw.type === "response" && raw.success) return { kind: "run.accepted", detail: "模拟 prompt 已接收，不等于任务完成" };
      if (raw.type === "agent_start") return { kind: "run.running", detail: "模拟 agent 已开始" };
      if (raw.type === "message_update") return { kind: "output.delta", detail: raw.assistantMessageEvent.delta };
      if (raw.type === "message_end") return { kind: "artifact.draft", detail: "预设 message 已结束", text: raw.message.content[0].text };
      if (raw.type === "agent_end") return { kind: "runtime.progress", detail: "底层 agent_end；仍等待 agent_settled" };
      if (raw.type === "agent_settled") return { kind: "run.succeeded", detail: "模拟 agent_settled 已收敛" };
    } else if (adapter === "dsh" && raw.fixtureEnvelope) {
      if (raw.event.type === "turn/start") return { kind: "run.accepted", detail: "示意 turn/start 已登记" };
      if (raw.event.type === "step/start") return { kind: "run.running", detail: "示意 step/start 已开始" };
      if (raw.event.type === "fixture/text-delta") return { kind: "output.delta", detail: raw.event.text };
      if (raw.event.type === "assistant/message") return { kind: "artifact.draft", detail: "示意 assistant/message 已组装", text: raw.event.text };
      if (raw.event.type === "turn/end") return { kind: "run.succeeded", detail: "示意 turn/end；不是已验证上游协议" };
    }
    throw new Error("Unknown fixture event");
  }

  function createRun(adapter, id) {
    if (!adapters.some(row => row.id === adapter)) throw new Error("Unknown fixture adapter");
    return { adapter, id, fixtureOnly: true, status: "idle", events: [], seen: [],
      draft: "", artifact: "", modelRequests: 0, toolExecutions: 0, usage: null };
  }
  function apply(run, record) {
    if (run.fixtureOnly !== true) throw new Error("Not a fixture run");
    if (run.seen.includes(record.nativeId) || terminal.has(run.status)) return run;
    const event = normalize(run.adapter, record);
    const transitions = {
      "run.accepted": ["idle", "accepted"],
      "run.running": ["accepted", "running"],
      "run.cancel_requested": ["running", "cancel_requested"],
      "run.canceled": ["cancel_requested", "canceled"],
      "run.succeeded": ["running", "succeeded"],
      "run.interrupted": ["running", "interrupted"],
      "run.failed": ["running", "failed"],
      "policy.denied": ["running", "rejected"],
    };
    if (transitions[event.kind]) {
      const [from, to] = transitions[event.kind];
      if (run.status !== from) throw new Error(`Invalid fixture transition: ${run.status} -> ${to}`);
      run.status = to;
    } else if (run.status !== "running") throw new Error("Output requires a running fixture");
    if (event.kind === "artifact.draft") run.draft = event.text;
    if (run.status === "succeeded") run.artifact = run.draft;
    run.seen.push(record.nativeId);
    run.events.push({ seq: run.events.length + 1, kind: event.kind, detail: event.detail,
      nativeId: record.nativeId, native: record.native });
    return run;
  }
  function cancel(run) {
    if (terminal.has(run.status) || run.status === "idle") return run;
    if (run.status === "accepted") {
      apply(run, { fixtureOnly: true, nativeId: `${run.id}-start-before-stop`,
        native: run.adapter === "codex" ? { method: "turn/started" } :
          run.adapter === "pi" ? { type: "agent_start" } : { fixtureEnvelope: true, event: { type: "step/start" } } });
    }
    if (run.status !== "cancel_requested") {
      apply(run, { fixtureOnly: true, nativeId: `${run.id}-stop`, native: { fixtureSignal: "cancel_requested" } });
    }
    return apply(run, { fixtureOnly: true, nativeId: `${run.id}-stop-ack`, native: { fixtureSignal: "cancel_acknowledged" } });
  }
  return { adapters, scenarios, terminal, names, fixtures, normalize, createRun, apply, cancel };
});
