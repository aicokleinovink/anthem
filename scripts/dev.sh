#!/usr/bin/env bash
#
# Start both dev servers with one command, and — the actual point of this script —
# make sure Ctrl+C leaves nothing behind.
#
# Two things conspire against that. A backgrounded server is re-parented when the
# script exits, and Ctrl+C only reaches the foreground process group, so `npm run dev`
# under `&` survives the interrupt that appeared to stop it. `set -m` gives each
# background job its own process group, and the trap kills those groups by hand.
#
# macOS ships bash 3.2, so nothing here may use `wait -n` or newer syntax.

set -uo pipefail
set -m

cd "$(dirname "$0")/.."

API_PORT=3000
UI_PORT=5173

# CLAUDE.md warns twice that a stray dev server has been mistaken for an app bug, and
# a leftover fake device server has already cost a confusing test failure. Start clean.
free_port() {
  local port=$1 pids
  if ! command -v lsof >/dev/null 2>&1; then
    return 0
  fi
  pids=$(lsof -ti "tcp:$port" 2>/dev/null || true)
  if [ -z "$pids" ]; then
    return 0
  fi
  echo "  port $port is in use — stopping $(echo "$pids" | tr '\n' ' ')"
  # shellcheck disable=SC2086 # word splitting is how the pid list is passed on
  kill $pids 2>/dev/null || true
  # Give them a moment to release the socket, then insist.
  local i
  for i in 1 2 3 4 5 6 7 8 9 10; do
    sleep 0.2
    pids=$(lsof -ti "tcp:$port" 2>/dev/null || true)
    [ -z "$pids" ] && return 0
  done
  # shellcheck disable=SC2086
  kill -9 $pids 2>/dev/null || true
  sleep 0.2
}

api_pid=
ui_pid=

cleanup() {
  # Disarm first: the kills below would otherwise re-enter this through EXIT.
  trap - INT TERM EXIT
  local pid
  for pid in $api_pid $ui_pid; do
    # Negative pid = the whole process group, which is where `tsx` and `vite` live.
    kill -- "-$pid" 2>/dev/null || true
  done
}
trap cleanup INT TERM EXIT

echo "Clearing ports…"
free_port "$API_PORT"
free_port "$UI_PORT"

(cd api && npm run dev) &
api_pid=$!

# --host so the LAN address is printed too: testing a remote on a phone is the point.
(cd frontend && npm run dev -- --host) &
ui_pid=$!

cat <<BANNER

  Open http://localhost:$UI_PORT   ← the one you want

  :$UI_PORT is Vite, serving from source with hot reload and proxying /api.
  :$API_PORT is the API; on its own it serves the last frontend build, which after a
  branch switch is silently stale. Use it only when checking a build.

  Ctrl+C stops both.

BANNER

# Neither server is meant to exit. If one does, stop the other and fail, rather than
# leaving half the app running and looking fine.
while kill -0 "$api_pid" 2>/dev/null && kill -0 "$ui_pid" 2>/dev/null; do
  sleep 1
done

echo
echo "A dev server exited — shutting the other one down." >&2
exit 1
