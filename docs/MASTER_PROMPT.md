# Master prompt: GlanceThing milestone sessions

Start a new cloud session on Opus 5.5 and paste the block under "Prompt", with `<N>`, `<name>` and the feature description filled in.

The session reads `CLAUDE.md` (which imports `AGENTS.md`) automatically. Hooks install dependencies at start and check that `AGENTS.md` was updated before stopping. Subagents are in `.claude/agents/`: planner (Opus), explorer (Haiku), coder (Sonnet), reviewer (Opus). Only the main session can delegate.

## Prompt

```
Milestone M<N> (<name>). Branch milestone/<N>-<name> from main.
Feature: <what it should do, from the user's point of view>

You are the coordinator on Opus 5.5. Follow "Agent harness (cascading
inference)" in AGENTS.md: every subagent call starts on the cheapest tier
that does the job well (explorer = Haiku, coder = Sonnet, planner and
reviewer = Opus) and escalates one tier for that call only after two
failures on the same step. Never run planner or reviewer below Opus.
Coder writes feature code, one step per call. Every subagent
call must be self-contained: goal, exact files, constraints, acceptance test.
Use explorer for repo searches.

1. Call planner. Show me the plan, what can run in parallel and what can't
   be verified in the cloud. STOP until I say go.
2. Per step: coder, then run `npm run gate -- fast` yourself, then commit.
   Run independent steps as parallel coder calls.
3. Run reviewer on the full diff. Fix real findings via coder.
4. Update AGENTS.md for everything this milestone changed (files, tabs,
   feeds, messages, rules, commands, roadmap status). Required.
5. Bump the version to the next 0.0.16-tabs.N (see AGENTS.md).
   `npm run gate` (full). Screenshots with scripts/preview (see its README)
   if the client changed. Open a DRAFT PR and stop.

Rules:
- Paste real gate output; a subagent saying "tests pass" is not evidence.
- 3 failures on the same problem: stop and tell me what's blocking.
- Never skip or disable tests or lint rules. Never commit secrets or personal IDs.
- Say "not verified" for anything you couldn't run (device, live APIs).
- Stay inside this milestone.
- List every model escalation (step, from → to, why) in the PR body.
- After ANY change, update AGENTS.md (and CLAUDE.md for Claude-only
  notes) in the same commit if it is now wrong or incomplete. Include this
  requirement in any prompt you write for a later session.

PR body: what changed, gate summary, screenshots, reviewer findings and what
you did with each, model escalations, what's unverified, and what changed in AGENTS.md (or
"AGENTS.md: no update needed").
```

## Notes

- Every prompt written for a future session must keep the AGENTS.md update rule.
- Every prompt written for a future session must also keep the coordinator-on-Opus-5.5 and cascading-inference rules (see AGENTS.md "Agent harness").
- If coder keeps failing one hard step, raise just that call one tier (Sonnet → Opus).
- To release after merging: tag `v0.0.16-tabs.N` (matching the bumped version) or create the release on GitHub.
