import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  FileCheck2,
  GitBranch,
  History,
  ListChecks,
  RefreshCw,
  Save,
  SearchCheck,
  UserCheck,
} from "lucide-react";
import {
  AppBadge,
  AppButton,
  AppCheckbox,
  AppDialog,
  AppInput,
  AppLoading,
  AppNumber,
  AppSelect,
  AppTextArea,
} from "../components/ui";
import { AppDraftGuard } from "../components/ui/DraftGuard";
import { ApiError, type Bootstrap } from "./api";
import {
  cancelWorkbenchNavigation,
  confirmWorkbenchNavigation,
  pushWorkbenchNavigation,
  registerWorkbenchNavigationBlocker,
} from "./navigation-guard";
import type { Copy, Locale } from "./state";
import {
  fetchWorkflow,
  fetchWorkflowImpact,
  fetchWorkflowOperation,
  fetchWorkflowVersion,
  fetchWorkflowVersions,
  parseWorkflowDefinition,
  publishWorkflow,
  saveWorkflowDraft,
  type WorkflowBundle,
  type WorkflowCommand,
  type WorkflowDefinition,
  type WorkflowImpact,
  type WorkflowReceipt,
  type WorkflowVersion,
  type WorkflowVersions,
} from "./workflows";
import "./workflow-page.css";

type Editor = { baseline: WorkflowBundle; draft: WorkflowDefinition };
type ReadFailure = { hard: boolean; message: string };
type Operation =
  | { phase: "idle" }
  | {
      phase: "sending" | "unknown" | "checking" | "missing";
      requestId: string;
      command?: WorkflowCommand;
    };
type Notice = { tone: "info" | "error"; text: string };

export function readWorkflowPendingRequest(href: string) {
  const query = href.split("#")[1]?.split("?")[1] ?? "";
  const params = new URLSearchParams(query);
  const values = params.getAll("workflowRequest");
  if (!values.length) return {};
  return values.length === 1 && /^[A-Za-z0-9_-]{8,100}$/.test(values[0])
    ? { requestId: values[0] }
    : { error: true };
}

export function workflowDraftDirty(editor: Editor | undefined) {
  return Boolean(
    editor &&
    JSON.stringify(editor.draft) !== JSON.stringify(editor.baseline.definition),
  );
}

export function workflowPublicationMatches(
  editor: Editor | undefined,
  current: WorkflowBundle | undefined,
  impact: WorkflowImpact | undefined,
) {
  return Boolean(
    editor &&
    current &&
    impact &&
    !workflowDraftDirty(editor) &&
    editor.baseline.revision === current.revision &&
    editor.baseline.definition_hash === current.definition_hash &&
    impact.revision === editor.baseline.revision &&
    impact.definition_hash === editor.baseline.definition_hash,
  );
}

const copyDefinition = (definition: WorkflowDefinition) =>
  parseWorkflowDefinition(definition);
const hardFailure = (reason: unknown) =>
  reason instanceof ApiError && [401, 403, 404].includes(reason.status);
const stageIcons = [ListChecks, SearchCheck, FileCheck2] as const;
const stageNames = [
  ["规划", "Planning"],
  ["研究", "Research"],
  ["汇总", "Synthesis"],
] as const;
const stageInputs = [
  ["任务资料", "Task context"],
  ["任务资料 + 研究计划", "Task context + plan"],
  ["任务资料 + 研究报告", "Task context + reports"],
] as const;
const stageOutputs = [
  ["研究计划", "Research plan"],
  ["研究报告", "Research reports"],
  ["报告成果", "Report artifact"],
] as const;

function readError(reason: unknown, t: Copy): ReadFailure {
  return {
    hard: hardFailure(reason),
    message:
      reason instanceof ApiError && reason.status === 401
        ? t(
            "登录已失效，请重新登录。",
            "Your session has expired. Sign in again.",
          )
        : reason instanceof ApiError && reason.status === 403
          ? t("无权读取此工作流。", "You cannot access this workflow.")
          : reason instanceof ApiError && reason.status === 404
            ? t(
                "未找到此工作流或版本。",
                "This workflow or version was not found.",
              )
            : t(
                "工作流读取失败，请重试。已显示内容可能已过期。",
                "The workflow could not be read. Retry; displayed content may be stale.",
              ),
  };
}

export function WorkflowPage({
  data,
  refreshRevision,
  t,
  locale,
}: {
  data: Bootstrap;
  refreshRevision: number;
  t: Copy;
  locale: Locale;
}) {
  const supported = data.capabilities.workflow_versions === true;
  const pendingLocation = readWorkflowPendingRequest(
    typeof window === "undefined" ? "" : window.location.href,
  );
  const [bundle, setBundle] = useState<WorkflowBundle>();
  const [editor, setEditor] = useState<Editor>();
  const [busy, setBusy] = useState(true);
  const [failure, setFailure] = useState<ReadFailure>();
  const [readRevision, setReadRevision] = useState(0);
  const [stageIndex, setStageIndex] = useState(0);
  const [impact, setImpact] = useState<WorkflowImpact>();
  const [impactBusy, setImpactBusy] = useState(false);
  const [publicationOpen, setPublicationOpen] = useState(false);
  const [consent, setConsent] = useState(false);
  const [notice, setNotice] = useState<Notice>();
  const [operation, setOperation] = useState<Operation>(() =>
    pendingLocation.requestId
      ? { phase: "unknown", requestId: pendingLocation.requestId }
      : { phase: "idle" },
  );
  const [historyPage, setHistoryPage] = useState(1);
  const [history, setHistory] = useState<WorkflowVersions>();
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyFailure, setHistoryFailure] = useState<ReadFailure>();
  const [historyRevision, setHistoryRevision] = useState(0);
  const [selectedVersion, setSelectedVersion] = useState<number>();
  const [historical, setHistorical] = useState<WorkflowVersion>();
  const [versionBusy, setVersionBusy] = useState(false);
  const [versionFailure, setVersionFailure] = useState<ReadFailure>();
  const [versionRevision, setVersionRevision] = useState(0);
  const [discard, setDiscard] = useState<"navigation" | "reload">();
  const root = useRef<HTMLElement>(null);
  const retryTrigger = useRef<HTMLButtonElement>(null);
  const pageFocus = useRef<
    | {
        origin: Element | null;
        direction: "previous" | "next";
        page: number;
      }
    | undefined
  >(undefined);
  const editorState = useRef(editor);
  editorState.current = editor;
  const operationState = useRef(operation);
  operationState.current = operation;
  const activeWorkspace = useRef(data.workspace);
  activeWorkspace.current = data.workspace;
  const mounted = useRef(true);
  const operationBusy = useRef(false);
  const internalNavigation = useRef(false);
  const mutationController = useRef<AbortController | undefined>(undefined);
  const impactController = useRef<AbortController | undefined>(undefined);
  const impactModels = useRef("");
  const previousWorkspace = useRef(data.workspace);
  const generation = useRef(0);
  const modelIdentity = JSON.stringify(data.models);
  const dirty = workflowDraftDirty(editor);
  const locked = operation.phase !== "idle";
  const currentRevision =
    editor?.baseline.revision === bundle?.revision &&
    editor?.baseline.definition_hash === bundle?.definition_hash;
  const validImpact =
    workflowPublicationMatches(editor, bundle, impact) &&
    impactModels.current === modelIdentity;
  const canEdit = Boolean(
    supported &&
    editor &&
    bundle &&
    !busy &&
    !failure &&
    !locked &&
    !pendingLocation.error &&
    selectedVersion === undefined,
  );
  const guardState = useRef({ dirty: false, busy: false });
  guardState.current = {
    dirty,
    busy: locked || Boolean(pendingLocation.error) || impactBusy,
  };
  const admission = useRef({
    edit: false,
    publish: false,
    identity: "",
    models: "",
    ready: false,
  });
  const identity = JSON.stringify([
    data.workspace,
    editor?.baseline.revision,
    editor?.baseline.definition_hash,
    editor?.draft,
  ]);
  admission.current = {
    edit: canEdit,
    publish: Boolean(
      canEdit && !dirty && currentRevision && validImpact && consent,
    ),
    identity,
    models: modelIdentity,
    ready: Boolean(supported && bundle && !busy && !failure),
  };
  const current = (workspace: string) =>
    mounted.current && activeWorkspace.current === workspace;
  const hidePrivate = () => {
    generation.current++;
    setBusy(false);
    setHistoryBusy(false);
    setVersionBusy(false);
    setImpactBusy(false);
    setBundle(undefined);
    setEditor(undefined);
    setImpact(undefined);
    setConsent(false);
    setPublicationOpen(false);
    setHistory(undefined);
    setHistorical(undefined);
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      mutationController.current?.abort();
      impactController.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (previousWorkspace.current === data.workspace) return;
    previousWorkspace.current = data.workspace;
    mutationController.current?.abort();
    impactController.current?.abort();
    hidePrivate();
    setOperation(
      pendingLocation.requestId
        ? { phase: "unknown", requestId: pendingLocation.requestId }
        : { phase: "idle" },
    );
    setSelectedVersion(undefined);
    setHistoryPage(1);
    setNotice(undefined);
  }, [data.workspace]);
  useEffect(() => {
    const unauthorized = () => {
      mutationController.current?.abort();
      impactController.current?.abort();
      hidePrivate();
      setFailure(readError(new ApiError(401, ""), t));
    };
    window.addEventListener("mybot:unauthorized", unauthorized);
    return () => window.removeEventListener("mybot:unauthorized", unauthorized);
  }, [t]);
  useEffect(() => {
    if (pendingLocation.requestId && operationState.current.phase === "idle")
      setOperation({
        phase: "unknown",
        requestId: pendingLocation.requestId,
      });
  }, [pendingLocation.requestId]);
  useEffect(() => {
    if (!dirty && !locked && !pendingLocation.error && !impactBusy) return;
    const unregister = registerWorkbenchNavigationBlocker({
      getState: () =>
        internalNavigation.current
          ? { dirty: false, busy: false }
          : guardState.current,
      onBlocked: () => setDiscard("navigation"),
      onReset: () => setDiscard(undefined),
    });
    const unload = (event: BeforeUnloadEvent) => {
      if (!guardState.current.dirty && !guardState.current.busy) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", unload);
    return () => {
      unregister();
      window.removeEventListener("beforeunload", unload);
    };
  }, [dirty, locked, pendingLocation.error, impactBusy]);
  useEffect(() => {
    const controller = new AbortController();
    const readGeneration = generation.current;
    setBusy(true);
    setFailure(undefined);
    if (!supported) {
      hidePrivate();
      setBusy(false);
      return;
    }
    fetchWorkflow(controller.signal)
      .then((value) => {
        if (controller.signal.aborted || readGeneration !== generation.current)
          return;
        setBundle(value);
        setEditor((before) =>
          before && workflowDraftDirty(before)
            ? before
            : { baseline: value, draft: copyDefinition(value.definition) },
        );
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted || readGeneration !== generation.current)
          return;
        if (hardFailure(reason)) hidePrivate();
        setFailure(readError(reason, t));
      })
      .finally(() => {
        if (!controller.signal.aborted && readGeneration === generation.current)
          setBusy(false);
      });
    return () => controller.abort();
  }, [supported, data.workspace, refreshRevision, readRevision]);
  const hasBundle = Boolean(bundle);
  useEffect(() => {
    const controller = new AbortController();
    const readGeneration = generation.current;
    if (!supported || !hasBundle) {
      setHistory(undefined);
      setHistoryBusy(false);
      return;
    }
    setHistoryBusy(true);
    setHistoryFailure(undefined);
    fetchWorkflowVersions(historyPage, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted && readGeneration === generation.current)
          setHistory(value);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted || readGeneration !== generation.current)
          return;
        if (hardFailure(reason)) {
          hidePrivate();
          setFailure(readError(reason, t));
        }
        setHistoryFailure(readError(reason, t));
      })
      .finally(() => {
        if (!controller.signal.aborted && readGeneration === generation.current)
          setHistoryBusy(false);
      });
    return () => controller.abort();
  }, [
    supported,
    hasBundle,
    data.workspace,
    historyPage,
    refreshRevision,
    historyRevision,
  ]);
  useEffect(() => {
    const controller = new AbortController();
    const readGeneration = generation.current;
    setHistorical(undefined);
    setVersionFailure(undefined);
    if (!supported || !hasBundle || selectedVersion === undefined) {
      setVersionBusy(false);
      return;
    }
    setVersionBusy(true);
    fetchWorkflowVersion(selectedVersion, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted && readGeneration === generation.current)
          setHistorical(value);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted || readGeneration !== generation.current)
          return;
        if (hardFailure(reason)) {
          hidePrivate();
          setFailure(readError(reason, t));
        }
        setVersionFailure(readError(reason, t));
      })
      .finally(() => {
        if (!controller.signal.aborted && readGeneration === generation.current)
          setVersionBusy(false);
      });
    return () => controller.abort();
  }, [
    supported,
    hasBundle,
    data.workspace,
    selectedVersion,
    refreshRevision,
    versionRevision,
  ]);
  useEffect(() => {
    impactController.current?.abort();
    impactModels.current = "";
    setImpact(undefined);
    setConsent(false);
    setPublicationOpen(false);
    setImpactBusy(false);
  }, [
    data.workspace,
    modelIdentity,
    editor?.baseline.revision,
    editor?.baseline.definition_hash,
    bundle?.revision,
    bundle?.definition_hash,
    refreshRevision,
  ]);
  useEffect(() => {
    const pending = pageFocus.current;
    if (!pending || pending.page !== historyPage || historyBusy) return;
    if (!history && !historyFailure) return;
    pageFocus.current = undefined;
    if (
      document.activeElement !== document.body &&
      document.activeElement !== pending.origin
    )
      return;
    if (historyFailure) {
      retryTrigger.current?.focus();
      return;
    }
    const available = ':not(:disabled):not([aria-disabled="true"])';
    const preferred = root.current?.querySelector<HTMLButtonElement>(
      `[data-workflow-history-page="${pending.direction}"]${available}`,
    );
    const fallback = root.current?.querySelector<HTMLButtonElement>(
      `[data-workflow-history-page]${available}`,
    );
    (preferred ?? fallback)?.focus();
  }, [history, historyBusy, historyFailure, historyPage]);

  const stampRequest = (requestId?: string) => {
    internalNavigation.current = true;
    try {
      const params = new URLSearchParams();
      if (requestId) params.set("workflowRequest", requestId);
      return pushWorkbenchNavigation(
        `#workflows${params.size ? `?${params}` : ""}`,
        { replace: true },
      );
    } finally {
      internalNavigation.current = false;
    }
  };
  const edit = (update: (before: WorkflowDefinition) => WorkflowDefinition) => {
    if (!admission.current.edit || operationBusy.current) return;
    admission.current.publish = false;
    impactController.current?.abort();
    impactModels.current = "";
    setImpactBusy(false);
    setEditor((before) =>
      before ? { ...before, draft: update(before.draft) } : before,
    );
    setImpact(undefined);
    setConsent(false);
    setPublicationOpen(false);
    setNotice(undefined);
  };
  const reload = () => {
    if (operationBusy.current || operationState.current.phase !== "idle")
      return;
    if (workflowDraftDirty(editorState.current)) {
      setDiscard("reload");
      return;
    }
    setReadRevision((value) => value + 1);
  };
  const acceptReceipt = (receipt: WorkflowReceipt) => {
    generation.current++;
    cancelWorkbenchNavigation();
    if (!stampRequest()) {
      const pending = operationState.current;
      if (pending.phase !== "idle")
        setOperation({ ...pending, phase: "unknown" });
      setNotice({
        tone: "error",
        text: t(
          "回执已确认，但页面状态未更新。请保留原请求继续核对。",
          "The receipt was confirmed, but page state did not update. Keep the original request and check again.",
        ),
      });
      return;
    }
    if (receipt.kind === "save") {
      setBundle(receipt.result);
      setEditor({
        baseline: receipt.result,
        draft: copyDefinition(receipt.result.definition),
      });
      setNotice({
        tone: "info",
        text: t(
          `草稿修订 ${receipt.result.revision} 已保存。`,
          `Draft revision ${receipt.result.revision} saved.`,
        ),
      });
      setReadRevision((value) => value + 1);
      setHistoryRevision((value) => value + 1);
    } else {
      setBundle((before) =>
        before ? { ...before, published: receipt.result } : before,
      );
      setNotice({
        tone: "info",
        text: t(
          `版本 ${receipt.result.version} 已发布。已有运行保留原配置。`,
          `Version ${receipt.result.version} published. Existing runs retain their configuration.`,
        ),
      });
      setReadRevision((value) => value + 1);
      setHistoryPage(1);
      setHistoryRevision((value) => value + 1);
    }
    setOperation({ phase: "idle" });
    operationState.current = { phase: "idle" };
    setFailure(undefined);
    setImpact(undefined);
    setConsent(false);
    setPublicationOpen(false);
  };
  const send = async (command: WorkflowCommand, retry = false) => {
    const before = operationState.current;
    if (
      operationBusy.current ||
      !admission.current.ready ||
      (retry
        ? before.phase !== "missing" ||
          before.command !== command ||
          before.requestId !== command.request_id
        : before.phase !== "idle")
    )
      return;
    const workspace = data.workspace;
    operationBusy.current = true;
    setNotice(undefined);
    if (!stampRequest(command.request_id)) {
      operationBusy.current = false;
      setNotice({
        tone: "error",
        text: t(
          "无法保存原请求标识，尚未发送。",
          "The original request ID could not be retained. Nothing was sent.",
        ),
      });
      return;
    }
    const sending: Operation = {
      phase: "sending",
      requestId: command.request_id,
      command,
    };
    operationState.current = sending;
    setOperation(sending);
    mutationController.current?.abort();
    const controller = new AbortController();
    mutationController.current = controller;
    try {
      const { kind, ...body } = command;
      const receipt =
        kind === "save"
          ? await saveWorkflowDraft(
              body as Omit<Extract<WorkflowCommand, { kind: "save" }>, "kind">,
              controller.signal,
            )
          : await publishWorkflow(
              body as Omit<
                Extract<WorkflowCommand, { kind: "publish" }>,
                "kind"
              >,
              controller.signal,
            );
      if (!current(workspace) || controller.signal.aborted) return;
      acceptReceipt(receipt);
    } catch (reason) {
      if (!current(workspace)) return;
      if (
        reason instanceof ApiError &&
        reason.status >= 400 &&
        reason.status < 500
      ) {
        if (hardFailure(reason)) {
          hidePrivate();
          setFailure(readError(reason, t));
        }
        if (stampRequest()) {
          setOperation({ phase: "idle" });
          operationState.current = { phase: "idle" };
        } else {
          setOperation({ ...sending, phase: "unknown" });
        }
        setImpact(undefined);
        setConsent(false);
        setPublicationOpen(false);
        setNotice({
          tone: "error",
          text:
            reason.status === 409
              ? t(
                  "版本或依赖已改变，未应用本次请求。输入已保留，请重新读取后检查。",
                  "The revision or its dependencies changed. This request was rejected; your input is retained. Reload and review.",
                )
              : t(
                  `请求被拒绝：${reason.message}`,
                  `The request was rejected: ${reason.message}`,
                ),
        });
      } else {
        setOperation({ ...sending, phase: "unknown" });
        setPublicationOpen(false);
        setNotice({
          tone: "error",
          text: t(
            "写入结果尚未确认。请核对原请求回执，不会自动重发。",
            "The write outcome is unconfirmed. Check the original request receipt; it will not be resent automatically.",
          ),
        });
      }
    } finally {
      if (current(workspace)) operationBusy.current = false;
    }
  };
  const save = () => {
    const before = editorState.current;
    if (
      !before ||
      !admission.current.edit ||
      admission.current.identity !== identity ||
      !workflowDraftDirty(before)
    )
      return;
    let definition: WorkflowDefinition;
    try {
      definition = copyDefinition(before.draft);
    } catch {
      setNotice({
        tone: "error",
        text: t(
          "请检查名称、阶段指令和资源限制。",
          "Check the name, stage instructions and resource limits.",
        ),
      });
      return;
    }
    void send({
      kind: "save",
      request_id: crypto.randomUUID(),
      expected_revision: before.baseline.revision,
      definition,
    });
  };
  const checkImpact = async () => {
    const before = editorState.current;
    if (
      !before ||
      !admission.current.edit ||
      workflowDraftDirty(before) ||
      !currentRevision ||
      impactBusy ||
      operationBusy.current
    )
      return;
    const workspace = data.workspace;
    const candidateIdentity = admission.current.identity;
    const dependencies = admission.current.models;
    impactController.current?.abort();
    const controller = new AbortController();
    impactController.current = controller;
    setImpactBusy(true);
    setConsent(false);
    setImpact(undefined);
    setNotice(undefined);
    try {
      const result = await fetchWorkflowImpact(
        {
          revision: before.baseline.revision,
          definition_hash: before.baseline.definition_hash,
        },
        controller.signal,
      );
      if (
        controller.signal.aborted ||
        !current(workspace) ||
        admission.current.identity !== candidateIdentity ||
        admission.current.models !== dependencies
      )
        return;
      impactModels.current = dependencies;
      setImpact(result);
      setPublicationOpen(true);
    } catch (reason) {
      if (controller.signal.aborted || !current(workspace)) return;
      if (hardFailure(reason)) {
        hidePrivate();
        setFailure(readError(reason, t));
      }
      setNotice({
        tone: "error",
        text:
          reason instanceof ApiError && reason.status === 409
            ? t(
                "草稿或模型依赖已改变，请重新读取后检查。",
                "The draft or model dependencies changed. Reload before checking again.",
              )
            : t(
                "发布检查失败。请确认三个阶段均绑定可用模型。",
                "Publication checks failed. Ensure all three stages have available model bindings.",
              ),
      });
    } finally {
      if (current(workspace) && !controller.signal.aborted)
        setImpactBusy(false);
    }
  };
  const publish = () => {
    if (
      !admission.current.publish ||
      admission.current.identity !== identity ||
      !editor ||
      !impact
    )
      return;
    void send({
      kind: "publish",
      request_id: crypto.randomUUID(),
      expected_revision: editor.baseline.revision,
      definition_hash: editor.baseline.definition_hash,
      impact_hash: impact.impact_hash,
      consent: true,
    });
  };
  const reconcile = async () => {
    const before = operationState.current;
    if (
      !supported ||
      operationBusy.current ||
      before.phase === "idle" ||
      before.phase === "sending" ||
      before.phase === "checking"
    )
      return;
    const workspace = data.workspace;
    operationBusy.current = true;
    setOperation({ ...before, phase: "checking" });
    setNotice(undefined);
    mutationController.current?.abort();
    const controller = new AbortController();
    mutationController.current = controller;
    try {
      const receipt = await fetchWorkflowOperation(
        before.requestId,
        controller.signal,
        before.command,
      );
      if (!current(workspace) || controller.signal.aborted) return;
      acceptReceipt(receipt);
    } catch (reason) {
      if (!current(workspace) || controller.signal.aborted) return;
      if (reason instanceof ApiError && reason.status === 404) {
        setOperation({
          ...before,
          phase: before.command ? "missing" : "unknown",
        });
        setNotice({
          tone: "error",
          text: before.command
            ? t(
                "暂未找到回执。可手动重试相同内容和请求标识，期间配置仍锁定。",
                "No receipt was found yet. You may manually retry the identical command and request ID; configuration remains locked.",
              )
            : t(
                "暂未找到原请求，之前的写入仍可能在途。浏览器未保存配置内容，请保留原请求继续核对。",
                "The original request was not found yet; its write may still be in flight. Definition content was not stored in the browser. Keep the original request and check again.",
              ),
        });
      } else {
        if (hardFailure(reason)) {
          hidePrivate();
          setFailure(readError(reason, t));
        }
        setOperation({ ...before, phase: "unknown" });
        setNotice({
          tone: "error",
          text: t(
            "回执无法确认，原请求仍待核对。",
            "The receipt could not be confirmed. The original request remains unresolved.",
          ),
        });
      }
    } finally {
      if (current(workspace)) operationBusy.current = false;
    }
  };
  const changeHistoryPage = (
    candidate: number,
    direction: "previous" | "next",
  ) => {
    if (
      !history ||
      historyBusy ||
      historyFailure ||
      candidate < 1 ||
      candidate > history.total_pages
    )
      return;
    pageFocus.current = {
      origin: document.activeElement,
      direction,
      page: candidate,
    };
    setHistory(undefined);
    setHistoryPage(candidate);
  };
  const editableDefinition = editor?.draft;
  const definition =
    selectedVersion === undefined ? editableDefinition : historical?.definition;
  const stage = definition?.stages[stageIndex];
  const readonly = selectedVersion !== undefined;
  let validDraft = true;
  if (editableDefinition) {
    try {
      parseWorkflowDefinition(editableDefinition);
    } catch {
      validDraft = false;
    }
  }
  const modelName = (id: string | null) =>
    id === null
      ? t("未绑定模型", "No model binding")
      : (data.models.find((model) => model.id === id)?.name ??
        t(`模型不可用（${id}）`, `Unavailable model (${id})`));
  const modelOptions = [
    { value: "__unbound__", label: t("未绑定模型", "No model binding") },
    ...data.models.map((model) => ({ value: model.id, label: model.name })),
    ...(stage?.model_id &&
    !data.models.some((model) => model.id === stage.model_id)
      ? [{ value: stage.model_id, label: modelName(stage.model_id) }]
      : []),
  ];
  const date = (value: string) => new Date(value).toLocaleString(locale);

  return (
    <section className="wb-workflow-page" ref={root}>
      <header className="wb-workflow-heading">
        <div>
          <div className="wb-workflow-eyebrow">
            <GitBranch size={16} aria-hidden="true" />
            <span>local-research</span>
            <AppBadge>{t("只读研发", "Read-only research")}</AppBadge>
          </div>
          <h1>{t("工作流", "Workflows")}</h1>
          <p>
            {t(
              "规划、研究、汇总与人工审查。",
              "Planning, research, synthesis and human review.",
            )}
          </p>
        </div>
        <div className="wb-workflow-actions">
          <AppButton
            label={t("重新读取", "Reload")}
            icon={<RefreshCw size={16} />}
            onClick={reload}
            disabled={!supported || locked || impactBusy}
            busy={busy && Boolean(bundle)}
          />
          <AppButton
            label={t("保存草稿", "Save draft")}
            icon={<Save size={16} />}
            onClick={save}
            disabled={!canEdit || !dirty || !validDraft}
            busy={
              operation.phase === "sending" &&
              operation.command?.kind === "save"
            }
          />
          <AppButton
            label={t("检查发布影响", "Check publication impact")}
            icon={<CheckCheck size={16} />}
            tone="primary"
            onClick={() => void checkImpact()}
            disabled={!canEdit || dirty || !currentRevision || !validDraft}
            busy={impactBusy}
          />
        </div>
      </header>
      {!supported && (
        <p role="status" className="wb-workflow-message">
          {t(
            "当前服务未提供工作流版本能力。",
            "This server does not provide workflow versioning.",
          )}
        </p>
      )}
      {pendingLocation.error && (
        <p role="alert" className="wb-workflow-message wb-workflow-error">
          {t(
            "原请求标识无效，已锁定配置操作。请保留地址并检查来源。",
            "The original request ID is invalid. Configuration actions are locked; retain this address and check its source.",
          )}
        </p>
      )}
      {failure && (
        <div role="alert" className="wb-workflow-message wb-workflow-error">
          <p>{failure.message}</p>
          <AppButton
            label={t("重试读取", "Retry read")}
            icon={<RefreshCw size={16} />}
            onClick={() => setReadRevision((value) => value + 1)}
            disabled={busy}
          />
        </div>
      )}
      {notice && (
        <p
          role={notice.tone === "error" ? "alert" : "status"}
          className={`wb-workflow-message${notice.tone === "error" ? " wb-workflow-error" : ""}`}
        >
          {notice.text}
        </p>
      )}
      {locked && (
        <div className="wb-workflow-pending" role="status">
          <div>
            <strong>
              {operation.phase === "sending"
                ? t("正在提交原请求", "Submitting original request")
                : t("原请求等待确认", "Original request awaiting confirmation")}
            </strong>
            <code>{operation.requestId}</code>
          </div>
          <div className="wb-workflow-actions">
            <AppButton
              label={t("核对原请求", "Check original request")}
              icon={<RefreshCw size={16} />}
              onClick={() => void reconcile()}
              disabled={!supported || operation.phase === "sending"}
              busy={operation.phase === "checking"}
            />
            {operation.phase === "missing" && operation.command && (
              <AppButton
                label={t("用原请求重试", "Retry original request")}
                icon={<ArrowRight size={16} />}
                onClick={() => {
                  if (
                    operationState.current.phase === "missing" &&
                    operationState.current.command
                  )
                    void send(operationState.current.command, true);
                }}
                disabled={!admission.current.ready}
              />
            )}
          </div>
        </div>
      )}
      {supported && busy && !bundle && (
        <AppLoading label={t("正在读取工作流", "Loading workflow")} />
      )}
      {bundle && editor && !failure?.hard && (
        <>
          <div className="wb-workflow-version-bar">
            <div>
              <AppBadge tone={dirty ? "warning" : "neutral"}>
                {dirty
                  ? t("未保存修改", "Unsaved changes")
                  : t("已保存草稿", "Saved draft")}
              </AppBadge>
              <span>
                {t("修订", "Revision")} {editor.baseline.revision}
              </span>
              <code title={editor.baseline.definition_hash}>
                {editor.baseline.definition_hash}
              </code>
            </div>
            <div>
              <CircleCheck size={15} aria-hidden="true" />
              {bundle.published ? (
                <AppButton
                  label={t(
                    `已发布 v${bundle.published.version}`,
                    `Published v${bundle.published.version}`,
                  )}
                  tone="ghost"
                  onClick={() => setSelectedVersion(bundle.published!.version)}
                />
              ) : (
                <span>{t("尚无已发布版本", "No published version")}</span>
              )}
            </div>
          </div>
          {busy && (
            <p role="status" className="wb-workflow-hint">
              {t(
                "正在刷新，编辑暂时锁定。",
                "Refreshing; editing is temporarily locked.",
              )}
            </p>
          )}
          {!currentRevision && (
            <p role="alert" className="wb-workflow-message wb-workflow-error">
              {t(
                "服务端草稿已有新修订。当前输入已保留；重新读取将要求确认放弃修改。",
                "The server draft has a newer revision. Your input is retained; reloading will ask before discarding it.",
              )}
            </p>
          )}
          {readonly && (
            <div className="wb-workflow-history-context">
              <div>
                <AppBadge tone="info">
                  {t(
                    `历史版本 v${selectedVersion} · 只读`,
                    `Historical v${selectedVersion} · Read only`,
                  )}
                </AppBadge>
                {historical && (
                  <time dateTime={historical.created_at}>
                    {date(historical.created_at)}
                  </time>
                )}
              </div>
              <AppButton
                label={t("返回草稿", "Back to draft")}
                icon={<ArrowLeft size={16} />}
                onClick={() => setSelectedVersion(undefined)}
              />
            </div>
          )}
          {versionBusy && readonly && (
            <AppLoading
              label={t("正在读取历史版本", "Loading historical version")}
            />
          )}
          {versionFailure && readonly && (
            <div role="alert" className="wb-workflow-message wb-workflow-error">
              <p>{versionFailure.message}</p>
              <AppButton
                label={t("重试版本读取", "Retry version read")}
                icon={<RefreshCw size={16} />}
                onClick={() => setVersionRevision((value) => value + 1)}
              />
            </div>
          )}
          {definition && (
            <>
              <div className="wb-workflow-name">
                <AppInput
                  label={t("工作流名称", "Workflow name")}
                  value={definition.name}
                  maxLength={80}
                  isDisabled={!canEdit || readonly}
                  onChange={(name) => edit((before) => ({ ...before, name }))}
                />
                <span className="wb-workflow-hint">local-superagent</span>
              </div>
              <ol
                className="wb-workflow-pipeline"
                aria-label={t("固定工作流阶段", "Fixed workflow stages")}
              >
                {definition.stages.map((item, index) => {
                  const Icon = stageIcons[index];
                  return (
                    <li key={item.id} data-selected={stageIndex === index}>
                      <AppButton
                        label={t(stageNames[index][0], stageNames[index][1])}
                        icon={<Icon size={18} />}
                        tone={stageIndex === index ? "secondary" : "ghost"}
                        onClick={() => setStageIndex(index)}
                        aria-pressed={stageIndex === index}
                        data-workflow-stage={item.id}
                      />
                      <span className="wb-workflow-stage-model">
                        {modelName(item.model_id)}
                      </span>
                      <span className="wb-workflow-stage-output">
                        {t(stageOutputs[index][0], stageOutputs[index][1])}
                      </span>
                      {index < 2 && (
                        <ArrowRight
                          className="wb-workflow-connector"
                          size={16}
                          aria-hidden="true"
                        />
                      )}
                    </li>
                  );
                })}
                <li className="wb-workflow-review">
                  <UserCheck size={19} aria-hidden="true" />
                  <strong>{t("人工审查", "Human review")}</strong>
                  <span>{t("报告成果", "Report artifact")}</span>
                </li>
              </ol>
              <div className="wb-workflow-properties">
                <section
                  className="wb-workflow-stage-properties"
                  aria-label={t("阶段配置", "Stage configuration")}
                >
                  <h2>
                    {t(stageNames[stageIndex][0], stageNames[stageIndex][1])}
                  </h2>
                  <dl className="wb-workflow-stage-contract">
                    <div>
                      <dt>{t("输入", "Input")}</dt>
                      <dd>
                        {t(
                          stageInputs[stageIndex][0],
                          stageInputs[stageIndex][1],
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>{t("输出", "Output")}</dt>
                      <dd>
                        {t(
                          stageOutputs[stageIndex][0],
                          stageOutputs[stageIndex][1],
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>{t("角色", "Role")}</dt>
                      <dd>{stage?.role}</dd>
                    </div>
                  </dl>
                  <AppSelect
                    label={t("阶段模型", "Stage model")}
                    value={stage?.model_id ?? "__unbound__"}
                    options={modelOptions}
                    disabled={!canEdit || readonly}
                    onChange={(value) =>
                      edit((before) => ({
                        ...before,
                        stages: before.stages.map((item, index) =>
                          index === stageIndex
                            ? {
                                ...item,
                                model_id:
                                  value === "__unbound__" ? null : value,
                              }
                            : item,
                        ),
                      }))
                    }
                  />
                  <AppTextArea
                    label={t("补充指令", "Supplemental instructions")}
                    value={stage?.instructions ?? ""}
                    rows={6}
                    isDisabled={!canEdit || readonly}
                    onChange={(instructions) =>
                      edit((before) => ({
                        ...before,
                        stages: before.stages.map((item, index) =>
                          index === stageIndex
                            ? { ...item, instructions }
                            : item,
                        ),
                      }))
                    }
                  />
                  <p
                    className={`wb-workflow-counter${[...(stage?.instructions ?? "")].length > 2000 ? " wb-workflow-error" : ""}`}
                  >
                    {[...(stage?.instructions ?? "")].length} / 2000
                  </p>
                </section>
                <section
                  className="wb-workflow-limits"
                  aria-label={t("资源限制", "Resource limits")}
                >
                  <h2>{t("资源限制", "Resource limits")}</h2>
                  <div className="wb-workflow-limit-grid">
                    {(
                      [
                        ["max_calls", t("调用总上限", "Call budget"), 3, 8],
                        [
                          "parallel",
                          t("研究并行上限", "Research concurrency"),
                          1,
                          2,
                        ],
                        [
                          "minutes",
                          t("运行时限（分钟）", "Time limit (min)"),
                          1,
                          30,
                        ],
                        [
                          "max_output_tokens",
                          t("每次输出 Token 上限", "Output tokens per call"),
                          256,
                          4096,
                        ],
                        [
                          "research_tasks",
                          t("研究任务数上限", "Research task limit"),
                          1,
                          2,
                        ],
                      ] as const
                    ).map(([key, label, min, max]) => (
                      <AppNumber
                        key={key}
                        label={label}
                        value={definition.limits[key]}
                        min={min}
                        max={max}
                        isDisabled={!canEdit || readonly}
                        onChange={(value) =>
                          edit((before) => ({
                            ...before,
                            limits: { ...before.limits, [key]: value },
                          }))
                        }
                      />
                    ))}
                  </div>
                </section>
              </div>
              {!validDraft && !readonly && (
                <p
                  role="alert"
                  className="wb-workflow-message wb-workflow-error"
                >
                  {t(
                    "名称须为 1–80 个字符且无首尾空白；每阶段指令最多 2000 字，资源须在标示范围内。",
                    "Use a name of 1–80 characters without leading or trailing whitespace, at most 2000 characters per instruction, and resources within the displayed ranges.",
                  )}
                </p>
              )}
            </>
          )}
          <section
            className="wb-workflow-history"
            aria-label={t("版本历史", "Version history")}
          >
            <div className="wb-workflow-section-heading">
              <h2>
                <History size={17} aria-hidden="true" />
                {t("版本历史", "Version history")}
              </h2>
              <AppButton
                label={t("刷新版本历史", "Refresh version history")}
                icon={<RefreshCw size={16} />}
                iconOnly
                tone="ghost"
                disabled={historyBusy}
                onClick={() => setHistoryRevision((value) => value + 1)}
              />
            </div>
            {historyBusy && (
              <AppLoading
                label={t("正在读取版本历史", "Loading version history")}
              />
            )}
            {historyFailure && (
              <div
                role="alert"
                className="wb-workflow-message wb-workflow-error"
              >
                <p>{historyFailure.message}</p>
                <AppButton
                  ref={retryTrigger}
                  label={t("重试历史读取", "Retry history read")}
                  icon={<RefreshCw size={16} />}
                  onClick={() => setHistoryRevision((value) => value + 1)}
                />
              </div>
            )}
            {history && (
              <>
                {history.total === 0 ? (
                  <p className="wb-workflow-hint">
                    {t("尚未发布版本。", "No versions have been published.")}
                  </p>
                ) : (
                  <ul className="wb-workflow-history-list">
                    {history.items.map((version) => (
                      <li key={version.version}>
                        <AppButton
                          label={t(
                            `查看版本 v${version.version}`,
                            `View version v${version.version}`,
                          )}
                          tone="ghost"
                          icon={<GitBranch size={16} />}
                          onClick={() => {
                            if (!historyBusy && !historyFailure)
                              setSelectedVersion(version.version);
                          }}
                          disabled={historyBusy || Boolean(historyFailure)}
                          aria-pressed={selectedVersion === version.version}
                        />
                        <span>{version.definition.name}</span>
                        <code title={version.definition_hash}>
                          {version.definition_hash}
                        </code>
                        <time dateTime={version.created_at}>
                          {date(version.created_at)}
                        </time>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="wb-workflow-pagination">
                  <span>
                    {t(
                      `${history.total} 个已发布版本`,
                      `${history.total} published versions`,
                    )}
                  </span>
                  <div>
                    <AppButton
                      label={t("上一页版本", "Previous versions")}
                      icon={<ChevronLeft size={16} />}
                      iconOnly
                      data-workflow-history-page="previous"
                      disabled={
                        historyBusy ||
                        Boolean(historyFailure) ||
                        history.page <= 1
                      }
                      onClick={() =>
                        changeHistoryPage(history.page - 1, "previous")
                      }
                    />
                    <span>
                      {history.page} / {history.total_pages}
                    </span>
                    <AppButton
                      label={t("下一页版本", "Next versions")}
                      icon={<ChevronRight size={16} />}
                      iconOnly
                      data-workflow-history-page="next"
                      disabled={
                        historyBusy ||
                        Boolean(historyFailure) ||
                        !history.has_more
                      }
                      onClick={() =>
                        changeHistoryPage(history.page + 1, "next")
                      }
                    />
                  </div>
                </div>
              </>
            )}
          </section>
        </>
      )}
      {publicationOpen && impact && editor && validImpact && !failure && (
        <AppDialog
          title={t("发布工作流版本", "Publish workflow version")}
          closeLabel={t("取消", "Cancel")}
          busy={operation.phase === "sending"}
          onClose={() => {
            if (operationBusy.current) return;
            setPublicationOpen(false);
            setConsent(false);
          }}
        >
          <div className="wb-workflow-publication">
            <p>{editor.baseline.definition.name}</p>
            <dl>
              <div>
                <dt>{t("已保存修订", "Saved revision")}</dt>
                <dd>{impact.revision}</dd>
              </div>
              <div>
                <dt>{t("定义摘要", "Definition hash")}</dt>
                <dd>
                  <code>{impact.definition_hash}</code>
                </dd>
              </div>
              <div>
                <dt>{t("模型", "Models")}</dt>
                <dd>{impact.model_ids.map(modelName).join(" · ")}</dd>
              </div>
              <div>
                <dt>{t("工作区活动 Run", "Workspace active runs")}</dt>
                <dd>{impact.active_runs}</dd>
              </div>
              <div>
                <dt>{t("工作区历史 Run", "Workspace historical runs")}</dt>
                <dd>{impact.historical_runs}</dd>
              </div>
            </dl>
            <p className="wb-workflow-hint">
              {t(
                "仅新运行可选择此版本；现有运行和快照保留原配置。此检查未调用模型或测试连接。",
                "New runs may select this version. Existing runs and snapshots retain their configuration. This check made no model call or connection test.",
              )}
            </p>
            <AppCheckbox
              label={t(
                "我确认发布此保存修订",
                "I confirm publication of this saved revision",
              )}
              value={consent}
              isDisabled={locked}
              onChange={(value) => setConsent(value)}
            />
            <div className="wb-workflow-actions">
              <AppButton
                label={t("确认发布", "Confirm publication")}
                tone="primary"
                icon={<CheckCheck size={16} />}
                disabled={!admission.current.publish}
                busy={operation.phase === "sending"}
                onClick={publish}
              />
            </div>
          </div>
        </AppDialog>
      )}
      {discard && (
        <AppDraftGuard
          title={t(
            "放弃未保存的工作流修改？",
            "Discard unsaved workflow changes?",
          )}
          description={t(
            "尚未保存的名称、模型、指令和资源修改会被放弃。",
            "Unsaved name, model, instruction and resource changes will be discarded.",
          )}
          keepLabel={t("继续编辑", "Keep editing")}
          discardLabel={t("放弃修改", "Discard changes")}
          onKeep={() => {
            setDiscard(undefined);
            cancelWorkbenchNavigation();
          }}
          onDiscard={() => {
            if (guardState.current.busy) return;
            const action = discard;
            setDiscard(undefined);
            setEditor(undefined);
            setImpact(undefined);
            setConsent(false);
            if (action === "navigation") confirmWorkbenchNavigation();
            else {
              cancelWorkbenchNavigation();
              setReadRevision((value) => value + 1);
            }
          }}
        />
      )}
    </section>
  );
}
