#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

SERVICE="${BOT_SERVICE:-generic-skyblock-bot}"
branch=$(git rev-parse --abbrev-ref HEAD)
git fetch --quiet origin "$branch"
before=$(git rev-parse HEAD)
after=$(git rev-parse "origin/$branch")
if [ "$before" = "$after" ] && [ -d node_modules ]; then
  exit 0
fi

git reset --hard --quiet "$after"
changed=$(git diff --name-only "$before" "$after" || true)

rollback() {
  echo "Update to ${after:0:7} failed, rolling back to ${before:0:7}" >&2
  git reset --hard --quiet "$before"
  npm ci --no-audit --no-fund --loglevel=error
  exit 1
}

if [ ! -d node_modules ] || echo "$changed" | grep -qE '^package(-lock)?\.json$'; then
  npm ci --no-audit --no-fund --loglevel=error || rollback
fi
npm run --silent typecheck || rollback
if [ "$before" = "$after" ] || echo "$changed" | grep -q '^emojis/'; then
  npm run --silent emojis
fi
npm run --silent deploy

echo "Updated ${before:0:7} -> ${after:0:7}"
if [ "${SKIP_RESTART:-}" != 1 ] && command -v systemctl >/dev/null && systemctl cat "$SERVICE" >/dev/null 2>&1; then
  systemctl restart "$SERVICE"
fi
