#!/usr/bin/env bash
# ponytail: no systemd/cron/pm2 in this container, so this is the simplest
# thing that works — a detached restart loop, started idempotently from
# .bashrc. Upgrade to a real process manager if this container ever gets one.
set -u
cd "$(dirname "$0")/.."

LOCK=/tmp/stash-scout-keepalive.lock
exec 9>"$LOCK"
flock -n 9 || exit 0

while true; do
  if ! curl -sf "http://127.0.0.1:${PORT:-8787}/" -o /dev/null; then
    node dist-server/server/index.js >>/home/coder/stash-scout/data/server.log 2>&1 &
  fi
  sleep 30
done
