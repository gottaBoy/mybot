// Imports selected upstream functions, not the server or a model driver.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(process.argv[2]);
const paths = [
  "dist-server/shared/approval-mode.js",
  "dist-server/server/auto-approve.js",
  "dist-server/server/runtime/level.js",
  "dist-server/server/bot-api-fence.js",
];
const imported = await Promise.all(paths.map(path => import(pathToFileURL(resolve(root, path)))));
const [approval, auto, runtime, api] = imported;
const cases = [];
function check(id, actual, expected) {
  cases.push({ id, actual, expected, passed: JSON.stringify(actual) === JSON.stringify(expected) });
}
check("unset_default", approval.approvalModeFor({}), "full");
approval.setDefaultApprovalMode("ask");
check("default_override_unset", approval.approvalModeFor({}), "ask");
check("default_override_explicit_full", approval.approvalModeFor({ approvalMode: "full" }), "full");
check("legacy_auto_still_auto", approval.approvalModeFor({ autoApprove: true }), "auto");
check("malformed_mode_fails_closed", approval.approvalModeFor({ approvalMode: "invalid" }), "ask");
check("thread_explicit_ask_wins", approval.threadApproval({ approvalMode: "ask" }, { approvalMode: "full" }).approvalMode, "ask");
check("full_cross_engine_not_forced_to_ask", approval.modelSwitchNeedsAsk("full", "codex", "claudeAgent"), false);
check("custom_cross_engine_requires_ask", approval.modelSwitchNeedsAsk("custom", "codex", "claudeAgent"), true);
check("chief_person_may_raise", runtime.assignmentLevel({
  own: "ask", chief: "full", origin: "person", chiefLineage: true, driverKind: "codex",
}), { level: "full", source: "chief" });
check("chief_routine_may_raise", runtime.assignmentLevel({
  own: "ask", chief: "full", origin: "routine", chiefLineage: true, driverKind: "codex",
}), { level: "full", source: "chief" });
check("outside_does_not_inherit", runtime.assignmentLevel({
  own: "ask", chief: "full", origin: "outside", chiefLineage: true, driverKind: "codex",
}), { level: "ask", source: "own" });
check("outside_does_not_clamp_own_full", runtime.assignmentLevel({
  own: "full", chief: "ask", origin: "outside", chiefLineage: true, driverKind: "codex",
}), { level: "full", source: "own" });
check("nonchief_does_not_raise", runtime.assignmentLevel({
  own: "ask", chief: "full", origin: "person", chiefLineage: false, driverKind: "codex",
}), { level: "ask", source: "own" });
check("custom_remains_own", runtime.assignmentLevel({
  own: "custom", chief: "full", origin: "person", chiefLineage: true, driverKind: "codex",
}), { level: "custom", source: "own" });
check("peer_origin_alone_not_ceiling", auto.approvalModeForOrigin("full", { peerInitiated: true }), "full");
check("ask_without_grant", auto.autoVerdict("ask", "Bash").source, "no-grant");
check("ask_saved_command_grant", auto.autoVerdict("ask", "Bash", { commandAllowed: true }).source, "command-allowlist");
check("ask_saved_tool_grant", auto.autoVerdict("ask", "fixture_read", { toolAllowed: true }).source, "tool-allowlist");
check("ask_own_files_grant", auto.autoVerdict("ask", "Read", { ownFilesRead: true }).source, "own-files");
check("ask_explicit_guard_first", auto.autoVerdict("ask", "Bash", { requiresExplicitApproval: true, commandAllowed: true }).source, "explicit-approval-block");
check("full_auto_verdict_first", auto.autoVerdict("full", "Bash", { requiresExplicitApproval: true }).source, "full-access");
check("question_still_human_in_full", auto.autoVerdict("full", "ask_user").source, "no-grant");
check("api_tools_hooks_only", [...api.BOT_API_TOOLS], ["hooks"]);
for (const [method, path, expected] of [
  ["POST", "/api/internal/hook", false],
  ["GET", "/api/internal/tool-result", false],
  ["POST", "/api/internal/tool-result", false],
  ["POST", "/api/internal/coordinate-bots", true],
  ["POST", "/api/internal/shell", true],
  ["POST", "/api/bots", true],
  ["PATCH", "/api/config", true],
  ["GET", "/api/internal/unknown", true],
]) {
  check(`api_route_${method}_${path}`, api.botApiRouteRefused(method, path), expected);
}
console.log(JSON.stringify({
  kind: "selected-upstream-functions-only",
  sha256: Object.fromEntries(paths.map(path => [
    path, createHash("sha256").update(readFileSync(resolve(root, path))).digest("hex"),
  ])),
  cases,
  passed: cases.every(row => row.passed),
  limitation: "Selected pure functions, not reachability or full task/tool security.",
}));
if (cases.some(row => !row.passed)) process.exitCode = 1;
