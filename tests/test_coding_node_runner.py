import asyncio
import json
import os
from pathlib import Path
import signal

import pytest

from workbench.coding_runner import CodingError, PythonTestRunner, node_runtime, parse_test_result


PROFILE = "node-test"


def selected(root, content, name="test_selected.mjs"):
    path = root / name
    path.write_text(content, encoding="utf-8")
    return name


def run(root, content, name="test_selected.mjs", timeout=5):
    return asyncio.run(PythonTestRunner().run(root, [selected(root, content, name)], timeout, profile=PROFILE))


def test_real_node_probe_verifies_confinement_and_actual_two_case_execution():
    assert asyncio.run(PythonTestRunner().probe(PROFILE)) == {
        "id": "landlock-seccomp-node", "available": True, "profile": PROFILE,
    }


@pytest.mark.parametrize("name,source", [
    ("test_selected.mjs", "import test from 'node:test';import assert from 'node:assert/strict';\n"),
    ("test_selected.cjs", "const test=require('node:test');const assert=require('node:assert/strict');\n"),
])
def test_actual_assertions_and_promises_run_only_explicit_files(tmp_path, name, source):
    selected(tmp_path, "throw new Error('not selected')", "test_other.mjs")
    result = run(tmp_path, source + (
        "test('sync',()=>assert.equal(2+2,4));\n"
        "test('async',async()=>assert.equal(await Promise.resolve(3),3));\n"
    ), name)
    assert result["passed"] and result["tests_run"] == 2, result
    assert result["receipt"] == {"tests_run": 2, "failures": 0, "errors": 0, "skipped": 0, "success": True}
    evidence = json.loads(next(line.removeprefix("MYBOT_NODE_RUNTIME=") for line in result["output"].splitlines()
                               if line.startswith("MYBOT_NODE_RUNTIME=")))
    assert evidence["version"] == "v24.21.0"
    assert "--permission" in evidence["execArgv"] and "--jitless" in evidence["execArgv"]
    assert "--no-experimental-strip-types" in evidence["execArgv"]
    assert result["command"][1:3] == ["-I", "-B"]
    assert json.loads(result["command"][-1]) == {"profile": PROFILE, "test_files": [name]}


def test_native_suites_and_nested_test_counts_remain_explicit(tmp_path):
    result = run(tmp_path, """
import {test,describe,it} from 'node:test'
describe('suite',()=>{it('one',()=>{});it('two',()=>{})})
test('parent',async t=>{await t.test('nested',()=>{})})
""")
    assert result["passed"] and result["tests_run"] == 4, result


@pytest.mark.parametrize("source", [
    "// no selected cases\n",
    "import {describe} from 'node:test';describe('empty suite',()=>{})\n",
    "import test from 'node:test';test.skip('skipped',()=>{})\n",
    "import test from 'node:test';test.todo('todo')\n",
    "import test from 'node:test';test('expected',{expectFailure:true},()=>{throw new Error('known')})\n",
])
def test_empty_skip_todo_and_expected_failures_never_pass(tmp_path, source):
    result = run(tmp_path, source)
    assert not result["passed"] and result["exit_code"] == 125, result
    assert result["receipt"] is None or result["receipt"]["success"] is False


def test_expected_failure_is_unsupported_even_with_a_real_passing_case(tmp_path):
    result = run(tmp_path, """
import test from 'node:test'
test('real pass',()=>{})
test('known issue',{expectFailure:true},()=>{throw new Error('expected')})
""")
    assert not result["passed"] and result["exit_code"] == 125


def test_import_exception_after_registration_cannot_be_swallowed_by_native_runner(tmp_path):
    result = run(tmp_path, """
import test from 'node:test'
test('registered pass',()=>{})
throw new Error('import failed after registration')
""")
    assert not result["passed"] and result["exit_code"] != 0, result
    assert result["receipt"]["errors"] >= 1, result
    assert "import failed after registration" in result["output"]


def test_only_and_nested_runonly_cannot_hide_failures(tmp_path):
    result = run(tmp_path, """
import test from 'node:test'
import assert from 'node:assert/strict'
test.only('focused pass',()=>{})
test('must execute',()=>assert.fail('must not be filtered'))
test('parent',async t=>{
  t.runOnly(true)
  await t.test('nested focused',{only:true},()=>{})
  await t.test('nested ordinary',()=>assert.fail('nested must not be filtered'))
})
""")
    assert not result["passed"] and result["tests_run"] == 5, result
    assert "must not be filtered" in result["output"] and "nested must not be filtered" in result["output"]


def test_user_diagnostics_are_not_a_test_selection_parser(tmp_path):
    result = run(tmp_path, """
import test from 'node:test'
test('diagnostic words',t=>{t.diagnostic('only local validation; expectFailure is a word')})
""")
    assert result["passed"], result


@pytest.mark.parametrize("source", [
    "import test from 'node:test';import assert from 'node:assert/strict';test('failure',()=>assert.equal(1,2))",
    "throw new Error('import failed')",
    "import {before,test} from 'node:test';before(()=>{throw new Error('hook failed')});test('case',()=>{})",
    "import {after,test} from 'node:test';after(()=>{throw new Error('teardown failed')});test('case',()=>{})",
    "import {describe,it,before} from 'node:test';describe('suite',()=>{before(()=>{throw new Error('suite hook')});it('case',()=>{})})",
])
def test_assertion_import_and_hook_errors_cannot_pass(tmp_path, source):
    result = run(tmp_path, source)
    assert not result["passed"] and result["exit_code"] != 0, result
    if "hook failed" in source or "teardown failed" in source or "suite hook" in source:
        assert result["receipt"] is None or result["receipt"]["errors"] >= 1, result


@pytest.mark.parametrize("source", [
    "import test from 'node:test';test('late timer',()=>{setTimeout(()=>{throw new Error('late')},50)})",
    "import test from 'node:test';test('late rejection',()=>{setTimeout(()=>Promise.reject(new Error('late')),50)})",
])
def test_late_async_errors_are_observed_before_receipt_and_natural_exit(tmp_path, source):
    result = run(tmp_path, source)
    assert not result["passed"] and result["exit_code"] != 0, result
    assert result["receipt"] is None or (
        result["receipt"]["errors"] >= 1 and result["receipt"]["success"] is False
    ), result
    assert "late" in result["output"], result


def test_host_environment_and_project_package_hooks_are_not_inherited(tmp_path, monkeypatch):
    monkeypatch.setenv("NODE_OPTIONS", "--require=/not-an-admitted-file")
    monkeypatch.setenv("NODE_PATH", "/not-an-admitted-module")
    monkeypatch.setenv("NODE_TEST_CONTEXT", "child-v8")
    (tmp_path / "package.json").write_text('{"type":"commonjs","scripts":{"test":"must not run"}}')
    result = run(tmp_path, """
import test from 'node:test'
import assert from 'node:assert/strict'
test('clean runtime',()=>{
  assert.equal(process.env.NODE_OPTIONS,undefined)
  assert.equal(process.env.NODE_PATH,undefined)
  assert.equal(process.env.NODE_TEST_CONTEXT,'mybot-confined-node-test')
  assert.equal(process.argv.some(a=>a.includes('--test-name-pattern')),false)
})
""")
    assert result["passed"], result


def test_sync_async_host_reads_writes_network_process_workers_and_addons_are_denied(tmp_path):
    workspace = tmp_path / "copy"
    workspace.mkdir()
    canary = tmp_path / "outside"
    canary.write_text("synthetic private content")
    source = f"""
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {{readFile,writeFile}} from 'node:fs/promises'
import net from 'node:net'
import {{spawnSync}} from 'node:child_process'
import {{Worker}} from 'node:worker_threads'
test('boundaries',async()=>{{
  assert.throws(()=>fs.readFileSync({str(canary)!r}),e=>e.code==='ERR_ACCESS_DENIED')
  const attempts=await Promise.allSettled(Array.from({{length:16}},()=>readFile({str(canary)!r})))
  assert.ok(attempts.every(a=>a.status==='rejected'&&a.reason.code==='ERR_ACCESS_DENIED'))
  assert.throws(()=>fs.writeFileSync('test_selected.mjs','changed'),e=>e.code==='ERR_ACCESS_DENIED')
  await assert.rejects(writeFile('test_selected.mjs','changed'),e=>e.code==='ERR_ACCESS_DENIED')
  await assert.rejects(new Promise((done,reject)=>{{const s=net.connect({{host:'127.0.0.1',port:9}},done);s.on('error',reject)}}),e=>e.code==='EPERM')
  assert.throws(()=>spawnSync(process.execPath,['-e','0']),e=>e.code==='ERR_ACCESS_DENIED')
  assert.throws(()=>new Worker('0',{{eval:true}}),e=>e.code==='ERR_ACCESS_DENIED')
  assert.throws(()=>process.dlopen({{}},'untrusted.node'),/node_test_addons_unsupported/)
  assert.throws(()=>fs.chmodSync('test_selected.mjs',0o777),e=>e.code==='ERR_ACCESS_DENIED')
}})
"""
    result = run(workspace, source)
    assert result["passed"] and result["tests_run"] == 1, result
    assert (workspace / "test_selected.mjs").read_text() == source
    assert canary.read_text() == "synthetic private content"


@pytest.mark.parametrize("source,flag", [
    ("import test from 'node:test';test('loop',()=>{while(true){}})", "timed_out"),
    ("import test from 'node:test';test('output',()=>{console.log('x'.repeat(100000))})", "truncated"),
])
def test_timeout_and_output_limits_never_pass(tmp_path, source, flag):
    result = run(tmp_path, source, timeout=1)
    assert not result["passed"] and result["exit_code"] != 0, result
    assert result[flag], result
    assert len(result["output"].encode()) <= 32768


def test_trusted_import_setup_supports_top_level_await_test(tmp_path):
    result = run(tmp_path, "import test from 'node:test';await test('top-level await',()=>{})")
    assert result["passed"] and result["tests_run"] == 1, result


def test_process_exit_without_receipt_is_not_test_evidence(tmp_path):
    result = run(tmp_path, "process.exit(0)\n")
    assert result["exit_code"] == 125
    assert result["receipt"] is None and result["passed"] is False


def test_cancellation_reaps_the_confined_process_group(tmp_path, monkeypatch):
    name = selected(tmp_path, "import test from 'node:test';test('loop',()=>{while(true){}})")
    original = asyncio.create_subprocess_exec
    pids = []

    async def capture(*args, **kwargs):
        process = await original(*args, **kwargs)
        pids.append(process.pid)
        return process

    monkeypatch.setattr("workbench.coding_runner.asyncio.create_subprocess_exec", capture)

    async def cancel():
        task = asyncio.create_task(PythonTestRunner().run(tmp_path, [name], timeout=10, profile=PROFILE))
        while not pids:
            await asyncio.sleep(0.01)
        await asyncio.sleep(0.1)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task

    asyncio.run(cancel())
    with pytest.raises(ProcessLookupError):
        os.killpg(pids[0], signal.SIGCONT)


def test_modified_runtime_identity_fails_closed_without_installing_or_building(monkeypatch):
    runtime, manifest = node_runtime()
    original = Path.read_text

    def substituted(path, *args, **kwargs):
        if path == runtime / "build" / "manifest.json":
            return json.dumps({**manifest, "node_sha256": "0" * 64})
        return original(path, *args, **kwargs)

    monkeypatch.setattr(Path, "read_text", substituted)
    with pytest.raises(CodingError) as error:
        asyncio.run(PythonTestRunner().probe(PROFILE))
    assert error.value.code == "coding_node_unavailable" and error.value.status == 422


@pytest.mark.parametrize("output", [
    "",
    'MYBOT_TEST_RESULT={"tests_run":1,"failures":0,"errors":0,"skipped":0,"success":true}\n' * 2,
    'MYBOT_TEST_RESULT={"tests_run":true,"failures":0,"errors":0,"skipped":0,"success":true}\n',
    'MYBOT_TEST_RESULT={"tests_run":1,"failures":0,"errors":0,"skipped":2,"success":true}\n',
])
def test_missing_duplicate_or_inconsistent_legacy_receipts_still_fail(output):
    result = parse_test_result({
        "profile": PROFILE, "output": output, "exit_code": 0, "timed_out": False, "truncated": False,
    })
    assert result["receipt"] is None and not result["passed"]
