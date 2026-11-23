import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type Bootstrap } from "../src/workbench/api";
import {
  WorkflowPage,
  readWorkflowPendingRequest,
  workflowDraftDirty,
  workflowPublicationMatches,
} from "../src/workbench/WorkflowPage";
import type {
  WorkflowBundle,
  WorkflowCommand,
  WorkflowDefinition,
  WorkflowImpact,
  WorkflowReceipt,
  WorkflowVersion,
} from "../src/workbench/workflows";

const mocks = vi.hoisted(() => ({
  states: [] as any[],
  refs: [] as { current: any }[],
  effects: [] as {
    dependencies?: unknown[];
    cleanup?: (() => void) | void;
  }[],
  pending: [] as (() => void)[],
  stateCursor: 0,
  refCursor: 0,
  effectCursor: 0,
  buttons: [] as Record<string, any>[],
  fields: [] as Record<string, any>[],
  checkboxes: [] as Record<string, any>[],
  dialogs: [] as Record<string, any>[],
  discard: undefined as Record<string, any> | undefined,
  guard: undefined as Record<string, any> | undefined,
  fetch: vi.fn(),
  versions: vi.fn(),
  version: vi.fn(),
  impact: vi.fn(),
  save: vi.fn(),
  publish: vi.fn(),
  receipt: vi.fn(),
  push: vi.fn(),
  confirm: vi.fn(),
  cancel: vi.fn(),
}));

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = mocks.stateCursor++;
      if (!(index in mocks.states))
        mocks.states[index] =
          typeof initial === "function" ? initial() : initial;
      return [
        mocks.states[index],
        (value: unknown) => {
          mocks.states[index] =
            typeof value === "function" ? value(mocks.states[index]) : value;
        },
      ];
    },
    useRef: (initial: unknown) => {
      const index = mocks.refCursor++;
      mocks.refs[index] ??= { current: initial };
      return mocks.refs[index];
    },
    useEffect: (
      effect: () => void | (() => void),
      dependencies?: unknown[],
    ) => {
      const index = mocks.effectCursor++;
      const previous = mocks.effects[index];
      if (
        previous &&
        dependencies &&
        previous.dependencies &&
        dependencies.length === previous.dependencies.length &&
        dependencies.every((value, key) =>
          Object.is(value, previous.dependencies![key]),
        )
      )
        return;
      mocks.pending.push(() => {
        previous?.cleanup?.();
        mocks.effects[index] = {
          dependencies,
          cleanup: effect(),
        };
      });
    },
  };
});
vi.mock("../src/components/ui", () => {
  const field = (kind: string) => (props: Record<string, any>) => {
    mocks.fields.push({ ...props, kind });
    return createElement(kind === "textarea" ? "textarea" : "input", {
      "aria-label": props.label,
      value: props.value,
      disabled: props.disabled || props.isDisabled,
      readOnly: true,
    });
  };
  return {
    AppButton: (props: Record<string, any>) => {
      mocks.buttons.push(props);
      return createElement(
        "button",
        {
          "aria-label": props.label,
          "aria-pressed": props["aria-pressed"],
          disabled: props.disabled,
          "data-workflow-stage": props["data-workflow-stage"],
          "data-workflow-history-page": props["data-workflow-history-page"],
        },
        props.label,
      );
    },
    AppInput: field("input"),
    AppTextArea: field("textarea"),
    AppNumber: field("number"),
    AppSelect: field("select"),
    AppCheckbox: (props: Record<string, any>) => {
      mocks.checkboxes.push(props);
      return createElement("input", {
        type: "checkbox",
        "aria-label": props.label,
        checked: props.value,
        disabled: props.isDisabled,
        readOnly: true,
      });
    },
    AppDialog: (props: Record<string, any>) => {
      mocks.dialogs.push(props);
      return createElement(
        "section",
        { role: "dialog", "aria-label": props.title },
        props.children as ReactNode,
      );
    },
    AppBadge: ({ children }: { children: ReactNode }) =>
      createElement("span", null, children),
    AppLoading: ({ label }: { label: string }) =>
      createElement("p", { role: "status" }, label),
  };
});
vi.mock("../src/components/ui/DraftGuard", () => ({
  AppDraftGuard: (props: Record<string, any>) => {
    mocks.discard = props;
    return createElement("section", { role: "dialog" }, props.title);
  },
}));
vi.mock("../src/workbench/navigation-guard", () => ({
  pushWorkbenchNavigation: (...args: unknown[]) => mocks.push(...args),
  confirmWorkbenchNavigation: () => mocks.confirm(),
  cancelWorkbenchNavigation: () => mocks.cancel(),
  registerWorkbenchNavigationBlocker: (guard: Record<string, any>) => {
    mocks.guard = guard;
    return () => {
      if (mocks.guard === guard) mocks.guard = undefined;
    };
  },
}));
vi.mock("../src/workbench/workflows", async () => {
  const actual = await vi.importActual<
    typeof import("../src/workbench/workflows")
  >("../src/workbench/workflows");
  return {
    ...actual,
    fetchWorkflow: (...args: unknown[]) => mocks.fetch(...args),
    fetchWorkflowVersions: (...args: unknown[]) => mocks.versions(...args),
    fetchWorkflowVersion: (...args: unknown[]) => mocks.version(...args),
    fetchWorkflowImpact: (...args: unknown[]) => mocks.impact(...args),
    saveWorkflowDraft: (...args: unknown[]) => mocks.save(...args),
    publishWorkflow: (...args: unknown[]) => mocks.publish(...args),
    fetchWorkflowOperation: (...args: unknown[]) => mocks.receipt(...args),
  };
});

const t = (_zh: string, en: string) => en;
const definition: WorkflowDefinition = {
  schema_version: 1,
  name: "Workspace research",
  harness: "local-superagent",
  stages: [
    {
      id: "planning",
      role: "coordinator",
      model_id: "model-planning",
      instructions: "Inspect the explicit task goal.",
    },
    {
      id: "research",
      role: "researcher",
      model_id: "model-research",
      instructions: "",
    },
    {
      id: "synthesis",
      role: "reviewer",
      model_id: "model-synthesis",
      instructions: "",
    },
  ],
  limits: {
    max_calls: 4,
    parallel: 2,
    minutes: 10,
    max_output_tokens: 1800,
    research_tasks: 2,
  },
  review: "human",
};
const bundle: WorkflowBundle = {
  schema_version: 1,
  workflow_id: "local-research",
  revision: 7,
  definition,
  definition_hash: "a".repeat(64),
  updated_at: "2026-11-21T00:00:00Z",
  published: null,
};
const version: WorkflowVersion = {
  workflow_id: "local-research",
  version: 3,
  definition_hash: bundle.definition_hash,
  definition,
  created_at: "2026-11-21T01:00:00Z",
};
const impact: WorkflowImpact = {
  workflow_id: "local-research",
  revision: bundle.revision,
  definition_hash: bundle.definition_hash,
  impact_hash: "b".repeat(64),
  model_ids: definition.stages.map((stage) => stage.model_id!),
  active_runs: 2,
  historical_runs: 12,
  published_version: null,
};
const data = {
  workspace: "/synthetic/workflow",
  projects: [],
  tasks: [],
  runs: [],
  backends: [],
  local_harnesses: [],
  models: [
    { id: "model-planning", name: "Planning model", key_available: true },
    { id: "model-research", name: "Research model", key_available: true },
    { id: "model-synthesis", name: "Synthesis model", key_available: true },
  ],
  capabilities: { workflow_versions: true },
} as unknown as Bootstrap;
type Props = Parameters<typeof WorkflowPage>[0];
let props: Props;
let html = "";

const clone = <T>(value: T): T => structuredClone(value);
const button = (label: string) =>
  mocks.buttons.find((candidate) => candidate.label === label)!;
const field = (label: string) =>
  mocks.fields.find((candidate) => candidate.label === label)!;
const saveResult = (value: {
  request_id: string;
  expected_revision: number;
  definition: WorkflowDefinition;
}): WorkflowReceipt => ({
  request_id: value.request_id,
  kind: "save",
  state: "applied",
  candidate_hash: "c".repeat(64),
  result: {
    ...clone(bundle),
    revision: value.expected_revision + 1,
    definition: clone(value.definition),
    definition_hash: "d".repeat(64),
  },
});
function render() {
  mocks.stateCursor = 0;
  mocks.refCursor = 0;
  mocks.effectCursor = 0;
  mocks.buttons = [];
  mocks.fields = [];
  mocks.checkboxes = [];
  mocks.dialogs = [];
  mocks.discard = undefined;
  html = renderToStaticMarkup(createElement(WorkflowPage, props));
  return html;
}
async function settle() {
  for (let step = 0; step < 6; step++) {
    render();
    const pending = mocks.pending.splice(0);
    pending.forEach((effect) => effect());
    await Promise.resolve();
    await Promise.resolve();
  }
  return render();
}
async function click(label: string) {
  const control = button(label);
  expect(control, label).toBeDefined();
  expect(control.disabled, label).not.toBe(true);
  await control.onClick();
  await settle();
}
async function change(label: string, value: unknown) {
  field(label).onChange(value);
  await settle();
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  mocks.effects.forEach((effect) => effect.cleanup?.());
  mocks.states = [];
  mocks.refs = [];
  mocks.effects = [];
  mocks.pending = [];
  mocks.guard = undefined;
  vi.clearAllMocks();
  const events = new EventTarget();
  vi.stubGlobal("window", {
    location: { href: "http://localhost/#workflows" },
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events),
  });
  const body = {};
  vi.stubGlobal("document", { body, activeElement: body });
  mocks.push.mockImplementation((href: string) => {
    window.location.href = `http://localhost/${href}`;
    return true;
  });
  mocks.fetch.mockResolvedValue(clone(bundle));
  mocks.versions.mockResolvedValue({
    schema_version: 1,
    workflow_id: "local-research",
    items: [],
    total: 0,
    requested_page: 1,
    page: 1,
    page_size: 20,
    total_pages: 1,
    has_more: false,
  });
  mocks.version.mockResolvedValue(clone(version));
  mocks.impact.mockResolvedValue(clone(impact));
  mocks.save.mockImplementation(async (value) => {
    const receipt = saveResult(value);
    mocks.fetch.mockResolvedValue(clone(receipt.result));
    return receipt;
  });
  mocks.publish.mockImplementation(async (value) => ({
    request_id: value.request_id,
    kind: "publish",
    candidate_hash: "c".repeat(64),
    state: "applied",
    result: clone(version),
  }));
  mocks.receipt.mockRejectedValue(new ApiError(404, "missing"));
  props = { data: clone(data), refreshRevision: 1, t, locale: "en" };
});

describe("workflow page request and publication admission", () => {
  it("admits only one strict unresolved request identifier", () => {
    expect(readWorkflowPendingRequest("http://host/#workflows")).toEqual({});
    expect(
      readWorkflowPendingRequest(
        "http://host/#workflows?workflowRequest=original_123",
      ),
    ).toEqual({ requestId: "original_123" });
    for (const query of [
      "workflowRequest=short",
      "workflowRequest=",
      "workflowRequest=original_123&workflowRequest=other_123",
      "workflowRequest=invalid%2Frequest",
    ])
      expect(readWorkflowPendingRequest(`/#workflows?${query}`)).toEqual({
        error: true,
      });
  });

  it("requires saved exact revision/hash and an unchanged draft to publish", () => {
    const editor = { baseline: clone(bundle), draft: clone(definition) };
    expect(workflowDraftDirty(editor)).toBe(false);
    expect(workflowPublicationMatches(editor, bundle, impact)).toBe(true);
    expect(
      workflowPublicationMatches(editor, { ...bundle, revision: 8 }, impact),
    ).toBe(false);
    expect(
      workflowPublicationMatches(editor, bundle, {
        ...impact,
        definition_hash: "e".repeat(64),
      }),
    ).toBe(false);
    editor.draft.name = "Not yet saved";
    expect(workflowDraftDirty(editor)).toBe(true);
    expect(workflowPublicationMatches(editor, bundle, impact)).toBe(false);
  });
});

describe("fixed workflow UI", () => {
  it("requires an explicit capability and performs no discovery fallback", async () => {
    props.data.capabilities.workflow_versions = undefined;
    await settle();
    expect(html).toContain("does not provide workflow versioning");
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.versions).not.toHaveBeenCalled();
    expect(mocks.fields).toHaveLength(0);
    expect(button("Save draft").disabled).toBe(true);
  });

  it("does not use a reload request to probe an unadvertised endpoint", async () => {
    window.location.href =
      "http://localhost/#workflows?workflowRequest=reload_original_123";
    props.data.capabilities.workflow_versions = false;
    await settle();
    expect(button("Check original request").disabled).toBe(true);
    button("Check original request").onClick();
    await settle();
    expect(mocks.receipt).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("renders three fixed stages, actual bindings, contracts and five limits", async () => {
    await settle();
    expect(html).toContain('data-workflow-stage="planning"');
    expect(html).toContain('data-workflow-stage="research"');
    expect(html).toContain('data-workflow-stage="synthesis"');
    expect(html).toContain("Human review");
    expect(html).toContain("Planning model");
    expect(html).toContain("Research model");
    expect(html).toContain("Synthesis model");
    expect(html).toContain("Task context");
    expect(html).toContain("Research plan");
    expect(mocks.fields.filter((item) => item.kind === "number")).toHaveLength(
      5,
    );
    expect(field("Research task limit").value).toBe(2);
    expect(html).toContain("Revision 7");
    expect(html).toContain(bundle.definition_hash);
    expect(html).toContain("No published version");
    expect(html).not.toContain("online");
    expect(button("Save draft").disabled).toBe(true);
  });

  it("edits the selected stage without changing the immutable stage contract", async () => {
    await settle();
    await click("Research");
    expect(field("Stage model").value).toBe("model-research");
    await change("Stage model", "model-planning");
    await change("Supplemental instructions", "  Keep exact whitespace 🧪\n");
    await click("Save draft");
    const command = mocks.save.mock.calls[0][0];
    expect(command.expected_revision).toBe(7);
    expect(command.definition.stages[1]).toEqual({
      id: "research",
      role: "researcher",
      model_id: "model-planning",
      instructions: "  Keep exact whitespace 🧪\n",
    });
    expect(command.definition.stages[0]).toEqual(definition.stages[0]);
    expect(command.definition.review).toBe("human");
    expect(mocks.publish).not.toHaveBeenCalled();
    expect(window.location.href).toBe("http://localhost/#workflows");
    expect(html).toContain("Draft revision 8 saved.");
  });

  it("preserves dirty fields across refresh, language and model changes", async () => {
    await settle();
    await change("Workflow name", "Local input retained");
    mocks.fetch.mockResolvedValue({
      ...clone(bundle),
      revision: 8,
      definition_hash: "e".repeat(64),
      definition: { ...clone(definition), name: "New server draft" },
    });
    props = {
      ...props,
      refreshRevision: 2,
      locale: "zh",
      data: { ...props.data, models: [...props.data.models] },
    };
    await settle();
    expect(field("Workflow name").value).toBe("Local input retained");
    expect(html).toContain("server draft has a newer revision");
    expect(button("Check publication impact").disabled).toBe(true);
    expect(mocks.guard?.getState()).toEqual({ dirty: true, busy: false });
  });

  it("shows a CAS rejection and preserves the entire local candidate", async () => {
    await settle();
    await change("Workflow name", "Conflict keeps my input");
    await change("Call budget", 5);
    mocks.save.mockRejectedValue(new ApiError(409, "revision_conflict"));
    await click("Save draft");
    expect(field("Workflow name").value).toBe("Conflict keeps my input");
    expect(field("Call budget").value).toBe(5);
    expect(html).toContain("request was rejected");
    expect(html).not.toContain("Draft revision 8 saved");
    expect(html).not.toContain("Original request awaiting confirmation");
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("blocks duplicate saves while the original immutable command is pending", async () => {
    await settle();
    await change("Workflow name", "One command only");
    const pending = deferred<WorkflowReceipt>();
    mocks.save.mockReturnValue(pending.promise);
    const savedHandler = button("Save draft").onClick;
    savedHandler();
    savedHandler();
    await settle();
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(mocks.guard?.getState().busy).toBe(true);
    const sent = mocks.save.mock.calls[0][0];
    const receipt = saveResult(sent);
    mocks.fetch.mockResolvedValue(receipt.result);
    pending.resolve(receipt);
    await settle();
    expect(html).toContain("Draft revision 8 saved");
  });

  it("restarts a pending history read after a save invalidates its generation", async () => {
    const pendingHistory = deferred<unknown>();
    mocks.versions.mockReturnValueOnce(pendingHistory.promise);
    await settle();
    expect(button("Refresh version history").disabled).toBe(true);
    await change("Workflow name", "Saved while history is loading");
    await click("Save draft");
    expect(mocks.versions).toHaveBeenCalledTimes(2);
    expect(button("Refresh version history").disabled).toBe(false);
    expect(html).toContain("No versions have been published.");
    pendingHistory.resolve({
      schema_version: 1,
      workflow_id: "local-research",
      items: [version],
      total: 1,
      requested_page: 1,
      page: 1,
      page_size: 20,
      total_pages: 1,
      has_more: false,
    });
    await settle();
    expect(button("View version v3")).toBeUndefined();
    expect(button("Refresh version history").disabled).toBe(false);
  });

  it("checks the exact saved candidate and requires explicit publication consent", async () => {
    await settle();
    await click("Check publication impact");
    expect(mocks.impact.mock.calls[0][0]).toEqual({
      revision: 7,
      definition_hash: bundle.definition_hash,
    });
    expect(html).toContain("Publish workflow version");
    expect(html).toContain("Workspace active runs");
    expect(html).toContain("Workspace historical runs");
    expect(button("Confirm publication").disabled).toBe(true);
    expect(mocks.publish).not.toHaveBeenCalled();
    mocks.checkboxes[0].onChange(true);
    await settle();
    await click("Confirm publication");
    expect(mocks.publish.mock.calls[0][0]).toEqual({
      request_id: expect.any(String),
      expected_revision: 7,
      definition_hash: bundle.definition_hash,
      impact_hash: impact.impact_hash,
      consent: true,
    });
    expect(html).toContain("Version 3 published");
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("invalidates publication permission when a model dependency changes", async () => {
    await settle();
    await click("Check publication impact");
    mocks.checkboxes[0].onChange(true);
    await settle();
    const stalePublish = button("Confirm publication").onClick;
    props = {
      ...props,
      data: {
        ...props.data,
        models: props.data.models.map((model, index) =>
          index === 0 ? { ...model, key_available: false } : model,
        ),
      },
    };
    await settle();
    stalePublish();
    await settle();
    expect(mocks.publish).not.toHaveBeenCalled();
    expect(mocks.dialogs).toHaveLength(0);
  });

  it("invalidates publication permission as soon as the candidate is edited", async () => {
    await settle();
    await click("Check publication impact");
    mocks.checkboxes[0].onChange(true);
    await settle();
    const stalePublish = button("Confirm publication").onClick;
    await change("Workflow name", "Another candidate");
    stalePublish();
    await settle();
    expect(mocks.publish).not.toHaveBeenCalled();
    expect(mocks.dialogs).toHaveLength(0);
  });

  it("locks an unknown save and retries only the same in-memory command after GET404", async () => {
    await settle();
    await change("Workflow name", "Unknown original content");
    mocks.save.mockRejectedValueOnce(new Error("response_lost"));
    await click("Save draft");
    const original = clone(mocks.save.mock.calls[0][0]);
    expect(window.location.href).toContain(original.request_id);
    expect(html).toContain("write outcome is unconfirmed");
    expect(field("Workflow name").isDisabled).toBe(true);
    expect(button("Save draft").disabled).toBe(true);
    expect(mocks.guard?.getState().busy).toBe(true);
    expect(button("Retry original request")).toBeUndefined();
    await click("Check original request");
    expect(mocks.receipt.mock.calls[0][0]).toBe(original.request_id);
    const known = mocks.receipt.mock.calls[0][2] as WorkflowCommand;
    expect(known).toEqual({ ...original, kind: "save" });
    expect(html).toContain("identical command and request ID");
    await click("Retry original request");
    expect(mocks.save).toHaveBeenCalledTimes(2);
    expect(mocks.save.mock.calls[1][0]).toEqual(original);
    expect(html).toContain("Draft revision 8 saved");
  });

  it("retains a reload request lock after404 without storing definition text", async () => {
    window.location.href =
      "http://localhost/#workflows?workflowRequest=reload_original_123";
    await settle();
    expect(field("Workflow name").isDisabled).toBe(true);
    await click("Check original request");
    expect(mocks.receipt.mock.calls[0][0]).toBe("reload_original_123");
    expect(mocks.receipt.mock.calls[0][2]).toBeUndefined();
    expect(html).toContain("write may still be in flight");
    expect(button("Retry original request")).toBeUndefined();
    expect(button("Save draft").disabled).toBe(true);
    expect(mocks.guard?.getState().busy).toBe(true);
    expect(window.location.href).toContain("reload_original_123");
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("accepts an exact reconciled receipt instead of inferring from the current draft", async () => {
    await settle();
    await change("Workflow name", "Receipt content");
    mocks.save.mockRejectedValueOnce(new Error("response_lost"));
    await click("Save draft");
    const original = mocks.save.mock.calls[0][0];
    const receipt = saveResult(original);
    mocks.receipt.mockResolvedValue(receipt);
    mocks.fetch.mockResolvedValue(receipt.result);
    await click("Check original request");
    expect(field("Workflow name").value).toBe("Receipt content");
    expect(button("Save draft").disabled).toBe(true);
    expect(html).not.toContain("Original request awaiting confirmation");
    expect(window.location.href).not.toContain("workflowRequest");
    expect(mocks.save).toHaveBeenCalledTimes(1);
  });

  it("keeps an invalid or mismatched receipt unresolved", async () => {
    await settle();
    await change("Workflow name", "Receipt must be exact");
    mocks.save.mockRejectedValue(new Error("workflow_response_invalid"));
    await click("Save draft");
    mocks.receipt.mockRejectedValue(new Error("candidate_mismatch"));
    await click("Check original request");
    expect(html).toContain("receipt could not be confirmed");
    expect(field("Workflow name").isDisabled).toBe(true);
    expect(button("Retry original request")).toBeUndefined();
    expect(mocks.save).toHaveBeenCalledTimes(1);
  });

  it("reads history separately and keeps it readonly without replacing the local draft", async () => {
    mocks.versions.mockResolvedValue({
      schema_version: 1,
      workflow_id: "local-research",
      items: [version],
      total: 1,
      requested_page: 1,
      page: 1,
      page_size: 20,
      total_pages: 1,
      has_more: false,
    });
    mocks.version.mockResolvedValue({
      ...clone(version),
      definition: { ...clone(definition), name: "Immutable historical name" },
    });
    await settle();
    await change("Workflow name", "Keep local draft");
    await click("View version v3");
    expect(mocks.version.mock.calls[0][0]).toBe(3);
    expect(field("Workflow name").value).toBe("Immutable historical name");
    expect(field("Workflow name").isDisabled).toBe(true);
    expect(field("Stage model").disabled).toBe(true);
    expect(button("Save draft").disabled).toBe(true);
    expect(html).toContain("Historical v3");
    await click("Back to draft");
    expect(field("Workflow name").value).toBe("Keep local draft");
    expect(button("Save draft").disabled).toBe(false);
  });

  it("requests the next bounded history page without slicing or sorting it again", async () => {
    mocks.versions.mockImplementation(async (page: number) => ({
      schema_version: 1,
      workflow_id: "local-research",
      items:
        page === 1
          ? Array.from({ length: 20 }, (_, index) => ({
              ...clone(version),
              version: 21 - index,
            }))
          : [{ ...clone(version), version: 1 }],
      total: 21,
      requested_page: page,
      page,
      page_size: 20,
      total_pages: 2,
      has_more: page === 1,
    }));
    await settle();
    expect(button("Previous versions").disabled).toBe(true);
    expect(button("View version v21")).toBeDefined();
    await click("Next versions");
    expect(mocks.versions.mock.calls.at(-1)?.[0]).toBe(2);
    expect(button("View version v1")).toBeDefined();
    expect(button("View version v21")).toBeUndefined();
    expect(button("Next versions").disabled).toBe(true);
    expect(html).toContain("21 published versions");
  });

  it("shows a history read failure without manufacturing zero versions", async () => {
    mocks.versions.mockRejectedValue(new ApiError(500, "read_failed"));
    await settle();
    expect(button("Retry history read")).toBeDefined();
    expect(html).not.toContain("0 published versions");
    expect(html).not.toContain("No versions have been published");
    expect(field("Workflow name").value).toBe("Workspace research");
  });

  it("blocks publication after impact drift and preserves the saved definition", async () => {
    await settle();
    await click("Check publication impact");
    mocks.checkboxes[0].onChange(true);
    await settle();
    mocks.publish.mockRejectedValue(
      new ApiError(409, "workflow_impact_changed"),
    );
    await click("Confirm publication");
    expect(html).toContain("revision or its dependencies changed");
    expect(field("Workflow name").value).toBe("Workspace research");
    expect(mocks.dialogs).toHaveLength(0);
    expect(button("Save draft").disabled).toBe(true);
    expect(mocks.publish).toHaveBeenCalledTimes(1);
  });

  it("clears private definitions on a hard refresh failure", async () => {
    await settle();
    await change("Workflow name", "Private dirty content");
    mocks.fetch.mockRejectedValue(new ApiError(403, "forbidden"));
    props = { ...props, refreshRevision: 2 };
    await settle();
    expect(html).toContain("cannot access this workflow");
    expect(html).not.toContain("Private dirty content");
    expect(mocks.fields).toHaveLength(0);
    expect(button("Save draft").disabled).toBe(true);
  });

  it("does not admit a late superseded root response", async () => {
    const first = deferred<WorkflowBundle>();
    mocks.fetch.mockReturnValueOnce(first.promise);
    await settle();
    props = { ...props, refreshRevision: 2 };
    await settle();
    expect(field("Workflow name").value).toBe("Workspace research");
    first.resolve({
      ...clone(bundle),
      definition: { ...clone(definition), name: "Late poisoned definition" },
    });
    await settle();
    expect(field("Workflow name").value).toBe("Workspace research");
  });

  it("requires explicit discard before reloading dirty fields", async () => {
    await settle();
    await change("Workflow name", "Unsaved needs confirmation");
    const reads = mocks.fetch.mock.calls.length;
    await click("Reload");
    expect(mocks.discard?.title).toBe("Discard unsaved workflow changes?");
    expect(field("Workflow name").value).toBe("Unsaved needs confirmation");
    expect(mocks.fetch).toHaveBeenCalledTimes(reads);
    mocks.discard!.onDiscard();
    await settle();
    expect(field("Workflow name").value).toBe("Workspace research");
    expect(mocks.fetch).toHaveBeenCalledTimes(reads + 1);
  });

  it("shares dirty navigation consent and never bypasses an unresolved write", async () => {
    await settle();
    await change("Workflow name", "Dirty navigation candidate");
    mocks.guard!.onBlocked();
    await settle();
    mocks.discard!.onDiscard();
    await settle();
    expect(mocks.confirm).toHaveBeenCalledTimes(1);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("counts instructions by Unicode codepoint and blocks an oversized candidate", async () => {
    await settle();
    await change("Supplemental instructions", "🧪".repeat(2000));
    expect(html).toContain("2000 / 2000");
    expect(field("Supplemental instructions").maxLength).toBeUndefined();
    expect(button("Save draft").disabled).toBe(false);
    await change("Supplemental instructions", "🧪".repeat(2001));
    expect(html).toContain("2001 / 2000");
    expect(button("Save draft").disabled).toBe(true);
  });
});
