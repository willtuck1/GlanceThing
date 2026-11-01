# M11 handoff: from code-complete to a working Agents tab

Paste the prompt block into a new Claude Code session (Opus 5.5) on the user's Windows PC, in `C:\Users\alext\Downloads\GlanceThing`.

## Prompt

```
Finish M11 (Agents tab) to a verified MVP. Branch milestone/11-agents, draft
PR #25 (willtuck1/GlanceThing). The code is done and the full gate is green;
nothing has run end to end yet (real Electron app, real Claude Code hooks,
Car Thing). Read docs/m11-mvp-handoff.md (this file) fully, then AGENTS.md
bullets "Agents (M11, host)", "Agents (M11, client)", "Client self-update",
and "Rules"; docs/m11-plan.md only if you need a design reason.

Work through the steps below in order. Say "not verified" for anything you
couldn't observe. Paste real output, never a summary of it. Three failures on
the same problem: stop and tell the user what's blocking. Fixes go on the same
branch (one commit per fix, `npm run gate -- fast` before each commit). After
ANY change, update AGENTS.md (and docs/HISTORY.md for traps/device facts) in
the same commit if it is now wrong or incomplete; include this requirement in
any prompt you write for a later session. Follow AGENTS.md "Agent harness"
(listener/token/adapter-privacy changes go to Opus). Don't merge, tag or
release without the user saying so at that step.
```

## State at handoff (2026-11-01)

- Branch `milestone/11-agents`, version `0.0.16-tabs.12`, draft PR #25. Full `npm run gate` green on `229bc80` (87 files, 1063 tests).
- The device runs GlanceThing tabs.11. It doesn't need flashing: on connect the client compares versions and the host reinstalls the client (`handlers/version.ts`, `handlers/update.ts`).
- Never verified: real Claude Code hooks firing (Windows hook shell, curl, `|| true`), the running Electron app with the listener, anything on the device (rendering, pulse, scroll, auto-jump, waking from sleep), and the button 4 key check that has been pending since M10.

## Primitives

| Thing | Value |
|---|---|
| Listener | `http://127.0.0.1:47816` (falls back through 47825; Settings → Agents shows the live port). Starts with the ws server (`src/main/lib/setup/agents.ts`), i.e. only after first-run setup is complete |
| Routes | `POST /v1/status` (generic), `POST /v1/hook/<adapterId>` (raw hook JSON; only adapter `claude-code`) |
| Responses | 202 accepted (also for ignored hook events) · 400 Origin/Sec-Fetch-Site present, bad Host, wrong content type, bad JSON/body · 401 token · 404 route/adapter · 413 over 64 KB |
| Token | Settings → Agents → Show/Copy. Secure storage key `agentsToken` (64 hex). Regenerate invalidates every installed hook |
| Status body | `{source: /^[a-z0-9-]{1,24}$/, sessionId: printable ASCII 1–128, state: working\|waiting\|idle\|stopped, label?: ≤24, detail?: ≤48, end?: boolean}` |
| Session key | `source:sessionId`. Working with no update for 15 min → stopped "No signal"; ended removed after 10 min; max 12 |
| Hook config | Settings → Agents → "Copy hooks config" → merge the `hooks` block into `~/.claude/settings.json` (user level). Events: SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, PostToolUseFailure, PermissionRequest, Notification, SubagentStop, Stop, StopFailure, SessionEnd; each `timeout: 5` |
| Hook command | `curl -s -m 2 -X POST http://127.0.0.1:<port>/v1/hook/claude-code -H "Authorization: Bearer <token>" -H "Content-Type: application/json" --data-binary @- \|\| true` |
| claude-code mapping | SessionStart → idle "Ready"; UserPromptSubmit/PostToolUse/SubagentStop → working; PreToolUse → "Running <tool>"; PermissionRequest → waiting "Needs approval: <tool>"; Notification by `notification_type` (permission_prompt → waiting, idle_prompt → idle, elicitation/agent_needs_input → waiting "Waiting for you", others ignored); Stop → idle "Done"; SessionEnd → stopped + end |
| Device message | `{type:'agents'}` → `{type:'agents', data:{sessions, counts}}`, pushed on change (250 ms coalesced) |
| Auto-jump | Once per session per waiting episode; held while the Menu is open, the timer is ringing, or the tab list hasn't arrived (3 s fallback for old hosts); only if Agents is visible; wakes a sleeping device |
| Key files | `src/main/lib/agents/` (listener, token, store, validate, snippets, ipc, adapters/), `src/main/lib/setup/agents.ts`, `client/src/modules/agents/`, `client/src/contexts/AgentsContext.tsx`, `src/renderer/src/pages/Settings/AgentsTab.tsx` |
| Logging | By design nothing logs tokens, bodies or labels. To see what arrives, watch the curl exit/HTTP code or the device |
| Gate | `npm run gate -- fast` between steps, `npm run gate` before the PR is marked ready |
| Screenshots | Playwright lives in `C:\Users\alext\AppData\Local\Temp\gt-pw`; run scripts with `npm_config_prefix=/c/Users/alext/AppData/Local/Temp/gt-pw PLAYWRIGHT_BROWSERS_PATH=/c/Users/alext/AppData/Local/Temp/gt-pw/browsers`. Auto-jump shots need `VARIANT_tabs=all` |
| Windows shell traps | Git Bash has no `pkill` (kill by PID); grep on gate output exits 0 even on FAIL; in PowerShell use `curl.exe`, not `curl` |

Test helpers (Git Bash; set `PORT` and `TOKEN` from Settings → Agents):

```bash
# 1. custom status → green "my-script" card
curl -s -o /dev/null -w "%{http_code}\n" -m 2 -X POST http://127.0.0.1:$PORT/v1/status \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"source":"custom","sessionId":"demo","label":"my-script","state":"working","detail":"Running"}'
# expect 202

# 2. simulated Claude Code permission prompt through the hook route → yellow card + jump
echo '{"session_id":"smoke-1","cwd":"C:\\Users\\x\\smoke-test","hook_event_name":"Notification","notification_type":"permission_prompt","message":"ignored"}' \
  | curl -s -o /dev/null -w "%{http_code}\n" -m 2 -X POST http://127.0.0.1:$PORT/v1/hook/claude-code \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data-binary @-
# expect 202

# 3. end it
echo '{"session_id":"smoke-1","cwd":"C:\\Users\\x\\smoke-test","hook_event_name":"SessionEnd","reason":"other"}' \
  | curl -s -o /dev/null -w "%{http_code}\n" -m 2 -X POST http://127.0.0.1:$PORT/v1/hook/claude-code \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data-binary @-

# negative checks: no token → 401; with -H "Origin: http://x" → 400
```

## Steps

1. **PC smoke test (no device).** `npm run dev` on the branch.
   - Settings → Agents shows "Listening on 127.0.0.1:47816" (or a fallback port; note which).
   - Run helpers 1–3 and the negative checks; paste the codes.
   - Restart the server from Settings (or stop/start it). The listener stays on the same port and no second port is bound: `netstat -ano | findstr 4781` shows exactly one LISTENING entry.
   - Fail → fix, gate, commit.
2. **Real hooks on the PC.** Copy hooks config into `~/.claude/settings.json`, keeping any existing hooks; back the file up first. Start a new `claude` session in a scratch folder.
   - Confirm no "hook error" notices in Claude Code.
   - Confirm the hooks print nothing into the context.
   - Find out which shell ran the hook (e.g. temporarily add a hook `echo $SHELL > %TEMP%\hookshell.txt`, or check Claude Code docs/debug output). Record the answer in `docs/HISTORY.md` "Claude Code hooks".
   - If the command fails under the real shell, fix `snippets.ts` `hookCommand` and the claude-code snippet (Opus), update tests and AGENTS.md.
3. **Device test on the dev build.** Plug in the Car Thing with `npm run dev` running; it should self-update to tabs.12 (the Agents tab appears last, after Clock). Then:
   - a. Start `claude` → grey "Idle · Ready" card named after the folder.
   - b. Ask for a shell command → permission prompt → yellow "Needs you · Needs approval: Bash", and the device jumps to Agents. Repeat with the device asleep: it should wake.
   - c. Approve → green, then grey "Idle · Done". Exit → red "Stopped · Session ended".
   - d. Helper 1 → green "my-script" card tagged `custom`.
   - e. Dial scrolls with more than 4 cards (send extra helper-1 posts with different `sessionId`s); the waiting pulse is visible.
   - f. Button 4 check: Settings → Clock → "Show button presses on the device" on; press 1–4 and record what the overlay and Settings → Logs (Keys) show.

   Record every result (worked / broke / what was seen) as device facts in AGENTS.md (replace the "unverified" notes they settle) and in HISTORY.md "Open items".
4. **Fix what broke** on the branch (one commit per fix, gate fast, update AGENTS.md in the same commit). Re-run the affected checks.
5. **Ready the PR.** Full `npm run gate`. Update the PR #25 body: what was verified (with outputs), fixes, what's still unverified. Mark it ready. **Ask the user before merging.**
6. **Release, after the user merges.** `git checkout main && git pull && git tag v0.0.16-tabs.12 && git push origin v0.0.16-tabs.12`. Watch `build-release.yml` (`gh run list --workflow build-release.yml`, `gh run watch`). Confirm the release exists, isn't a pre-release, and is titled `GlanceThing_v0.NN`.
7. **Install and confirm.** The user installs the released desktop app and connects the device; the client self-updates. Run step 3b once more on the release build.
8. **Close out.** Record the final results in AGENTS.md and HISTORY.md (M11 ledger row: PR #25, verified items) in a small docs PR. Tell the user they can delete `claude/m11-agents-handoff` and `C:\Users\alext\AppData\Local\Temp\gt-pw`.

## Open decisions (ask the user if they come up)

- Waiting cards never time out (the spec only times out silent *working* sessions). If a crashed session sticking at "Needs you" is annoying in practice, apply the 15 min rule to waiting in `store.ts` `sweep()`.
- The Settings heading shows the 8-char card label "Claude". Showing "Claude Code" would need an optional display-name field on `AgentAdapter`.
- If the port fell back from 47816, installed hooks point at the wrong port until the config is copied again. A fixed port with a clear error might be better than a fallback.
