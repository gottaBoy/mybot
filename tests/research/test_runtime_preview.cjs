const assert = require("node:assert/strict");
const test = require("node:test");
const F = require("../../design/runtime-lab/fixture-runtime.js");

for (const adapter of F.adapters) {
  for (const scenario of F.scenarios) {
    test(`${adapter.id}: ${scenario.id} is fixture-only and reaches its declared terminal`, () => {
      const run = F.createRun(adapter.id, "demo-test");
      for (const record of F.fixtures(adapter.id, scenario.id, "synthetic")) F.apply(run, record);
      assert.equal(run.status, scenario.outcome);
      assert.equal(run.fixtureOnly, true);
      assert.equal(run.modelRequests, 0);
      assert.equal(run.toolExecutions, 0);
      assert.equal(run.usage, null);
      assert.deepEqual(run.events.map(event => event.seq), run.events.map((_, index) => index + 1));
      assert.equal(Boolean(run.artifact), scenario.outcome === "succeeded");
    });
  }
  test(`${adapter.id}: duplicate delivery does not duplicate state or events`, () => {
    const run = F.createRun(adapter.id, "demo-test");
    const record = F.fixtures(adapter.id, "success", "synthetic")[0];
    F.apply(run, record);
    F.apply(run, record);
    assert.equal(run.events.length, 1);
    assert.equal(run.status, "accepted");
  });
  test(`${adapter.id}: manual cancellation does not promote a draft or accept late success`, () => {
    const run = F.createRun(adapter.id, "demo-test");
    const records = F.fixtures(adapter.id, "success", "synthetic");
    F.apply(run, records[0]);
    F.cancel(run);
    for (const record of records.slice(1)) F.apply(run, record);
    assert.equal(run.status, "canceled");
    assert.equal(run.artifact, "");
    assert.equal(run.toolExecutions, 0);
  });
}
test("Pi agent_end is not the final completed state", () => {
  const run = F.createRun("pi", "demo-test");
  const records = F.fixtures("pi", "success", "synthetic");
  for (const record of records.slice(0, -1)) F.apply(run, record);
  assert.equal(run.status, "running");
  assert.equal(run.artifact, "");
  F.apply(run, records.at(-1));
  assert.equal(run.status, "succeeded");
});
test("reject non-fixture input and unknown fixture selections", () => {
  assert.throws(() => F.normalize("codex", { method: "thread/started" }), /fixture/);
  assert.throws(() => F.createRun("unknown", "demo-test"), /Unknown/);
  assert.throws(() => F.fixtures("codex", "unknown", "synthetic"), /Unknown/);
});
test("invalid terminal ordering is refused", () => {
  const run = F.createRun("codex", "demo-test");
  assert.throws(() => F.apply(run, F.fixtures("codex", "success", "synthetic").at(-1)), /Invalid/);
  assert.equal(run.status, "idle");
  assert.equal(run.events.length, 0);
});
