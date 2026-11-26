import asyncio
import json
from pathlib import Path
import textwrap
import venv

import pytest

from test_coding import coding_case, execute, prepared
from test_workbench import post, wait_status
from workbench.coding_runner import CodingError, PythonTestRunner
from workbench.recovery import fingerprint


PROFILE = "python-pytest"
RECEIPT_KEYS = {"tests_run", "failures", "errors", "skipped", "success"}


def selected(root, content, name="test_selected.py"):
    path = root / name
    path.write_text(textwrap.dedent(content), encoding="utf-8")
    return name


def run_selected(root, content, timeout=5):
    name = selected(root, content)
    return asyncio.run(PythonTestRunner().run(root, [name], timeout, profile=PROFILE))


def preview(case, config):
    return post(case[0], f"/api/tasks/{case[5]['id']}/coding/preview", config)


def prepare_config(case, config, candidate, request_id="pytest-request-original"):
    return post(case[0], f"/api/tasks/{case[5]['id']}/coding/prepare", {
        **config, "request_id": request_id, "preview_hash": candidate["candidate_hash"],
    })


def test_profile_probe_executes_confined_pytest_fixtures_and_parametrization():
    result = asyncio.run(PythonTestRunner().probe(PROFILE))
    assert result == {
        "id": "landlock-seccomp-python", "available": True, "profile": PROFILE,
    }


def test_real_fixtures_parametrization_assertions_and_explicit_file_selection(tmp_path):
    chosen = selected(tmp_path, """
        import pytest

        @pytest.fixture
        def source():
            return {"base": 10}

        @pytest.mark.parametrize("value", [1, 2, 3])
        def test_add(source, value):
            assert source["base"] + value == 10 + value
    """)
    selected(tmp_path, "raise RuntimeError('not explicitly selected')\n", "test_other.py")
    original = {path.name: path.read_bytes() for path in tmp_path.iterdir()}
    result = asyncio.run(PythonTestRunner().run(tmp_path, [chosen], profile=PROFILE))
    assert result["passed"] and result["profile"] == PROFILE, result
    assert result["tests_run"] == 3 and result["exit_code"] == 0
    assert result["command"][1:3] == ["-I", "-B"]
    assert json.loads(result["command"][-1]) == {
        "profile": PROFILE, "test_files": [chosen],
    }
    assert result["receipt"] == {
        "tests_run": 3, "failures": 0, "errors": 0, "skipped": 0, "success": True,
    }
    assert {path.name: path.read_bytes() for path in tmp_path.iterdir()} == original


def test_real_assertion_failure_is_not_a_pass(tmp_path):
    result = run_selected(tmp_path, """
        def test_wrong_result():
            assert 2 + 2 == 5, "actual assertion evidence"
    """)
    assert not result["passed"] and result["exit_code"] != 0
    assert result["receipt"] == {
        "tests_run": 1, "failures": 1, "errors": 0, "skipped": 0, "success": False,
    }
    assert "actual assertion evidence" in result["output"]


@pytest.mark.parametrize(("source", "counts"), [
    ("import pytest\n", (0, 0, 0)),
    (
        "import pytest\n@pytest.mark.skip(reason='no validation')\n"
        "def test_skipped(): pass\n",
        (1, 0, 1),
    ),
    (
        "import pytest\n@pytest.mark.xfail(reason='known failure')\n"
        "def test_expected_failure(): assert False\n",
        (1, 0, 1),
    ),
    (
        "import pytest\n@pytest.mark.xfail(reason='unexpected pass')\n"
        "def test_unexpected_pass(): assert True\n",
        (1, 1, 0),
    ),
])
def test_empty_skip_xfail_and_xpass_cannot_establish_verification(tmp_path, source, counts):
    result = run_selected(tmp_path, source)
    assert not result["passed"] and result["exit_code"] != 0, result
    assert set(result["receipt"]) == RECEIPT_KEYS
    assert (
        result["receipt"]["tests_run"], result["receipt"]["failures"],
        result["receipt"]["skipped"],
    ) == counts
    assert result["receipt"]["success"] is False


def test_actual_pass_can_coexist_with_skip_and_expected_failure(tmp_path):
    result = run_selected(tmp_path, """
        import pytest

        def test_actual_pass():
            assert 3 * 3 == 9

        @pytest.mark.skip(reason="not applicable")
        def test_skipped():
            assert False

        @pytest.mark.xfail(reason="known issue")
        def test_expected_failure():
            assert False
    """)
    assert result["passed"], result
    assert result["receipt"] == {
        "tests_run": 3, "failures": 0, "errors": 0, "skipped": 2, "success": True,
    }


@pytest.mark.parametrize(("source", "tests_run"), [
    ("raise RuntimeError('collection failed')\n", 0),
    (
        "import pytest\n@pytest.fixture\ndef broken(): raise RuntimeError('setup failed')\n"
        "def test_case(broken): assert True\n",
        1,
    ),
    (
        "import pytest\n@pytest.fixture\ndef broken():\n"
        "    yield 1\n    raise RuntimeError('teardown failed')\n"
        "def test_case(broken): assert broken == 1\n",
        1,
    ),
])
def test_collection_setup_and_teardown_errors_are_reported(tmp_path, source, tests_run):
    result = run_selected(tmp_path, source)
    assert not result["passed"] and result["exit_code"] != 0, result
    assert result["receipt"] == {
        "tests_run": tests_run, "failures": 0, "errors": 1,
        "skipped": 0, "success": False,
    }


def test_repository_config_conftest_environment_plugins_and_cache_are_ignored(tmp_path, monkeypatch):
    selected(tmp_path, "raise RuntimeError('conftest must not load')\n", "conftest.py")
    selected(tmp_path, "raise RuntimeError('environment plugin must not load')\n", "bad_plugin.py")
    (tmp_path / "pytest.ini").write_text(
        "[pytest]\naddopts = --unknown-project-option\npython_files = absent_*.py\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("PYTEST_ADDOPTS", "--unknown-environment-option")
    monkeypatch.setenv("PYTEST_PLUGINS", "bad_plugin")
    monkeypatch.setenv("PYTEST_DISABLE_PLUGIN_AUTOLOAD", "0")
    result = run_selected(tmp_path, """
        import os
        from pathlib import Path

        def test_clean_profile():
            assert os.environ.get("PYTEST_DISABLE_PLUGIN_AUTOLOAD") == "1"
            assert "PYTEST_ADDOPTS" not in os.environ
            assert "PYTEST_PLUGINS" not in os.environ
            assert not Path(".pytest_cache").exists()
    """)
    assert result["passed"] and result["tests_run"] == 1, result
    assert not (tmp_path / ".pytest_cache").exists()
    assert not list(tmp_path.rglob("__pycache__"))


def test_selected_module_cannot_load_project_pytest_plugins(tmp_path):
    selected(tmp_path, "raise RuntimeError('plugin was imported')\n", "project_plugin.py")
    result = run_selected(tmp_path, """
        pytest_plugins = ["project_plugin"]

        def test_without_plugin():
            assert True
    """)
    assert not result["passed"] and result["exit_code"] != 0, result
    assert "mybot_pytest_module_plugins_unsupported" in result["output"]
    assert "plugin was imported" not in result["output"]


def test_pytest_cannot_read_outside_write_files_network_or_create_processes(tmp_path):
    workspace = tmp_path / "copy"
    workspace.mkdir()
    private = tmp_path / "private-source"
    private.write_text("must remain private", encoding="utf-8")
    chosen = selected(workspace, f"""
        import os
        from pathlib import Path
        import socket
        import subprocess
        import sys
        import pytest

        def test_boundaries():
            with pytest.raises(PermissionError):
                Path({str(private)!r}).read_bytes()
            with pytest.raises(PermissionError):
                Path("test_selected.py").write_text("changed")
            with pytest.raises(PermissionError):
                socket.socket()
            with pytest.raises(PermissionError):
                os.fork()
            with pytest.raises(PermissionError):
                subprocess.run([sys.executable, "-c", "pass"], check=True)
            with pytest.raises(PermissionError):
                os.chmod({str(private)!r}, 0o777)
    """)
    original = (workspace / chosen).read_bytes()
    result = asyncio.run(PythonTestRunner().run(workspace, [chosen], profile=PROFILE))
    assert result["passed"] and result["tests_run"] == 1, result
    assert (workspace / chosen).read_bytes() == original
    assert private.read_text() == "must remain private"


@pytest.mark.parametrize(("source", "flag"), [
    ("def test_timeout():\n    while True: pass\n", "timed_out"),
    (
        "def test_output():\n"
        "    print('x' * 100000)\n    assert False\n",
        "truncated",
    ),
])
def test_pytest_timeout_and_output_limit_never_pass(tmp_path, source, flag):
    result = run_selected(tmp_path, source, timeout=1)
    assert not result["passed"] and result["exit_code"] != 0, result
    assert result[flag], result
    assert len(result["output"].encode("utf-8")) <= 32768


def test_missing_pytest_real_interpreter_probe_fails_closed(tmp_path, monkeypatch):
    interpreter = tmp_path / "without-pytest"
    venv.EnvBuilder(with_pip=False, symlinks=True).create(interpreter)
    monkeypatch.setattr("workbench.coding_runner.sys.executable", str(interpreter / "bin" / "python"))
    with pytest.raises(CodingError) as rejected:
        asyncio.run(PythonTestRunner().probe(PROFILE))
    assert rejected.value.code == "coding_pytest_unavailable"
    assert rejected.value.status == 422
    assert asyncio.run(PythonTestRunner().probe())["profile"] == "python-unittest"


def test_legacy_unittest_profile_and_array_argv_remain_compatible(tmp_path):
    name = selected(tmp_path, """
        import unittest

        class Legacy(unittest.TestCase):
            def test_value(self):
                self.assertEqual(4 + 1, 5)
    """)
    runner = PythonTestRunner()
    legacy = asyncio.run(runner.run(tmp_path, [name]))
    explicit = asyncio.run(runner.run(tmp_path, [name], profile="python-unittest"))
    assert legacy["passed"] and explicit["passed"]
    assert legacy["profile"] == explicit["profile"] == "python-unittest"
    assert legacy["receipt"] == explicit["receipt"] == {
        "tests_run": 1, "failures": 0, "errors": 0, "skipped": 0, "success": True,
    }
    assert json.loads(legacy["command"][-1]) == [name]


def test_profile_input_is_strict_and_never_falls_back(coding_case):
    client, _, provider, _, _, task, config = coding_case
    for profile in [None, "", "pytest", "python", 1, True, ["python-pytest"]]:
        response = preview(coding_case, {**config, "profile": profile})
        assert response.status_code == 422, (profile, response.text)
    assert client.get(f"/api/tasks/{task['id']}/coding").json() == {"prepared": None}
    assert provider.requests == []


def test_profile_binds_preview_prepare_replay_and_legacy_serialization(coding_case):
    client, app, provider, _, _, task, config = coding_case
    legacy = preview(coding_case, config).json()
    explicit = preview(coding_case, {**config, "profile": "python-unittest"}).json()
    pytest_candidate = preview(coding_case, {**config, "profile": PROFILE}).json()
    assert "profile" not in legacy["config"]
    assert legacy["snapshot"]["profile"] == "python-unittest"
    assert explicit["config"]["profile"] == explicit["snapshot"]["profile"] == "python-unittest"
    assert pytest_candidate["config"]["profile"] == pytest_candidate["snapshot"]["profile"] == PROFILE
    assert len({value["candidate_hash"] for value in (legacy, explicit, pytest_candidate)}) == 3
    stale = prepare_config(coding_case, {**config, "profile": PROFILE}, legacy)
    assert stale.status_code == 409
    assert stale.json()["detail"]["code"] == "coding_preview_changed"
    original = prepare_config(coding_case, config, legacy)
    assert original.status_code == 200, original.text
    job = original.json()
    assert prepare_config(coding_case, config, legacy).json() == job
    assert "profile" not in job["candidate"]["config"]
    exact = client.get(f"/api/tasks/{task['id']}/coding/{job['request_id']}")
    assert exact.json() == job
    conflict = prepare_config(coding_case, {**config, "profile": "python-unittest"}, explicit)
    assert conflict.status_code == 409
    with app.state.store.transaction() as db:
        stored = json.loads(db.execute(
            "SELECT candidate FROM coding_jobs WHERE request_id=?", (job["request_id"],),
        ).fetchone()[0])
    assert "profile" not in stored["config"]
    assert fingerprint({key: value for key, value in stored.items() if key != "candidate_hash"}) == stored["candidate_hash"]
    assert provider.requests == []


def test_execution_rejects_configuration_snapshot_profile_mismatch(coding_case):
    _, app, provider, _, _, _, config = coding_case
    config["profile"] = PROFILE
    job = prepared(coding_case)
    with app.state.store.transaction() as db:
        row = db.execute(
            "SELECT candidate FROM coding_jobs WHERE request_id=?", (job["request_id"],),
        ).fetchone()
        candidate = json.loads(row["candidate"])
        candidate["snapshot"]["profile"] = "python-unittest"
        db.execute("UPDATE coding_jobs SET candidate=? WHERE request_id=?",
                   (json.dumps(candidate), job["request_id"]))
    response = execute(coding_case, job)
    assert response.status_code == 409, response.text
    assert response.json()["detail"]["code"] == "coding_profile_inconsistent"
    assert app.state.store.list("runs") == [] and provider.requests == []


def test_real_pytest_fail_repair_pass_artifacts_and_original_files_unchanged(coding_case):
    client, _, provider, workspace, _, _, config = coding_case
    config["profile"] = PROFILE
    (workspace / "test_calculator.py").write_text(
        "import pytest\nfrom calculator import add\n"
        "@pytest.fixture\ndef operand(): return 3\n"
        "@pytest.mark.parametrize('left, expected', [(2, 5), (-2, 1)])\n"
        "def test_add(left, expected, operand): assert add(left, operand) == expected\n",
        encoding="utf-8",
    )
    original = {path.name: path.read_bytes() for path in workspace.iterdir()}
    job = prepared(coding_case)
    assert job["candidate"]["config"]["profile"] == PROFILE
    assert provider.requests == []
    applied = execute(coding_case, job)
    assert applied.status_code == 200, applied.text
    result = wait_status(client, applied.json()["run_id"], {"failed", "succeeded"})
    assert result["run"]["status"] == "succeeded", result
    assert result["harness"]["tools"] == [PROFILE]
    attempts = sorted(
        [json.loads(artifact["content"]) for artifact in result["artifacts"]
         if artifact["kind"] == "test_result"],
        key=lambda attempt: attempt["round"],
    )
    assert [attempt["passed"] for attempt in attempts] == [False, False, True]
    assert [attempt["receipt"]["failures"] for attempt in attempts] == [2, 2, 0]
    assert all(attempt["profile"] == PROFILE and attempt["tests_run"] == 2 for attempt in attempts)
    assert all(json.loads(attempt["command"][-1]) == {
        "profile": PROFILE, "test_files": config["tests"],
    } for attempt in attempts)
    assert len(result["calls"]) == len(provider.requests) == 2
    second_input = json.loads(provider.requests[-1][1][-1]["content"])
    assert second_input["previous_test"]["profile"] == PROFILE
    assert second_input["previous_test"]["receipt"]["failures"] == 2
    assert {path.name: path.read_bytes() for path in workspace.iterdir()} == original
    assert execute(coding_case, job).json()["run_id"] == result["run"]["id"]


def test_pytest_all_xfail_baseline_stops_before_model_call(coding_case):
    client, _, provider, workspace, _, _, config = coding_case
    config["profile"] = PROFILE
    (workspace / "test_calculator.py").write_text(
        "import pytest\n@pytest.mark.xfail(reason='not verified')\n"
        "def test_expected_failure(): assert False\n",
        encoding="utf-8",
    )
    job = prepared(coding_case)
    result = wait_status(client, execute(coding_case, job).json()["run_id"], {"failed"})
    assert result["run"]["error"] == "coding_test_runner_unverified"
    assert provider.requests == []
    attempt = json.loads(next(a["content"] for a in result["artifacts"] if a["kind"] == "test_result"))
    assert attempt["profile"] == PROFILE
    assert attempt["receipt"]["skipped"] == attempt["tests_run"] == 1


def test_legacy_checkpoint_keeps_original_hash_when_continued_under_pytest(coding_case, monkeypatch):
    client, _, provider, workspace, _, task, config = coding_case
    config["max_rounds"] = 1
    first_job = prepared(coding_case)
    first = wait_status(client, execute(coding_case, first_job).json()["run_id"], {"failed"})
    assert first["run"]["error"] == "coding_tests_failed"
    old = first["run"]["context"]["coding"]
    assert "profile" not in old["config"]
    old_hash = old["candidate_hash"]
    option = client.get(f"/api/tasks/{task['id']}/coding/checkpoints").json()["items"][0]
    continuation = {**config, "profile": PROFILE, "continuation": {
        "checkpoint": {"id": option["id"], "sha256": option["sha256"]},
        "instruction": "Preserve inherited code and repair the remaining addition assertion.",
    }}
    candidate = preview(coding_case, continuation)
    assert candidate.status_code == 200, candidate.text
    next_job = prepare_config(coding_case, continuation, candidate.json(), "pytest-checkpoint-next").json()
    assert next_job["candidate"]["snapshot"]["profile"] == PROFILE
    original = {path.name: path.read_bytes() for path in workspace.iterdir()}

    async def repair(model, messages, max_tokens):
        provider.requests.append((model, messages, max_tokens))
        return {
            "text": json.dumps({"summary": "Repair addition", "changes": [{
                "path": "calculator.py", "content": "def add(a, b):\n    return a + b\n",
            }]}),
            "model": model["model"], "input_tokens": 20, "output_tokens": 20, "truncated": False,
        }

    monkeypatch.setattr(provider, "complete", repair)
    result = wait_status(client, execute(coding_case, next_job).json()["run_id"], {"failed", "succeeded"})
    assert result["run"]["status"] == "succeeded", result
    attempts = sorted(
        [json.loads(a["content"]) for a in result["artifacts"] if a["kind"] == "test_result"],
        key=lambda value: value["round"],
    )
    assert [attempt["passed"] for attempt in attempts] == [False, True]
    assert all(attempt["profile"] == PROFILE for attempt in attempts)
    assert attempts[0]["receipt"]["failures"] == 2
    preserved = client.get(f"/api/runs/{first['run']['id']}").json()["run"]["context"]["coding"]
    assert preserved == old and preserved["candidate_hash"] == old_hash
    assert {path.name: path.read_bytes() for path in workspace.iterdir()} == original
