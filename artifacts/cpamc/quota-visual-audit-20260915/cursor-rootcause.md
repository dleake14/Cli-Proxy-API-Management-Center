# CPAMC Cursor quota-card timeout / missing-timeline-lane — root-cause investigation

Working directory: `"/home/david/forks/cpamc"`. Read-only investigation, no edits made.

## 1. Call chain from page mount to `fetchCursorQuota`

`"src/features/quota/QuotaPage.tsx:110-112"`:
```
useEffect(() => {
  void loadFiles();
}, [loadFiles]);
```
`loadFiles` (`QuotaPage.tsx:87-106`) calls `authFilesApi.list()`, sets `files`, which feeds `entries = useMemo(() => classifyQuotaFiles(files), [files])` (`QuotaPage.tsx:176`).

The auto-refresh controller effect (`QuotaPage.tsx:270-300`) creates a `createQuotaRefreshController` (`"src/features/quota/quotaRefreshClock.ts:43-96"`) whose `refresh()` calls `state.loadQuota(state.entries, true)`, where `loadQuota` is `useQuotaBatchLoader().loadQuota` (`"src/features/quota/hooks/useQuotaBatchLoader.ts:33-114"`). That function groups entries by provider and for the `cursor` group calls:
```
const data = await adapter.fetchQuota(file, t);   // useQuotaBatchLoader.ts:72
```
where `adapter = QUOTA_ADAPTERS.cursor = { ...CURSOR_CONFIG, Body: CursorQuotaBody }` (`"src/features/quota/providers/index.ts:63"`), and `CURSOR_CONFIG.fetchQuota = fetchCursorQuota` (`"src/features/quota/providers/cursor/data.ts:117"`).

A manual card refresh takes the parallel path `useQuotaActions.refreshQuota` → `adapter.fetchQuota(file, t)` (`"src/features/quota/hooks/useQuotaActions.ts:41"`), same target function.

`fetchCursorQuota` (`"src/features/quota/providers/cursor/data.ts:86-111"`) calls `requestCursorUsage()` (`data.ts:71-84`), which calls `fetchSidecarJson<CursorUsagePayload>(endpoint, fetchImpl)` (`"src/utils/quota/sidecarFetch.ts:54-75"`) against `CURSOR_USAGE_ENDPOINT` (`http://127.0.0.1:47193/cursor-usage`).

## 2. Every place the in-flight request can be aborted / cancelled / superseded / re-triggered

**a. The only `AbortController` in this path is local to `fetchSidecarJson` itself, not tied to React unmount.**
`"src/utils/quota/sidecarFetch.ts:59-74"`:
```ts
const controller = new AbortController();
const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);
try {
  const response = await fetchImpl(endpoint, { ..., signal: controller.signal });
  const payload = (await response.json()) as T;
  return { response, payload };
} catch (error: unknown) {
  if (controller.signal.aborted) throw new SidecarTimeoutError();
  throw error;
} finally {
  globalThis.clearTimeout(timer);
}
```
Grep confirms no `useEffect` cleanup, no cancellation token, and no component ever calls `.abort()` on this controller — React unmount cannot cancel it, and nothing in `QuotaPage.tsx`, `useQuotaBatchLoader.ts`, or `useQuotaActions.ts` passes an external signal in. So React StrictMode double-effects, tab switches, or unmounts do **not** directly abort this fetch.

**b. The `catch` block converts *any* rejection into `SidecarTimeoutError` whenever `controller.signal.aborted` happens to already be `true` at that instant** (`sidecarFetch.ts:70`). This is not limited to an `AbortError` — a `TypeError` from `response.json()` (e.g. body already consumed, or a parse error) thrown after the 12s timer has separately fired would also surface as `SidecarTimeoutError`, mislabeling a different failure as a timeout.

**c. Multiple independent 12s timers can be in flight for the *same* Cursor credential at once**, because nothing outside `fetchSidecarJson` deduplicates or serializes Cursor requests across call sites:
   - `useQuotaBatchLoader.loadQuota` guards *itself* against concurrent batches with `loadingRef` (`useQuotaBatchLoader.ts:35`), but that only blocks a second call to the whole batch loader — it does not block `useQuotaActions.refreshQuota`, which has its own independent guard checking only `getQuotaState(adapter, file.name)?.status === 'loading'` (`useQuotaActions.ts:31`). A user click on "refresh" for the Cursor card while a background `loadQuota(entries, true)` batch is mid-flight for the same file starts a **second**, fully independent `fetchSidecarJson` call with its **own** 12s timer and its own `AbortController` hitting the same sidecar endpoint.
   - The auto-refresh poll (`QuotaPage.tsx:264-300`) runs `window.setInterval(check, 15_000)` and also calls `check()` synchronously on effect mount and on every `focus`/`online`/`visibilitychange` event (`QuotaPage.tsx:283-291`). Each accepted `check()` that fires `refresh()` starts a brand-new `loadQuota(entries, true)` batch — i.e. a brand-new `fetchSidecarJson` call to `/cursor-usage` — while a manual refresh or a previous batch may still be resolving.
   - `handleRefreshAll` (`QuotaPage.tsx:306-321`) re-fetches the file list and then, once loading flips from `true`→`false`, calls `loadQuota(entries)` unconditionally — another independent Cursor request.
   None of these paths share an `AbortController`, a request-id, or a lock keyed by *provider+file*; the only in-order guard (`requestIdRef` in `useQuotaBatchLoader.ts:38,86,107`) discards a **stale batch's commit to the store**, it does not cancel or prevent the stale batch's underlying `fetch` from running to completion (or to its own 12s abort).

**d. Server-side queuing consequence.** If several of these independently-triggered requests reach the Cursor sidecar close together, and the sidecar (per `AGENTS.md`, a small local Python service, not shown here but referenced by `CURSOR_USAGE_ENDPOINT`) handles requests with any serialization, a later request in the pile-up can sit unserved past the client's 12s deadline even though any *single* request in isolation (the `curl` test, or the browser JS-context fetch) completes in well under a second. Each browser-side request still independently times its **own** 12s window from when *it* was issued, so a request that is queued for 12+ seconds before the server even reads it produces a genuine, correctly-labeled `SidecarTimeoutError.timeout` — the request itself never was slow, the *pileup* was.

**e. React StrictMode.** Not directly verified here (would need to run the dev server and inspect double-invocation), but StrictMode's synthetic double-invoke of effects/render in development would double every mount-triggered call above, compounding (d).

## 3. Does a filter exclude Cursor's window ids from the timeline?

Not at the row level for `session`/`weekly` — both are explicitly included:
`"src/features/quota/windowVisibility.ts:14-19"`:
```ts
/** Cursor Ultra exposes two independent pools; the billing total is not a window. */
export const CURSOR_TIMELINE_ROW_IDS = new Set(['session', 'weekly']);

export function isCursorTimelineRow(id: string | undefined): boolean {
  return CURSOR_TIMELINE_ROW_IDS.has(String(id ?? ''));
}
```
`monthly` is deliberately excluded by design (comment: "the billing total is not a window") — that is intentional, not a bug, and matches the observed sidecar payload having a `monthly` window that should never get a lane.

The actual disappearance of the lane happens one layer up, in `QuotaTimeline.tsx`, via `laneHasWindow`:
`"src/features/quota/quotaTimelineModel.ts:457-464"`:
```ts
export function laneHasWindow(lane: TimelineLane): boolean {
  return (
    lane.anchorMs !== null &&
    Number.isFinite(lane.anchorMs) &&
    lane.periodHours !== null &&
    Number.isFinite(lane.periodHours) &&
    lane.periodHours > 0
  );
}
```
and `"src/features/quota/components/QuotaTimeline.tsx:250-257"`:
```ts
const lanes = useMemo(
  () =>
    laneInputs
      .flatMap((input) => buildTimelineLanes({ ...input, nowMs: now, maxPeriodHours: ... }))
      .filter((lane) => laneHasWindow(lane) && (mode !== 'session' || lane.periodHours === 5)),
  [laneInputs, mode, now]
);
```
`buildTimelineLane`/`buildTimelineLanes` return the `empty` lane object (`anchorMs: null`) whenever `quota.status !== 'success'` (`"src/features/quota/quotaTimelineModel.ts:590"`: `if (!quota || quota.status !== 'success') return empty;`). Since Cursor's card is stuck in `status: 'error'` (Q1), its lane is always `empty`, `laneHasWindow` returns `false`, and `QuotaTimeline.tsx:256`'s `.filter(...)` drops it before render. Note the doc-comment directly above `laneHasWindow` (`quotaTimelineModel.ts:450-455`) claims "an anchored lane... still gets a row" and frames dropping as reserved for providers with genuinely "no usable reset instant" — but the *filter that actually runs* treats "no anchor because the fetch errored" identically to "no anchor because the provider has no schedule," silently conflating a data-fetch failure with a designed absence.

## 4. Is `cursor` present in every exhaustive map?

Checked every file named in the packet plus `providers/types.ts`. **Cursor is present in all of them** — no map is missing it:

| Map | Evidence |
|---|---|
| `"src/features/quota/providers/index.ts"` | `QUOTA_ADAPTERS.cursor` (`index.ts:63`) |
| `"src/features/quota/logic.ts"` | `cursor: CURSOR_CONFIG.filterFn` (`logic.ts:25`); `{ name: 'Cursor Ultra', type: 'cursor' }` (`logic.ts:46`) |
| `"src/features/quota/constants.ts"` | `QUOTA_TAB_ORDER` includes `'cursor'` (`constants.ts:9`) |
| `"src/features/authFiles/constants.ts"` | `'cursor'` at lines 35, 46, 77; `cursor: iconOllama` at line 94 |
| `"src/features/quota/QuotaPage.tsx"` | `cursorQuota` store slice wired at lines 145, 157 |
| `"src/features/quota/resetSchedule.ts"` | `provider === 'cursor'` handled at lines 134, 137 |
| `"src/features/quota/quotaTimelineModel.ts"` | per-provider branch at line 748 (`buildTimelineLane`) and line 889 (`buildTimelineLanes`) |
| `"src/features/quota/providers/types.ts"` | `'cursor'` union member (line 30), `cursorQuota` field (line 41) |

**No missing-map finding for Q2.** The timeline lane's absence is fully explained by the error status flowing through the shared `laneHasWindow` filter (§3), not by any incomplete provider registration.

## 5. Most likely root cause per question, with supporting and falsifying evidence

### Q1 — why `fetchSidecarJson` throws `SidecarTimeoutError` when the request itself is fast

**Most likely root cause: uncoordinated concurrent Cursor requests (auto-refresh poll + manual refresh + initial batch load, each with its own independent 12s `AbortController`) cause requests to pile up faster than the sidecar (or the browser's own connection/queueing) can service them, so a given request's *own* 12s clock elapses before it gets serviced — a real, correctly-detected timeout for *that* request, even though a fresh, uncontended request (the `curl`, or a one-off in-page fetch) completes in well under a second.**

Supporting evidence:
- No cancellation, dedup, or single-flight lock exists across `useQuotaBatchLoader.loadQuota` and `useQuotaActions.refreshQuota` for the same provider+file (§2c) — both can independently call `fetchSidecarJson` against `/cursor-usage` at the same time.
- The auto-refresh controller fires `check()` on mount, on `focus`, on `online`, on `visibilitychange`, and every 15s (`QuotaPage.tsx:283-291`), each capable of starting a fresh batch fetch that is fully independent of any request already in flight.
- `fetchSidecarJson`'s own catch-all (`sidecarFetch.ts:70`) will report `SidecarTimeoutError` for *any* rejection coincident with `controller.signal.aborted === true`, which is exactly what a genuinely-queued-past-12s request produces — this is a real timeout being correctly reported, not a misfire, but its *cause* is client-side request pileup rather than sidecar or network slowness.
- The reported single-shot fetches (curl at 0.41s, in-page JS-context fetch at 448ms) are each a *lone* request with no contention — they do not test the pileup scenario and are consistent with this theory.

Would falsify it:
- Chrome DevTools Network panel, captured while the quota page is open and failing, showing only **one** `GET /cursor-usage` request in flight per failure (no overlapping requests) — that would rule out pileup and point instead at (b)/(e) below or at main-thread scheduling delay.
- The CPAMC sidecar's own access log (if it timestamps request-received vs. request-answered) showing every request answered in <1s server-side even during a failure — that would shift blame to the browser/network layer rather than server queuing.

Second-most-likely candidate, not ruled out: **main-thread starvation delaying the `await` continuation past the 12s deadline.** The 9-second-plus "still running" `quota-card-in` (0.45s) / `quota-meter-fill` (0.48s) CSS animations (`"src/features/quota/components/QuotaCard.module.scss:34"`, `"src/features/quota/components/QuotaBody.module.scss:113"`) are each far shorter than 9s, so an animation still reporting `playState: "running"` 9+ seconds after load means the element (or its animation) is being **re-triggered**, not merely slow — consistent with repeated remounts producing heavy synchronous render work that could delay promise-continuation scheduling long enough for the independent `setTimeout(...,12000)` in `fetchSidecarJson` to win the race even after the network response already arrived. I could not identify the specific remount trigger within the files read for this packet (card `key`s are stable at `QuotaPage.tsx:416`, and `cardsAnimated` is captured once at `QuotaCard.tsx:57`); confirming or ruling this out needs either a React DevTools "why did this render" trace or a `performance_start_trace`/long-task capture, which was out of scope for a read-only, 15-minute pass. Falsifier: a long-task/perf trace showing no main-thread task >2s coincident with a Cursor timeout.

### Q2 — why Cursor never gets a timeline lane

**Root cause: this is a direct, mechanical downstream consequence of Q1, not a separate bug.** `buildTimelineLane`/`buildTimelineLanes` return an anchor-less `empty` lane whenever `quota.status !== 'success'` (`quotaTimelineModel.ts:590`), and `QuotaTimeline.tsx:256` filters any lane failing `laneHasWindow` out of the rendered set before the chart ever sees it. Since Cursor's fetch always ends in `status: 'error'` (Q1), its lane is always empty and always filtered — with zero missing-provider-map involvement (§4).

Supporting evidence: quoted filter chain in §3; Cursor *is* registered in `QUOTA_TAB_ORDER`, `QUOTA_ADAPTERS`, and the `quotaTimelineModel.ts` per-provider branches, so a missing-registration explanation is directly contradicted by the code.

Would falsify it: if a manual browser check shows the Cursor **card** successfully reaching `status: 'success'` (quota numbers rendering) while the **timeline** still shows no Cursor lane, that would disprove this chain and point instead at a real bug in `laneHasWindow`/`buildTimelineLanes` (e.g. `rows` filtering losing `resetAtMs` typing, or `isCursorTimelineRow` mismatching row `id` casing) rather than at the fetch failure.

## Summary of what to check next (diagnosis only — no patch proposed)

1. Confirm Q1's leading theory with a Network-panel capture during an actual failing load (count of concurrent `/cursor-usage` requests, and each one's client-observed duration vs. server-received-to-answered timestamps if available).
2. If pileup is confirmed, the object of interest is the *lack of a single-flight guard* across `useQuotaBatchLoader.loadQuota` and `useQuotaActions.refreshQuota` for the same provider+file, and the four independent auto-refresh triggers in `QuotaPage.tsx:264-300`.
3. If pileup is ruled out, capture a long-task/performance trace correlated with the animation-restart symptom to test the main-thread-starvation theory, and identify the actual remount trigger (not found in the files read for this packet).
4. Q2 needs no independent fix path — it will resolve automatically once Q1's fetch reliably returns `status: 'success'` for Cursor, though the stale doc-comment at `quotaTimelineModel.ts:450-455` (claiming empty lanes still render) versus the actual filtering behavior at `QuotaTimeline.tsx:256` is worth flagging as a documentation/behavior mismatch, separate from this bug.
