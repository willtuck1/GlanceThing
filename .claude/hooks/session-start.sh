#!/usr/bin/env bash
# Installs dependencies at the start of a cloud session so the model doesn't
# spend turns (and tokens) on it. Quiet unless something fails.
[ "$CLAUDE_CODE_REMOTE" = "true" ] || exit 0
cd "$CLAUDE_PROJECT_DIR" || exit 0

install() {
  local dir=$1
  [ -d "$dir/node_modules" ] && return 0
  if ! out=$(npm --prefix "$dir" ci --no-audit --no-fund --loglevel=error 2>&1); then
    echo "session-start: npm ci failed in $dir"
    echo "$out" | tail -n 20
  fi
}

install .
install client
exit 0
