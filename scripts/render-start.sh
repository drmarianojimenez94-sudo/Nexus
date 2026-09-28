#!/usr/bin/env bash
# Single-service production entrypoint (see render.yaml).
#
# Render only exposes one $PORT per service, and NEXUS is two processes
# (the Express API, the Next.js server). Rather than ask for two Render
# services wired together — a second thing to configure, and a second
# free-tier cold start — this runs the API privately on a fixed internal
# port and puts the Next.js server (which proxies /api/* to it, see
# apps/web/next.config.mjs) on the port Render actually routes traffic to.
set -euo pipefail

PORT=4000 node apps/api/dist/server.js &
API_PID=$!
trap 'kill "$API_PID" 2>/dev/null || true' EXIT

cd apps/web
exec ./node_modules/.bin/next start -p "$PORT"
