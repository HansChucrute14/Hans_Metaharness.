#!/usr/bin/env bash
# Robust dev-server watchdog.
# - No heap cap (turbopack is native Rust; NODE_OPTIONS doesn't bound it).
# - Lowers its own oom_score_adj so the OOM killer spares the watchdog.
# - Restarts next-server whenever it exits.
set -u
cd /home/z/my-project

# Protect the watchdog itself from OOM killer (-1000 = unkillable by OOM)
echo -1000 > /proc/self/oom_score_adj 2>/dev/null || true

while true; do
  ts=$(date '+%H:%M:%S')
  echo "[$ts] booting next-server..." >> dev-watchdog.log
  node_modules/.bin/next dev -p 3000 >> dev.log 2>&1
  ec=$?
  ts=$(date '+%H:%M:%S')
  echo "[$ts] next-server exited code=$ec; sleeping 2s before restart" >> dev-watchdog.log
  sleep 2
done
