# M11 prompt: Agents tab (MVP) + repo housekeeping

Written 2026-11-01 for a Claude Code session in `willtuck1/GlanceThing`. It follows `docs/MASTER_PROMPT.md` with two changes for speed: the plan is pre-approved (stop only if it departs from this spec), and housekeeping rides in the same PR. Start a session on Opus 5.5 and paste the block under "Prompt".

Product reference: "Agent and Personal Management Dock (Jit)" brief (claude.ai artifact 38NSVN1Lq8dMazkCQWaXLj). It plans a desk dock whose phase 1 is agent status cards for Claude Code, fed by Claude Code hooks, with the host holding every connector and the device only rendering. This milestone builds that phase 1 on the Car Thing as a GlanceThing tab.

## Prompt

```
Milestone M11 (agents). Branch milestone/11-agents from main.
Pre-approved spec below: call planner, show me the plan, then GO without
waiting unless the plan departs from the spec. Speed matters; this is an MVP.

PART 0: Housekeeping (first commits on the branch, and git operations)

0.1 Docs. Copy docs/HISTORY.md and docs/m11-agents-prompt.md from branch
    claude/m11-agents-handoff into this branch (git checkout <branch> -- <files>).
    Add to AGENTS.md "Where things are": "docs/HISTORY.md: milestone ledger,
    traps and decisions; read Traps before starting a milestone." Add new
    traps learned this milestone to docs/HISTORY.md, not to AGENTS.md.
0.2 Device test results. Ask me for the 2026-11-01 Car Thing test results
    (what worked, whether button 4 sends '4', anything broken) if they are not
    in this chat, and record them as facts in AGENTS.md (replace the
    "unverified" notes they settle) and in HISTORY.md Open items.
0.3 Roadmap renumber in AGENTS.md: M11 = Agents tab (this milestone,
    tabs.12). The connector builder + Notifications work becomes M12
    (tabs.13), then Gmail (M13). Fold item 5 Notifications into M12.
0.4 Branch cleanup (do these with git/gh REST, list each SHA in the PR body
    before deleting so anything can be restored):
    a. Delete remote branches already merged to main: milestone/9c-mcp-connectors
       (#22), milestone/10-clock (#24), claude/upbeat-brahmagupta-28yo2e (#23).
       Confirm each with `git branch -r --merged origin/main` first; skip any
       that isn't merged and tell me.
    b. Park the builder: create milestone/12-builder-notify from
       origin/milestone/11-builder-notify, cherry-pick the 2 commits from
       origin/claude/intelligent-planck-wjxk57 onto it (they add
       docs/m11-prompt.md and its roadmap line), then in one commit rename
       docs/m11-prompt.md to docs/m12-prompt.md and change M11 -> M12,
       tabs.12 -> tabs.13 and the branch name inside it. Add a note at the
       top: "Steps A1, A2, A4, A5, A6, A10 are committed; re-plan the rest."
       Push it. Run `npm run gate -- fast` on it and paste the result.
       Then delete remote branches milestone/11-builder-notify and
       claude/intelligent-planck-wjxk57. Leave gh-pages alone.
       No PR for the parked branch.
    c. After this PR merges, I delete claude/m11-agents-handoff myself.

PART 1: Agents tab. Feature, from the user's point of view.

When I run an AI agent (Claude Code first, any agent later) on the same
computer as the GlanceThing desktop app, each session appears as a card in an Agents tab on the Car Thing, so I can
see at a glance whether anything needs me without switching windows.

States (4; colour is never the only signal, every card also shows the word):
- working (green #30D158): the agent is doing something
- waiting (yellow #FFD60A): it needs me: a permission prompt or a question
- idle (grey #8E8E93): it finished its turn and waits for my next prompt
- stopped (red #FF453A): the session ended, or it went silent while working

Design goal: model-agnostic. Everything downstream of ingest (store, cards,
colours, sorting, auto-jump) knows only one normalized status shape and
never anything agent-specific. Each agent is an adapter that translates its
own events into that shape. Shipped adapters this milestone: Claude Code
only (local, via hooks). Cloud sessions are out of scope (they need a relay).
Adding Codex, OpenCode, Gemini CLI, OpenClaw or a custom script later must be
one new adapter file + tests + a config snippet, with no client release and
no change outside the adapters folder and its registry.

Host (security-sensitive steps go to Opus per the harness):
1. Ingest: an HTTP listener in the Electron main process bound to 127.0.0.1
   only (never 0.0.0.0), fixed default port 47816 with fallback to the next
   free port, shown in Settings. JSON body ≤ 64 KB, 2 s read timeout, every
   route requires header `Authorization: Bearer <token>` (token: 32 random
   bytes hex, generated on first use, stored with setStorageValue(...,
   true), protected key, "Regenerate" in Settings). Wrong/missing token → 401,
   anything else → 404/413/400. Reply fast (202) and never throw. No CORS
   headers, refuse requests carrying an Origin header (blocks browser pages
   from posting). Routes:
   - POST /v1/status: the generic, documented endpoint any agent or wrapper
     script can call directly. Body = AgentStatus:
     {source: string (1–24 chars, [a-z0-9-], e.g. "claude-code", "codex",
      "custom"), sessionId: string (≤ 128), label?: string, state:
      "working"|"waiting"|"idle"|"stopped", detail?: string, end?: boolean}
     Validated strictly; label/detail trimmed and capped (24 / 48 chars),
     control characters stripped. end:true = session ended (stopped, removed
     after 10 min).
   - POST /v1/hook/<adapterId>: raw events from an agent's own hook system,
     passed to that adapter's pure `toStatus(payload) → AgentStatus | null`
     (null = ignore). Unknown adapterId → 404.
   Session key = source + ":" + sessionId, so two agents can never collide.
2. Adapters: src/main/lib/agents/adapters/<id>.ts, listed in
   adapters/registry.ts. Each exports {id, label (short tag shown on
   cards, ≤ 8 chars, e.g. "Claude"), toStatus, configSnippet(port, token),
   setupSteps: string[]} and has a test file with committed sample payloads.
   Adapters are the privacy boundary: they may only emit fixed phrases plus
   a tool name in `detail`, and a folder basename as `label`. Add a short
   "Adding an agent" section to docs/NEW_APP.md describing this contract and
   the /v1/status body, so the next agent is one adapter PR.
   First adapter: claude-code. Verify event names and Notification fields
   against the current Claude Code hooks docs (docs.claude.com) before
   writing; record what you found in HISTORY.md. Intended mapping:
   - SessionStart → idle
   - UserPromptSubmit, PreToolUse, PostToolUse, SubagentStop → working
   - Notification asking for permission or input → waiting;
     Notification meaning "idle / waiting for your input" → idle
   - Stop → idle
   - SessionEnd → end:true
   sessionId = session_id, label = basename of cwd, detail built only from
   fixed phrases plus tool_name ("Running Bash", "Needs approval: Edit",
   "Waiting for you", "Done", "Session ended"). NEVER forward prompts,
   messages, tool inputs, file paths beyond the cwd basename, or
   transcript_path (privacy, per the brief).
   The store (adapter-independent) owns timing: working with no update for
   15 min → stopped, detail "No signal"; ended sessions are removed after
   10 min. Card fields sent to the device: {key, source, sourceLabel, label,
   state, detail, sinceMs (host epoch of last state change)}. Max 12
   sessions kept; oldest idle/stopped dropped first.
3. Module `agents` (code-built app module, follow docs/NEW_APP.md), last in
   both registries. It is push-based: state changes broadcast the feed payload
   (coalesce to at most one broadcast per 250 ms); a client request gets the
   current payload. Choose the simplest fit with Feed/useFeed and say why.
   Payload: {sessions: Card[], counts: {working, waiting, idle, stopped}}.
   In-memory only; an app restart starts empty.
4. Settings → Agents panel: listener status (running on 127.0.0.1:<port> or
   the error), token Show/Copy/Regenerate, then one row per registered
   adapter with its label, setup steps and a "Copy config" button (from the
   adapter's configSnippet), plus a "Custom agent" row that copies a curl
   example for /v1/status. Claude Code's snippet is for
   ~/.claude/settings.json (user level, so every project reports). Each hook
   command:
   curl -s -m 2 -X POST http://127.0.0.1:<port>/v1/hook/claude-code -H "Authorization: Bearer <token>" -H "Content-Type: application/json" --data-binary @- || true
   (stdin is the hook JSON; curl ships with Windows 10+ and macOS). Hooks
   must never block or fail Claude Code: 2 s cap, always exit 0. Short
   setup steps under the button. Do not edit ~/.claude/settings.json from
   the app in this milestone. Pure helpers + tests for the snippet builder.

Client (Chrome 69 rules apply):
5. Agents tab at 800×480, dark screen. One job: "does anything need me?"
   - Top line: summary in words, e.g. "1 needs you · 2 working · 1 idle"
     (omit zero counts; "No agents running" when empty).
   - Cards sorted waiting → stopped → working → idle, then newest change
     first. Each card ~88 px tall, 4 visible: a 6 px full-height status bar
     on the left in the state colour (the signature element), project label
     28 px semibold with the sourceLabel as a small outlined tag after it
     (18 px, e.g. "Claude"), state word + detail 20 px in #EBEBF5 at 60% or more,
     elapsed time right-aligned ("4m", "1h 2m") from host time (ClockContext
     hostNow, never Date). Text ≥ 18 px everywhere. Contrast vs #000 ≥ 4.5:1.
   - Waiting cards only: a slow 2 s opacity pulse on the status bar. No other
     motion.
   - Dial scrolls when there are more than 4; "+N more" if over 12.
   - Empty state: "No agents running" and one line: "Install the hooks from
     Settings → Agents on your computer."
6. Auto-jump: when a session enters waiting, the pager switches to the
   Agents tab if it is visible, and a sleeping device wakes. One jump per
   session per waiting episode; never while the timer alert is ringing or
   the Menu is open. Older hosts never send the module; nothing breaks.

7. Design check: run the /apple-design skill (installed on my PC at
   C:\Users\alext\.claude\skills\apple-design) on the preview screenshots
   (empty, 1 waiting + 2 working + 1 idle, 6+ sessions scrolled, a stopped
   card). Fix Critical and High findings, list the rest in the PR body.

Out of scope: approve/deny from the device, cloud sessions, adapters other
than claude-code (the contract must make them easy),
writing ~/.claude/settings.json, sleep-clock widget, notification sound.

You are the coordinator on Opus 5.5. Follow "Agent harness (cascading
inference)" in AGENTS.md: every subagent call starts on the cheapest tier
that does the job well (explorer = Haiku, coder = Sonnet, planner and
reviewer = Opus) and escalates one tier for that call only after two
failures on the same step. Never run planner or reviewer below Opus. The
ingest listener, token handling and the privacy filter in the mapping go to
Opus. Coder writes feature code, one step per call; run independent steps
in parallel. Every subagent call must be self-contained: goal, exact files,
constraints, acceptance test. Use explorer for repo searches.

Single source of truth: AGENTS.md (standing facts) + docs/m11-plan.md (this
milestone). The planner writes docs/m11-plan.md and you commit it before any
code: every step with its workstream, files, tier, dependency and status
(todo / doing / done + commit SHA). Update a step's status in the same
commit that finishes it, so a crashed or resumed session restarts from the
file (the old M11 lost its plan this way). Subagents read only their step
in the plan plus the AGENTS.md sections it names, and report back to you;
they never talk to each other.

Workstreams (one agent per discrete workflow; you own ordering, the gate
and commits):
- W0 Housekeeping: git and branch ops → Haiku; doc edits → Sonnet.
- W1 Contract + ingest: AgentStatus types, listener, token, store and
  timing → Opus (security). Lands FIRST; W2–W4 build against its types.
- W2 Claude Code adapter + fixtures: hooks-docs lookup → Haiku; adapter,
  tests, config snippet → Sonnet.
- W3 Settings → Agents panel → Sonnet.
- W4 Client tab + auto-jump → Sonnet.
- W5 Previews and screenshots → Haiku; /apple-design check → Opus.
- W6 Diff review → Opus reviewer.
Order: W0 ∥ W1 → W2 ∥ W3 ∥ W4 (parallel) → W5 → W6 → docs, bump, PR.

1. Call planner. Show me the plan, what runs in parallel and what can't be
   verified in the cloud. Proceed unless it departs from the spec.
2. Part 0 first. Then per step: coder, `npm run gate -- fast` yourself, commit.
3. Preview screenshots (scripts/preview, add payload variants for agents),
   then step 7. Run reviewer on the full diff. Fix real findings via coder.
4. Update AGENTS.md (files, module, listener, port, token key, routes, adapter contract and registry,
   message, rules, commands, roadmap) and the "Adding an agent"
   section to docs/NEW_APP.md. Required.
5. Bump to 0.0.16-tabs.12 (see AGENTS.md). Full `npm run gate`. Open a DRAFT
   PR and stop. Include a 5-line manual test I can run on my PC: install
   hooks, start Claude Code, trigger a permission prompt, see yellow + jump,
   plus one curl to /v1/status with source "custom" that shows a card.

Rules:
- Paste real gate output; a subagent saying "tests pass" is not evidence.
- 3 failures on the same problem: stop and tell me what's blocking.
- Never skip or disable tests or lint rules. Never commit secrets, tokens or
  personal paths.
- Tests use committed fixtures and mocked HTTP, never live calls. The
  listener test binds 127.0.0.1 on port 0.
- Say "not verified" for anything you couldn't run (device, real hooks).
- Client stays Chrome 69 safe (no flexbox gap, aspect-ratio, :is(), CSS
  transforms on SVG).
- Stay inside this milestone.
- List every model escalation (step, from → to, why) in the PR body.
- After ANY change, update AGENTS.md (and CLAUDE.md for Claude-only notes)
  in the same commit if it is now wrong or incomplete. Include this
  requirement in any prompt you write for a later session.

PR body: what changed, gate summary, screenshots, apple-design findings and
what you did, reviewer findings and what you did with each, branch cleanup
log with SHAs, model escalations, what's unverified, and what changed in
AGENTS.md.
```

## Why these choices (for the next human or agent)
- Four states, not three: idle (grey) separates "finished, your move when you like" from "blocked on you" (yellow), so yellow stays rare and meaningful. This matches the managents model the Jit brief cites.
- Model-agnostic from day one: one normalized AgentStatus shape plus per-agent adapters, so each new agent (Codex, OpenCode, Gemini CLI, OpenClaw, a custom script) is one adapter PR with no client release. Agents without a hook or notify feature need a small wrapper script calling /v1/status. Some agents only report "finished", so they may never show yellow; that is accepted per adapter.
- Local hooks only: cloud sessions can't reach 127.0.0.1 on the PC. A relay that forwards to /v1/status is a later milestone.
- Port + bearer token + Origin refusal: any local process or web page could otherwise spoof agent cards.
- Fixed-phrase details: the Car Thing sits in view of others; the brief plans privacy mode, and the MVP never shows prompt or file content.
- Read-only: approve/deny needs PTY-managed sessions (brief, phase 3).
