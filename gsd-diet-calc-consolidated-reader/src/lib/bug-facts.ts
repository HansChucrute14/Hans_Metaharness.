// Client-safe BugFact data — no `fs` import, no server-only code.
// This module is imported by client components (markdown-renderer.tsx) to
// render Quick-Reference Cards in cross-reference popovers.

export interface BugFact {
  id: string;
  subsystem: string;
  severity: "P0" | "P1" | "P2" | "P3";
  oneLiner: string;       // human-readable 1-line summary
  repairs: string[];      // IDs this task repairs (for task IDs)
  blockedBy: string[];    // IDs that block this task (for task IDs)
  onCriticalPath?: boolean;
}

// Subsystem mapping: A=LP solver, B=Nutrition, C=Data/Schema, D=Validation, E=Cross-cutting
export const BUG_FACTS: Record<string, BugFact> = {
  // P0 / Critical findings
  A2:  { id: "A2",  subsystem: "LP solver",    severity: "P0", oneLiner: "5 mineral antagonism constraints soft at every cascade level — diet violating ratios can be returned SAFE_TO_FEED", repairs: [], blockedBy: [], onCriticalPath: true },
  A3:  { id: "A3",  subsystem: "Output contract", severity: "P0", oneLiner: "nutrient_results hardcoded 'adequate' with pct_of_min: None — the report lies for every nutrient", repairs: [], blockedBy: [], onCriticalPath: true },
  B2:  { id: "B2",  subsystem: "Nutrition",     severity: "P0", oneLiner: "No absolute calcium maximum — Ca+P scale together past safe ceiling → developmental orthopedic disease in puppies", repairs: [], blockedBy: [], onCriticalPath: true },
  B1:  { id: "B1",  subsystem: "Nutrition",     severity: "P0", oneLiner: "Flat k=1.2×RER growth energy (no age taper); scenario labels inverted — puppies underfed 40-60%", repairs: [], blockedBy: [], onCriticalPath: true },
  C1:  { id: "C1",  subsystem: "Data/CI",       severity: "P0", oneLiner: "DB_ingredientes.json fails its own schema (21 errors); no CI gate catches it — silent-poisoning vector", repairs: [], blockedBy: [], onCriticalPath: true },
  C2:  { id: "C2",  subsystem: "Data/Schema",   severity: "P0", oneLiner: "No canonical nutrient namespace — 3 competing schemes, duplicate conflicting units, typos match wrong nutrients", repairs: [], blockedBy: [], onCriticalPath: true },
  C4:  { id: "C4",  subsystem: "Schema",        severity: "P0", oneLiner: "lp_parameters.schema.json orphaned — validates no real file; 44KB dead artifact, real config unchecked", repairs: [], blockedBy: [], onCriticalPath: true },
  D1:  { id: "D1",  subsystem: "Validation",    severity: "P0", oneLiner: "validators/_shared.py missing → ModuleNotFoundError — CI is RED TODAY, blocks all verification", repairs: [], blockedBy: [], onCriticalPath: true },
  A5:  { id: "A5",  subsystem: "LP/config",     severity: "P0", oneLiner: "objective_weights.json (322 lines) never read by solver.py (0 refs) — trustworthiness gap", repairs: [], blockedBy: [], onCriticalPath: true },
  A1:  { id: "A1",  subsystem: "LP solver",     severity: "P0", oneLiner: "Lexicographic stage order inverted (L1/L2 swapped) — level-1 allocation is not what config intended", repairs: [], blockedBy: [], onCriticalPath: true },
  A14: { id: "A14", subsystem: "LP solver",    severity: "P0", oneLiner: "Antagonism cascade mismatch (same as A2 mechanism)", repairs: [], blockedBy: [], onCriticalPath: true },
  B11: { id: "B11", subsystem: "Nutrition",     severity: "P0", oneLiner: "Level-1 infeasibility — diagnose whether solver can reach SAFE_TO_FEED at L1", repairs: [], blockedBy: [], onCriticalPath: false },

  // P0 / Critical TASKS (what fixes the findings)
  B0:  { id: "B0",  subsystem: "Safety freeze",  severity: "P0", oneLiner: "Safety freeze — first commit, backstops EVERYTHING, forces DO_NOT_FEED + banner on 5 trip conditions", repairs: ["A3","A2","B2","C1","D1"], blockedBy: [], onCriticalPath: true },
  B2a: { id: "B2a", subsystem: "LP solver",     severity: "P0", oneLiner: "Harden antagonisms at Level 1 (violation ⇒ infeasible ⇒ DO_NOT_FEED). G1 resolved; INDEPENDENT.", repairs: ["A2","A14"], blockedBy: [], onCriticalPath: true },
  B2b: { id: "B2b", subsystem: "LP solver",     severity: "P0", oneLiner: "Severity-scaled recommendation — the decisive protection that actually protects the animal today", repairs: ["A6"], blockedBy: ["B2a","G3"], onCriticalPath: true },
  B3:  { id: "B3",  subsystem: "Nutrition",     severity: "P0", oneLiner: "Ca/P ceilings — blocked by G3 + vet sign-off", repairs: ["B2"], blockedBy: ["G3"], onCriticalPath: false },
  B4:  { id: "B4",  subsystem: "Nutrition",     severity: "P0", oneLiner: "Growth energy + labels — blocked by G3 + vet", repairs: ["B1","B5"], blockedBy: ["G3"], onCriticalPath: false },
  B5:  { id: "B5",  subsystem: "Validation",    severity: "P0", oneLiner: "Restore _shared.py — CI RED TODAY, hidden critical-path accelerator. URGENT.", repairs: ["D1"], blockedBy: ["B7"], onCriticalPath: true },
  B6:  { id: "B6",  subsystem: "Data/Schema",   severity: "P0", oneLiner: "DB conformance / schema gate — prevents data drift recurring", repairs: ["C1","C9","C13"], blockedBy: ["B7"], onCriticalPath: true },
  B7:  { id: "B7",  subsystem: "Data/Schema",   severity: "P0", oneLiner: "Canonical nutrient namespace — single most-connected node, feeds B1/B5/B6/B8/B12/C5", repairs: ["C2","C3","C5","C7"], blockedBy: [], onCriticalPath: true },
  B8:  { id: "B8",  subsystem: "Schema",        severity: "P0", oneLiner: "lp_parameters schema — registry shape, validates real config", repairs: ["C4","C11"], blockedBy: ["B7"], onCriticalPath: true },
  B9:  { id: "B9",  subsystem: "LP/config",     severity: "P0", oneLiner: "Delete objective_weights.json — G2 resolved, removes dead config", repairs: ["A5"], blockedBy: [], onCriticalPath: false },
  B10: { id: "B10", subsystem: "LP solver",     severity: "P0", oneLiner: "Fix lexicographic stage order — L1/L2 were swapped", repairs: ["A1"], blockedBy: [], onCriticalPath: false },
  B12: { id: "B12", subsystem: "Nutrition",     severity: "P1", oneLiner: "Arginine — REFRAMED in Part 3 §8, only reporting layer (A3) is broken", repairs: [], blockedBy: ["B7","B1"], onCriticalPath: true },

  // P1 tasks
  C1_task: { id: "C1", subsystem: "LP solver",    severity: "P1", oneLiner: "Antagonism penalty normalization (~500× unit mismatch)", repairs: ["A4"], blockedBy: ["B2a"], onCriticalPath: true },
  C2_task: { id: "C2", subsystem: "Output",        severity: "P1", oneLiner: "Status branching — all non-Optimal collapsed to 'infeasible'. INDEPENDENT.", repairs: ["A8","E3"], blockedBy: [], onCriticalPath: false },
  C3:  { id: "C3",  subsystem: "Nutrition",        severity: "P1", oneLiner: "Dry matter from data (hardcoded 72% moisture / 1% ash)", repairs: ["B4"], blockedBy: [], onCriticalPath: false },
  C4_task: { id: "C4", subsystem: "Nutrition",     severity: "P1", oneLiner: "SUL verification for Cu/Fe/I/Mn/Zn — blocked by G3 + vet", repairs: ["B6","B10"], blockedBy: ["G3"], onCriticalPath: false },
  C5:  { id: "C5",  subsystem: "Schema",           severity: "P1", oneLiner: "Schema hardening — blocked by B7 + B8, repairs C6/C8/C10-C13", repairs: ["C6","C8","C10","C11","C12","C13"], blockedBy: ["B7","B8"], onCriticalPath: true },
  C6:  { id: "C6",  subsystem: "Security",         severity: "P1", oneLiner: "FDC API key leaked in URLs — move to header. INDEPENDENT.", repairs: ["D2"], blockedBy: [], onCriticalPath: false },
  C7:  { id: "C7",  subsystem: "Validation",       severity: "P1", oneLiner: "D3 empty-200 accepted as zero-nutrient", repairs: ["D3"], blockedBy: ["B5"], onCriticalPath: true },
  C8:  { id: "C8",  subsystem: "Validation",       severity: "P1", oneLiner: "D4 audit trail not tamper-evident", repairs: ["D4"], blockedBy: ["B5"], onCriticalPath: true },
  C9:  { id: "C9",  subsystem: "Validation",       severity: "P1", oneLiner: "D5 circuit-breaker defeatable", repairs: ["D5"], blockedBy: ["B5"], onCriticalPath: true },
  C10: { id: "C10", subsystem: "Validation",       severity: "P1", oneLiner: "D6 CoFID checksum bypassed when cached", repairs: ["D6"], blockedBy: ["B5"], onCriticalPath: true },
  C11: { id: "C11", subsystem: "Validation",       severity: "P1", oneLiner: "D7/D12 fetch loop crashes on int(Retry-After)", repairs: ["D7","D12"], blockedBy: ["B5"], onCriticalPath: true },
  C12: { id: "C12", subsystem: "Validation",       severity: "P1", oneLiner: "D8 commit swallows failures", repairs: ["D8"], blockedBy: ["B5"], onCriticalPath: true },
  C13_task: { id: "C13", subsystem: "Cross-cutting", severity: "P1", oneLiner: "Runtime input validation unvalidated. INDEPENDENT.", repairs: ["E4"], blockedBy: [], onCriticalPath: false },
  C14: { id: "C14", subsystem: "CI",               severity: "P1", oneLiner: "CI gates + Python matrix — blocked by B5 + B6", repairs: ["E6","E19"], blockedBy: ["B5","B6"], onCriticalPath: true },
  C15: { id: "C15", subsystem: "Process",          severity: "P1", oneLiner: "Bug-numbering reconciliation (3 inconsistent schemes). INDEPENDENT.", repairs: ["E7"], blockedBy: [], onCriticalPath: false },
  C16: { id: "C16", subsystem: "Cross-cutting",    severity: "P1", oneLiner: "Dead floor-relaxation code; file handle leak. INDEPENDENT.", repairs: ["A7","E8"], blockedBy: [], onCriticalPath: false },

  // Gates
  G1:  { id: "G1",  subsystem: "Decision gate", severity: "P0", oneLiner: "Mineral antagonisms: hard or soft? → RESOLVED: HARD at Level 1", repairs: [], blockedBy: [], onCriticalPath: true },
  G2:  { id: "G2",  subsystem: "Decision gate", severity: "P0", oneLiner: "objective_weights.json: wire in or delete? → RESOLVED: DELETE (0 solver refs)", repairs: [], blockedBy: [], onCriticalPath: true },
  G3:  { id: "G3",  subsystem: "Decision gate", severity: "P0", oneLiner: "Numeric safety values (Ca/P ceilings, growth taper, SULs) → PENDING: vet sign-off required. THE PROJECT BOTTLENECK.", repairs: [], blockedBy: [], onCriticalPath: true },

  // Regression tests
  R1:  { id: "R1",  subsystem: "Regression",   severity: "P2", oneLiner: "Tautological assertions — after fixes they lock (Phase 3)", repairs: ["E16"], blockedBy: [], onCriticalPath: true },
  R2:  { id: "R2",  subsystem: "Regression",   severity: "P2", oneLiner: "audit_test_result never asserts (Phase 3)", repairs: ["E17"], blockedBy: [], onCriticalPath: true },
  R3:  { id: "R3",  subsystem: "Regression",   severity: "P2", oneLiner: "Lex dominance; real timeout test (Phase 3)", repairs: ["E18","E5"], blockedBy: [], onCriticalPath: true },
  R4:  { id: "R4",  subsystem: "Regression",   severity: "P2", oneLiner: "Proof discipline (byte-identical replay) (Phase 3)", repairs: [], blockedBy: [], onCriticalPath: true },
  R5:  { id: "R5",  subsystem: "Regression",   severity: "P2", oneLiner: "Dead code, DEBUG prints — LAST in regression suite, blocked by R1-R4", repairs: ["A19","D22","A12"], blockedBy: ["R1","R2","R3","R4"], onCriticalPath: true },

  // P1 findings
  A4:  { id: "A4",  subsystem: "LP solver",    severity: "P1", oneLiner: "Antagonism penalty unit mismatch (~500×) — distorts L1 trade-off", repairs: [], blockedBy: [], onCriticalPath: true },
  A6:  { id: "A6",  subsystem: "LP solver",    severity: "P1", oneLiner: "Config-driven recommendation ignores realized violations — no path to escalate", repairs: [], blockedBy: [], onCriticalPath: true },
  A7:  { id: "A7",  subsystem: "LP solver",    severity: "P1", oneLiner: "Floor-relaxation unimplemented (dead code)", repairs: [], blockedBy: [], onCriticalPath: false },
  A8:  { id: "A8",  subsystem: "LP solver",    severity: "P1", oneLiner: "All non-Optimal statuses collapsed to 'infeasible' — hides useful gradations", repairs: [], blockedBy: [], onCriticalPath: false },
  E1:  { id: "E1",  subsystem: "Output",       severity: "P1", oneLiner: "Same as A3 — nutrient_results lies", repairs: [], blockedBy: [], onCriticalPath: true },
  E3:  { id: "E3",  subsystem: "Test",         severity: "P1", oneLiner: "Same as A8 — all non-Optimal collapsed", repairs: [], blockedBy: [], onCriticalPath: false },
  E4:  { id: "E4",  subsystem: "Input",        severity: "P1", oneLiner: "--runtime input unvalidated", repairs: [], blockedBy: [], onCriticalPath: false },
  E6:  { id: "E6",  subsystem: "CI",           severity: "P1", oneLiner: "No schema/MAPA CI gate, single Python, dead dep", repairs: [], blockedBy: [], onCriticalPath: true },
  E7:  { id: "E7",  subsystem: "Process",      severity: "P1", oneLiner: "3 inconsistent bug-numbering schemes", repairs: [], blockedBy: [], onCriticalPath: false },

  // P1 validation findings
  D2:  { id: "D2",  subsystem: "Security",     severity: "P1", oneLiner: "FDC API key leaked in URLs", repairs: [], blockedBy: [], onCriticalPath: false },
  D3:  { id: "D3",  subsystem: "Validation",   severity: "P1", oneLiner: "Empty-200 accepted as zero-nutrient", repairs: [], blockedBy: [], onCriticalPath: true },
  D4:  { id: "D4",  subsystem: "Validation",   severity: "P1", oneLiner: "Audit trail not tamper-evident", repairs: [], blockedBy: [], onCriticalPath: true },
  D5:  { id: "D5",  subsystem: "Validation",   severity: "P1", oneLiner: "Circuit-breaker defeatable", repairs: [], blockedBy: [], onCriticalPath: true },
  D6:  { id: "D6",  subsystem: "Validation",   severity: "P1", oneLiner: "CoFID checksum bypassed when cached", repairs: [], blockedBy: [], onCriticalPath: true },
  D7:  { id: "D7",  subsystem: "Validation",   severity: "P1", oneLiner: "Fetch loop crashes on int(Retry-After)", repairs: [], blockedBy: [], onCriticalPath: true },
  D8:  { id: "D8",  subsystem: "Validation",   severity: "P1", oneLiner: "Commit swallows failures silently", repairs: [], blockedBy: [], onCriticalPath: true },
};

export function getBugFact(id: string): BugFact | null {
  // Try direct lookup first
  const direct = BUG_FACTS[id];
  if (direct) return direct;
  // For C-series IDs that might be stored as C1_task etc. (task vs finding disambiguation)
  const taskKey = `${id}_task`;
  if (BUG_FACTS[taskKey]) return BUG_FACTS[taskKey];
  return null;
}

// Severity color helpers (client-safe, used by Quick-Reference Cards)
export function severityBadgeClass(severity: string): string {
  switch (severity) {
    case "P0": return "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 border-rose-300 dark:border-rose-800";
    case "P1": return "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300 border-orange-300 dark:border-orange-800";
    case "P2": return "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border-amber-300 dark:border-amber-800";
    case "P3": return "bg-gray-100 text-gray-700 dark:bg-gray-950/50 dark:text-gray-300 border-gray-300 dark:border-gray-800";
    default:   return "bg-muted text-muted-foreground border-border";
  }
}
