#!/bin/bash
# This script keeps the dev server running persistently.
# It restarts the server if it crashes (OOM or otherwise).
cd /home/z/my-project

# Clean up old processes
fuser -k 3000/tcp 2>/dev/null || true
sleep 2

# Start server with memory constraints, in a loop
while true; do
  echo "$(date): Starting dev server..." > /home/z/my-project/dev.log
  NODE_OPTIONS="--max-old-space-size=256" node node_modules/.bin/next dev -p 3000 >> /home/z/my-project/dev.log 2>&1
  EXIT_CODE=$?
  echo "$(date): Server exited with code $EXIT_CODE, restarting in 5s..." >> /home/z/my-project/dev.log
  sleep 5
done
