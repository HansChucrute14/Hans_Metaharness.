# Verification Report — BUG-DEPENDENCY-MAP.md vs Source Documents (Parts 1, 2, 3, Appendix-ID-KEY)

**Task ID:** 6-a
**Agent:** general-purpose
**Scope:** Verify every bug/dependency relationship in `consolidated-docs/BUG-DEPENDENCY-MAP.md` against its source-of-truth citations (Part 1 §9–§10, Part 2 §4 + §10, Part 3 §2 + §9, APPENDIX-ID-KEY). Cross-check against the existing `src/lib/dependency-graph.ts` NODE_TABLE / EDGE_TABLE.
**Mode:** Verification only — no source-code modifications. Output is this report plus a worklog append.

---

## Executive summary

The BUG-DEPENDENCY-MAP.md is **structurally faithful** to Parts 1–3 — every gate, every safety relationship, every Phase, every "key verified fact" maps to a real citation in the source documents. The **graph topology** (nodes + edges in `src/lib/dependency-graph.ts`) is also structurally faithful to §D's ASCII art.

However, the bug map and the source documents contain **three classes of quantitative discrepancy** that the UI rebuild should be aware of:

1. **The headline "77 findings" count does not reconcile with the §10.1 master table.** The table has 88 deduplicated rows (or 99 deduplicated IDs); the "9 + 27 + 30 + 11 = 77" arithmetic in §9.2 (which the bug map inherits) is internally consistent but does not match the table.
2. **The "28 tasks" headline in §C is wrong.** Part 2 §15 explicitly states the program is "14 P0 tasks (B0–B12), 16 P1 hardening tasks (C1–C16), 5 regression-suite tasks (R1–R5)" = **35 tasks**, not 28. The §C.2 sub-heading "12 P0 tasks" is also wrong (lists 13 entries).
3. **One task is missing from the dependency-graph.ts NODE_TABLE: C3.** §C.3 lists C3 ("dry matter from data, blocked by moisture/ash data in DB") but the graph omits it entirely. Additionally, the graph has 3 backstop edges (B0→G3, B0→B7) that are not in §E.4, and is missing 4 backstop edges that §E.4 mandates (B0→B1, B0→B3, B0→B5, B0→B6).

All other verifications (Safety Triad, decision gates, critical path, B5 escalation, B12 reframing, empirically-cleared non-defects, legacy self-review) check out exactly.

---

## A. Bug count verification — does 77 = A + B + C + D + E?

**Short answer: No.** The "77" headline does not match either the §10.1 master-priority table or the per-subsystem raw-ID counts. Part 1 §9.2 itself flags this by writing "≈77 unique findings" (with the approximation sign); the bug map drops the "≈" and presents the figure as exact.

### A.1 What the bug map claims

`BUG-DEPENDENCY-MAP.md` §A intro: "§A is the bug catalog (77 findings across 5 subsystems)." The breakdown it gives:

| Severity / Priority | Count claimed | IDs listed in bug map |
|---|---|---|
| P0 / Critical | 10 | A2(+A14), A3(=E1,=R4), B2, B1(+B11), C1, C2/C3/C5/C7, C4, D1, A5, A1 |
| P1 / High | 27 (4 clusters) | LP (4): A4, A6, A7, A8/E3 · Nutrition (8): B3–B10 · Validation (7): D2–D8 · Cross-cutting (4): E4, E5, E6, E7 |
| P2 / Medium | 30 | A9–A18, B12–B18, C14–C18, D9–D18, E8–E19 |
| P3 / Low | 11 | A19, A20, B13, C19–C22, D19–D22, E20–E23 |
| **Total** | **78** | (10 + 27 + 30 + 11 = 78, not 77 — the bug map is internally inconsistent) |

### A.2 What Part 1 §9.2 says

> "The diagnosis identifies 9 Critical, 27 High, 30 Medium, and 11 Low defects (≈77 unique findings, deduplicated across subsystems), plus 6 empirically-cleared non-defects."

So Part 1 uses **severity** (not priority) as the count axis, and **9 Critical** (because A5 was downgraded Critical→High, so 9 P0-priority findings are Critical severity + A5 is High severity). Arithmetic: 9 + 27 + 30 + 11 = 77 ✓ (with the "≈" qualifier).

### A.3 What the §10.1 master priority table actually contains

I counted the rows of the §10.1 table directly (88 rows total). Breakdown by priority:

| Priority | Row count in §10.1 | Findings (IDs) |
|---|---|---|
| P0 | **10** | A3/E1/E2/R4, A2/A14/R1, B2, B1/B11, C1, C2/C3/C5/C7, C4, D1, A5, A1 |
| P1 | **30** | A4, A6/R5, A7, A8/E3, B3, B4, B5, B6, B7, B8, B9, B10, C6, C8, C9, C10, C11, C12, C13, D2, D3, D4, D5, D6, D7, D8, E4, E5, E6, E7 |
| P2 | **42** | A9, A10, A11, A12/C21, A13, A15, A16, A17, A18 (9) · B12, B14, B15, B16, B17, B18 (6) · C14, C15, C16, C17, C18 (5) · D9–D18 (10) · E8–E19 (12) |
| P3 | **6 rows / 14 IDs** | A19, A20 (2 rows) · B13 (1 row) · C19/C20/C22 (1 row, 3 IDs) · D19/D20/D21/D22 (1 row, 4 IDs) · E20/E21/E22/E23 (1 row, 4 IDs) |
| **Total rows** | **88** | |

### A.4 Per-subsystem counts (raw A-E ID ranges, per APPENDIX-ID-KEY §1)

| Subsystem | Range | Raw ID count | After cross-series dedup |
|---|---|---|---|
| A — LP / OR solver | A1–A20 | 20 | 19 (A14 merged into A2) |
| B — Canine Nutrition | B1–B18 | 18 | 17 (B11 merged into B1) |
| C — Data Modeling / JSON Schema | C1–C22 | 22 | 21 (C21 merged into A12) |
| D — Validation Pipeline | D1–D22 | 22 | 22 (no merges) |
| E — Cross-cutting / Tests / CLI | E1–E23 | 23 | 20 (E1, E2, E3 merged into A3, A3, A8) |
| **Total** | | **105** | **99** |

### A.5 The reconciliation problem

| Counting method | Result | Matches "77"? |
|---|---|---|
| Sum of severity counts from §9.2 | 9 + 27 + 30 + 11 = 77 | ✓ (with "≈") |
| Row count of §10.1 table | 88 | ✗ (off by 11) |
| Deduplicated individual IDs | 99 | ✗ (off by 22) |
| Raw A-E IDs (no dedup) | 105 | ✗ (off by 28) |

**The arithmetic in §9.2 is internally consistent (77), but the underlying §10.1 table has 88 rows.** The discrepancy is concentrated in P1 ("27" claimed vs 30 actual) and P2 ("30" claimed vs 42 actual).

### A.6 Specific count discrepancies (bug map vs §10.1)

| Bug map claim | Actual from §10.1 | Discrepancy |
|---|---|---|
| "10 P0 / Critical bugs" | 10 P0-priority rows | ✓ Count is correct, but the label conflates priority (P0) and severity (Critical). A5 is P0 priority but High severity (Critical→High downgrade per §10.1 footnote). Strictly: "10 P0 = 9 Critical + 1 High". |
| "27 High / P1 bugs" (4 clusters) | 30 P1-priority rows; bug map's 4 clusters list 23 IDs | ✗ Bug map is missing the 5th P1 cluster — the Schema/Data P1 findings (C6, C8, C9, C10, C11, C12, C13 = 7 IDs). Adding them: 23 + 7 = 30. So "27" is incorrect; the correct P1 count is 30. |
| "30 P2 / Medium" | 42 P2-priority rows (or 42 P2 IDs after dedup) | ✗ Bug map lists 5 ID ranges (A9-A18, B12-B18, C14-C18, D9-D18, E8-E19) which actually total 42 IDs (or 44 raw ranges), not 30. Even excluding A14 (merged into A2) and B13 (P3): 9 + 6 + 5 + 10 + 12 = 42. |
| "11 P3 / Low" | 14 P3-priority IDs; 11 Low-severity IDs | ⚠ "11" matches the Low-severity count (3+4+4 from C19/C20/C22, D19-D22, E20-E23) but NOT the P3-priority count (14, including A19, A20, B13 which are Medium severity). The bug map label conflates priority (P3) with severity (Low). |

### A.7 Subsystem-level verification

The bug map does not give per-subsystem counts (only the headline "5 subsystems"), so there's nothing to verify directly. The correct per-subsystem counts (per §10.1, deduplicated) are:

- **A (LP / OR solver): 19 unique findings** (A1–A20 minus A14 merged into A2)
- **B (Canine Nutrition): 17 unique findings** (B1–B18 minus B11 merged into B1)
- **C (Data / Schema): 21 unique findings** (C1–C22 minus C21 merged into A12)
- **D (Validation): 22 unique findings** (D1–D22, no cross-series merges)
- **E (Cross-cutting / Tests / CLI): 20 unique findings** (E1–E23 minus E1, E2 merged into A3, E3 merged into A8)

Sum: **99 deduplicated findings** — does not match "77".

### A.8 The "10 P0 / Critical bugs" table — verified

The bug map §A.1 table lists 10 rows. Cross-checking each against §10.1 and Part 3 §7 (verified-findings table):

| # | Bug map ID(s) | Part 1 §10.1 | Part 3 §7 verification | Status |
|---|---|---|---|---|
| 1 | A2 (+A14) | A2/A14/R1 row (P0) | "A2 — Mineral antagonisms are soft, not hard" — `grep -c HARD_FAIL_INFEASIBLE` → 60 | ✓ |
| 2 | A3 (=E1, =R4) | A3/E1/E2/R4 row (P0) | "A3 — `nutrient_results` is a hardcoded fake" — solver execution | ✓ |
| 3 | B2 | B2 (P0) | (implied by B3 task) | ✓ |
| 4 | B1 (+B11) | B1/B11 (P0) | (implied by B4 task) | ✓ |
| 5 | C1 | C1 (P0) | "C1 — DB fails own schema" — jsonschema run, 21 errors | ✓ |
| 6 | C2/C3/C5/C7 | C2/C3/C5/C7 (P0) | (covered by B7 task) | ✓ |
| 7 | C4 | C4 (P0) | "C4 — orphaned schema" — 3 errors | ✓ |
| 8 | D1 | D1 (P0) | "D1 — `_shared.py` missing" — ModuleNotFoundError | ✓ |
| 9 | A5 | A5 (P0, Critical→High) | "A5 — `objective_weights.json` dead" — grep -c → 0 | ✓ |
| 10 | A1 | A1 (P0) | (implied by B10 task) | ✓ |

All 10 P0 IDs verified against source documents. ✓

---

## B. Task catalog verification — is it really 28 tasks?

**Short answer: No.** The actual count is **35 tasks**, per Part 2 §15's explicit statement: "14 P0 tasks (B0–B12), 16 P1 hardening tasks (C1–C16), 5 regression-suite tasks (R1–R5)".

### B.1 What the bug map claims

`BUG-DEPENDENCY-MAP.md` §C intro: "## §C. The Fix Task Catalog — 28 tasks across 4 phases"

Sub-sections:
- §C.1 Phase 0 — Safety Freeze (**1 task**): B0
- §C.2 Phase 1 — Blockers & Stability (**12 P0 tasks**): lists 13 entries (B1, B2a, B2b, B3, B4, B5, B6, B7, B8, B9, B10, B11, B12)
- §C.3 Phase 2 — P1 Hardening (**16 C-series tasks**): lists 11 rows but 16 IDs (C1, C2, C3, C4, C5, C6, C7-C12 grouped, C13, C14, C15, C16)
- §C.4 Phase 3 — Regression Suite (**5 R-series tasks**): R1, R2, R3, R4, R5

### B.2 Arithmetic check

| Phase | Bug map heading | Actual entries | Discrepancy |
|---|---|---|---|
| Phase 0 | "1 task" | 1 (B0) | ✓ |
| Phase 1 | "12 P0 tasks" | 13 (B1, B2a, B2b, B3, B4, B5, B6, B7, B8, B9, B10, B11, B12) | ✗ Heading says 12, lists 13 |
| Phase 2 | "16 C-series tasks" | 16 IDs (C1–C16) | ✓ (heading correct; table groups C7–C12 into one row but the count is by ID) |
| Phase 3 | "5 R-series tasks" | 5 (R1, R2, R3, R4, R5) | ✓ |
| **Total** | **"28 tasks"** | **1 + 13 + 16 + 5 = 35** | ✗ Off by 7 |

### B.3 What Part 2 says

Part 2 §15 (line 967): *"This document presents the complete remediation program: **14 P0 tasks (B0–B12), 16 P1 hardening tasks (C1–C16), 5 regression-suite tasks (R1–R5)**, and 15 P2/P3 debt items, all reconciled into a single canonical task system…"*

Part 2 §14 (line 944): *"Critical safety defects have P0 remediation plans | ✅ B0–B12 (14 tasks)"*

So Part 2 is explicit: **14 P0 tasks** (B0, B1, B2a, B2b, B3, B4, B5, B6, B7, B8, B9, B10, B11, B12 — 14 IDs because B2 is split into B2a and B2b).

### B.4 Where did "28" come from?

The only arithmetic that produces 28: 12 (the §C.2 heading's claim) + 16 (§C.3) = 28, which excludes Phase 0 (B0) and Phase 3 (R1–R5). This appears to be the bug map author's original intent — count only the "engineer-built fix tasks" (B1–B12 + C1–C16) and exclude the safety freeze (B0) and the regression suite (R1–R5). However, the §C intro says "across 4 phases" which contradicts this interpretation.

**Recommendation for the UI rebuild:** replace "28 tasks" with "35 tasks (14 P0 + 16 P1 + 5 R)" to match Part 2 §15.

### B.5 Reconciliation with the task description's hypothesis

The task description suggested three possible interpretations of "28":
- (a) 13 + 16 + 5 = 34 — wrong (would mean B0 is excluded from Phase 1)
- (b) 13 + 16 + 5 = 34, or "only counting Phase 1+2+3 without B0" — same as (a)
- (c) 13 + 16 - 1 = 28 (treating B2a/B2b as one B2) + Phase 3 = 33 — wrong arithmetic

None of these reconcile to 28. The actual count is 35 (per Part 2 §15). The "28" appears to be a stale or miscalculated figure.

---

## C. Dependency edges verification — every "Blocked by" in §C vs EDGE_TABLE

### C.1 The §C "Blocked by" relationships (full list, by Phase)

**Phase 1 (§C.2):**

| Task | §C "Blocked by" | Representative graph edge(s) |
|---|---|---|
| B0 | none | — |
| B1 | B7 (clean min/max source) | B7 → B1 |
| B2a | none (G1 resolved) | — |
| B2b | B2a + G3 thresholds + vet | B2a → B2b, G3 → B2b |
| B3 | G3 + vet | G3 → B3 |
| B4 | G3 + vet | G3 → B4 |
| B5 | B7 (recommended, not hard) | B7 → B5 (recommended) |
| B6 | B7 (schema tightening) | B7 → B6 |
| B7 | chicken_blood_raw Mg source (external — verify FDC) | (external, not in graph) |
| B8 | B7 (registry shape) | B7 → B8 |
| B9 | none (G2 resolved) | — |
| B10 | none | — |
| B11 | none (diagnostic) | — |
| B12 | B7; B1 (reporting layer) | B7 → B12, B1 → B12 |

**Phase 2 (§C.3):**

| Task | §C "Blocked by" | Representative graph edge(s) |
|---|---|---|
| C1 | B2a | B2a → C1 |
| C2 | none | — |
| C3 | moisture/ash data in DB (external) | (external, not in graph) — **but C3 node is missing from NODE_TABLE** |
| C4 | G3 + vet | G3 → C4 |
| C5 | B7, B8 | B7 → C5, B8 → C5 |
| C6 | none — security, do early | — |
| C7–C12 (all 6) | B5 | B5 → C7, B5 → C8, B5 → C9, B5 → C10, B5 → C11, B5 → C12 |
| C13 | none | — |
| C14 | B5, B6 | B5 → C14, B6 → C14 |
| C15 | none | — |
| C16 | none | — |

**Phase 3 (§C.4):** R1–R4 are "after fixes they lock"; R5 is "R1–R4 (last)". Represented as R1→R5, R2→R5, R3→R5, R4→R5.

### C.2 EDGE_TABLE audit (current `src/lib/dependency-graph.ts`)

The current EDGE_TABLE has 30 edges. Categorized:

| Edge group | Edges | Source citation |
|---|---|---|
| G3 (pending) | G3→B3, G3→B4, G3→B2b, G3→C4 | §C.2 B3, B4, B2b; §C.3 C4 ✓ |
| B2a chain | B2a→B2b, B2a→C1 | §C.2 B2b; §C.3 C1 ✓ |
| B7 chain (blocks) | B7→B1, B7→B6, B7→B8, B7→B12, B7→C5 | §C.2 B1, B6, B8, B12; §C.3 C5 ✓ |
| B7 chain (recommended) | B7→B5 (recommended) | §C.2 B5 "B7 (recommended, not hard)" ✓ |
| B1 → B12 | B1→B12 | §C.2 B12 "B7; B1 (reporting layer)" ✓ |
| B6/B8 → C5 | B6→C5, B8→C5 | §C.3 C5 says only "B7, B8" — **B6→C5 is NOT in §C** |
| B5 → C7–C12 | B5→C7, B5→C8, B5→C9, B5→C10, B5→C11, B5→C12 | §C.3 "C7–C12 (all 6) | B5" ✓ |
| B5/B6 → C14 | B5→C14, B6→C14 | §C.3 C14 "B5, B6" ✓ |
| B0 backstops | B0→G3, B0→B7, B0→B2a | §E.4 lists A3/A2/B2/C1/D1 (defects B0 detects); representative fix tasks are B1/B2a/B3/B5/B6 — **B0→G3 and B0→B7 are NOT in §E.4** |
| R1–R4 → R5 | R1→R5, R2→R5, R3→R5, R4→R5 | §C.4 R5 "R1–R4 (last)" ✓ |

### C.3 Missing edges (in §C but not in EDGE_TABLE)

| Missing edge | §C citation | Recommendation |
|---|---|---|
| (none — every §C blocked-by that maps to a graph node has a corresponding edge, except for C3's external blocker which is correctly omitted) | | |

The only structural gap is that **C3 itself is missing from NODE_TABLE** (see §G below), so no edges to/from C3 exist.

### C.4 Extra edges (in EDGE_TABLE but not in §C)

| Extra edge | In §D? | Recommendation |
|---|---|---|
| **B6 → C5** (kind: "blocks") | Yes — §D ASCII art shows "B6 (DB conformance) ─> C5 (schema hardening) [+ B7, B8]". The dependency-graph.ts comment also says "B6 ─> C5" with "B6 as feeder". | §C says C5 is "Blocked by B7, B8" only. §D includes B6 as a "feeder" (recommended, not hard block). **Either downgrade to "recommended" in the graph, or document as a §D-only feeder edge.** |
| **B0 → G3** (kind: "backstops") | Not in §E.4 (which lists A3/A2/B2/C1/D1 as defects B0 detects; G3 is a gate, not a defect) | **Remove** — G3 is not a defect B0 detects. (Or reinterpret as "B0 backstops the G3-blocked tasks by providing interim containment," but that would require edges to B3, B4, B2b, C4, not to G3 itself.) |
| **B0 → B7** (kind: "backstops") | Not in §E.4 (B7 doesn't repair any of A3/A2/B2/C1/D1 directly) | **Remove** — B7 is the canonical-namespace task; it doesn't repair any of B0's 5 trip conditions. (B7 repairs C2/C3/C5/C7/B18/C6, none of which B0 detects.) |
| **B0 → B2a** (kind: "backstops") | §E.4 trip condition #2: "Any antagonism slack > tolerance → detects A2 (and B2a's prerequisite)". | ✓ Keep — B2a repairs A2, which B0 detects. |

### C.5 §D critical-path verification

Bug map §D says: *"The critical path (Part 2 §10): `G1/G2/G3 → B7 → {B1, B5, B6, B8} → {B2a, C1}, {C5}, {C7–C12}, {C14} → Phase 3`."*

Part 2 §10 says: *"Critical path: G1/G2/G3 decisions → B7 → {B1, B5, B6, B8} → {B2a, C1}, {C5}, {C7–C12}, {C14} → Phase 3. B3/B4 run in parallel once G3 values + vet review land."*

✓ **Exact match.**

---

## D. Backstop coverage — does B0 backstop everything §E.4 says it does?

### D.1 What §E.4 says

§E.4 ("The Containment Layer — B0"): B0 makes the system honest today by forcing `DO_NOT_FEED` + `feed_safe=false` + a visible banner whenever any of **5 trip conditions** is true:

1. Any `nutrient_results[i].status == "adequate"` while `pct_of_min is None` → detects **A3**
2. Any antagonism slack > tolerance → detects **A2** (and B2a's prerequisite)
3. No absolute Ca max in config → detects **B2** (for growth scenarios)
4. DB fails schema → detects **C1** (and B6's prerequisite)
5. Validation package import fails → detects **D1** (and B5's prerequisite)

So B0 detects **A3, A2, B2, C1, D1** (5 original defects).

### D.2 What the current EDGE_TABLE has

| Edge | Present? | Matches §E.4? |
|---|---|---|
| B0 → B2a (backstops) | ✓ | ✓ (B2a repairs A2, which B0 detects) |
| B0 → G3 (backstops) | ✓ | ✗ G3 is a gate, not a defect B0 detects |
| B0 → B7 (backstops) | ✓ | ✗ B7 doesn't repair any of A3/A2/B2/C1/D1 |

### D.3 What should be there (mapping defect → repair task)

| Defect B0 detects | Repair task (per §C) | Should B0 backstop this task? |
|---|---|---|
| A3 | B1 (B1 repairs A3, E1, E2) | **YES — missing edge B0 → B1** |
| A2 | B2a (B2a repairs A2, A14) | YES — present ✓ |
| B2 | B3 (B3 repairs B2, B3-findings) | **YES — missing edge B0 → B3** |
| C1 | B6 (B6 repairs C1, C9, C13) | **YES — missing edge B0 → B6** |
| D1 | B5 (B5 repairs D1) | **YES — missing edge B0 → B5** |

### D.4 Verdict

**The graph's B0 backstop edges are partially wrong and partially incomplete.**

- **Remove:** B0 → G3, B0 → B7 (not in §E.4 — G3 is a gate, B7 doesn't repair any of the 5 trip-condition defects)
- **Keep:** B0 → B2a ✓
- **Add:** B0 → B1 (backstops), B0 → B3 (backstops), B0 → B5 (backstops), B0 → B6 (backstops)

This gives B0 exactly 5 backstop edges, one per defect it detects, matching §E.4 precisely. Note that B0 → B5 would be in addition to B5's existing "urgent" status (B5 is the most urgent task per Part 3 §9).

---

## E. Independent nodes verification — §D list vs NODE_TABLE `status: "independent"`

### E.1 What §D says

§D ASCII art comment: "Independent (can start now): **B2a, B9, B10, B11, C2, C6, C13, C15, C16**" (9 nodes).

### E.2 What §F Phase 1 says

§F: "Phase 1 (now, G3-independent — 7 tasks can start in parallel): **B0, B5, B6, B11, B2a, B9, B10**"

Note: §F uses a broader "G3-independent" definition (recommended parallel start, even if there's a soft/recommended dependency on B7). §D uses a stricter "no hard blockers" definition.

### E.3 Current NODE_TABLE `status: "independent"` entries

| Node | Status | §D list? | §F list? |
|---|---|---|---|
| B0 | "independent" | ✗ (not in §D list — B0 is treated separately in §D as "backstops EVERYTHING") | ✓ |
| B2a | "independent" | ✓ | ✓ |
| B9 | "independent" | ✓ | ✓ |
| B10 | "independent" | ✓ | ✓ |
| B11 | "independent" | ✓ | ✓ |
| C2 | "independent" | ✓ | (not in §F — Phase 2 task) |
| C6 | "independent" | ✓ | (not in §F — Phase 2 task) |
| C13 | "independent" | ✓ | (not in §F — Phase 2 task) |
| C15 | "independent" | ✓ | (not in §F — Phase 2 task) |
| C16 | "independent" | ✓ | (not in §F — Phase 2 task) |
| B5 | "urgent" | (not in §D list — B5 has a recommended dep on B7) | ✓ |
| B6 | null | (not in §D list — B6 has a hard dep on B7) | ✓ |
| C3 | (missing) | (not in §D list — C3 has external blocker) | (not in §F) |

### E.4 Mismatches

| Mismatch type | Nodes | Recommendation |
|---|---|---|
| Graph marks "independent" but §D doesn't list | B0 | **Acceptable.** §D treats B0 specially ("backstops EVERYTHING; first commit") rather than in the "Independent" list, but B0 is conceptually independent (no blockers, first commit). The graph's "independent" status for B0 is consistent with §F. Keep as is. |
| §F lists as G3-independent but graph doesn't mark | B5, B6 | **Discrepancy.** §F explicitly says these 7 tasks (including B5, B6) "can start in parallel" as Phase 1 G3-independent work. The graph marks B5 as "urgent" and B6 as null. If the UI wants to surface "G3-independent" status, B5 and B6 should be marked. **Recommendation:** add a new status value `"g3-independent"` (or extend the status field) for B5 and B6, or document in the inspector that "urgent" implies G3-independent. |
| C3 is entirely missing | C3 | **Critical discrepancy.** C3 has an external blocker ("moisture/ash data in DB"), so it's not "independent" — but it should still be in the graph as a node, not omitted. See §G. |

### E.5 Verdict

The graph's 10 "independent" nodes (B0, B2a, B9, B10, B11, C2, C6, C13, C15, C16) **correctly represent §D's strict "no hard blockers" definition plus B0** (which §D treats specially). The graph is **missing** B5 and B6 from the broader "G3-independent" set per §F, and **missing C3 entirely**.

---

## F. Factual discrepancies between BUG-DEPENDENCY-MAP.md and Parts 1/2/3

### F.1 Discrepancies in the bug map itself

| # | Location in bug map | Bug map claim | Source-of-truth | Status |
|---|---|---|---|---|
| 1 | §A intro | "77 findings across 5 subsystems" | Part 1 §9.2 says "≈77"; §10.1 has 88 deduplicated rows; dedup ID count is 99 | ✗ The "77" is an approximation that doesn't match the master table. Should be "≈77" or "99 deduplicated findings" or "88 table rows". |
| 2 | §A.1 | "10 P0 / Critical bugs" | §10.1: 10 P0-priority rows, but A5 is "Critical→High" (so 9 Critical severity + 1 High severity) | ⚠ Conflates priority (P0) with severity (Critical). Should say "10 P0-priority bugs (9 Critical + 1 High)". |
| 3 | §A.1 row 9 | A5 listed as one of the "10 P0 / Critical bugs" | §10.1: A5 is "Critical→High | LP / config | ... | P0" — severity High, priority P0 | ⚠ Should clarify A5 is High severity (per the Critical→High downgrade in APPENDIX-ID-KEY §5). |
| 4 | §A.2 | "27 High / P1 bugs" in 4 clusters | §10.1: 30 P1-priority rows. Bug map's 4 clusters list 23 IDs. Missing the 5th P1 cluster (Schema/Data: C6, C8, C9, C10, C11, C12, C13 = 7 IDs). 23 + 7 = 30. | ✗ "27" is wrong; should be "30 P1 bugs in 5 clusters". |
| 5 | §A.3 | "P2 (30): A9–A18, B12–B18, C14–C18, D9–D18, E8–E19" | §10.1: those 5 ranges actually total 42 P2 IDs (or 44 raw ranges). Even excluding A14 (merged into A2) and B13 (P3): 9 + 6 + 5 + 10 + 12 = 42. | ✗ "30" is wrong; should be "42 P2-priority findings". (Or if counting Medium-severity only: 42 P2 + 3 P3-Medium = 45, still not 30.) |
| 6 | §A.3 | "P3 (11): A19, A20, B13, C19–C22, D19–D22, E20–E23" | §10.1: P3-priority IDs = 14 (2+1+3+4+4). Low-severity IDs = 11 (3+4+4, excluding A19/A20/B13 which are Medium severity). | ⚠ "11" matches Low-severity count, not P3-priority count. Bug map label conflates priority with severity. Should say "11 Low-severity findings" or "14 P3-priority findings (11 Low + 3 Medium severity)". |
| 7 | §C intro | "28 tasks across 4 phases" | Part 2 §15: "14 P0 tasks (B0–B12), 16 P1 hardening tasks (C1–C16), 5 regression-suite tasks (R1–R5)" = 35 tasks. Part 2 §14: "B0–B12 (14 tasks)". | ✗ "28" is wrong; should be "35 tasks across 4 phases". |
| 8 | §C.2 heading | "Phase 1 — Blockers & Stability (12 P0 tasks)" | §C.2 table actually lists 13 entries (B1, B2a, B2b, B3, B4, B5, B6, B7, B8, B9, B10, B11, B12). Part 2 §15 says "14 P0 tasks (B0–B12)" (B0 is in Phase 0, so Phase 1 has 13). | ✗ "12" is wrong; should be "13 P0 tasks" (Phase 1 only) or "14 P0 tasks" (including B0 in Phase 0). |

### F.2 Discrepancies between bug map §C and §D (within the bug map)

| # | Topic | §C says | §D ASCII art says | Recommendation |
|---|---|---|---|---|
| 9 | C5 "Blocked by" | "B7, B8" | "B6 (DB conformance) ─> C5 (schema hardening) [+ B7, B8]" (B6 is a "feeder") | §D adds B6 as a feeder. Either downgrade B6→C5 to "recommended" in the graph, or document the discrepancy. |

### F.3 Discrepancies between bug map §E.4 and the current EDGE_TABLE

| # | Topic | §E.4 says | EDGE_TABLE has | Recommendation |
|---|---|---|---|---|
| 10 | B0 detects | A3, A2, B2, C1, D1 (5 defects) → backstop edges to B1, B2a, B3, B5, B6 (5 tasks) | B0 → G3, B0 → B7, B0 → B2a (3 edges, only 1 correct) | Remove B0→G3 and B0→B7; add B0→B1, B0→B3, B0→B5, B0→B6. See §D above. |

### F.4 Verifications that check out exactly (no discrepancy)

| Topic | Bug map claim | Source citation | Status |
|---|---|---|---|
| Safety Triad | A2 + A3 + B2 | Part 1 §9.1: "the safety triad A2 + A3 + B2" | ✓ |
| Triad reinforcements | A6, A1, A4 | Part 1 §9.1: "reinforced by three compounding defects: A6, A1, A4" | ✓ |
| G1 resolution | HARD at Level 1, resolved, unblocks B2a/B2b | Part 3 §2: "Resolved: HARD, at Level 1" | ✓ |
| G2 resolution | DELETE objective_weights.json, resolved, unblocks B9 | Part 3 §2: "Resolved: DELETE" | ✓ |
| G3 resolution | PENDING, blocks B3/B4/B2b-thresholds/C4, single project bottleneck | Part 3 §2: "PENDING", Part 3 §6: "G3 is the only item outside engineering control" | ✓ |
| Critical path | G1/G2/G3 → B7 → {B1, B5, B6, B8} → {B2a, C1}, {C5}, {C7–C12}, {C14} → Phase 3 | Part 2 §10: identical wording | ✓ |
| B5 hidden critical-path | CI is RED today (pytest collection failure, 191 tests collected then ModuleNotFoundError) | Part 3 §9: identical account, with the actual pytest output | ✓ |
| B12 reframed | Arginine already correctly placed; real defect is A3 (reporting layer); B12 = "confirm B1 fixes arginine display" | Part 3 §8: full reframing with verification details | ✓ |
| LP core verified correct | Lexicographic cascade, fix-optimum, Big-M, normalized-deviation, RER 70·BW^0.75, Modified Atwater, AAFCO per-1000-kcal | Part 3 §4: "The mathematical core of the system is correct"; Part 3 §7: verified-by-execution table | ✓ |
| 6 empirically-cleared non-defects | 6 bullet points in §G.4 | Part 1 §10.2: 6 bullet points listed (Level-2/3 slack, PuLP APIs, inclusion constraints, fix-optimum, energy formulas, validation positives) | ✓ |
| Legacy self-review missed safety bugs | R1 (=A2), R4 (=A3), R5 (=A6 mechanism) known but unfixed; R2, R3 fixed; R6 (=E23 DEBUG prints) cosmetic, still present | Part 1 §9.4 + APPENDIX-ID-KEY §3.2 (governance R-series) | ✓ |
| B0 trip conditions (5) | A3 detection (placeholder signature), A2 (antagonism slack), B2 (no Ca max), C1 (DB schema), D1 (validation import) | Part 2 §5: identical 5 trip conditions | ✓ |
| Phase 0 = B0 (safety freeze, first commit, backstops everything) | ✓ | Part 2 §5, Part 3 §5.1 | ✓ |
| Phase 1 G3-independent tasks (7): B0, B5, B6, B11, B2a, B9, B10 | ✓ | Part 2 §6: identical 7-task list | ✓ |
| Phase 2 = C1–C16 (P1 hardening) | ✓ | Part 2 §7 | ✓ |
| Phase 3 = R1–R5 (regression suite, R5 is LAST) | ✓ | Part 2 §8 | ✓ |
| Verdict sentence: "Today the system can return SAFE_TO_FEED for a diet with a Ca:Mg ratio 631% out of range" | ✓ | Part 3 §1: identical sentence | ✓ |

---

## G. Recommended additions to the dependency graph (for the UI rebuild)

### G.1 Missing nodes (1)

| # | id | label | kind | severity | status | description | x hint | y hint |
|---|---|---|---|---|---|---|---|---|
| 1 | **C3** | "C3 · dry matter from data" | task | P1 | null | "Dry matter from data — replace hardcoded 72% moisture/1% ash denominator with measured per-ingredient values. Blocked by moisture/ash data in DB (external data prerequisite). Repairs finding B4." | 1000 | 670 (Row 5, near C4 — both blocked by external data) |

**Citation:** §C.3 row: "**C3** | B4 (dry matter from data) | moisture/ash data in DB". Also Part 2 §4 master reconciliation table: "C3 | P1-B4 | B4 | P1 | moisture/ash data in DB".

### G.2 Edges to add (4 backstop edges per §E.4)

| # | from | to | kind | label | Citation |
|---|---|---|---|---|---|
| 1 | B0 | B1 | backstops | "detects A3" | §E.4 trip #1: A3 detection. B1 repairs A3/E1/E2. |
| 2 | B0 | B3 | backstops | "detects B2" | §E.4 trip #3: B2 detection (no Ca max). B3 repairs B2. |
| 3 | B0 | B5 | backstops | "detects D1" | §E.4 trip #5: D1 detection (validation import fails). B5 repairs D1. |
| 4 | B0 | B6 | backstops | "detects C1" | §E.4 trip #4: C1 detection (DB schema fails). B6 repairs C1/C9/C13. |

### G.3 Edges to remove (2)

| # | from | to | kind | Reason |
|---|---|---|---|---|
| 1 | B0 | G3 | backstops | §E.4 does not list G3 as a defect B0 detects. G3 is a decision gate (vet sign-off), not a defect. B0 doesn't "backstop" G3; rather, B0 provides interim containment for the G3-blocked tasks. If we want to represent that relationship, the edges should go B0 → {B3, B4, B2b, C4} (the G3-blocked tasks), not B0 → G3. |
| 2 | B0 | B7 | backstops | §E.4 does not list B7 as a task whose defect B0 detects. B7 repairs C2/C3/C5/C7/B18/C6 (namespace findings), none of which are in B0's 5 trip conditions (A3/A2/B2/C1/D1). |

### G.4 Edges to reconsider (1)

| # | from | to | kind | Current | Recommended | Reason |
|---|---|---|---|---|---|---|
| 1 | B6 | C5 | blocks | "blocks" | "recommended" | §C.3 says C5 is "Blocked by B7, B8" — B6 is not listed. §D ASCII art includes B6→C5 as a "feeder" (with "+ B7, B8" notation), suggesting B6 is a soft/recommended dependency, not a hard block. Downgrade to "recommended" to match §C.3's strict reading. |

### G.5 Status updates (2)

| # | Node | Current status | Recommended status | Reason |
|---|---|---|---|---|
| 1 | B5 | "urgent" | "urgent" + add a `g3Independent: true` flag (or new status `"urgent+g3-independent"`) | §F lists B5 as one of the 7 Phase 1 G3-independent tasks. The "urgent" status captures B5's CI-red-today priority but doesn't convey its G3-independence. |
| 2 | B6 | null | add `g3Independent: true` (or new status `"g3-independent"`) | §F lists B6 as one of the 7 Phase 1 G3-independent tasks. Currently has no status, but should be marked as startable-now per §F. |

(Note: B6 has a hard `B7 → B6` edge in the graph, so "G3-independent" doesn't mean "no blockers" — it means "no G3-blocker". The current EDGE_TABLE correctly represents the B7 hard dependency. The new status would only flag that B6 is not blocked by G3.)

### G.6 Summary of changes

- **Add 1 node:** C3
- **Add 4 edges:** B0 → B1, B0 → B3, B0 → B5, B0 → B6 (all "backstops")
- **Remove 2 edges:** B0 → G3, B0 → B7 (both currently "backstops" but not in §E.4)
- **Downgrade 1 edge:** B6 → C5 from "blocks" to "recommended"
- **Update 2 statuses:** B5 and B6 to flag G3-independence (per §F)

After these changes, the graph would have:
- 36 nodes (35 + C3)
- 32 edges (30 - 2 removed + 4 added; B6→C5 stays but with downgraded kind)
- 5 B0 backstop edges matching §E.4 exactly (B0 → B1, B0 → B2a, B0 → B3, B0 → B5, B0 → B6)

### G.7 Documentation / metadata suggestions

For the UI rebuild, consider adding:
1. **A "fact-check" badge** on the §A bug-count heading noting that "77" is an approximation (Part 1 §9.2 uses "≈77"; the §10.1 master table has 88 rows / 99 deduplicated IDs).
2. **A "task-count" badge** on the §C heading correcting "28" to "35" with the breakdown "14 P0 + 16 P1 + 5 R" per Part 2 §15.
3. **A "counting axis" legend** distinguishing priority (P0/P1/P2/P3) from severity (Critical/High/Medium/Low) — the bug map currently mixes them.
4. **A "backstop semantics" note** in the graph legend explaining that B0 backstop edges point to the **repair task** for each defect B0 detects (per §E.4), not to the defect itself or to structurally-related tasks.

---

## End of verification report

**Files written by this task:**
- `/home/z/my-project/verification-report.md` (this file)

**Files NOT modified:**
- `/home/z/my-project/consolidated-docs/BUG-DEPENDENCY-MAP.md` (verification only — bug map is the user's source-of-truth document; the user may wish to apply the corrections in §F.1 themselves)
- `/home/z/my-project/src/lib/dependency-graph.ts` (no code changes per task instructions)
- All other source files

**Next actions for the user / main agent:**
1. Decide whether to apply the §F.1 corrections to BUG-DEPENDENCY-MAP.md (8 count/label fixes).
2. Apply the §G additions to `src/lib/dependency-graph.ts` (1 missing node, 4 added edges, 2 removed edges, 1 downgraded edge, 2 status updates) — this is a follow-up code task, not part of this verification.
3. Consider adding the §G.7 documentation badges in a future UI polish pass.
