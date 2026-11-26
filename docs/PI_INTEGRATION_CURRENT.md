# Pi Text Provider Integration

Date: 2026-11-27, Asia/Singapore. Status: verified and locally activated;
no automatic paid model or real-account quality certification.

## Concrete Product Capability

`PiSdkProvider.complete(model, messages, max_tokens)` provides text generation to
mybot's existing research and isolated coding loops. Pi is not a second task,
permission, tool or Run authority. Research retains its fixed published workflow;
coding still accepts strict JSON, writes only a private selected-file copy and
runs immutable tests through the existing confined test runner.

The model kind is `pi_sdk`. Its explicit HTTP(S) OpenAI-compatible endpoint,
model ID and optional `key_env` are the existing model fields. It does not use a
Pi built-in provider selection, CLI login, OAuth token, Codex credential,
repository configuration or user session. Saving a model does not start a
request. A configured connection is used only after the user's explicit test or
Run confirmation.

The independent `runtime/pi` package pins
`@earendil-works/pi-coding-agent@1.5.0` and its full transitive lock. Node.js
`>=22.19.0` is required. Dependencies were installed with `--ignore-scripts`,
without a global installation or frontend dependency change. The exact package
integrity, upstream source observation and license declarations are recorded in
`runtime/pi/README.md`; registry `gitHead` was absent, so source and published
artifact identity remain separate facts.

## Narrow SDK Boundary

The bridge actually calls the installed `createAgentSession` and `ModelRuntime`
SDK. It supplies memory-only auth, settings and session managers, `tools: []`,
`noTools: "all"`, no custom tools, and a project-owned empty resource loader.
There are no extensions, skills, prompt templates, MCP servers, AGENTS/context
files, package loader or saved session. Prompt expansion is disabled.

Each Python call starts one Node process with a fresh empty cwd, HOME, agent
directory and XDG directories. The inherited environment is replaced; only the
configured key is transferred over stdin. `NODE_OPTIONS`, ambient provider keys,
proxy configuration and CLI credentials are not inherited. stdout is parsed as
one bounded JSON result; stderr is discarded rather than persisted as a possible
secret-bearing diagnostic.

A fixed SDK stream function sends exactly the confirmed messages, without Pi's
default system prompt, cwd or transcript. It sets the actual request
`maxTokens`, zero transport retries, no cache retention, no reasoning request and
no provider attribution. The bridge's internal context-window metadata is a host
transport bound, not a tested capacity claim about the configured remote model.
Automatic retry, compaction, analytics, installation
telemetry and cache warming are disabled. An exact URL/method gate admits one
POST to the configured endpoint's `/chat/completions`; redirects and any second
request are rejected. No generic RPC, bash or tool command is accepted from an
API caller.

Tool-call output is a failure even though the enabled tool registry is empty.
Completion requires a settled SDK session, one assistant response, no queued
messages, exactly one request and a `stop` or `length` result. `length` records
truncation. Error, aborted, deferred, tool-use, empty or malformed results never
become a complete text answer. Reasoning content is not returned or persisted.

This configuration narrows the trusted SDK's capabilities; it is not an
operating-system sandbox for malicious SDK/package code. The separate coding
writer and test confinement retain their existing authority and limits.

## Results, Cost And Unknown Outcomes

The normal result contains text, configured model identity, input/output token
counts, truncation and safe structured diagnostics. Public `input_tokens` is the
complete prompt total including cached input, matching the Chat provider and
the shared Call usage summary. Pi's uncached SDK input is retained as
`native_input_tokens`; cache-read/cache-write counts are diagnostic subsets of
public input and must not be added again. For example, prompt11 with cache-read3
records public input11, native input8, cache-read3 and cache-write0. Output already
includes reasoning tokens; no separate reasoning count is added.

The bridge checks the original wire prompt/completion counts independently
instead of trusting the SDK's default zeros. A missing or invalid count remains
unknown for that field. Invalid, conflicting or excessive cache counts make
input and its diagnostic breakdown unknown; a valid output count stays known.
A valid prompt total remains known when cache components are merely absent;
the unreported components and uncached native input remain unknown. An explicit
prompt total of zero mathematically establishes zero cache/native input.
Explicit zero counts remain valid. The default mock reports cache-write0
explicitly, rather than relying on the SDK's default. No upstream estimated
price is reported as a settled bill.

The response body and bridge stdout are bounded to 1 MiB, and returned text to
80,000 Unicode characters. The configured call timeout is finite. Cancellation,
timeout and output failure terminate and reap the owned process group, drain
readers and remove the temporary directories. A timeout or connection loss may
have an unknown model outcome or cost; the provider never retries it.

Safe codes include `pi_sdk_not_available`, `pi_sdk_invalid_input`,
`pi_sdk_start_failed`, `pi_sdk_provider_rejected`, `pi_sdk_policy_violation`,
`pi_sdk_invalid_response`, `pi_sdk_empty_response` and `pi_sdk_output_limit`.
`pi_sdk_timeout_outcome_unknown` and `pi_sdk_connection_outcome_unknown` retain
the unknown-outcome distinction. Diagnostics contain no prompt, key, upstream
body, reasoning or raw exception.

`pi_sdk_available()` checks local Node/bridge and the pinned installed package/
lock identity. It makes no network call and is not a connection test, credential
test, supported-model proof or complete runtime health probe. The bridge checks
the Node engine again at actual execution and fails closed if unsupported.

## Verification

`tests/test_pi_provider.py` uses the actual installed SDK and an owned localhost
HTTP/SSE mock. It does not substitute a fake Pi executable or contact a real
Provider. Its reusable `pi_mock_server(responder)` exposes `endpoint` and captured
`calls`; deterministic replies are source fixtures, not generated model quality.

The targeted checks cover exact confirmed messages and wire token limit, empty
tools, one-request counting, host configuration/credential markers, explicit key
only, discarded reasoning, missing/partial/invalid usage, total-input/cache
accounting and cache-write subsets, truncation, HTTP
failure/no retry, redirect rejection, tool-call rejection, output bounds, invalid
inputs, missing key, timeout, cancellation and process cleanup.

Run those checks with:

```sh
.venv/bin/python -m pytest -q tests/test_pi_provider.py
```

The earlier provider-only run passed all 30 checks before the public-input
denominator was aligned with other adapters. It does not cover the later usage
validation. The final expanded provider-only suite passed all 50 checks in
36.91 seconds after the total-input and missing-cache rules were applied.
JavaScript syntax and `git diff --check` also passed. The earlier HTTP-header case mismatch
was corrected in the mock's captured headers. A redirect-error fetch mode hid
the known HTTP status; the bridge now uses manual redirect handling and rejects
the response before another endpoint can be requested.

Root integration verifies explicit connection tests, original operation
reconciliation, research Agent/Call/Artifact persistence and coding JSON -> actual
pytest -> Diff with unchanged source. Final1406 Python/2374 frontend/build passed;
50 provider plus9 integration checks passed again under MYBOT_REQUIRE_PI_RUNTIME=1.
The real browser chain sends7 SDK requests:1 connection test,4 research,2 coding,
with four immutable pytest cases failing2->1->0. Primary capability/selector
checks are GET-only and original rows remain unchanged.
[Delivery record](../frontend/evidence/plan-revisions-pi-2026-11-27/README.md).
A successful
local SDK/mock test does not certify real Pi model quality, a paid connection,
full Pi tools/Harness operation or long-lived sessions.
