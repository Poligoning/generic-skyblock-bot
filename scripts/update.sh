#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

SERVICE="${BOT_SERVICE:-generic-skyblock-bot}"
before=$(git rev-parse HEAD)
git fetch --quiet origin
git reset --hard --quiet "origin/$(git rev-parse --abbrev-ref HEAD)"
after=$(git rev-parse HEAD)
changed=$(git diff --name-only "$before" "$after" || true)

if [ "$before" != "$after" ] && echo "$changed" | grep -qE '^package(-lock)?\.json$'; then
  npm ci --no-audit --no-fund
elif [ ! -d node_modules ]; then
  npm ci --no-audit --no-fund
fi

npm run --silent typecheck
npm run --silent emojis
npm run --silent deploy

if command -v systemctl >/dev/null && systemctl list-unit-files "$SERVICE.service" >/dev/null 2>&1; then
  systemctl restart "$SERVICE"
  echo "Restarted $SERVICE (${before:0:7} -> ${after:0:7})"
else
  echo "No $SERVICE systemd unit found; restart the bot yourself"
fi
