#!/bin/sh
# Runs the Express backend and the Next.js frontend as sibling processes in
# one container. If either one dies, kill the other and exit non-zero so
# Railway's restart policy brings the whole container back up cleanly —
# running with only one of the two alive is never a valid state.

node backend/backend/src/server.js &
BACKEND_PID=$!

npm run start &
FRONTEND_PID=$!

while kill -0 "$BACKEND_PID" 2>/dev/null && kill -0 "$FRONTEND_PID" 2>/dev/null; do
  sleep 2
done

kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null
exit 1
