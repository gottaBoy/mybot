# ADR-0033: Pi SDK Text Execution In The Existing Workbench

- Date: 2026-11-27, Asia/Singapore
- Status: Accepted; verified and locally activated
- Scope: an explicitly configured, one-request Pi SDK text adapter

The user requested Pi capability after the core plan work. Earlier Pi material
was source research and mybot-owned protocol fixtures, not an integrated runtime.
Introduce actual SDK text execution in the existing research and coding loops;
keep mybot as the sole Task/Run/permission/budget/evidence authority.

## Artifact And Model Identity

`runtime/pi` pins `@earendil-works/pi-coding-agent@1.5.0`, complete transitive
package-lock and npm integrity. Installation uses ignore-scripts and stays
separate from frontend dependencies, global CLI installation and model calls.
Node>=22.19 is required. Source commit085c84e... is a separate research snapshot;
the registry did not supply gitHead, so it does not prove this tarball's build
commit. Package identities and license declarations remain in the runtime README.

Model kind `pi_sdk` uses existing explicit HTTP(S) endpoint/model/key_env fields.
Only dedicated `WORKBENCH_MODEL_*_KEY` references are configurable. No Pi built-in
provider/OAuth selection, Codex login, credential copying or sibling discovery.
Saving a model does not test it. Explicit test/Run consent follows existing
durable operation and candidate contracts. Missing runtime fails, never falls
back to another adapter or installs itself.

Bootstrap's `pi_sdk` advertises local Node/bridge/package-lock presence only.
It is not model reachability, authentication or a successful runtime probe.
New configuration controls require explicit advertisement. Existing Pi candidates
retain their identity and fail visibly if the runtime later disappears.

## One Request, No Tools Or Implicit Resources

Each Call starts a fresh Node process with clean environment and private empty
cwd/HOME/agent/XDG directories. Only the configured key is passed on stdin.
The actual SDK uses memory auth/settings/session, an empty resource loader and
empty tool registries; no extensions, skills, MCP, templates, context files,
package discovery or session restore are admitted.

The bridge supplies a fixed SDK stream function so only the confirmed messages
reach the model, without Pi's default system prompt/cwd/transcript. It binds
actual maxTokens, disables retry/compaction/cache warming/telemetry and gates
exactly one POST to the configured endpoint. Redirects and second requests fail.
There is no generic RPC/CLI command or browser-controlled tool invocation.

Success requires settled/idle state, one assistant answer, no queued messages,
exactly one request and stop/length termination. Length is truncated. Tool-call
output, malformed/empty results and unfinished/aborted/error states fail.
Reasoning is neither returned nor persisted. This config constrains a trusted
SDK; it is not an OS sandbox for arbitrary dependency code. Mybot's isolated
writer and confined Python tests retain their existing limits.

## Evidence, Usage And Lifecycle

Reuse existing Run/Agent/Call/Artifact/Event and model-test receipts.
Input is the total prompt-token denominator used by Chat Completions. Native
Pi input excludes cache, so preserve it separately as native_input_tokens;
cache read/write are subsets of public input, never extra tokens added by the UI.
Read raw provider usage before SDK default-zero normalization. Valid total input
may stay known while unreported cache/native fields remain unknown. Inconsistent
or malformed usage does not become a fabricated zero. Output is not incremented
again for reasoning. No estimated SDK price is a settled bill.

Bound stdin/response/stdout to1MiB, text to80,000 characters and calls to their
finite authorized timeout. Cancel/timeout terminate and reap the process group
and remove temporary files. Preserve unknown outcomes/costs; never auto-replay.
Safe diagnostics carry only fixed policy/lifecycle labels and token counters,
not keys, prompts, upstream bodies, raw exceptions or reasoning.

## Product Delivery And Verification

The same model form adds an execution-adapter selector. Saved Pi configurations
have an explicit badge and existing separate connection test. Research and
strict-JSON coding may select them; coding still writes only the selected
private snapshot and runs actual immutable tests through mybot.

Verify the real installed SDK against an owned localhost SSE mock: exact
messages/maxTokens, one request, negative config/resource/tool probes, usage
with cache/missing fields, HTTP/redirect failure, cancellation, cleanup and output
bounds. Then verify model save->explicit test->research->coding JSON->actual
pytest->Diff/report with unchanged original files. Replies are deterministic
fixtures; SDK/protocol/process/file/test/API/persistence work is real.

Actual paid models, broader Pi tool/Harness operation, external skills,
long-lived sessions and execution migration require separate scope and evidence.
Final1406 Python/2374 frontend/typecheck/build passed;50 real SDK plus9 API
integration checks were repeated with the SDK-required flag after optional-test
gating. Browser model save->test->research->coding produced7 actual SDK requests
and immutable pytest failures2->1->pass4. Primary read-only checks and unchanged
rows, retained failures and limits are in
[delivery evidence](../../frontend/evidence/plan-revisions-pi-2026-11-27/README.md).
Historical119/9/110 counts are unchanged.
