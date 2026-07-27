# Document 1 — Systemic Review & Tri-Option Diagnosis

> **Input**: `01-research.md` (Phase 1 audit).
> **Output**: For each architectural issue, (a) systemic-risk analysis, (b) a
> concrete remediation, (c) **three options** (X / Y / Union), (d) a solo-
> maintainer over-engineering audit.
> **Constraint**: every proposal must be backward-compatible with the existing
> export signatures and the 3661-line `dependency-graph.tsx` dialog's consumed
> shapes.

---

## 2.0 Issue inventory (consolidated from Phase 1)

| # | Issue | Severity | Phase-1 citation |
|---|---|---|---|
| I-1 | Hardcoded absolute paths (`DOCS_DIR`, `BUG_MAP_PATH`) | High | `01-research.md §1.2.1` |
| I-2 | Filename-as-schema (`startsWith("PART-")`) | High | `§1.2.2` |
| I-3 | `bug-facts.ts` dual source of truth (unfinished migration) | High | `§1.2.3` |
| I-4 | Untyped, scattered CustomEvent bus | **Critical** | `§1.2.4` |
| I-5 | Monolithic `dependency-graph.tsx` (3661 lines) | High | `§1.2.5` |
| I-6 | No schema-migration path (`z.literal("1.0.0")`) | Medium | `§1.2.6` |
| I-7 | No dry-run validation endpoint (agent blast-radius) | Medium | `§1.3` |
| I-8 | Rate-limit memory unbounded across restarts | Low | `§1.2.7` |

**Multi-issue consolidation opportunity**: I-1, I-2, and I-4 are all symptoms of
the same disease — **string literals acting as an implicit contract**. One
"typed registry" module (`src/lib/contracts.ts`) can hold the doc-registry
schema, the event-name registry, AND the resolved docs directory, killing three
issues with one file. This is the highest-leverage move and is detailed first.

---

## 2.1 Issue I-4 — Untyped CustomEvent bus (CRITICAL)

### 2.1.1 Systemic risk

The event bus is how the **store** (server-pushed state changes) talks to **UI**
(components that didn't subscribe to that slice of state). Today the contract is
7 raw strings in 6 files (`01-research.md §1.2.4`). The systemic regression risk
of *fixing* this is low *if* the registry is purely additive: existing string
literals become `EventName.X` references, behaviour identical. The risk of *not*
fixing it compounds with every new event — the design doc already proposed
"event #6" (`graph:synced`), implying event #7, #8... each one a new silent-failure
surface.

### 2.1.2 Remediation strategy

Introduce a single `as const` registry object mapping a typed key to
`{ name: string; payload: z.ZodType }`. Both producers (`signalDocJump*`,
`syncDependencyGraph`) and consumers (`addEventListener`) import from it. A typo
becomes a compile error. Payload shape becomes runtime-validatable (defense
against an agent dispatching `graph:synced` with the wrong detail shape).

### 2.1.3 Tri-option analysis

**Option X — Minimal: typed name registry only (no payload schemas).**
```ts
// src/lib/contracts.ts
export const EVT = {
  DocJump: "doc:jump",
  DocJumpTo: "doc:jumpto",
  DocJumpToOccurrence: "doc:jumpto-occurrence",
  GraphSynced: "graph:synced",
  GraphOpenAtNode: "graph:open-at-node",
  AnnotationClicked: "annotation-clicked",
  AnnotationsUpdated: "annotations-updated",
} as const;
export type EventName = (typeof EVT)[keyof typeof EVT];
```
Producers/consumers swap literals for `EVT.GraphSynced`. Payloads stay
untyped (`CustomEvent<unknown>`). **Cost**: 1 new file, ~30 line edits. **Solo-
maintainer fit**: excellent. **Gap**: payload drift still possible (agent
dispatches `graph:synced` with `{ wrong: "shape" }`).

**Option Y — Full: registry + zod payload schemas + a typed `dispatch`/`subscribe`
helper pair.**
```ts
export const EVENT_CONTRACTS = {
  [EVT.GraphSynced]: { payload: z.object({ generatedAt: z.string() }) },
  [EVT.DocJumpToOccurrence]: { payload: z.object({ id: z.string(), occurrenceIndex: z.number() }) },
  // ...
} as const;
export function dispatchGraphEvent<K extends EventName>(name: K, detail: z.infer<(typeof EVENT_CONTRACTS)[K]["payload"]>) { ... }
export function subscribeGraphEvent<K extends EventName>(name: K, handler: (detail: z.infer<...>) => void) { ... }
```
**Cost**: ~120 lines + ~40 call-site edits. **Gap**: over-engineering for a solo
maintainer — 7 events don't justify a generic publish/subscribe framework, and
the `z.infer` conditional typing is the kind of cleverness that slows down a
tired 2am fix.

**Option Z (Union) — Typed name registry + a thin `dispatchDocEvent` helper with
payload validation ONLY for the 3 events that cross module boundaries**
(`graph:synced`, `graph:open-at-node`, `doc:jumpto-occurrence`). The 4
intra-module events (`annotation-*`, `doc:jump`, `doc:jumpto`) keep raw
`window.dispatchEvent` because their producer+consumer live in the same file
already — no cross-module drift risk.

```ts
// src/lib/contracts.ts  (≤60 lines)
export const EVT = { /* ...as Option X... */ } as const;
export type EventName = (typeof EVT)[keyof typeof EVT];

// Payload contracts ONLY for cross-module events
export const CROSS_MODULE_PAYLOADS = {
  [EVT.GraphSynced]: z.object({ generatedAt: z.string() }),
  [EVT.GraphOpenAtNode]: z.object({ id: z.string() }),
  [EVT.DocJumpToOccurrence]: z.object({ id: z.string(), occurrenceIndex: z.number() }),
} as const;

export function dispatchDocEvent<K extends keyof typeof CROSS_MODULE_PAYLOADS>(
  name: K,
  detail: z.infer<(typeof CROSS_MODULE_PAYLOADS)[K]>
): void {
  if (typeof window === "undefined") return;
  // validate best-effort (don't throw in a dispatch hot-path; log instead)
  const parsed = CROSS_MODULE_PAYLOADS[name].safeParse(detail);
  if (!parsed.success) {
    console.warn(`[contracts] malformed payload for ${name}`, parsed.error.issues);
    return;
  }
  window.dispatchEvent(new CustomEvent(name, { detail: parsed.data }));
}
```
**Cost**: ~60 lines + ~12 call-site edits (only the 3 cross-module events).
**Solo-maintainer fit**: best — pays for itself only where drift actually bites.

### 2.1.4 Over-engineering audit

- Option X is *under*-engineered: solves the typo class but not the payload class.
- Option Y is *over*-engineered: a generic typed pub/sub for 7 events violates
  the solo-maintainer rule (extra abstraction layer, harder to debug).
- **Option Z is the recommendation**: scope the type-safety to where the risk is
  (cross-module), leave intra-module events alone.

---

## 2.2 Issue I-1 + I-2 + I-4 — Consolidated "typed contracts" module

### 2.2.1 Systemic risk

Combining the three fixes into one `src/lib/contracts.ts` module is the
*opposite* of risky: it **reduces** the surface area. Today the docs dir, the
file-classification rules, and the event names are spread across 3 files with no
single source of truth. Consolidation means an agent (or maintainer) reads ONE
file to understand "what are the app's static contracts?".

The one regression risk: **import-cycle**. `contracts.ts` must not import from
`doc-store.ts` or `dependency-graph.ts`. It is a leaf module (only imports `zod`
+ `path`). Enforced by a lint rule if desired; structurally guaranteed by keeping
it dependency-free.

### 2.2.2 Remediation strategy

`contracts.ts` exports four things:
1. `DOCS_DIR` — resolved via `path.resolve(process.cwd(), "consolidated-docs")`.
2. `resolveDocPath(fileName)` — single chokepoint (replaces both `docs-parser.ts:5` and `dependency-graph.ts:31`).
3. `DocMeta` zod schema (front-matter or registry file) — replaces `startsWith`.
4. `EVT` + `CROSS_MODULE_PAYLOADS` + `dispatchDocEvent` (from §2.1.3 Option Z).

### 2.2.3 Tri-option analysis (for the *doc registry* part, I-2)

**Option X — Front-matter in each `.md` file.**
Each doc gets a YAML front-matter block:
```yaml
---
type: part
order: 1
title: "Diagnosis, Findings, and As-Built Reality"
---
```
`docs-parser.ts` reads front-matter instead of `startsWith`. **Cost**: edit 10
files + ~40 lines of parser. **Gap**: front-matter drifts from filename (a
renamed file keeps its old front-matter); also pollutes 10 hand-authored prose
docs with metadata the author doesn't care about.

**Option Y — A single `consolidated-docs/INDEX.yml` registry file.**
```yaml
docs:
  - file: PART-1-Diagnosis-Findings-and-As-Built-Reality.md
    type: part
    order: 1
    title: "Diagnosis, Findings, and As-Built Reality"
  # ...
```
**Cost**: 1 new file + ~30 lines of parser. **Gap**: now there are *two* files
to keep in sync (INDEX.yml + the actual .md), and the parser must validate that
every `.md` in the dir appears in INDEX (else a new doc silently doesn't render).

**Option Z (Union) — A single `INDEX.yml` AND the parser auto-discovers any
`.md` NOT in INDEX, classifying it as `type: "unlisted"` (renders but warns).**
This is Option Y + a fail-safe. An agent adding a doc has two paths: (a) add to
INDEX (explicit, gets the right type/order), or (b) drop the file in the dir
(lazy, renders as unlisted until someone classifies it). No silent omission.
**Cost**: 1 new file + ~45 lines of parser. **Recommendation.**

### 2.2.4 Over-engineering audit

- Option X touches 10 files — too much blast radius for a metadata change.
- Option Y is clean but has the silent-omission footgun.
- **Option Z** is the recommendation: explicit-by-default, lazy-safe.

---

## 2.3 Issue I-5 — Monolithic `dependency-graph.tsx` (3661 lines)

### 2.3.1 Systemic risk

Splitting a 3661-line React component is the **highest-regression-risk** change
in this review. The component shares ~15 `useEffect` hooks, ~40 `useState`
hooks, and implicit closures across what *should* be separate sub-components.
A naive split (just move JSX into children) breaks because the children need
access to the parent's state — and prop-drilling 40 states is worse than the
monolith.

The systemic regression is **stale closure bugs**: a child component captures a
state value at mount and never sees updates. This is the #1 way a React
component split silently breaks.

### 2.3.2 Remediation strategy

**Split along state-ownership boundaries, not visual boundaries.** Identify
which state belongs to which sub-component, hoist only the truly-shared state to
the orchestrator, and pass the rest down. Use **Zustand selectors** (already
available — `useDocStore`) for cross-cutting state like `graphSyncStatus` so
prop-drilling is avoided.

Boundaries (grounded in `01-research.md §1.2.5`):
- **`GraphCanvas`** (owns: viewport transform, pan/zoom, node positions) — `:1402-1403`, `:2604`, `:2963-2965`
- **`GraphToolbar`** (owns: sync button state, layout toggle, search input) — `:2259-2290`, `:3304-3343`
- **`GraphNodeDetail`** (owns: selected node, popover position) — `:2963` click handler
- **`GraphLegend`** (stateless: renders lane legend from props)
- **`DependencyGraphDialog`** (orchestrator: owns dialog open/close, fetches graph, wires `graph:synced` listener `:2313-2324`, renders the 4 children)

### 2.3.3 Tri-option analysis

**Option X — Big-bang split into 5 files in one PR.**
**Cost**: ~1 day, high risk. **Gap**: a single stale-closure bug ships and the
graph silently stops responding to sync. Unacceptable for a solo maintainer with
no QA team.

**Option Y — Don't split; just extract the stateless pieces (`GraphLegend`,
`GraphLaneBackground`) and leave the rest.**
**Cost**: ~2 hours, low risk. **Gap**: the 3661-line file stays 3000+ lines; the
maintainability problem is unchanged. Cosmetic only.

**Option Z (Union) — Incremental extraction in 3 phases, each independently
shippable + revertible:**
1. **Phase A**: extract stateless `GraphLegend` + `GraphLaneBackground` (zero state, pure props). Verifiable: visual diff = none.
2. **Phase B**: extract `GraphToolbar` (owns its own state, reads `graphSyncStatus` from `useDocStore` directly — no prop-drilling). Verifiable: sync button still works.
3. **Phase C**: extract `GraphCanvas` (owns viewport transform via a local `useGraphViewport` hook; receives `nodes`/`edges` as props). Verifiable: pan/zoom + node-click still work.

Each phase is a separate commit; each can be reverted without touching the
others. The orchestrator shrinks from 3661 → ~2500 → ~1800 → ~600 lines.
**Recommendation.**

### 2.3.4 Over-engineering audit

- Option X violates the solo-maintainer rule (unverifiable big-bang).
- Option Y is under-engineered (doesn't solve the problem).
- **Option Z** is the recommendation: incremental, each step pays for itself.

---

## 2.4 Issue I-6 — No schema-migration path

### 2.4.1 Systemic risk

Today `schemaVersion: z.literal("1.0.0")` (`dependency-graph.ts:114`) means a
1.1.0 block *cannot exist*. The systemic risk of *adding* migration is low: the
migrator runs only when `schemaVersion !== CURRENT`, and on success feeds the
migrated object into the existing v1.0.0 parser. The cache is untouched until
migration succeeds (fail-closed, same pattern as `reparseDependencyGraphNow`).

### 2.4.2 Remediation strategy

Replace the literal with a discriminated union + a `migrate(source): GraphSource`
function. Version negotiation: if `source.schemaVersion === CURRENT` → passthrough;
if `< CURRENT` → run migrators in sequence; if `> CURRENT` → reject (can't
fast-forward).

### 2.4.3 Tri-option analysis

**Option X — Hand-rolled migrator map.**
```ts
const MIGRATORS: Record<string, (s: any) => any> = {
  "1.0.0": (s) => s, // identity
  "1.0.1": (s) => ({ ...s, schemaVersion: "1.1.0", nodes: s.nodes.map(addPriorityField) }),
};
```
**Cost**: ~30 lines. **Gap**: `any` everywhere — an AI agent editing the
migrator has no type guidance, exactly the problem we're solving.

**Option Y — Full version-tracking library (e.g. port `renoun`'s versioned
schema pattern).**
**Cost**: new dependency, ~200 lines of wrapper. **Gap**: grossly over-engineered
for a schema that has had one version in its entire history.

**Option Z (Union) — Typed migrator map with zod-validated input/output per
step.**
```ts
const v1_0_0 = z.object({ schemaVersion: z.literal("1.0.0"), /* ...full v1 shape... */ });
const v1_1_0 = z.object({ schemaVersion: z.literal("1.1.0"), /* ...v1 + new field... */ });
const MIGRATORS = {
  "1.0.0": (s: z.infer<typeof v1_0_0>): z.infer<typeof v1_1_0> => ({ ...s, schemaVersion: "1.1.0", nodes: s.nodes.map(n => ({ ...n, priorityScore: n.severity === "P0" ? 100 : 0 })) }),
} as const;
export const CURRENT_SCHEMA_VERSION = "1.1.0";
```
**Cost**: ~50 lines, no new deps. **Gap**: none for the current scale.
**Recommendation** — but **deferred**: there is no v1.1.0 yet, so this is
"scaffold the hook, don't populate it". The hook's existence is the value; an
agent evolving the schema has a clear pattern to follow.

### 2.4.4 Over-engineering audit

- Option X is under-typed.
- Option Y is over-engineered.
- **Option Z (scaffold only)** is the recommendation.

---

## 2.5 Issue I-7 — No dry-run validation endpoint

### 2.5.1 Systemic risk

`POST /api/dependency-graph/sync` (`src/app/api/dependency-graph/sync/route.ts:40`)
calls `reparseDependencyGraphNow()` which **mutates the cache on success**. An
AI agent validating a proposed YAML edit has no way to ask "would this parse?"
without risking a clobber if its edit is subtly wrong (e.g. valid YAML, valid
schema, but semantically wrong — wrong lane assignment). The systemic risk of
*adding* a dry-run endpoint is zero: it's a new route, doesn't touch the
existing sync route.

### 2.5.2 Remediation strategy

Add `POST /api/dependency-graph/validate` that takes a YAML body, runs the same
`parseGraphSource` + `checkReferentialIntegrity` pipeline, returns
`{ ok: true, nodeCount, edgeCount }` or `{ ok: false, issues[] }` — **without**
touching the cache or the disk file. Reuses 100% of existing validation logic
(`dependency-graph.ts:280` `parseGraphSource` is already pure).

### 2.5.3 Tri-option analysis

**Option X — New `POST /api/dependency-graph/validate` route, body = raw YAML.**
**Cost**: ~35 lines (mirror of sync route, minus the cache write). **Gap**: an
agent must paste YAML into the request body — works, but the agent must
read+serialize the file itself.

**Option Y — Query param `?dry-run=1` on the existing sync route.**
**Cost**: ~10 lines. **Gap**: overloads `POST /sync` with two semantics (apply
vs check); REST-unfriendly; an agent may accidentally omit `?dry-run` and apply
a broken edit. **Rejected.**

**Option Z (Union) — New `POST /api/dependency-graph/validate` route that accepts
 EITHER a `{ yaml: string }` body OR no body (in which case it re-validates the
 file currently on disk, returning the same result sync would).**
This gives the agent two modes: "check my proposed edit" (body) and "is the
current file valid?" (no body, useful after a manual edit). **Cost**: ~45 lines.
**Recommendation.**

### 2.5.4 Over-engineering audit

- Option X is clean but slightly less useful than Z.
- Option Y is dangerous (semantic overload).
- **Option Z** is the recommendation.

---

## 2.6 Issue I-3 — `bug-facts.ts` dual source of truth

### 2.6.1 Systemic risk

`bug-facts.ts` (~60 entries) and the YAML `nodes[].subsystem/oneLiner/...` are
two sources for the same data. The systemic risk of *deleting* `bug-facts.ts`
prematurely is **broken popovers** — `doc-reader.tsx` imports `BUG_FACTS` for its
hover popovers, and if the YAML isn't fully populated, those popovers go empty.
The risk of *not* deleting it is **silent drift** (the original disease).

### 2.6.2 Remediation strategy

**Three-step migration, each step independently shippable:**
1. **Populate**: ensure every node in the YAML has `subsystem`/`oneLiner`/`repairs`/`blockedBy`/`onCriticalPath`. Verify via a one-shot script that diffs `BUG_FACTS` keys against YAML node ids.
2. **Bridge**: make `bug-facts.ts`'s `BUG_FACTS` a *lazy read-through* — it tries the graph API first, falls back to the hardcoded entries. This proves the YAML is complete without removing the safety net.
3. **Delete**: once the bridge has run in dev for a session with zero fallback hits, delete `bug-facts.ts` and point the two call sites at the graph payload.

### 2.6.3 Tri-option analysis

**Option X — Delete `bug-facts.ts` now, force YAML population in the same PR.**
**Cost**: high risk — if even one node is missing a field, a popover breaks.
**Gap**: unverifiable without a full click-through of every node.

**Option Y — Keep `bug-facts.ts` forever, accept the drift.**
**Cost**: zero effort, infinite drift. **Rejected.**

**Option Z (Union) — The three-step bridge above.**
**Cost**: medium, spread over 3 PRs. **Recommendation.** The bridge step is the
key — it makes YAML-completeness *empirically verifiable* (zero fallback hits =
complete) rather than a guess.

### 2.6.4 Over-engineering audit

- Option X is reckless.
- Option Y abdicates.
- **Option Z** is the recommendation.

---

## 2.7 Issue I-8 — Rate-limit memory (deferred)

`api-utils.ts:17` in-memory map resets on restart. For the single-instance
sandbox this is acceptable and fixing it (Redis/Upstash) would violate the
"local memory caching, no additional middleware" stack constraint. **Deferred
indefinitely.** Documented here for completeness only.

---

## 2.8 Priority ordering for Doc 3

| Priority | Issue | Rationale |
|---|---|---|
| P0 | I-4 (event bus) + I-1/I-2 (contracts module) | Highest leverage, lowest risk, kills 3 issues with 1 file. Unblocks safe agent interaction. |
| P1 | I-7 (dry-run validate endpoint) | Zero risk (new route), removes agent blast-radius footgun. |
| P2 | I-5 (monolith split, Phase A+B only) | Phase A (stateless) is risk-free; Phase B (toolbar) is low-risk. Phase C deferred. |
| P3 | I-6 (schema-migration scaffold) | Defer population; scaffold the hook only. |
| P4 | I-3 (bug-facts bridge) | Multi-PR; start the bridge but don't delete yet. |
| — | I-8 | Deferred. |

---

*End of Document 1 (initial pass). Proceed to Document 2
(`03-document2-adversarial-dialectic.md`) for the dual-persona debate.*

---

## 2.9 Recheck amendment (added after Document 2)

Document 2's adversarial debate produced **two reversals** and **two
refinements** to this document's recommendations. Recorded here so the audit
chain is honest; Document 3 inherits the revised positions, not the originals.

### Reversals (Document 1 recommendation overridden by Document 2 Union verdict)

1. **§2.4 (I-6 schema migration) — REVERSED.** This document recommended
   "Option Z: scaffold the hook, don't populate it" (~50 lines of migrator
   scaffolding). Document 2 §Decision 4 Persona B argued an unused scaffold is
   dead code (YAGNI) and Persona A conceded. **Revised position: defer entirely.
   No code change. A 15-line comment block above `dependency-graph.ts:114`
   documents the migration pattern for the future implementer.** The codebase
   stays lean; the pattern survives as documentation.

2. **§2.6 (I-3 bug-facts) — REVERSED (runtime bridge removed).** This document
   recommended "Option Z: three-step bridge with a lazy read-through `Proxy`".
   Document 2 §Decision 6 Persona B Attack 1 identified that `bug-facts.ts` is
   imported by a client component (`doc-reader.tsx`), making a synchronous
   `fetchGraphFactsSync()` impossible in the browser; Attack 3 identified
   `Proxy` breaks `Object.keys()`. **Revised position: no runtime bridge. A
   one-shot dev script (`scripts/check-bug-facts-coverage.ts`) verifies YAML
   completeness offline; once it reports 0 missing, populate the 2 call sites
   from the graph payload and delete `bug-facts.ts` in one PR.** The
   "empirical signal" (§1.7 refinement #2) is the dev script's output, not a
   runtime counter.

### Refinements (Document 1 recommendation preserved but hardened)

3. **§2.3 (I-5 monolith split) — REFINED.** This document's "Option Z:
   incremental 3-phase" is preserved, but Document 2 §Decision 3 added two
   hardening constraints: (a) Phase C (`GraphCanvas` + `useGraphViewport`) ships
   behind a `NEXT_PUBLIC_GRAPH_SPLIT=v1` feature flag with `LegacyCanvas` as
   fallback, DOM-diffed in dev before flip; (b) the viewport hook takes
   `nodesRef` (a ref), not `nodes` (a closure), to prevent the stale-closure
   bug Persona B Attack 1 identified at `dependency-graph.tsx:2604`'s
   `[]`-deps wheel listener.

4. **§2.5 (I-7 validate endpoint) — REFINED.** This document's "Option Z: one
   route, body or no body" is **split into two verbs** per Document 2
   §Decision 5: `POST /api/dependency-graph/validate` (requires `{ yaml:
   string }` body, 256KB cap, 400 on bad JSON) and `GET
   /api/dependency-graph/validate` (re-validates on-disk file). Persona B
   Attack 3 showed the overloaded route's `source` field could be misread by an
   agent that reads `ok` first. No `source` field; the verb IS the source.

### Unchanged

- §2.1 (I-4 event bus) and §2.2 (contracts module) — Document 2 §Decision 1
  preserved the Option Z recommendation, hardening only the dispatch contract
  (boolean return, fail-fast path validation, eslint-ban on raw dispatch
  outside `contracts.ts`).
- §2.7 (I-8 rate-limit) — still deferred.

Document 3 will encode the **revised** positions, not the originals.

---

## 2.10 Recheck amendment (added after the §12 cross-cutting pass on Doc 4)

`04-document3 §12` is a fifth, *cross-cutting* recheck. Per the workflow
rule, its findings must propagate back through this document's issue
diagnosis. This section records how each of the 8 issues (§2.0 inventory) is
affected. **Document 3 inherits the §12-revised positions, not the §2.9
positions.** Where §12 refines an issue's remediation, the issue's severity
and Option-Z recommendation stand; where §12 reverses one, that is noted.

### Issue-by-issue propagation

| Issue | §2.x | §12 effect | Net position |
|---|---|---|---|
| I-1 paths | §2.2 | REFINED by §12.3 (env-var `DOCS_DIR` override) | Option Z stands; `getDocsDir()` reads env var first |
| I-2 filename schema | §2.2 | REFINED by §12.5 (schemaVersion validation + exact-case gate) + §12.7 (`validateRegistry`) | Option Z stands; `INDEX.yml` gains a top-level `DocRegistry` schema |
| I-3 bug-facts | §2.6 | **PARTIALLY REVERSED by §12.2** (T8c hard-gated on fetch-strategy) | §2.9 reversal (no runtime bridge) stands; T8c now gated |
| I-4 event bus | §2.1 | REFINED by §12.4 (boolean wire-or-drop) | Option Z stands; `dispatchDocEvent` boolean must be exercised or removed |
| I-5 monolith | §2.3 | REFINED by §12.6 (target-check popover fix + Playwright gate) | Option Z 3-phase stands; Phase C hardened |
| I-6 schema migration | §2.4 | META-REFINED by §12.5 (anti-pattern recurred in INDEX.yml) | §2.9 reversal (defer) stands; lesson now applied to the new schema too |
| I-7 validate endpoint | §2.5 | REFINED by §12.7 (`RegistryResult` shape) | §2.9 refinement (two verbs) stands; result shape unified with T3+T8a |
| I-8 rate-limit | §2.7 | unchanged | still deferred |

### 2.10.1 I-1 (paths) — remediation hardened (§12.3)

§2.2.2 listed `DOCS_DIR` resolution as "`path.resolve(process.cwd(),
"consolidated-docs")`". §12.3 found this only **moves** the failure from
import-time to first-call-time; the repo-root-as-cwd assumption persists.
**Revised remediation**: `getDocsDir()` reads `process.env.DOCS_DIR` first
(resolved absolutely), falling back to `process.cwd()/consolidated-docs`. One
env var makes the module portable across sandboxes/deploys without code
changes — the actual goal of the §2.0 "portability blocker" framing. The
Option-Z consolidation (one `contracts.ts` module) is unchanged; only the
resolution function body is sharpened.

### 2.10.2 I-2 (filename schema) — remediation hardened (§12.5 + §12.7)

§2.2.3 Option Z (`INDEX.yml` + auto-discover unlisted) is preserved. §12.5
found two gaps in the Option-Z parser as Doc 3 T3 specified it:

- **Dead `schemaVersion` field.** `INDEX.yml` declares `schemaVersion:
  "1.0.0"` but `loadDocRegistry()` never reads it — the precise "versioned
  field with zero enforcement" anti-pattern this document's own §2.4 (I-6)
  calls out. **Revised remediation**: add a top-level `DocRegistry` zod
  schema (`{ schemaVersion: z.literal("1.0.0"), docs: z.array(DocMeta) }`)
  in `contracts.ts`; `loadDocRegistry()` parses with it, falling back to
  `legacyScan()` + a warning on schemaVersion mismatch. This makes the field
  load-bearing and points a future editor at the T5 migration comment.
- **Case-sensitivity landmine.** §2.2.3's `existsSync` reference check (Doc 3
  T3.2 line 297) is case-insensitive on default macOS FS. A maintainer's
  `part-1-...` typo resolves locally, 404s in prod/CI. **Revised remediation**:
  after `existsSync`, compare each entry's `file` against
  `readdirSync(getDocsDir())` with exact-case `Set.has`; push a warning on
  mismatch (do not drop the entry — the warning is the signal).

§12.7 additionally unifies the result shape: `loadDocRegistry()` returns
`RegistryResult<DocMetaEntry>` from a shared `validateRegistry<T>()` helper,
identical in shape to T4's validate endpoint and T8a's coverage script. The
Option-Z "never-throw + warnings banner" contract is unchanged; its
*implementation* is deduplicated.

### 2.10.3 I-3 (bug-facts) — PARTIAL REVERSAL of §1.9's "unblocked" (§12.2)

This is the most important propagation. §2.6 Option Z (three-step bridge) was
**reversed in §2.9** to "no runtime bridge; dev-script + populate + delete".
§12.2 verified the §2.9 reversal's *data* premise (YAML fully populated —
true) but found its *runtime* premise false:

- Doc 3 T8b specifies `useGraphNode(id)` reading "the graph payload from
  useDocStore (the dialog already fetches it)". §12.2 verified the dialog
  fetches only `if (open)` (`dependency-graph.tsx:2327-2328`) into a
  **module-level** cache + dialog-local state — **not** a Zustand slice.
- The 3 popover call sites render `getBugFact(id)` **synchronously** on the
  main page (`markdown-renderer.tsx:266,315`, `backlinks-panel.tsx:179`,
  `command-palette.tsx:216`), independent of the dialog.

**Net effect on §2.6 / §2.9**: the "no runtime bridge" reversal **stands**
(sync-fetch is still impossible in the browser; the Proxy is still a footgun).
But "deletion unblocked today" (§1.9, inherited by §2.9) is **reversed for
the deletion step only**: T8c is now **hard-gated** on §12.2. Before T8c:

1. A `graphNodes: GraphNode[]` + `graphNodesStatus` slice must exist in
   `useDocStore`.
2. `doc-reader.tsx` must eager-fetch `/api/dependency-graph` on mount
   (Strategy A, preferred) OR `useGraphNode` must lazy-fetch on first call
   (Strategy B).
3. Cold-start verification must pass: fresh tab, dialog never opened, B7
   popover still renders (not the "no fact" fallback).

§2.6's "Option X — delete now, force YAML population" was already rejected as
reckless; §12.2 adds a *second* reason it was reckless (the runtime gap, not
just the data gap). §2.6's "verifiable by: does the popover show data for
every node?" (echoed in Doc 3 T8c line 716) is **defective** per §12.2: an
empty popover has two causes (T8a coverage gap OR fetch-timing), and T8c
considers only the first. The §12.2 cold-start protocol distinguishes them.

**§2.8 priority table update**: I-3 (P4) stays last, but its row note changes
from "Multi-PR; start the bridge but don't delete yet" to "Multi-PR; T8c
hard-gated on §12.2 fetch-strategy + cold-start verification".

### 2.10.4 I-4 (event bus) — remediation hardened (§12.4)

§2.1 Option Z (typed registry + `dispatchDocEvent` for the 3 cross-module
events) is preserved. §12.4 found the adopted boolean return value (Doc 2
Decision 1 Persona B's "caller can decide" rationale) is a **dead contract**:
no T2 call site reads it. **Revised remediation**: choose one —
- **Option A (preferred)**: wire at least one call site. `doc-store.ts`
  `syncDependencyGraph` success branch checks the boolean; on `false`
  (SSR or zod-rejected payload) sets `graphSyncStatus: "error"` instead of
  silently no-op'ing. This makes the boolean load-bearing.
- **Option B**: drop the boolean (`dispatchDocEvent(...): void`), update the
  comment to "logs + no-ops, never throws".

Do not leave the boolean return with zero consumers — that is the
"decorative contract" anti-pattern. The §2.1.4 over-engineering audit
("Option Z pays for itself only where drift actually bites") is sharpened:
the boolean must actually bite somewhere, or it should not exist.

### 2.10.5 I-5 (monolith) — remediation hardened (§12.6)

§2.3 Option Z (3-phase incremental, Phase C flagged) is preserved, including
the §2.9 refinements (feature flag + ref-not-closure). §12.6 found two gaps:

- **Popover-close race.** Doc 2 Decision 3 Attack 2 identified the
  opens-then-instantly-closes risk; the adopted fix (Doc 3 T6c line 600) is a
  `stopPropagation`'d synthetic event, which relies on capture-phase listener
  ordering across a component boundary — the same implicit coupling the split
  exists to kill. **Revised remediation**: replace `stopPropagation` with a
  `target.closest('[data-graph-node]')` guard in the orchestrator's
  click-outside handler (skip closing if the click landed on a graph node).
  This removes the ordering dependency entirely; the decision is made on the
  event target, not on which listener fired first. `GraphCanvas` stamps
  `data-graph-node={node.id}` on each node element.
- **No repeatable regression gate.** §2.3.3 Option Z's "each phase
  verifiable" claim is only as good as the verification, and Doc 3 T6c's
  verification is a one-time screenshot diff. Once `LegacyCanvas` is deleted,
  no test catches a future stale-closure regression in `useGraphViewport`.
  **Revised remediation**: add `e2e/graph-canvas.spec.ts` (Playwright
  snapshot + pan/zoom/click-interaction + sync-event-spy). Do not delete
  `LegacyCanvas` until this test is green on `v1`.

§2.3.4's over-engineering audit ("Option Z is incremental, each step pays
for itself") is sharpened: a phase is not "paid for" until it has a
repeatable gate, not a one-time diff.

### 2.10.6 I-6 (schema migration) — META-REFINED (§12.5)

§2.4 Option Z (scaffold the hook) was **reversed in §2.9** to "defer entirely,
comment-only". §12.5 does **not** re-reverse this — the defer verdict stands.
But §12.5 surfaces a **meta-finding**: the *exact anti-pattern §2.4
identifies* ("a versioned field with zero enforcement") recurred in the
`INDEX.yml` registry that §2.2 (I-2) introduces as a fix. `INDEX.yml`
declares `schemaVersion: "1.0.0"` but the parser never validates it.

**Net effect on §2.4 / §2.9**: the defer verdict stands for the *graph*
schema. The *lesson* of §2.4 ("don't ship a versioned field without
enforcement") is now also applied to the *doc-registry* schema (§2.10.2
above). This document's own §2.4.4 over-engineering audit ("Option Z is the
recommendation") was correct for the graph schema; the same audit should
have been run on the INDEX.yml schema when §2.2 introduced it. §12.5 runs it
retroactively and finds the field must be validated, not just declared.

### 2.10.7 I-7 (validate endpoint) — remediation hardened (§12.7)

§2.5 Option Z (one route, body or no body) was **refined in §2.9** to "two
verbs" (POST body / GET disk). §12.7 preserves the two-verb split and
unifies the *result shape*: the endpoint returns `RegistryResult`-shaped JSON
(`{ ok, entries, warnings }`) on both success and failure, instead of the
bespoke `{ ok, nodeCount, edgeCount, schemaVersion }` / `{ ok: false, issues
}` pair. `entries.length` and `parsed.schemaVersion` are derivable by the
caller; the unified shape means an agent reasoning about validation results
learns **one** contract for T3 + T4 + T8a, not three.

§2.5.4's over-engineering audit ("Option Z is the recommendation") is
sharpened: the two-verb split removed the `source`-misread footgun (Doc 2
Decision 5 Attack 3); the shape unification removes the "three near-identical
result contracts" footgun that the sequential debate couldn't surface
because it is cross-cutting across decisions 2, 5, and 6.

### 2.10.8 Priority ordering (§2.8) — minor update

The §2.8 priority table's row for I-3 (P4) changes its rationale note (per
§2.10.3). No priority *rank* changes — I-3 remains P4 (last) because T8 is
still multi-PR and strictly-last. But the note "start the bridge but don't
delete yet" is replaced with "T8c hard-gated on §12.2 fetch-strategy +
cold-start verification; T8b is no longer mechanical repoint". This is a
note change, not a priority change.

### What §12 did NOT change in this document

- The 8-issue inventory (§2.0) — no issue added or removed.
- The multi-issue consolidation I-1+I-2+I-4 → one `contracts.ts` (§2.0) —
  stands; §12.7 *adds* `validateRegistry<T>()` to that same file (a fourth
  export), extending the consolidation rather than replacing it.
- All 6 Option-Z recommendations — stand, with hardened remediations.
- The §2.9 reversals (I-6 defer, I-3 no runtime bridge) — both stand; §12.2
  adds a gate *on top of* the I-3 reversal, it does not re-reverse it.
- §2.7 (I-8 deferred) — unchanged.

### Self-recheck (internal consistency after this amendment)

After writing §2.10, I re-read §2.1–§2.8 for contradictions introduced by the
§12 propagations. **No contradictions found.** Specifically:

- §2.2.2's `DOCS_DIR` line ("`path.resolve(process.cwd(), ...)`") is
  *narrower* than §2.10.1's env-var form, but §2.10.1 explicitly says "the
  Option-Z consolidation is unchanged; only the resolution function body is
  sharpened" — this is a refinement, not a contradiction. A future reader
  sees §2.2.2 as the original and §2.10.1 as the authoritative update.
- §2.6.3 Option Z's "three-step bridge" was already reversed by §2.9; §2.10.3
  does not re-introduce it. The §2.6.3 text is retained for audit-chain
  honesty; §2.9 and §2.10.3 are the authoritative positions.
- §2.4.3 Option Z's "scaffold the hook" was already reversed by §2.9; §2.10.6
  does not re-introduce it.
- §2.8's priority *ranks* are unchanged; only the I-3 row note is updated.

The §2.10 amendments are consistent with §2.1–§2.8 and supersede them only
where explicitly stated (§2.10.3's reversal of "deletion unblocked",
§2.10.1/§2.10.2/§2.10.4/§2.10.5/§2.10.6/§2.10.7's hardenings). Document 3
inherits the §2.10 positions.

---

*End of Document 1 (with §2.10 cross-cutting recheck). Proceed to Document 2
(`03-document2-adversarial-dialectic.md`), which carries its own recheck
propagating these same §12 findings through the 6 decisions.*
