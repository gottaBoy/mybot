from __future__ import annotations

import fcntl
import hashlib
import ipaddress
import secrets
import shutil
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .config import Settings
from .backend import BackendError
from .backend_service import BackendService
from .context import ContextError, snapshot, validate_directory
from .engine import Engine
from .harness import LocalSuperagentHarness
from .provider import ProviderError, ProviderRouter, key_available
from .recovery import MODEL_FIELDS
from .schemas import (
    ArtifactDecision, BackendCheck, BackendCreate, DefaultModel, Login, ModelCreate, ProjectCreate,
    Resume, RunCreate, RunRetry, TaskCreate,
)
from .store import Store, now


def create_app(settings=None, provider=None, backend_adapter=None) -> FastAPI:
    settings = settings or Settings.from_env()
    store = Store(settings.data_dir)
    engine = Engine(store, provider or ProviderRouter(), settings.poll_interval)
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
        return {**model, "key_available": key_available(model)}

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
                                 "harness": LocalSuperagentHarness.capabilities()}}

    @app.post("/api/projects", status_code=201)
    async def project_create(body: ProjectCreate):
        validate_directory(settings.workspace, body.directory)
        return store.add("projects", body.model_dump(), "project.created")

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
    async def model_test(identifier: str):
        model = store.get("models", identifier)
        if model.get("kind") == "codex_cli":
            model = {**model, "workspace": str(settings.workspace)}
        try:
            await engine.provider.complete(model, [{"role": "user", "content": "Reply only OK."}], 16)
            status = "reachable"
        except ProviderError as exc:
            status = exc.code
        with store.transaction() as db:
            db.execute("UPDATE models SET tested_at=?,test_status=? WHERE id=?", (now(), status, identifier))
            store.event(db, "model.tested", {"status": status}, entity_id=identifier, actor="user")
        return {"status": status, "note": "A minimal request tests reachability, not full tool capability"}

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
