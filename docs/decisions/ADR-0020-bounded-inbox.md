# ADR-0020: Bounded Inbox And Selected Details

- Date: 2026-11-20, Asia/Singapore
- Status: Accepted; listed consumer implemented and locally verified
- Work Item: IZ-07.3c2b2
- Follows: ADR-0019

## Reuse Existing Reads

Use existing `task_query: true` and GET `/api/tasks/query`, with no new backend
endpoint or capability. Missing/false retains the current local Inbox. An
advertised read failure never substitutes Bootstrap items or fabricated totals.

The Inbox request is a fixed adapter: query.text from the committed Inbox search,
projects[], states `["pending","attention"]` for all, or the one selected state;
jql empty, mode basic, sorts[], no project scope, page and20/50/100 capacity.
The existing Task-latest classification, task-created descending/source tie,
literal server text match and full bounded Task-query DTO remain authoritative.
No client text filtering, sorting or slicing of admitted pages.

`task_detail: true` independently enables existing GET
`/api/tasks/{id}/detail?page=1&page_size=20` only for a currently presented
selection. Use the exact fresh item, not a Bootstrap lookup. Missing/false detail
capability uses the admitted full list Task item as a list snapshot, with no
detail request. An advertised detail failure never falls back to the list body.
History is bounded by the existing contract; this slice displays its attempts
count, not a new history pager.

The query/detail DTO deliberately excludes Run error/config/context/output.
Remote Inbox summaries show Task goals and status; diagnostics remain behind
the exact Open run link. Do not supplement them with stale Bootstrap errors.
Legacy local Inbox keeps its previous error presentation.

## Query And Selection

Shareable Inbox fields: q, page, pageSize and independent `inboxType` raw URL
parameter. Valid types are all/attention/pending; absent means all. Invalid type
is retained and blocks remote reads/results until Clear. Unrelated Task/Run/
Board sort and view fields do not define the Inbox adapter. Supplied nonempty
JQL, project/state conditions, non-all legacy filter or grouping are explicitly
unsupported and block results; Clear removes them atomically. Do not turn an
unsupported expression into an apparently successful unfiltered Inbox.

Search is draft-only until Search or non-composing Enter atomically commits q
and page1. Clear also removes draft-only edits and resets type/page. Type segments
are immediate scope navigation: change only inboxType/page, retaining a pending
search draft. Capacity changes reset page. Back/Forward restore committed drafts
through the shared navigation event/resetKey. All writes use canonical navigation
admission; no independent hash assignment or popstate listener.

Selection is local stable Task ID plus current committed request identity.
A new query/page/capacity resets explicit selection and closes the mobile dialog.
Desktop may initially select the first page item; mobile reads details only after
an explicit row selection. Same-key refresh preserves an explicit selected ID.
If that ID leaves the page, show unavailable instead of selecting another task.
Cross-breakpoint presentation mounts only one detail consumer.

A fresh detail outside the current Inbox type is no longer actionable here:
show that state and offer a read-only Inbox refresh. It is not a write lease.
Eligible fresh details may reflect a newer snapshot; use their exact Task/Run
for existing Review/Open run/Open project actions. Review still enters the
existing context preview/explicit consent flow, never an automatic model call.

## Read Lifecycle And UI

Use15s abort, obsolete-response guards, same-key busy retention, different-key
hiding, ready-only Bootstrap poll revalidation and explicit GET retry. A poll
must not interrupt loading or replay errors. HTTP401/logout clears private
projections. Provider/mutation requests never inherit this retry policy.

While retained list/detail data is busy, block selection and domain actions,
including retained callbacks. Keep Close/Cancel available. Detail error/forbidden/
missing/timeout, list error, loading, real empty and unsupported legacy are
separate. Reading current state is not exact mutation evidence.

Keep the existing Astryx Inbox business composition, top global Quick find and
one-row Inbox scope/search controls. Add one real20/50/100 list footer with
range/total/page, list scroll and desktop detail scroll. Mobile uses the same
detail body in Astryx Dialog. Pager and dialog focus must avoid native/ARIA-
disabled or hidden targets and preserve user-moved focus. Three styles/both
modes, Chinese/English, long labels and reduced motion require browser evidence.

## Remaining Scope

No Python/schema/provider changes, primary4180 activation, credentials, new
dependencies, sibling changes or deployment. Bootstrap remains full. Overview,
hierarchy, documents and remaining Project consumers precede negotiated reduction,
invalidation and actual transfer/scale evidence. Original119/9/110 remains.

## Evidence And Next Priority

Completed2026-11-21 Asia/Singapore. 1605 frontend tests/56 files,156 existing
Python Task-query/detail contract tests, TypeScript and production build passed.
Production browser:59 synthetic,8 actual API and58 comprehensive checks;78 final
PNG, no page errors. No Python code changes or new API.
See `frontend/evidence/inbox-2026-11-21/README.md` for exact fixture, failure and
activation boundaries. Per user feedback on November20, next priorities follow
`PRODUCT_GOALS_CURRENT.md`: visible goal/task/Agent/outcome integration rather
than automatically migrating the next data projection.
