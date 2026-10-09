@AGENTS.md

## Claude Code specifics
- Subagents in `.claude/agents/`: planner (Opus, read-only), explorer (Haiku, lookups), coder (Sonnet, one step), reviewer (Opus, diff review). Only the main session (Opus 5.5) delegates. Model tiers and escalation follow "Agent harness" in `AGENTS.md`; to escalate one call, pass `model: "opus"` on that Agent call. Milestone sessions start from `docs/MASTER_PROMPT.md`.
- Hooks in `.claude/settings.json`:
  - SessionStart installs dependencies in cloud sessions.
  - Stop: when code changed after the last docs check, it blocks once and asks you to update `AGENTS.md`. Update it, or if nothing there changed, run `touch .claude/.docs-checked`.
- Keep `AGENTS.md` current (see its last section). Put Claude-only notes here; everything else goes in `AGENTS.md`.
