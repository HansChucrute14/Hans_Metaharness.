"""backfill-reconciliation: Populate the shared DB with reconciliation data.
Reads mapping.json and backfills Project.slug, Finding.canonicalId, GraphNode, GraphEdge.
"""
import json
import sqlite3
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
MAPPING_PATH = REPO_ROOT / "docs/reconciliation/mapping.json"
DB_PATH = REPO_ROOT / "audit-dashboard-project/my-project/db/custom.db"

def main():
    # Load mapping
    mapping = json.loads(MAPPING_PATH.read_text(encoding="utf-8"))
    raw_to_canonical = mapping["raw_to_canonical"]
    graph_edges = mapping["graph_edges"]
    print(f"Loaded mapping: {len(raw_to_canonical)} raw->canonical mappings, {len(graph_edges)} edges")

    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    # 1. Backfill Project.slug
    rows = c.execute("SELECT id, name, repoOwner, repoName FROM Project").fetchall()
    if not rows:
        print("ERROR: No projects found in DB.")
        return 1

    project = rows[0]
    slug = f"{project['repoOwner']}-{project['repoName']}"
    c.execute("UPDATE Project SET slug = ? WHERE id = ?", (slug, project["id"]))
    print(f"  Project.slug = {slug}")

    # 2. Backfill Finding.canonicalId and create GraphNode rows
    findings = c.execute("SELECT id, task, projectId FROM Finding").fetchall()
    canonical_count = 0
    graph_node_rows = []
    for f in findings:
        task = f["task"]
        canon = raw_to_canonical.get(task)
        if not canon:
            # Try without suffix
            base = task.split("-")[0] if "-" in task else task
            canon = raw_to_canonical.get(base)
        if canon:
            c.execute("UPDATE Finding SET canonicalId = ? WHERE id = ?", (canon, f["id"]))
            canonical_count += 1
            graph_node_rows.append({
                "canonicalId": canon,
                "projectId": f["projectId"],
                "findingId": f["id"],
            })
        else:
            print(f"  WARNING: no mapping for task={task}")

    # 3. Insert GraphNode rows
    node_id_map = {}
    for gn in graph_node_rows:
        c.execute(
            "INSERT OR IGNORE INTO GraphNode (canonicalId, projectId, findingId) VALUES (?, ?, ?)",
            (gn["canonicalId"], gn["projectId"], gn["findingId"]),
        )
    print(f"  Finding.canonicalId backfilled: {canonical_count}")

    # 4. Fetch GraphNode IDs for edge insertion
    nodes = c.execute("SELECT id, canonicalId FROM GraphNode").fetchall()
    canon_to_node_id = {n["canonicalId"]: n["id"] for n in nodes}

    # 5. Insert GraphEdge rows
    edge_count = 0
    for ge in graph_edges:
        from_id = canon_to_node_id.get(ge["from"])
        to_id = canon_to_node_id.get(ge["to"])
        if from_id and to_id:
            try:
                c.execute(
                    "INSERT OR IGNORE INTO GraphEdge (fromId, toId, kind) VALUES (?, ?, ?)",
                    (from_id, to_id, ge["kind"]),
                )
                edge_count += 1
            except Exception as e:
                print(f"  WARNING: edge insert failed: {ge} -> {e}")
    print(f"  GraphEdge inserted: {edge_count}")

    conn.commit()
    conn.close()
    print("Backfill complete.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
