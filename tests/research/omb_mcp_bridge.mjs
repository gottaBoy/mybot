// Research transport: upstream MCP handlers, HTTP only through a trusted parent.
// The child remains under guard.py's unchanged deny-all outbound policy.
import readline from "node:readline";
import { pathToFileURL } from "node:url";

const upstream = await import(pathToFileURL(process.argv[2]).href);
const pending = new Map();
const running = new Set();
let nextId = 0;
const emit = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);
const fetcher = (path, options = {}) => new Promise((resolve, reject) => {
  if (options.signal?.aborted) {
    reject(new DOMException("Request cancelled", "AbortError"));
    return;
  }
  const id = ++nextId;
  pending.set(id, { resolve, reject });
  emit({ bridgeRequest: id, path, method: options.method || "GET", body: options.body });
});
const input = readline.createInterface({ input: process.stdin, terminal: false });
input.on("line", (line) => {
  let frame;
  try { frame = JSON.parse(line); }
  catch { emit({ bridgeFailure: "invalid parent frame" }); return; }
  if (frame.bridgeResponse !== undefined) {
    const waiter = pending.get(frame.bridgeResponse);
    if (!waiter) return;
    pending.delete(frame.bridgeResponse);
    if (frame.status < 200 || frame.status >= 300) {
      waiter.reject(new upstream.OpenMausBotApiError(frame.status, `HTTP ${frame.status}: ${JSON.stringify(frame.body)}`));
    } else waiter.resolve(frame.body);
    return;
  }
  if (!frame.rpc) return;
  const task = upstream.processMcpMessage(
    JSON.stringify(frame.rpc),
    (name, args, _unusedNativeFetcher, signal) => upstream.handleToolCall(name, args, fetcher, signal),
  ).then((response) => {
    if (response) emit({ mcpResponse: JSON.parse(response) });
  }).catch((error) => emit({ bridgeFailure: error.message }));
  running.add(task);
  task.finally(() => running.delete(task));
});
input.on("close", async () => {
  for (const waiter of pending.values()) waiter.reject(new Error("Parent closed"));
  pending.clear();
  await Promise.allSettled([...running]);
});
