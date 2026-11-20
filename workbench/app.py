from __future__ import annotations

import fcntl
import hashlib
import ipaddress
import secrets
import shutil
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, Request, Response
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .config import Settings
from .backend import BackendError
from .backend_service import BackendService
from .context import ContextError, snapshot, validate_directory
from .engine import Engine
from .harness import LocalSuperagentHarness
from .model_test_service import ModelTestService
from .provider import ProviderRouter, key_available
from .project_references import (
    MAX_PROJECT_PAGE, ProjectReferenceError, parse_project_references, read_project_references,
)
from .project_resources import (
    ProjectResourceError, parse_project_detail, parse_project_query,
    read_project_detail, read_project_query,
)
from .recovery import MODEL_FIELDS
from .schemas import (
    ArtifactDecision, BackendCheck, BackendCreate, DefaultModel, Login, ModelCreate, ModelTest, ProjectCreate,
    RecoveryIntentCreate, RecoveryIntentExecute, Resume, RunCreate, RunRetry, TaskCreate,
    SavedViewCreate, SavedViewDelete, SavedViewUpdate,
)
from .saved_views import SavedViewError
from .run_query import RunQueryError, parse_run_query, read_run_page
from .task_board import EMPTY_PAGES, TaskBoardError, parse_task_board, read_task_board
from .task_detail import TaskDetailError, parse_task_detail, read_task_detail
from .task_query import EMPTY_QUERY, MAX_PAGE, TaskQueryError, parse_task_query, read_task_page
from .workspace_reads import (
    WorkspaceReadError, parse_workspace_counts, parse_workspace_search,
    read_workspace_counts, read_workspace_search,
)
from .store import Store


def create_app(settings=None, provider=None, backend_adapter=None) -> FastAPI:
    settings = settings or Settings.from_env()
    store = Store(settings.data_dir)
    engine = Engine(store, provider or ProviderRouter(), settings.poll_interval)
    model_tests = ModelTestService(store, engine.provider, settings.workspace)
    backends = BackendService(store, backend_adapter)
    sessions = {}
    login_attempts = {}
    root = Path(__file__).resolve().parents[1]

    @asynccontextmanager
    async def lifespan(app):
        lock_file = open(settings.data_dir / "worker.lock", "a")
        try:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            lock_file.close()
            raise RuntimeError("Another workbench process owns this data directory") from None
        try:
            engine.start()
            yield
        finally:
            await engine.stop()
            lock_file.close()

    app = FastAPI(title="AI Workbench", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    app.state.store, app.state.engine = store, engine
    app.state.backends = backends
    app.state.model_tests = model_tests
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=list(settings.allowed_hosts))

    def loopback(request):
        try:
            return ipaddress.ip_address(request.client.host).is_loopback
        except ValueError:
            return request.client.host == "testclient"

    def authorized(request):
        if not settings.access_token:
            return loopback(request)
        session = request.cookies.get("workbench_session", "")
        return sessions.get(hashlib.sha256(session.encode()).hexdigest(), 0) > time.time()

    @app.middleware("http")
    async def boundary(request: Request, call_next):
        if not settings.access_token and not loopback(request):
            return JSONResponse({"detail": "Remote access requires WORKBENCH_ACCESS_TOKEN"}, status_code=403)
        if request.url.path.startswith("/api/"):
            if request.headers.get("sec-fetch-site") == "cross-site":
                return JSONResponse({"detail": "Cross-site access denied"}, status_code=403)
            if request.url.path not in {"/api/auth", "/api/auth/state"} and not authorized(request):
                return JSONResponse({"detail": "Authentication required"}, status_code=401)
            if request.method not in {"GET", "HEAD", "OPTIONS"}:
                origin = request.headers.get("origin")
                expected = f"{request.url.scheme}://{request.url.netloc}"
                if origin and origin.rstrip("/") != expected:
                    return JSONResponse({"detail": "Origin not allowed"}, status_code=403)
                if request.headers.get("x-workbench-request") != "1":
                    return JSONResponse({"detail": "Missing request boundary"}, status_code=403)
                try:
                    length = int(request.headers.get("content-length", "0") or "0")
                except ValueError:
                    return JSONResponse({"detail": "Invalid content length"}, status_code=400)
                if length > 131072:
                    return JSONResponse({"detail": "Request too large"}, status_code=413)
                size = 0
                chunks = []
                async for chunk in request.stream():
                    size += len(chunk)
                    if size > 131072:
                        return JSONResponse({"detail": "Request too large"}, status_code=413)
                    chunks.append(chunk)
                # Starlette reuses cached request bytes for downstream schema parsing.
                request._body = b"".join(chunks)
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; "
            "base-uri 'self'; form-action 'self'"
        )
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.exception_handler(KeyError)
    async def not_found(request, exc):
        return JSONResponse({"detail": "Object not found"}, status_code=404)

    @app.exception_handler(ContextError)
    async def context_error(request, exc):
        return JSONResponse({"detail": str(exc)}, status_code=422)

    @app.exception_handler(BackendError)
    async def backend_error(request, exc):
        status = 422 if exc.code in {"backend_check_confirmation_required", "backend_read_confirmation_required"} else 409
        return JSONResponse({"detail": exc.code}, status_code=status)

    @app.exception_handler(SavedViewError)
    async def saved_view_error(request, exc):
        return JSONResponse({"detail": exc.detail()}, status_code=exc.status)

    @app.exception_handler(TaskQueryError)
    async def task_query_error(request, exc):
        return JSONResponse({"detail": {"code": exc.code}}, status_code=exc.status)

    @app.exception_handler(RunQueryError)
    async def run_query_error(request, exc):
        return JSONResponse({"detail": {"code": exc.code}}, status_code=exc.status)

    @app.exception_handler(TaskBoardError)
    async def task_board_error(request, exc):
        return JSONResponse({"detail": {"code": exc.code}}, status_code=exc.status)

    @app.exception_handler(TaskDetailError)
    async def task_detail_error(request, exc):
        return JSONResponse({"detail": {"code": exc.code}}, status_code=exc.status)

    @app.exception_handler(WorkspaceReadError)
    async def workspace_read_error(request, exc):
        return JSONResponse({"detail": {"code": exc.code}}, status_code=exc.status)

    @app.exception_handler(ProjectReferenceError)
    async def project_reference_error(request, exc):
        return JSONResponse({"detail": {"code": exc.code}}, status_code=exc.status)

    @app.exception_handler(ProjectResourceError)
    async def project_resource_error(request, exc):
        return JSONResponse({"detail": {"code": exc.code}}, status_code=exc.status)

    @app.get("/api/auth/state")
    async def auth_state(request: Request):
        return {"authenticated": authorized(request), "required": bool(settings.access_token),
                "mode": "token" if settings.access_token else "local"}

    @app.post("/api/auth")
    async def login(body: Login, request: Request, response: Response):
        address = request.client.host
        attempts = [v for v in login_attempts.get(address, []) if time.monotonic() - v < 60]
        if len(attempts) >= 8:
            raise HTTPException(429, "Too many attempts; wait a minute")
        login_attempts[address] = attempts + [time.monotonic()]
        if not settings.access_token or not secrets.compare_digest(body.token, settings.access_token):
            raise HTTPException(401, "Invalid access token")
        session = secrets.token_urlsafe(40)
        sessions[hashlib.sha256(session.encode()).hexdigest()] = time.time() + 43200
        response.set_cookie("workbench_session", session, httponly=True, secure=settings.secure_cookie,
                            samesite="strict", max_age=43200)
        return {"authenticated": True}

    @app.post("/api/logout")
    async def logout(request: Request, response: Response):
        session = request.cookies.get("workbench_session", "")
        sessions.pop(hashlib.sha256(session.encode()).hexdigest(), None)
        response.delete_cookie("workbench_session")
        return {"ok": True}

    @app.get("/healthz")
    async def health():
        return {"status": "ok"}

    def public_model(model):
        return {**model, "key_available": key_available(model),
                "latest_test": model_tests.latest(model["id"])}

    @app.get("/api/bootstrap")
    async def bootstrap():
        local_harnesses = [
            {"id": name, "label": label, "available": bool(shutil.which(name)), "auth": "unverified"}
            for name, label in (("codex", "Codex CLI"), ("claude", "Claude Code"),
                                ("opencode", "OpenCode"), ("t3", "T3 Code"))
        ]
        connections = store.list("backend_connections")
        cached = {}
        for connection in connections:
            try:
                cached[connection["id"]] = store.cached_conversations(connection["id"])
            except BackendError as exc:
                if exc.code != "backend_revoked":
                    raise
        return {"projects": store.list("projects"), "models": [public_model(m) for m in store.list("models")],
                "tasks": store.list("tasks"), "runs": store.list("runs"),
                "backends": connections,
                "backend_conversations": cached,
                "workspace": str(settings.workspace), "access": "read_only",
                "default_model_id": store.get_setting("default_model_id", settings.default_model_id),
                "local_harnesses": local_harnesses,
                "capabilities": {"code_write": False, "shell": False, "deployment": False,
                                 "backend_sync": backends.read_adapter is not None,
                                 "parallel_research": True, "max_parallel": 2,
                                 "agent_work": True,
                                 "task_query": True,
                                 "task_board": True,
                                 "run_query": True,
                                 "task_detail": True,
                                 "workspace_counts": True,
                                 "workspace_search": True,
                                 "project_references": True,
                                 "project_detail": True,
                                 "project_query": True,
                                 "harness": LocalSuperagentHarness.capabilities()}}

    @app.get("/api/projects/query")
    def project_query(
        request: Request,
        q: str = Query("", max_length=2000),
        page: int = Query(1, ge=1, le=MAX_PROJECT_PAGE),
        page_size: int = Query(20, ge=20, le=100),
    ):
        allowed = {"q", "page", "page_size"}
        if any(
            key not in allowed or len(request.query_params.getlist(key)) != 1
            for key in request.query_params
        ):
            raise ProjectResourceError("project_query_parameters_invalid")
        candidate = parse_project_query(q, page, page_size)
        return read_project_query(store.path, candidate)

    @app.get("/api/projects/{identifier:path}/detail")
    def project_detail(identifier: str, request: Request):
        if request.query_params:
            raise ProjectResourceError("project_detail_parameters_invalid")
        candidate = parse_project_detail(identifier)
        return read_project_detail(store.path, candidate)

    @app.get("/api/project-references")
    def project_references(
        request: Request,
        q: str = Query("", max_length=2000),
        page: int = Query(1, ge=1, le=MAX_PROJECT_PAGE),
        page_size: int = Query(20, ge=20, le=100),
        selected: str = Query("[]", max_length=24000),
    ):
        allowed = {"q", "page", "page_size", "selected"}
        if any(
            key not in allowed or len(request.query_params.getlist(key)) != 1
            for key in request.query_params
        ):
            raise ProjectReferenceError("project_references_parameters_invalid")
        candidate = parse_project_references(q, page, page_size, selected)
        return read_project_references(store.path, candidate)

    @app.get("/api/workspace/counts")
    def workspace_counts(
        request: Request,
        projects: str = Query("[]", max_length=24000),
        scope_project_id: str | None = Query(None, min_length=1, max_length=100),
    ):
        allowed = {"projects", "scope_project_id"}
        if any(
            key not in allowed or len(request.query_params.getlist(key)) != 1
            for key in request.query_params
        ):
            raise WorkspaceReadError("workspace_counts_parameters_invalid")
        candidate = parse_workspace_counts(projects, scope_project_id)
        return read_workspace_counts(store.path, candidate)

    @app.get("/api/workspace/search")
    def workspace_search(
        request: Request,
        q: str = Query("", max_length=2000),
        limit: int = Query(20, ge=20, le=50),
        scope_project_id: str | None = Query(None, min_length=1, max_length=100),
    ):
        allowed = {"q", "limit", "scope_project_id"}
        if any(
            key not in allowed or len(request.query_params.getlist(key)) != 1
            for key in request.query_params
        ):
            raise WorkspaceReadError("workspace_search_parameters_invalid")
        candidate = parse_workspace_search(q, limit, scope_project_id)
        return read_workspace_search(store.path, candidate)

    @app.post("/api/projects", status_code=201)
    async def project_create(body: ProjectCreate):
        validate_directory(settings.workspace, body.directory)
        return store.add("projects", body.model_dump(), "project.created")

    @app.get("/api/tasks/board")
    def task_board(
        request: Request,
        query: str = Query(EMPTY_QUERY, max_length=24000),
        pages: str = Query(EMPTY_PAGES, max_length=1024),
        scope_project_id: str | None = Query(None, min_length=1, max_length=100),
    ):
        allowed = {"query", "pages", "scope_project_id"}
        if any(
            key not in allowed or len(request.query_params.getlist(key)) != 1
            for key in request.query_params
        ):
            raise TaskBoardError("task_board_parameters_invalid")
        candidate = parse_task_board(query, pages, scope_project_id)
        return read_task_board(store.path, candidate)

    @app.get("/api/tasks/query")
    def task_query(
        request: Request,
        query: str = Query(EMPTY_QUERY, max_length=24000),
        sorts: str = Query("[]", max_length=1024),
        scope_project_id: str | None = Query(None, min_length=1, max_length=100),
        page: int = Query(1, ge=1, le=MAX_PAGE),
        page_size: int = Query(20, ge=20, le=100),
    ):
        allowed = {"query", "sorts", "scope_project_id", "page", "page_size"}
        if any(
            key not in allowed or len(request.query_params.getlist(key)) != 1
            for key in request.query_params
        ):
            raise TaskQueryError("task_query_parameters_invalid")
        candidate = parse_task_query(query, sorts, scope_project_id, page, page_size)
        return read_task_page(store.path, candidate)

    @app.get("/api/saved-views")
    async def saved_view_list(
        request: Request, scope_type: str | None = None, project_id: str | None = None,
        offset: int = Query(0, ge=0, le=9007199254740991), limit: int = Query(100, ge=1, le=100),
    ):
        allowed = {"scope_type", "project_id", "offset", "limit"}
        if any(
            key not in allowed or len(request.query_params.getlist(key)) != 1
            for key in request.query_params
        ):
            raise SavedViewError("saved_view_query_invalid", 422)
        return store.list_saved_views(scope_type, project_id, offset, limit)

    @app.get("/api/saved-views/{identifier}")
    async def saved_view_read(identifier: str):
        return store.saved_view(identifier)

    @app.post("/api/saved-views", status_code=201)
    async def saved_view_create(body: SavedViewCreate):
        return store.create_saved_view(body.model_dump())

    @app.put("/api/saved-views/{identifier}")
    async def saved_view_update(identifier: str, body: SavedViewUpdate):
        return store.update_saved_view(identifier, body.model_dump())

    @app.post("/api/saved-views/{identifier}/delete")
    async def saved_view_delete(identifier: str, body: SavedViewDelete):
        return store.delete_saved_view(identifier, body.expected_revision)

    @app.post("/api/models", status_code=201)
    async def model_create(body: ModelCreate):
        return public_model(store.add("models", body.model_dump(), "model.configured"))

    @app.post("/api/models/enable-codex")
    async def enable_codex():
        if not shutil.which("codex"):
            raise HTTPException(422, "Codex CLI was not found on PATH")
        existing = next((model for model in store.list("models") if model.get("kind") == "codex_cli"), None)
        if existing:
            return {"model": public_model(existing), "created": False,
                    "note": "Codex CLI 配置已存在；尚未发起请求"}
        model = store.add("models", {
            "kind": "codex_cli", "name": "Codex CLI", "endpoint": "codex://local",
            "model": "codex-cli", "key_env": "",
        }, "model.codex_enabled")
        return {"model": public_model(model), "created": True,
                "note": "Codex CLI 配置已启用；尚未发起请求"}

    @app.post("/api/models/{identifier}/test")
    async def model_test(identifier: str, body: ModelTest):
        if not body.consent:
            raise HTTPException(422, "model_test_confirmation_required")
        try:
            return await model_tests.start(identifier, body.request_id)
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from exc

    @app.get("/api/models/{identifier}/tests/{request_id}")
    async def model_test_status(identifier: str, request_id: str):
        try:
            return model_tests.read(identifier, request_id)
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from exc

    @app.post("/api/settings/default-model")
    async def default_model(body: DefaultModel):
        model = store.get("models", body.model_id)
        store.set_setting("default_model_id", model["id"])
        return {"model_id": model["id"], "name": model["name"], "note": "保存默认模型不发起请求"}

    @app.post("/api/tasks", status_code=201)
    async def task_create(body: TaskCreate):
        project = store.get("projects", body.project_id)
        snapshot(settings.workspace, project, body.files)
        return store.add("tasks", body.model_dump(), "task.created")

    @app.post("/api/tasks/{identifier}/preview")
    async def task_preview(identifier: str):
        task = store.get("tasks", identifier)
        project = store.get("projects", task["project_id"])
        text, evidence = snapshot(settings.workspace, project, task["files"])
        return {"goal": task["goal"], "acceptance": task["acceptance"], "notes": project["notes"],
                "text": text, "evidence": evidence, "bytes": len(text.encode()),
                "access": "read_only", "tools": [],
                "context_hash": hashlib.sha256(json_bytes(task, project, text)).hexdigest()}

    @app.get("/api/tasks/{identifier}/detail")
    def task_detail(
        identifier: str,
        request: Request,
        page: int = Query(1, ge=1, le=MAX_PAGE),
        page_size: int = Query(20, ge=20, le=100),
        scope_project_id: str | None = Query(None, min_length=1, max_length=100),
    ):
        allowed = {"page", "page_size", "scope_project_id"}
        if any(
            key not in allowed or len(request.query_params.getlist(key)) != 1
            for key in request.query_params
        ):
            raise TaskDetailError("task_detail_parameters_invalid")
        candidate = parse_task_detail(identifier, scope_project_id, page, page_size)
        return read_task_detail(store.path, candidate)

    @app.post("/api/tasks/{identifier}/runs", status_code=201)
    async def run_create(identifier: str, body: RunCreate):
        if not body.consent:
            raise HTTPException(422, "Confirm sending the exact selected context to the configured models")
        task = store.get("tasks", identifier)
        project = store.get("projects", task["project_id"])
        config = body.model_dump(exclude={"consent", "request_id", "context_hash"})
        models = {}
        for field in ("coordinator_model", "researcher_model", "reviewer_model"):
            model = store.get("models", config[field])
            if not key_available(model):
                if model.get("kind") == "codex_cli":
                    models[model["id"]] = {**model, "workspace": str(settings.workspace)}
                    continue
                raise HTTPException(422, f"Missing environment key for {model['name']}")
            models[model["id"]] = model
        text, evidence = snapshot(settings.workspace, project, task["files"])
        if not secrets.compare_digest(body.context_hash, hashlib.sha256(json_bytes(task, project, text)).hexdigest()):
            raise HTTPException(409, "Context changed after preview; inspect and confirm the latest snapshot")
        context = {"text": text, "evidence": evidence, "notes": project["notes"],
                   "goal": task["goal"], "acceptance": task["acceptance"], "models": models,
                   "hash": body.context_hash}
        try:
            return store.create_run(identifier, body.request_id, config, context)
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from exc

    @app.get("/api/runs/query")
    def run_query(
        request: Request,
        query: str = Query(EMPTY_QUERY, max_length=24000),
        sorts: str = Query("[]", max_length=1024),
        scope_project_id: str | None = Query(None, min_length=1, max_length=100),
        page: int = Query(1, ge=1, le=MAX_PAGE),
        page_size: int = Query(20, ge=20, le=100),
    ):
        allowed = {"query", "sorts", "scope_project_id", "page", "page_size"}
        if any(
            key not in allowed or len(request.query_params.getlist(key)) != 1
            for key in request.query_params
        ):
            raise RunQueryError("run_query_parameters_invalid")
        candidate = parse_run_query(query, sorts, scope_project_id, page, page_size)
        return read_run_page(store.path, candidate)

    @app.get("/api/runs/{identifier}")
    async def run_detail(identifier: str):
        run = store.get("runs", identifier)
        task = store.get("tasks", run["task_id"])
        agents = store.list("agents", identifier)
        calls = store.list("calls", identifier)
        artifacts = store.list("artifacts", identifier)
        events = store.events(identifier)
        return {"run": run, "task": task, "project": store.get("projects", task["project_id"]),
                "agents": agents, "calls": calls, "artifacts": artifacts, "events": events,
                "retry_runs": store.retry_children(identifier),
                "harness": LocalSuperagentHarness.describe(run, agents, calls, artifacts, events)}

    @app.get("/api/runs/{identifier}/events")
    async def run_events(identifier: str, after: int = 0):
        store.get("runs", identifier)
        return {"events": store.events(identifier, max(0, after))}

    @app.get("/api/backends")
    async def backend_list():
        return {"connections": store.list("backend_connections"), "read_only": True}

    @app.post("/api/backends", status_code=201)
    async def backend_configure(body: BackendCreate):
        return backends.configure(body)

    @app.get("/api/backends/{identifier}/health")
    async def backend_health(identifier: str):
        return backends.health(identifier)

    @app.post("/api/backends/{identifier}/check")
    async def backend_check(identifier: str, body: BackendCheck):
        return await backends.check_health(identifier, body.consent)

    @app.post("/api/backends/{identifier}/revoke")
    async def backend_revoke(identifier: str):
        return backends.revoke(identifier)

    @app.get("/api/backends/{identifier}/conversations")
    async def backend_conversations(identifier: str):
        return {"conversations": store.cached_conversations(identifier), "read_only": True}

    @app.post("/api/backends/{identifier}/sync")
    async def backend_sync(identifier: str, body: BackendCheck):
        return await backends.sync_conversations(identifier, body.consent)

    @app.get("/api/conversations/{identifier}/messages")
    async def conversation_messages(identifier: str):
        return store.cached_recent_messages(identifier)

    @app.post("/api/conversations/{identifier}/sync")
    async def conversation_sync(identifier: str, body: BackendCheck):
        return await backends.sync_messages(identifier, body.consent)

    @app.get("/api/runs/{identifier}/retry-preview")
    async def run_retry_preview(identifier: str):
        return store.retry_preview(identifier)

    @app.post("/api/runs/{identifier}/retry", status_code=201)
    async def run_retry(identifier: str, body: RunRetry):
        if not body.consent:
            raise HTTPException(422, "retry_send_confirmation_required")
        preview = store.retry_preview(identifier)
        config = body.model_dump(exclude={"consent", "acknowledge_replay", "request_id", "snapshot_hash"})
        active_roles = {step["role"] for step in preview["steps"] if step["action"] != "reuse"}
        models = {}
        for role, field in zip(("coordinator", "researcher", "reviewer"), MODEL_FIELDS):
            if role not in active_roles:
                if config[field] != preview["defaults"][field]:
                    raise HTTPException(422, "retry_completed_role_model_locked")
                continue
            model = store.get("models", config[field])
            if not key_available(model):
                raise HTTPException(422, "missing_api_key")
            if model.get("kind") == "codex_cli":
                model = {**model, "workspace": str(settings.workspace)}
            models[model["id"]] = model
        try:
            return store.create_retry(
                identifier, body.request_id, config, models, body.snapshot_hash, body.acknowledge_replay,
            )
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from exc

    @app.post("/api/runs/{identifier}/recovery-intents")
    async def recovery_intent_prepare(identifier: str, body: RecoveryIntentCreate):
        try:
            return store.prepare_recovery_intent(
                identifier, body.request_id, body.mode, body.snapshot_hash,
                body.config.model_dump() if body.config is not None else None,
            )
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from exc

    @app.get("/api/runs/{identifier}/recovery-intents")
    async def recovery_intent_list(identifier: str):
        return store.recovery_intents(identifier)

    @app.get("/api/runs/{identifier}/recovery-intents/{request_id}")
    async def recovery_intent_read(identifier: str, request_id: str):
        try:
            return store.recovery_intent(identifier, request_id)
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from exc

    @app.post("/api/runs/{identifier}/recovery-intents/{request_id}/abandon")
    async def recovery_intent_abandon(identifier: str, request_id: str):
        try:
            return store.abandon_recovery_intent(identifier, request_id)
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from exc

    @app.post("/api/runs/{identifier}/recovery-intents/{request_id}/execute")
    async def recovery_intent_execute(identifier: str, request_id: str, body: RecoveryIntentExecute):
        if not body.consent:
            raise HTTPException(422, "recovery_intent_consent_required")
        try:
            return store.execute_recovery_intent(
                identifier, request_id, body.acknowledge_replay, settings.workspace,
            )
        except ValueError as exc:
            status = 422 if str(exc) == "retry_replay_confirmation_required" else 409
            raise HTTPException(status, str(exc)) from exc

    @app.post("/api/runs/{identifier}/{action}")
    async def run_control(identifier: str, action: str, body: Resume):
        if action not in {"pause", "cancel", "resume"}:
            raise HTTPException(404, "Action not found")
        try:
            result = store.control(identifier, action, body.acknowledge_replay)
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from exc
        if action == "cancel":
            engine.cancel(identifier)
        return result

    @app.post("/api/artifacts/{identifier}/decision")
    async def artifact_decision(identifier: str, body: ArtifactDecision):
        store.decide(identifier, body.decision)
        return store.get("artifacts", identifier)

    app.mount("/icons", StaticFiles(directory=root / "design/review-v1/assets/icons"), name="icons")
    app.mount("/styles", StaticFiles(directory=root / "design/review-v2"), name="styles")
    app.mount("/assets", StaticFiles(directory=root / "web"), name="web")

    @app.get("/")
    async def index():
        return FileResponse(root / "web/index.html")

    return app


def json_bytes(task, project, text):
    import json
    return json.dumps([task["goal"], task["acceptance"], project["notes"], text], ensure_ascii=False).encode()
