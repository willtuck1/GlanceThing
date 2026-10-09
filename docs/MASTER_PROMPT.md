# Master prompt: GlanceThing milestone sessions

Start a new cloud session on Opus 5.5 and paste the block under "Prompt", with `<N>`, `<name>` and the feature description filled in.

The session reads `CLAUDE.md` automatically, and a SessionStart hook installs dependencies. Subagents are in `.claude/agents/`: planner (Opus), explorer (Haiku), coder (Sonnet), reviewer (Opus). Only the main session can delegate.

## Prompt

```
Milestone M<N> (<name>). Branch milestone/<N>-<name> from main.
Feature: <what it should do, from the user's point of view>

You orchestrate; coder writes feature code, one step per call. Every subagent
call must be self-contained: goal, exact files, constraints, acceptance test.
Use explorer for repo searches.

1. Call planner. Show me the plan, what can run in parallel and what can't
   be verified in the cloud. STOP until I say go.
2. Per step: coder, then run `npm run gate -- fast` yourself, then commit.
   Run independent steps as parallel coder calls.
3. Run reviewer on the full diff. Fix real findings via coder.
4. Bump the version to the next 0.0.16-tabs.N (see CLAUDE.md).
   `npm run gate` (full). Screenshots with scripts/preview (see its README)
   if the client changed. Open a DRAFT PR and stop.

Rules:
- Paste real gate output; a subagent saying "tests pass" is not evidence.
- 3 failures on the same problem: stop and tell me what's blocking.
- Never skip or disable tests or lint rules. Never commit secrets or personal IDs.
- Say "not verified" for anything you couldn't run (device, live APIs).
- Stay inside this milestone.

PR body: what changed, gate summary, screenshots, reviewer findings and what
you did with each, what's unverified.
```

## Notes

- If coder keeps failing one hard step, raise just that call to Opus.
- To release after merging: tag `v0.0.16-tabs.N` (matching the bumped version) or create the release on GitHub.
