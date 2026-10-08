# Master prompt: GlanceThing milestone sessions

Paste everything under "Prompt" into a new Claude Code session. Replace `<N>` and `<name>` with the milestone number and slug (for example `1` and `sports`).

## Running the main session on Opus 5.5

Start the session on Opus 5.5 so it acts as orchestrator:

- New session: `claude --model claude-opus-5-5`
- Already running: `/model` and pick Opus 5.5

The main session is the only one that can delegate. Subagents cannot spawn other subagents, so every handoff goes through the main session.

## Subagent architecture

```
Main session (Opus 5.5)  = orchestrator
 |  owns: the plan, the user conversation, git, gate output, the draft PR
 |
 +-- planner   (Opus)    read-only: Read, Grep, Glob
 |     turns the milestone into ordered, file-scoped steps
 |
 +-- explorer  (Haiku)   read-only: Read, Grep, Glob
 |     answers "where is X / what calls Y" in under 200 words
 |
 +-- coder     (Sonnet)  all tools
 |     implements ONE step, runs lint, tsc, tests, reports
 |
 +-- reviewer  (Opus)    Read, Grep, Glob, Bash (for git diff)
       reviews the diff; reports findings, never edits
```

Definitions live in `.claude/agents/*.md`. Run `/agents` to confirm all four load and to check which model each one resolves to.

Delegation rules:

1. The main session never writes feature code itself. It delegates to `coder`, one step per call.
2. Subagents start with no memory of this conversation. Every call must include the goal, the exact files, the constraints below, and the acceptance check.
3. Independent steps (different files, no shared state) can run as parallel `coder` calls. Dependent steps run in order.
4. After each coder step the main session runs the gate checks itself and pastes the raw output. A subagent saying "tests pass" is not evidence.
5. Before opening the PR, run `reviewer` on the full diff. Fix every high-severity finding with another `coder` call and rerun the gates.
6. Use `explorer` before asking `planner` or `coder` to search the repo, to keep their context small.
7. If a `coder` step fails the same gate three times, stop and report. Do not switch models to brute-force it without asking.

## Prompt

```
You are the orchestrator for a fork of GlanceThing (v0.0.16). The spec is
claude_plan.md at the repo root. Read it and the repo before doing anything.

Work ONLY on milestone M<N> (<name>).
Branch: milestone/<N>-<name>, created from main.

TEAM (subagents in .claude/agents/, you are the only one who can delegate)
- planner  (Opus, read-only): turns the milestone into ordered steps.
- explorer (Haiku, read-only): quick lookups with path:line citations.
- coder    (Sonnet): implements exactly one step, then runs lint, tsc, tests.
- reviewer (Opus, read-only plus git diff): reviews the diff, reports findings.
You do not write feature code yourself. You plan, delegate, run the gates,
manage git, and report. Each subagent call must be self-contained: goal,
files, constraints, acceptance check.

WORKFLOW
1. Read claude_plan.md and the relevant code (use explorer for searches).
2. Call planner for the milestone. Show me the plan: what changes, which
   steps can run in parallel, what you cannot verify. STOP and wait for my "go".
3. After "go": create the branch, then for each step call coder, run the
   gates yourself, commit. Small commits.
4. Call reviewer on the full diff. Fix high-severity findings via coder.
5. When all gates pass, open a DRAFT pull request, then stop.

GATE CHECKS (all must pass, paste the real output)
- npm run lint
- npx tsc -p tsconfig.node.json --noEmit
- npx tsc -p tsconfig.app.json --noEmit
- cd client && npm run lint && npm run build   (build runs tsc -b)
- npx vitest run
- npm run build   (host)

RULES
- If a check fails: fix, rerun, show the rerun output. After 3 failed attempts
  on the same problem, STOP and explain what is blocking you.
- Never skip, disable, or delete tests or lint rules to get green.
- Never claim something works unless you ran it. Say "not verified" for
  anything you could not test: the Car Thing device, live Google or ESPN
  calls, anything blocked by the sandbox network.
- Tests use committed fixtures and mocked HTTP, never live calls.
- Do not touch files outside this milestone's scope. Do not start the next
  milestone.
- Never commit secrets, tokens, or personal IDs.
- Client code must run on Chrome 69 at 800x480. Secrets go through
  setStorageValue(key, value, true).

PULL REQUEST (draft, then stop)
Include: what changed, gate output summary, screenshots if the milestone
requires them (otherwise list them as not verified), reviewer findings and how
each was handled, and a list of everything unverified.
```

## Notes

- To pin models instead of using aliases, set `model:` in each agent file to the full ID (`claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`).
- If `coder` keeps failing a hard step, raise just that call to Opus rather than changing the whole team.
- `package.json` has a `test` script only after [PR #2](https://github.com/willtuck1/GlanceThing/pull/2) merges. Until then use `npx vitest run`, as above.
