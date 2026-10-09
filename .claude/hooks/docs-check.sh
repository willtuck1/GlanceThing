#!/usr/bin/env bash
# Stop hook: if code changed (vs origin/main, including uncommitted work)
# more recently than AGENTS.md or the last explicit docs check, block once
# and ask Claude to update AGENTS.md or confirm nothing there changed.
input=$(cat)
# Already blocked once this turn: let Claude stop, so it can never loop.
echo "$input" | grep -q '"stop_hook_active": *true' && exit 0
cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0
git rev-parse --verify -q origin/main >/dev/null || exit 0

changed=$( { git diff --name-only origin/main...HEAD; git diff --name-only HEAD; git ls-files --others --exclude-standard; } 2>/dev/null |
  sort -u | grep -E '^(src|client/src|scripts|\.github|\.claude/(agents|hooks|settings\.json)|package\.json|client/package\.json)' )
[ -z "$changed" ] && exit 0

newest=0
for f in $changed; do
  [ -f "$f" ] || continue
  t=$(stat -c %Y "$f" 2>/dev/null || stat -f %m "$f")
  [ "$t" -gt "$newest" ] && newest=$t
done

seen=0
for f in AGENTS.md .claude/.docs-checked; do
  [ -f "$f" ] || continue
  t=$(stat -c %Y "$f" 2>/dev/null || stat -f %m "$f")
  [ "$t" -gt "$seen" ] && seen=$t
done

[ "$newest" -le "$seen" ] && exit 0

echo "Code changed since AGENTS.md was last updated. If the change makes anything in AGENTS.md wrong or incomplete (files, tabs, feeds, messages, rules, commands, roadmap), update it now. If nothing there changed, run: touch .claude/.docs-checked" >&2
exit 2
