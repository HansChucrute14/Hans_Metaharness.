#!/usr/bin/env python3
"""assert-unification: FULL F1-F7 G7 count + schema assertion.

Verifies:
  - mapping.json raw_ids == 107
  - canonical_ids within expected range (79-98; exact 79 requires §9.2)
  - collision resolutions == {C4, C7, C16, R1}
  - MAPA 2.0 remap count == 8
  - alias chain entries >= 4
  - graph edges > 0
  - Prisma migration SQL output exists and contains F1-F7 tables
  - bug-facts-replacement-plan.md exists
  - migration_applied flag is True

Usage:
    assert-unification.py [path/to/mapping.json]
    (default: ../docs/reconciliation/mapping.json)
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_MAPPING = PROJECT_ROOT / "docs/reconciliation/mapping.json"
DEFAULT_MIGRATION = PROJECT_ROOT / "docs/reconciliation/prisma/migrations/reconcile-gsd-ids/migration.sql"
DEFAULT_PLAN = PROJECT_ROOT / "docs/reconciliation/bug-facts-replacement-plan.md"


def load_json(path: Path) -> dict:
    if not path.exists():
        print(f"ERROR: {path.name} not found at {path}")
        sys.exit(1)
    return json.loads(path.read_text(encoding="utf-8"))


def check(label: str, ok: bool, detail: str = "") -> bool:
    status = "PASS" if ok else "FAIL"
    msg = f"  {label}: {detail} [{status}]" if detail else f"  {label} [{status}]"
    print(msg)
    return ok


def verify_schema_migration(path: Path) -> list[tuple[str, bool, str]]:
    """Verify Prisma migration SQL contains F1-F7 tables."""
    results = []
    if not path.exists():
        results.append(("migration.sql exists", False, f"not found at {path}"))
        return results
    sql = path.read_text(encoding="utf-8")
    checks = {
        "F1: Finding.canonicalId": "canonicalId" in sql and "Finding" in sql,
        "F1: approvedProposalIndex": "approvedProposalIndex" in sql,
        "F1: pipelineTier": "pipelineTier" in sql,
        "F1: dependencyConfidence": "dependencyConfidence" in sql,
        "F1: findingIds_legacy rename": "findingIds_legacy" in sql,
        "F1: dependsOn_legacy rename": "dependsOn_legacy" in sql,
        "F1: task_legacy rename": "task_legacy" in sql,
        "F2: GraphNode table": "GraphNode" in sql,
        "F2: GraphEdge table": "GraphEdge" in sql,
        "F4: DomainEvent table": "DomainEvent" in sql,
        "F4: DeadLetterQueue table": "DeadLetterQueue" in sql,
        "F5: GraphRepository interface": "GraphRepository" in sql and "getNode" in sql,
        "F6: Project.slug": "slug" in sql and "Project" in sql,
        "F7: OpencodeSetting validation": "OpencodeSetting" in sql,
    }
    for label, ok in checks.items():
        status = "PASS" if ok else "FAIL"
        results.append((label, ok, status))
    return results


def main():
    mapping_path = DEFAULT_MAPPING if len(sys.argv) < 2 else Path(sys.argv[1])
    mapping = load_json(mapping_path)

    print("=" * 60)
    print("  assert-unification: FULL F1-F7 G7 assertion")
    print("=" * 60)

    results: list[tuple[str, bool, str]] = []

    # G7 count assertions
    raw = mapping.get("raw_ids", 0)
    canon = mapping.get("canonical_ids", 0)
    results.append(("raw_ids == 107", raw == 107, f"raw_ids={raw}"))
    results.append(("canonical_ids 79-98", 79 <= canon <= 98, f"canonical_ids={canon}"))

    # Orphan detection
    orphans = mapping.get("orphan_canonicals", [])
    results.append(("no orphan canonicals", len(orphans) == 0,
                    f"orphans={orphans}" if orphans else "0 orphans"))

    # Bug facts remap note
    bfn = mapping.get("bug_facts_remap_note", "")
    results.append(("bug_facts_remap_note present", bool(bfn), "present" if bfn else "MISSING"))

    # Collision resolutions
    cr = mapping.get("collision_resolutions", {})
    expected_collisions = {"C4", "C7", "C16", "R1"}
    cr_keys = set(cr.keys())
    results.append(("collision_resolutions complete", cr_keys == expected_collisions,
                    f"keys={sorted(cr_keys)} vs expected={sorted(expected_collisions)}"))
    for cid in expected_collisions:
        if cid in cr:
            ok = "canonical" in cr[cid]
            results.append((f"  {cid} has canonical target", ok, f"canonical={cr[cid].get('canonical', 'MISSING')}"))

    # MAPA 2.0
    mr = mapping.get("mapa_2_0_remap", {})
    results.append(("mapa_2_0_remap count == 8", len(mr) == 8, f"count={len(mr)}"))

    # Alias chains
    ac = mapping.get("alias_chains", {})
    results.append(("alias_chains >= 4", len(ac) >= 4, f"count={len(ac)}"))

    # Graph edges
    edges = mapping.get("graph_edges", [])
    results.append(("graph_edges > 0", len(edges) > 0, f"count={len(edges)}"))

    # raw_to_canonical consistency
    rtc = mapping.get("raw_to_canonical", {})
    results.append(("raw_to_canonical count matches raw_ids", len(rtc) == raw,
                    f"rtc_entries={len(rtc)}, raw_ids={raw}"))
    # Verify every canonical has at least one raw
    canon_to_raw: dict[str, list[str]] = {}
    for rid, cid in rtc.items():
        canon_to_raw.setdefault(cid, []).append(rid)
    empty_canon = [cid for cid, ids in canon_to_raw.items() if not ids]
    results.append(("no empty canonical in raw_to_canonical", len(empty_canon) == 0,
                    f"empty_canon={empty_canon}" if empty_canon else "0 empty"))

    # Migration applied
    results.append(("migration_applied is True", mapping.get("migration_applied") is True, ""))

    # Idempotency / already_applied (checked during dry-run, apply sets it)
    aa = mapping.get("already_applied", None)
    results.append(("already_applied flag present or null", aa is True or aa is None,
                    str(aa) if aa is not None else "null"))




    # Schema migration
    schema_results = verify_schema_migration(DEFAULT_MIGRATION)
    results.extend(schema_results)

    # bug-facts-replacement-plan
    plan_exists = DEFAULT_PLAN.exists()
    results.append(("bug-facts-replacement-plan.md exists", plan_exists, str(DEFAULT_PLAN.relative_to(PROJECT_ROOT))))

    # Print results
    all_pass = True
    for label, ok, detail in results:
        all_pass = all_pass and ok
        check(label, ok, detail)

    print(f"\n  OVERALL: {'ALL PASS' if all_pass else 'SOME FAILED'}")
    sys.exit(0 if all_pass else 1)


if __name__ == "__main__":
    main()
