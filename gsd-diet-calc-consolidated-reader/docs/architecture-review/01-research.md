# Phase 1 — Context Gathering & Research

> **Role**: Staff Backend Architect / Read-Only Planning Agent.
> **Scope**: Audit the *current* state of the GSD doc-reader codebase (Next.js 16
> App Router) and design a hyper-modular, backward-compatible, AI-agent-friendly
> architecture for a **solo maintainer**.
> **Method**: READ-ONLY. Every claim is grounded in an exact `file:line` citation.
> No speculative assumptions; no fabricated sources.

---

## 1.1 Web-Research Directives (methodology grounding)

The workflow brief asks for SOTA research (May–July 2026) on adversarial
planning, AI self-critique, and execution-error prevention. **Honesty
constraint**: this agent cannot verify live 2026 publication dates from inside
the sandbox, so rather than fabricate citations it grounds the methodology in
**established, durable practices** that are independently reproducible:

| Practice | Why it prevents AI execution errors | Applied in this review |
|---|---|---|
| **Schema-as-contract** (zod / JSON Schema) | The schema is the single source of truth an agent validates against *before* writing code; a mismatch is a hard 422, not a silent drift. | Already in `dependency-graph.ts`; extended in Doc 3 to cover the event bus + file registry. |
| **Fail-closed caches** | A bad edit degrades to "stale until fixed", never "broken for everyone". The agent's blast radius is bounded. | `dependency-graph.ts:495` `reparseDependencyGraphNow()` leaves cache intact on throw. |
| **A2A machine-readable plans** | Downstream agents execute zero-ambiguity steps with exact `file:line` ranges + type signatures; no prose interpretation. | Doc 3 is pure A2A. |
| **Tri-option dialectic (X / Y / Union)** | Forces the planner to consider the adversarial case before committing; eliminates "first idea wins" bias. | Doc 2 structure. |
| **Referential-integrity post-pass** | Schemas can't express cross-field rules; a second pass catches what zod can't. | `dependency-graph.ts:203` `checkReferentialIntegrity()`. |
| **Read-only planning before write** | Separating "what should change" from "change it" prevents the agent from editing code while still understanding it. | This entire session. |

**Protocol definition** (transforms monolithic workflows into extensible,
backward-compatible interface contracts):

1. **Never break the export signature.** A rewrite swaps the *implementation*
   behind an existing export; callers stay untouched. (Already proven by
   `parseDependencyGraph = getDependencyGraph` alias at `dependency-graph.ts:487`.)
2. **Version every contract.** `schemaVersion` is a literal today; every
   machine-readable interface gets the same treatment so an agent can detect
   "I'm targeting v1.0, the file is v1.1" and refuse rather than misread.
3. **Registry over scatter.** String literals that appear in >1 file
   (event names, file paths, ID prefixes) belong in one typed registry that both
   the producer and consumer import. Drift becomes a compile error.
4. **One file, one responsibility, <400 lines.** The 4005-line
   `dependency-graph.tsx` dialog violates this; an agent editing line 3304 cannot
   safely reason about side effects at line 1402.

---

## 1.2 Codebase Audit — hardcoded logic & tight coupling

The codebase is a **single-route** Next.js app (`src/app/page.tsx`: 10 lines,
renders `<DocReader />`) that reads 10 hand-authored `.md` files from
`/home/z/my-project/consolidated-docs/` (verified: `ls consolidated-docs/*.md |
wc -l` = 10) and renders them as an interactive documentation reader with a
schema-driven dependency graph.

### 1.2.1 Hardcoded absolute paths (portability blocker)

| File:Line | Hardcode | Impact |
|---|---|---|
| `src/lib/docs-parser.ts:5` | `const DOCS_DIR = "/home/z/my-project/consolidated-docs"` | Breaks on any machine where the repo isn't at `/home/z/my-project`. An AI agent running in a different sandbox path gets `ENOENT`. |
| `src/lib/dependency-graph.ts:31` | `const BUG_MAP_PATH = "/home/z/my-project/consolidated-docs/BUG-DEPENDENCY-MAP.md"` | Same problem; also couples the graph parser to one specific file rather than "the doc whose `type === 'map'`". |

**Root cause**: both modules reach for an absolute path instead of resolving
relative to `process.cwd()` or a single configured `DOCS_DIR` constant shared
from one place.

### 1.2.2 Hardcoded file-classification heuristics (data drift blocker)

`src/lib/docs-parser.ts:64-85` — two functions, `inferDocType` (lines 64-68) and
`inferOrder` (lines 71-85), classify every `.md` file by filename prefix and
substring:

```ts
// docs-parser.ts:64-68
function inferDocType(fileName: string): DocType {
  if (fileName.startsWith("PART-")) return "part";
  if (fileName.startsWith("APPENDIX-")) return "appendix";
  if (fileName.startsWith("BUG-")) return "map";
  return "appendix";          // ← silent default: unknown files become "appendix"
}

// docs-parser.ts:71-85
function inferOrder(fileName: string): number {
  if (fileName.startsWith("PART-1")) return 1;
  if (fileName.startsWith("PART-2")) return 2;
  if (fileName.startsWith("PART-3")) return 3;
  if (fileName.startsWith("PART-4")) return 4;
  if (fileName.startsWith("BUG-")) return 5;
  const name = fileName.toLowerCase();
  if (name.includes("id-key")) return 6;        // ← substring, not prefix
  if (name.includes("verification")) return 7;
  if (name.includes("public-health")) return 8;
  if (name.includes("safety-process")) return 9;
  if (name.includes("glossary")) return 10;
  return 99;                   // ← silent default: unknown files sort last
}
```

A new doc named `ROADMAP.md` is **silently misclassified** as `type: "appendix"`
with `order: 99` — it renders, but in the wrong section of the sidebar, after
every real appendix. A renamed `PART-1-Diagnosis.md` → `DIAGNOSIS.md` loses its
`part` type AND its order (falls to 99). The substring matchers are also
fragile: `GLOSSARY-v2.md` matches `name.includes("glossary")` (order 10) but
`definitions.md` does not (order 99). **The filename is the schema** — there is
no front-matter or registry that declares a file's type/order. An AI agent
adding an 11th doc must reverse-engineer this convention AND avoid accidental
substring collisions with the 5 appendix matchers.

### 1.2.3 Stale duplicate: `bug-facts.ts` is already superseded (deletion unblocked)

The design doc (`upload/DEPENDENCY-GRAPH-SCHEMA-DESIGN.md` §5 & §6 step 6)
explicitly says:

> `bug-facts.ts`'s `BUG_FACTS` gets the same treatment: fold its fields
> (`subsystem`, `oneLiner`, `repairs`, `blockedBy`, `onCriticalPath`) directly
> into `nodes[]` ... and delete the file.

**Reality (verified)**: the YAML source block in `BUG-DEPENDENCY-MAP.md §D-DATA`
IS fully populated — all 36 nodes carry `subsystem`, `oneLiner`, `repairs`,
`blockedBy`, and `onCriticalPath` (verified: `rg -c '^\s+subsystem:'` on the
extracted YAML block = 36, matching the 36 node entries; same for `oneLiner`
and `onCriticalPath`). The schema includes these fields
(`dependency-graph.ts:99-103`), and `computeLayout` propagates them into the
graph payload (`dependency-graph.ts:415-419`). So `GET /api/dependency-graph`
already serves this data.

**Yet `bug-facts.ts` (115 lines, 60 entries) still exists as a hand-curated
duplicate** (`bug-facts.ts:18` `A2: { subsystem: "LP solver", ... }`). Its
actual consumers (verified by `rg 'bug-facts|BUG_FACTS' src/`):
- `markdown-renderer.tsx:24` imports `getBugFact` → used at `:266` and `:315`
  for ID-link hover popovers (reads `fact.subsystem` at `:274`, `fact.oneLiner`
  at `:284`).
- `backlinks-panel.tsx:8` imports `BUG_FACTS` → used at `:179` for short human
  titles.
- `command-palette.tsx:13` imports `getBugFact`.

**`doc-reader.tsx` does NOT import `bug-facts` at all** (`rg 'BUG_FACTS|bug-facts'
doc-reader.tsx` = 0 matches). The prior draft's claim that bug-facts.ts is "the
*de facto* source for the doc-reader popovers" was wrong — the popovers live in
`markdown-renderer.tsx`, not `doc-reader.tsx`.

**Drift risk**: two sources of truth, both fully populated, neither referencing
the other. A maintainer who edits the YAML's `oneLiner` for B7 but not
`bug-facts.ts` (or vice-versa) ships a silent inconsistency — and since both are
complete, there is no "which one wins" fallback; whichever the consumer imports
wins, per-consumer. This is the *exact* failure mode the schema project was
meant to eliminate (`DEPENDENCY-GRAPH-SCHEMA-DESIGN.md` §0).

**Corrected severity — HIGHER than the prior draft stated.** The prior draft
called this "unfinished migration" (implying data-population work remains). In
fact the data work is DONE — only the deletion + 3 call-site repoints remain.
The task is unblocked today, not pending YAML population.

### 1.2.4 Untyped, growing CustomEvent bus (the "event #6" smell)

The design doc (`DEPENDENCY-GRAPH-SCHEMA-DESIGN.md` §5) casually says:

> add `graph:synced` as event #6 in the §8 table, consumed by
> `DependencyGraphDialog` ... no new listener pattern, just one more entry in a
> table that already exists.

But there is **no typed registry**. The "table" is prose in a design doc. The
actual event literals are scattered as raw strings — exactly 7 distinct names
(verified: `rg -o 'CustomEvent\("[^"]+"' src/ | sort -u | wc -l` = 7):

| Event literal | Dispatched at | Listened at |
|---|---|---|
| `doc:jump` | `doc-store.ts:66` | `doc-reader.tsx:669` |
| `doc:jumpto` | `doc-store.ts:78` | `doc-reader.tsx:684` |
| `doc:jumpto-occurrence` | `doc-store.ts:95` | `doc-reader.tsx:823` |
| `graph:synced` | `doc-store.ts:321` | `dependency-graph.tsx:2323` |
| `graph:open-at-node` | `markdown-renderer.tsx:378` | `doc-reader.tsx:954` |
| `annotation-clicked` | `annotations.tsx:1671` | `annotations.tsx:1834` |
| `annotations-updated` | `annotation-highlights.ts:194` | `annotations.tsx:208,1043` |

A typo on either side (`"graph:synced"` vs `"graph:sync "` ) is a **silent
runtime no-op** — no compile error, no test failure, the feature just stops
working. An AI agent refactoring one side has no type-level guarantee the other
side matches. This is the highest-leverage modularity fix available.

### 1.2.5 Monolith: `dependency-graph.tsx` (4005 lines)

`src/components/docs/dependency-graph.tsx` (verified: `wc -l` = 4005) contains
the SVG canvas, the pan/zoom
controller, the node renderer, the edge renderer, the lane renderer, the toolbar,
the sync button, the search, the legend, the detail popover, AND the event
listener wiring — all in one file. Specific citations:

- `:1402-1403` pointermove/pointerup pan handler
- `:2036` media-query listener
- `:2259-2290` sync button state subscription
- `:2313-2324` `graph:synced` listener
- `:2604` wheel-zoom handler
- `:2963-2965` global click/keydown/scroll listeners
- `:3105` keydown handler
- `:3304-3343` the "Sync graph from source" button JSX

A solo maintainer cannot safely touch line 3304 without re-reading 3000+ lines
of context. An AI agent has the same problem, worse (no semantic memory of the
file). **This is the scalability bottleneck**, not the data.

### 1.2.6 No schema-migration path

`src/lib/dependency-graph.ts:114`:

```ts
schemaVersion: z.literal("1.0.0"),
```

A YAML block declaring `schemaVersion: "1.1.0"` hard-fails zod with no migration
hook. The design doc (`DEPENDENCY-GRAPH-SCHEMA-DESIGN.md` §2) versions the
schema "so the parser can reject or migrate old blocks instead of silently
misreading them" — but the *migrate* half is unimplemented. Today it only
*rejects*. An AI agent that legitimately needs to evolve the schema (add a
`priority` lane kind, say) has no path that doesn't break every existing block.

### 1.2.7 Rate-limit memory is unbounded across restarts (minor)

`src/lib/api-utils.ts:17` `const buckets = new Map<string, Bucket>()` — in-memory
only, reset on every server restart. The eviction interval (`:58-67`) caps
growth *within* a process but not across deploys. For a single-instance sandbox
this is acceptable; flagged for completeness, **not** a Doc-3 target.

---

## 1.3 AI-Agent Integration Points (where agents touch the app)

| Surface | Current state | Agent-friendliness gap |
|---|---|---|
| **YAML schema block** in `BUG-DEPENDENCY-MAP.md §D-DATA` | zod-validated, fail-closed 422 with `issues[]` | ✅ Good. The 422 body is machine-readable. |
| **`POST /api/dependency-graph/sync`** | Re-parses + replaces cache synchronously | ⚠️ No **dry-run** mode. An agent cannot validate a proposed edit *without* applying it (and potentially clobbering a good cache if the agent mis-edits). |
| **`GET /api/dependency-graph/sync`** | Status probe (cachedAt) | ✅ Good. |
| **`GET /api/docs`** / **`GET /api/docs?slug=`** | List + single | ⚠️ No `If-None-Match`/ETag; an agent polling for changes re-downloads the full payload. |
| **Event bus** (`graph:synced` etc.) | Untyped strings | ❌ An agent reasoning about "what events can I dispatch?" must grep. No introspection. |
| **File registry** | `startsWith("PART-")` heuristics | ❌ An agent adding a doc cannot declare its type/order declaratively. |
| **`bug-facts.ts`** | Hand-curated mirror | ❌ An agent updating a bug fact must edit *two* places (YAML + TS) with no compile-time link. |

---

## 1.4 Protocol Definition — the "extensible interface contract" pattern

To transform the monolith into modular, backward-compatible contracts *without*
over-engineering (solo-maintainer rule), this review adopts **three contract
layers**, each versioned, each swappable behind its existing export:

```
Layer 1 — DATA CONTRACTS (versioned schemas)
  • GraphSource v1.0.0   (exists: dependency-graph.ts:113-118)
  • DocRegistry v1.0.0   (NEW: replaces startsWith() heuristics)
  • EventBus v1.0.0      (NEW: typed registry of CustomEvent names + payloads)

Layer 2 — SERVICE CONTRACTS (pure functions, no UI)
  • getDependencyGraph() / reparseDependencyGraphNow()  (exist)
  • validateGraphSource(yaml): DryRunResult              (NEW: split from reparse)
  • getDocRegistry()                                     (NEW)

Layer 3 — UI CONTRACTS (components, <400 lines each)
  • DependencyGraphDialog (orchestrator only)
  • GraphCanvas / GraphToolbar / GraphNodeDetail / GraphLegend  (split from monolith)
```

**Backward-compatibility lock**: every Layer-2 export keeps its current name +
signature. `parseDependencyGraph` stays as an alias (`dependency-graph.ts:487`
already does this). `bug-facts.ts` keeps exporting `BUG_FACTS` until its 3
consumers (`markdown-renderer.tsx`, `backlinks-panel.tsx`, `command-palette.tsx`)
are repointed to the graph payload, then is deleted in a final step — not before.
(The YAML is already fully populated per §1.2.3, so no data-population step
gates the deletion.)

**AI-agent loop lockdown**: an agent edits YAML → calls `validateGraphSource`
(dry-run) → on success calls the sync endpoint → on 422 reads `issues[]` and
re-edits. The dry-run removes the "agent clobbers a good cache" footgun.

---

## 1.5 Baseline metrics (for Doc 3 verification)

| Metric | Current | Target |
|---|---|---|
| Absolute hardcoded paths | 2 (`docs-parser.ts:5`, `dependency-graph.ts:31`) | 0 (resolve via `process.cwd()`) |
| Untyped event literals | 7 scattered (exactly — verified) | 0 (one typed registry) |
| `bug-facts.ts` entries | 60 (verified: `rg -c` = 60) | 0 (repoint 3 consumers to graph payload, delete file) |
| `dependency-graph.tsx` lines | 4005 (verified: `wc -l` = 4005) | <400 (orchestrator) + 5-6 child components |
| Schema-migration hooks | 0 (literal `1.0.0`) | 1 (versioned migrator) |
| Dry-run validation endpoint | 0 | 1 (`POST /api/dependency-graph/validate`) |
| Lint errors | 0 (verified prior session) | 0 (preserved) |

---

## 1.6 What this review deliberately does NOT do

- **No new framework.** Stays on Next.js 16 / Zustand / zod. No event-bus
  library, no state-machine lib. The registry is a plain `as const` object.
- **No auth layer.** The app has none today (`DEPENDENCY-GRAPH-SCHEMA-DESIGN.md`
  §7); adding one is out of scope for a read-only doc reader.
- **No database.** Prisma is available but the app is file-backed by design
  (`APP-OVERVIEW.md:58` "No server-side writes anywhere. No database writes
  (Prisma is wired but unused)." — text is under a `**Outputs:**` bullet, NOT
  under a §1.2.4 heading which does not exist). The graph cache is in-memory;
  that stays.
- **No rewrite of the docs-parser.** Its 60s TTL cache (`docs-parser.ts:320`
  `PARSED_TTL_MS = 60_000`, eviction at `:335-338`) + section extraction is
  working; only the hardcoded `DOCS_DIR` and `startsWith` heuristics change.

---

*End of Phase 1 (initial pass). Proceed to Document 1
(`02-document1-systemic-review.md`) for the tri-option diagnosis.*

---

## 1.7 Recheck amendment (added after Document 1)

Document 1 surfaced two refinements this research doc's initial pass under-
specified. Recorded here so the audit chain stays honest:

1. **Dry-run endpoint — no-body variant** (refines §1.3). Document 1 §2.5
   Option Z proposes `POST /api/dependency-graph/validate` accepting either a
   `{ yaml }` body OR no body (re-validates the on-disk file). The initial §1.3
   table only listed "no dry-run mode" as the gap; the no-body re-validate mode
   is a distinct agent affordance (useful after a *manual* edit to confirm the
   file is still valid before clicking sync). No change to §1.3's verdict; this
   just enriches the contract.

2. **`bug-facts.ts` migration — empirical completeness signal** (refines §1.2.3).
   Document 1 §2.6 introduces a "bridge" step where `BUG_FACTS` becomes a lazy
   read-through (graph API first, hardcoded fallback). The *fallback-hit count*
   is the empirical signal that the YAML is complete — zero hits over a dev
   session = safe to delete. The initial §1.2.3 framed this only as "two sources
   of truth"; the bridge makes completeness *measurable*, which is the
   methodology addition. No change to §1.2.3's verdict.

   **[§1.9 supersession notice]**: This refinement was premised on the §1.2.3
   claim that the YAML was "not yet populated". The §1.9 re-audit verified the
   YAML is in fact fully populated (36/36 nodes). The bridge is therefore moot —
   there is nothing to measure because the data is already complete. This
   refinement is retained for audit-chain honesty but is operationally
   superseded; the §1.8 refinement (offline dev script) is also superseded
   because there is nothing for the script to verify.

3. **Contracts module consolidation** (refines §1.4). §1.4 listed "DocRegistry
   v1.0.0" and "EventBus v1.0.0" as separate Layer-1 contracts. Document 1 §2.2
   consolidates `DOCS_DIR` + `DocMeta` + `EVT` into one file
   (`src/lib/contracts.ts`). This is compatible with §1.4 (one file can export
   multiple contracts) and is the lower-cognitive-overhead choice for a solo
   maintainer. §1.4's Layer model stands; the file granularity is an
   implementation detail resolved in Doc 1.

No gaps found that change Document 1's recommendations. The recheck confirms
Document 1 is consistent with this research doc.

---

## 1.8 Recheck amendment (added after Document 2)

Document 2's adversarial debate reversed two of Document 1's recommendations
(recorded in Document 1 §2.9). For the research record, the net effect on this
document's findings:

- **§1.2.6 (no schema-migration path)** — still a valid *finding*, but the
  *remediation* is downgraded from "scaffold a migrator" to "document the
  pattern in a comment, defer code until a v1.1.0 is actually needed". The
  finding stands; the fix shrinks. This is consistent with the solo-maintainer
  principle (no dead code).
- **§1.2.3 (bug-facts dual source)** — still a valid *finding*, but the
  *remediation* loses its runtime bridge. Verification moves to an offline dev
  script. The §1.7 refinement #2 ("empirical completeness signal") is preserved
  — the signal just comes from a script, not a runtime counter.
- **§1.3 (AI-agent integration table)** — the dry-run row is refined: two verbs
  (`POST` body / `GET` disk-revalidate) instead of one overloaded route. The
  table's verdict ("⚠️ No dry-run mode") is still accurate today; Document 3
  adds both verbs.

No other findings in this research doc were invalidated by Document 2. The
baseline metrics in §1.5 are unchanged (the targets still hold; the paths to
them are now specified in Document 3).

---

## 1.9 Critical re-audit correction (added after line-by-line verification)

A line-by-line re-verification of every citation in this document against the
live codebase surfaced **4 factual errors** and **4 imprecisions** in the
initial pass. All have been corrected in-place above; this section records them
for audit-chain honesty so future readers can see what changed and why.

### Errors corrected

1. **§1.2.3 was INVERTED (critical).** The initial pass claimed the YAML "is
   not yet populated with these fields for every node, so `bug-facts.ts` remains
   the *de facto* source for the doc-reader popovers." Both clauses were false:
   - The YAML **is** fully populated — all 36 nodes carry `subsystem`,
     `oneLiner`, `repairs`, `blockedBy`, `onCriticalPath` (verified:
     `rg -c '^\s+subsystem:'` on the extracted §D-DATA block = 36).
   - `doc-reader.tsx` does **not** import `BUG_FACTS` (`rg 'BUG_FACTS|bug-facts'
     doc-reader.tsx` = 0 matches). The actual consumers are
     `markdown-renderer.tsx:24,266,315`, `backlinks-panel.tsx:8,179`,
     `command-palette.tsx:13`.
   The corrected §1.2.3 reframes the finding: `bug-facts.ts` is **already-dead
   duplicate code**, not an unfinished migration. The deletion task is
   unblocked today (no YAML population needed). This makes the finding
   *stronger*, not weaker. **Downstream impact**: Document 3 task T8a (coverage
   dev script) is now a no-op — the YAML is already complete; T8 can proceed
   directly to T8b (repoint) + T8c (delete).

2. **§1.2.4 table fabricated a listener site.** The `graph:open-at-node` row
   claimed it was "Listened at: `doc-reader.tsx:954`, `dependency-graph.tsx`".
   `rg -n 'graph:open-at-node' dependency-graph.tsx` returns 0 matches — there
   is no listener in that file. Corrected to the single real site
   (`doc-reader.tsx:954`). The `annotations-updated` dispatch site was also
   vague ("(annotations module)") — corrected to the precise
   `annotation-highlights.ts:194`.

3. **§1.2.5 stale line count.** The initial pass said "3661+ lines" (carried
   over from an earlier session's count). `wc -l dependency-graph.tsx` = **4005**.
   The file is 344 lines *bigger* than claimed. Corrected in §1.1, §1.2.5, and
   §1.5. The understatement weakens the doc's own argument ("this file is too
   big"), so the correction strengthens it.

4. **§1.6 fabricated a section number.** Cited `APP-OVERVIEW.md §1.2.4` for
   "no server-side writes". `rg '1\.2\.4' APP-OVERVIEW.md` = 0 matches — there
   is no §1.2.4. The text exists at `APP-OVERVIEW.md:58` under a
   `**Outputs:**` bullet. Corrected to the line citation.

### Imprecisions tightened

5. **§1.2.2 line range + snippet.** Initial: "`docs-parser.ts:65-75`" with a
   truncated snippet. Actual: `inferDocType` at lines 64-68, `inferOrder` at
   71-85. The snippet omitted `BUG-` → `"map"` (line 67) and the entire
   appendix substring-matching block (lines 76-84: `name.includes("id-key")`
   etc). The fallback (returns `"appendix"` / `99`) was not shown. Corrected:
   full snippet, exact line range, explicit fallback behaviour, and the
   substring-collision risk (`GLOSSARY-v2.md` matches, `definitions.md`
   doesn't).

6. **§1.2.4 / §1.5 "7+ scattered".** Exact count is **7** (verified:
   `rg -o 'CustomEvent\("[^"]+"' src/ | sort -u | wc -l` = 7). "7+" overstated;
   corrected to "7 scattered".

7. **§1.5 "~60 entries".** Exact count is **60** (verified:
   `rg -c '^\s+[A-Z][0-9]+[a-z]?:\s*\{' bug-facts.ts` = 60). Corrected.

8. **§1.1 / §1.2 "page.tsx: 11 lines".** `wc -l page.tsx` = **10**.
   Corrected.

### Methodology lesson

The §1.2.3 inversion is the most damaging: it was a **plausible-sounding claim
that was never verified against the file**. The initial pass trusted the prior
session's summary (which said the migration was "unfinished") instead of
reading the YAML. The lesson for downstream documents (2, 3, 4): every
load-bearing factual claim about file state must be re-verified with a `rg` /
`wc` / `sed` command, not inherited from prose. Documents 2-4 inherit the
**corrected** §1.2.3 (deletion unblocked, no bridge needed) via the §1.8
amendment, which itself is now annotated as superseded by this section.

---

## 1.10 Recheck amendment (added after the §12 cross-cutting pass on Doc 4)

`04-document3 §12` is a fifth, *cross-cutting* recheck that spans task
boundaries the four sequential documents structurally cannot. Six of its
findings connect back to claims in this research doc. Recorded here so the
audit chain stays honest; **Doc 3 inherits the §12-revised positions, not the
originals**. Where §12 refines a finding, the finding stands; where §12
reverses one, that is noted explicitly.

### Findings refined (finding stands, remediation hardened)

1. **§1.2.1 (hardcoded paths) — REFINED by §12.3.** This section's root cause
   said the fix is "resolving relative to `process.cwd()` or a single
   configured `DOCS_DIR` constant" (line 63). Doc 3 T1 adopted only the
   `process.cwd()` half — moving the failure from import-time to first-call-time
   but **not removing** the repo-root-as-cwd assumption. §12.3 mandates an
   `process.env.DOCS_DIR` override *before* the `process.cwd()` fallback, which
   is the full portability fix the §1.2.1 framing implied but did not require.
   **§1.5 baseline-metric target upgraded**: from "0 (resolve via
   `process.cwd()`)" to "0 (resolve via `DOCS_DIR` env var OR `process.cwd()`
   fallback)". The finding stands; the target is sharper.

2. **§1.2.4 (untyped event bus) — REFINED by §12.4.** This section's verdict
   ("highest-leverage modularity fix") is preserved. §12.4 found that the
   adopted `dispatchDocEvent` boolean return (Doc 2 Decision 1 Persona B's
   "caller can decide" rationale) is a **dead contract** — no T2 call site
   reads the return value. The typed-registry fix is necessary but not
   sufficient: the boolean must be wired (Option A: surface a toast on
   `graph:synced` dispatch failure) or dropped (Option B: `void` return). The
   finding stands; the contract is sharpened.

3. **§1.2.5 (monolith) — REFINED by §12.6.** This section's line-level
   citations (pan handler, sync button, `graph:synced` listener, wheel-zoom,
   global listeners) are all preserved. §12.6 found two gaps in the Doc 3
   split plan that this section's audit did not surface: (a) the popover-close
   race (Doc 2 Decision 3 Attack 2) is "fixed" with a `stopPropagation`'d
   synthetic event that relies on capture-phase listener ordering across a
   component boundary — the same implicit coupling the split exists to kill;
   a `target.closest('[data-graph-node]')` guard in the click-outside handler
   removes the ordering dependency entirely; (b) the verification is a
   one-time screenshot diff with **no repeatable CI gate**, so once
   `LegacyCanvas` is deleted a future stale-closure regression in
   `useGraphViewport` goes undetected. §12.6 mandates a Playwright
   snapshot+interaction test (`e2e/graph-canvas.spec.ts`). The finding stands;
   the split plan is hardened.

4. **§1.2.6 (no schema-migration path) — META-REFINED by §12.5.** This
   section's finding ("a `1.1.0` block hard-fails with no migration hook") is
   preserved, and Doc 2 Decision 4's "defer, comment-only" verdict stands.
   §12.5 surfaces a **meta-finding**: the *exact anti-pattern this section
   calls out* — a versioned field with zero enforcement — recurred in the
   `INDEX.yml` registry that Doc 3 T3 introduces as the *fix* for §1.2.2.
   `INDEX.yml` declares `schemaVersion: "1.0.0"` but `loadDocRegistry()`
   never reads or validates it. The lesson of §1.2.6 was applied to the graph
   schema (correctly deferred) but not to the new doc-registry schema. §12.5
   mandates a top-level `DocRegistry` zod schema with `schemaVersion:
   z.literal("1.0.0")` so the field is load-bearing. The finding stands; its
   lesson is now applied consistently.

5. **§1.4 (protocol / Layer model) — REFINED by §12.7.** The three Layer-1
   data contracts (`GraphSource`, `DocRegistry`, `EventBus`) stand. §12.7
   found that the *validation result shape* for declarative registries is
   written three slightly-different ways across T3 (`{entries,warnings}`),
   T8a (stdout+exit-code), and T4 (`{ok,nodeCount,edgeCount}`/`{ok:false,
   issues}`). A shared `validateRegistry<T>()` helper in `contracts.ts` —
   returning `RegistryResult<T> = {entries, warnings, ok}` — unifies all
   three. The Layer model is unchanged; one helper is added to it. This
   directly serves §1.4's stated goal ("registry over scatter") at the
   *result-contract* level, not just the *name* level.

### Finding partially reversed

6. **§1.2.3 + §1.9 (bug-facts "deletion unblocked") — PARTIALLY REVERSED by
   §12.2.** §1.9 corrected the initial pass: the YAML *is* fully populated
   (36/36 nodes), so "the data work is DONE — only the deletion + 3 call-site
   repoints remain" and "the task is unblocked today". §12.2 verified the
   data claim (still true) but found a **runtime precondition §1.9 did not
   check**: the graph payload is fetched only `if (open)` into a
   **module-level** cache + dialog-local state (`dependency-graph.tsx:2293-
   2311,2327-2328`), **not** into any Zustand slice. The 3 popover call sites
   (`markdown-renderer.tsx:266,315`, `backlinks-panel.tsx:179`,
   `command-palette.tsx:216`) read `getBugFact(id)` **synchronously during
   render** on the main page, independent of the dialog. So if Doc 3 T8b
   repoints them to a `useGraphNode(id)` store selector "populated by the
   dialog's fetch" (Doc 3 T8b's own premise), every popover renders **empty
   on a cold page load** — the exact "broken popover" failure mode Doc 2
   Decision 6 was written to prevent, via the fetch-timing door instead of
   the dual-source-of-truth door.

   **Net effect on §1.9**: the *data* claim ("YAML fully populated,
   deletion unblocked") is preserved. The *operational* claim ("the task is
   unblocked today, only deletion + repoints remain") is **reversed**: T8c
   (delete `bug-facts.ts`) is now **hard-gated** on §12.2 — a
   `graphNodes`/`graphNodesStatus` store slice + a mount-time fetch in
   `doc-reader.tsx` must exist and be cold-start-verified (fresh tab, dialog
   never opened, B7 popover still renders) before deletion. §1.9's
   "downstream impact: T8a is a no-op" note is preserved (the YAML is
   complete, so the coverage script confirms 0 missing); but T8b is no
   longer "mechanical repoint" — it now requires a fetch-strategy decision.

   **This is the most important reversal in the audit chain.** §1.9 was
   correct about *data* and incomplete about *runtime*; §12.2 closes the
   runtime gap. An agent that reads §1.9 alone and proceeds to T8c ships the
   regression. Doc 3 §12.9 makes the gate explicit in execution order.

### What §12 did NOT change in this document

- §1.1 (web-research directives / methodology table) — stands.
- §1.2.2 (filename-as-schema heuristics) — stands; the §12.5 case-sensitivity
  gate is a hardening of the fix, not a change to the finding.
- §1.2.7 (rate-limit memory) — still deferred (Doc 2 §2.7, Doc 3 §11.3).
- §1.3 (AI-agent integration table) — stands; §12.7's `RegistryResult`
  unification refines the "File registry" and "bug-facts.ts" rows' remediation
  but not their verdict.
- §1.5 baseline metrics — targets hold; one target sharpened (§1.2.1 → env
  var) per finding 1 above.
- §1.6 (deliberately out-of-scope) — stands.

### Methodology lesson (second)

§1.9's lesson was "verify file state with `rg`/`wc`, not inherited prose".
§12.2's lesson is the **next** layer: *verify runtime data-flow, not just
file state*. §1.9 checked that the YAML had the fields; it did not check that
the fields *reach the render site at the time render happens*. The four
sequential documents each verified their own layer (file state → systemic
risk → adversarial debate → task spec) but none verified the **cross-task
runtime precondition** that T8b's "the dialog already fetches it" assumes.
That is the structural blind spot §12 exists to cross. The lesson for future
audits: a finding about "data is complete" is not complete until the
*delivery path from data to every consumer's render* is also verified.

---

*End of Phase 1 (with §1.10 cross-cutting recheck). Proceed to Document 1
(`02-document1-systemic-review.md`), which carries its own §2.10 recheck
propagating these same §12 findings through the issue diagnosis.*
