"""Seed canonical data into the shared DB from mapping.json and bug-facts.ts.
Creates a dedicated project for the Reader's graph data and populates Finding +
GraphNode + GraphEdge rows.
"""
import json
import sqlite3
import re
import sys
from pathlib import Path
from datetime import datetime

REPO_ROOT = Path(__file__).resolve().parent.parent
MAPPING_PATH = REPO_ROOT / "docs/reconciliation/mapping.json"
BUG_FACTS_PATH = REPO_ROOT / "gsd-diet-calc-consolidated-reader/src/lib/bug-facts.ts"
DB_PATH = REPO_ROOT / "audit-dashboard-project/my-project/db/custom.db"

# Map legacy tier strings to pipelineTier values
TIER_TO_PIPELINE = {"tier0": 0, "tier1": 1, "tier2": 2, "deferred": 3, "additional": 4}

def parse_bug_facts(path):
    """Extract {id: {title, severity, subsystem, oneLiner, repairs, blockedBy, onCriticalPath}}."""
    text = path.read_text(encoding="utf-8")
    result = {}
    key_pattern = re.compile(r'^\s+(\w[\w]*):\s*\{', re.MULTILINE)
    for key in key_pattern.findall(text):
        m = re.search(r'^\s+' + re.escape(key) + r':\s*\{', text, re.MULTILINE)
        if not m:
            continue
        start = m.end()
        depth = 1
        pos = start
        while depth > 0 and pos < len(text):
            if text[pos] == '{': depth += 1
            elif text[pos] == '}': depth -= 1
            pos += 1
        block = text[start:pos-1]
        entry = {"id": key}
        for fraw in re.split(r',(?=(?:[^"]*"[^"]*")*[^"]*$)', block):
            fraw = fraw.strip()
            if ":" not in fraw:
                continue
            fname, fval_raw = fraw.split(":", 1)
            fname = fname.strip()
            fval_raw = fval_raw.strip()
            if fval_raw.startswith('"') and fval_raw.endswith('"'):
                fval = fval_raw[1:-1]
            elif fval_raw.startswith('[') and fval_raw.endswith(']'):
                inner = fval_raw[1:-1].strip()
                fval = [x.strip().strip('"') for x in inner.split(",") if x.strip()]
            elif fval_raw in ("true", "false"):
                fval = fval_raw == "true"
            else:
                fval = fval_raw
            entry[fname] = fval
        result[key] = entry
    return result

def main():
    print("Seeding canonical data...\n")

    mapping = json.loads(MAPPING_PATH.read_text(encoding="utf-8"))
    bug_facts = parse_bug_facts(BUG_FACTS_PATH)
    rtc = mapping["raw_to_canonical"]

    conn = sqlite3.connect(str(DB_PATH))
    c = conn.cursor()

    slug = "gsd-diet-calc"
    project_id = None

    existing = c.execute("SELECT id FROM Project WHERE slug = ?", (slug,)).fetchone()
    if existing:
        project_id = existing[0]
        print(f"  Using existing project: {slug} (id={project_id})")
    else:
        ts = datetime.utcnow().isoformat()
        c.execute(
            "INSERT INTO Project (id, name, description, slug, repoOwner, repoName, createdAt, updatedAt) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            ("proj-gsd-diet-calc", "GSD Diet Calculator", "Reader corpus — GSD-canonized findings",
             slug, "gsd", "diet-calc", ts, ts),
        )
        project_id = "proj-gsd-diet-calc"
        print(f"  Created project: {slug} (id={project_id})")

    # Build canonical → raw mapping
    canon_to_raws = {}
    for raw, canon in rtc.items():
        canon_to_raws.setdefault(canon, []).append(raw)

    # For each canonical, find the best bug_fact entry or create a synthetic one
    canonicals = sorted(canon_to_raws.keys(), key=lambda x: (x[0], int(x[1:]) if x[1:].isdigit() else 0))
    finding_count = 0
    graph_node_count = 0

    for canon in canonicals:
        raw_ids = canon_to_raws[canon]
        primary_raw = raw_ids[0]

        bf = bug_facts.get(primary_raw) or bug_facts.get(canon)
        title = bf.get("title", bf.get("oneLiner", f"Finding {canon}")) if bf else f"Finding {canon}"
        severity = {"P0": "critical", "P1": "high", "P2": "medium", "P3": "low"}.get(
            (bf or {}).get("severity", ""), "medium")
        category = (bf or {}).get("subsystem", "unclassified")
        claim = (bf or {}).get("oneLiner", "")
        tier = (bf or {}).get("severity", "")
        pipeline_tier = {"P0": 0, "P1": 1, "P2": 2, "P3": 3}.get(tier, 0)
        on_critical_path = (bf or {}).get("onCriticalPath", False)

        existing_f = c.execute(
            "SELECT id FROM Finding WHERE canonicalId = ?", (canon,)).fetchone()
        if existing_f:
            finding_id = existing_f[0]
        else:
            finding_id = f"find-{canon.lower().replace(':', '-')}"
            ts = datetime.utcnow().isoformat()
            try:
                c.execute(
                    """INSERT INTO Finding (id, task, canonicalId, findingIds, title, tier,
                       pipelineTier, severity, category, summary, claim, evidence,
                       verificationStatus, dependsOn, affectedFiles, projectId, createdAt, updatedAt)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (finding_id, primary_raw, canon, json.dumps(raw_ids),
                     title, tier, pipeline_tier, severity, category,
                     title, claim, "", "confirmed-execution",
                     json.dumps([r for r in raw_ids if r != primary_raw]),
                     json.dumps([]), project_id, ts, ts),
                )
            except sqlite3.IntegrityError as e:
                print(f"  WARNING: finding {canon} failed: {e}")
                continue
            finding_count += 1

        # Create GraphNode
        existing_gn = c.execute(
            "SELECT id FROM GraphNode WHERE canonicalId = ?", (canon,)).fetchone()
        if not existing_gn:
            try:
                c.execute(
                    """INSERT INTO GraphNode (canonicalId, projectId, findingId, pipelineTier,
                       dependencyConfidence) VALUES (?, ?, ?, ?, ?)""",
                    (canon, project_id, finding_id, pipeline_tier,
                     "documented" if bf else "discovered"),
                )
                graph_node_count += 1
            except sqlite3.IntegrityError:
                pass

    print(f"  Findings created: {finding_count}")
    print(f"  GraphNodes created: {graph_node_count}")

    # Create GraphEdges
    edge_count = 0
    for ge in mapping["graph_edges"]:
        from_id = c.execute("SELECT id FROM GraphNode WHERE canonicalId = ?",
                            (ge["from"],)).fetchone()
        to_id = c.execute("SELECT id FROM GraphNode WHERE canonicalId = ?",
                          (ge["to"],)).fetchone()
        if from_id and to_id:
            try:
                c.execute(
                    "INSERT OR IGNORE INTO GraphEdge (fromId, toId, kind) VALUES (?, ?, ?)",
                    (from_id[0], to_id[0], ge["kind"]),
                )
                edge_count += 1
            except sqlite3.IntegrityError:
                pass

    print(f"  GraphEdges created: {edge_count}")

    # Compute pipeline tiers via DP
    print("\n  Computing pipeline tiers...")
    nodes = c.execute("SELECT id FROM GraphNode WHERE projectId = ?", (project_id,)).fetchall()
    edges = c.execute(
        "SELECT fromId, toId FROM GraphEdge WHERE kind = 'blockedBy' AND (fromId IN (SELECT id FROM GraphNode WHERE projectId = ?) OR toId IN (SELECT id FROM GraphNode WHERE projectId = ?))",
        (project_id, project_id)).fetchall()

    adj = {n[0]: [] for n in nodes}
    for e in edges:
        if e[1] in adj:
            adj[e[1]].append(e[0])

    dp = {}
    def dfs(nid):
        if nid in dp:
            return dp[nid]
        best = 0
        for pred in adj.get(nid, []):
            if pred in adj:
                best = max(best, dfs(pred) + 1)
        dp[nid] = best
        return best

    for nid in adj:
        dfs(nid)

    for nid, tier in dp.items():
        c.execute("UPDATE GraphNode SET pipelineTier = ? WHERE id = ?", (tier, nid))

    max_tier = max(dp.values()) if dp else 0
    print(f"  Pipeline tiers computed: max={max_tier}")

    conn.commit()
    conn.close()
    print("\nSeed complete.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
