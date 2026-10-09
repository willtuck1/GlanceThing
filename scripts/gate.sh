#!/usr/bin/env bash
# Runs every CI check and prints one line per check. On a failure it prints
# the last 40 lines of that check's output. `fast` skips the two builds.
# Exit code is non-zero if any check failed.
cd "$(dirname "$0")/.." || exit 1

mode=${1:-full}
log=$(mktemp)
failed=0

run() {
  local name=$1
  shift
  if "$@" >"$log" 2>&1; then
    echo "ok    $name"
  else
    echo "FAIL  $name"
    tail -n 40 "$log"
    failed=1
  fi
}

ext=.js,.jsx,.cjs,.mjs,.ts,.tsx,.cts,.mts
run "host lint" npx eslint . --ext "$ext"
run "tsc node" npx tsc -p tsconfig.node.json --noEmit
run "tsc app" npx tsc -p tsconfig.app.json --noEmit
run "client lint" npm --prefix client run lint --silent
run "vitest" npx vitest run --reporter=dot
if [ "$mode" != fast ]; then
  run "client build" npm --prefix client run build --silent
  run "host build" npm run build --silent
fi

rm -f "$log"
exit $failed
