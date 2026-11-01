# M11 plan: Agents tab (tabs.12)

**Goal:** each local AI-agent session (Claude Code first) shows as a card in an `agents` tab on the Car Thing, fed by an authenticated listener on 127.0.0.1 and per-agent adapters; a session that starts waiting jumps the device to the tab.
**Branch:** `milestone/11-agents` (from main). **Version:** `0.0.16-tabs.12`. **Spec:** `docs/m11-agents-prompt.md`.

**Rules**
- Update a step's status (todo / doing / done + SHA) in the same commit that finishes it. A resumed session restarts from this file.
- Subagents read only their step plus the AGENTS.md sections it names, and report to the coordinator.
- Any change that makes AGENTS.md wrong updates it in the same commit (parallel steps leave AGENTS.md to D1).
- Paste real gate output. Tests use committed fixtures; the listener test binds 127.0.0.1 port 0.

## Design decisions

1. **Push handler, not Feed.** `Feed.ts` is poll + cache (interval, `saveCache`, stale from the interval, `{items, fetchedAt, stale, error}`); agents data has no fetch or interval, must not persist, and isn't item-shaped. `useFeed` requests only while its tab is `active`, but auto-jump must see pushes from any tab or while asleep. So: plain handler `agents` (like `clock/timerHandler.ts`): `{type:'agents'}` → `{type:'agents', data: AgentsPayload}` to that ws; store changes call `serverManager.broadcast('agents', payload)` through a 250 ms trailing coalescer. Manifest `feedKeys: []`, `feeds: () => []`. Client: `contexts/AgentsContext.tsx` (built like `ClockContext`: request on every connect, accept messages without `action`); the tab and auto-jump both read it.
2. **Listener lifecycle.** `src/main/lib/setup/agents.ts` (a `SetupHandler`) in `setupHandlers` (`setup/setup.ts`); starts with the ws server, cleanup closes it; `setup()` never throws (bind failure → `{running:false, error}` for Settings). Ports 47816–47825 on `'127.0.0.1'`. The store survives a ws restart.
3. **Token.** Storage key `agentsToken`, `setStorageValue('agentsToken', hex, true)`, `crypto.randomBytes(32)` on first use. `isProtectedStorageKey` (`connectors/store.ts`) adds it (constant from `agents/token.ts`, imports only `storage.ts`). `timingSafeEqual` after a length check; read per request so Regenerate applies at once.
4. **Host time.** `sinceMs` = host `Date.now()` at the last state change. Client elapsed uses `useNow(15000)` from `ClockContext`, never `Date`; null → elapsed hidden.
5. **Jump and wake.** `TabPager` gains optional `jumpTo?: {key, seq}`; effect on `seq` → `setIndex(indexForJump(keys, key))` (new in `TabPager/keys.ts`, null if absent). `App.tsx` gets it from `useAgentJump(visibleKeys)`. Wake = what `TimerAlert` does: `setSleepState('off')` + `socket.send({type:'wake'})`. `AgentsContextProvider` mounted in `client/src/main.tsx` inside `SleepContextProvider`.
6. **Blocked.** Menu open = `AppBlurContext.blurred` (also set by `UpdateScreen`, also correct). Timer ringing = `useClock().timer?.state === 'ringing'`.
7. **Interpretations (reversible, inside the spec).**
   - Jump episode: client-side set of keys that already jumped while waiting; cleared when the key leaves waiting; first payload after connect counts. A blocked jump isn't consumed; it fires when the block clears if still waiting.
   - Wake only when the Agents tab is visible.
   - Hook route forces `source` = adapter id; a throwing `toStatus` = null → still 202.
   - `sourceLabel` = adapter label when `source` is an adapter id, else `source.slice(0,8)`.
   - Eviction at 12: oldest idle/stopped by last update, else oldest overall.
   - Stopped without `end` (incl. "No signal") stays until evicted; only ended sessions time out (10 min).
   - "+N more" drawn when `sessions.length > 12` (host caps at 12: defensive).
   - Order of checks: `Origin` present → 400 before auth, body unread; `Host` not `127.0.0.1:<port>`/`localhost:<port>` → 400 (DNS-rebinding hardening); then 401, 404, 413, 400, 202.
   - Hook snippet sets an explicit `timeout` (SessionEnd's default budget is 1.5 s; see HISTORY.md "Claude Code hooks").

## Shared types (W1.1; client copies them)
`AgentState = 'working'|'waiting'|'idle'|'stopped'`
`AgentStatus {source; sessionId; label?; state; detail?; end?}`
`AgentCard {key; source; sourceLabel; label; state; detail; sinceMs}`
`AgentsPayload {sessions: AgentCard[]; counts: Record<AgentState, number>}`
`AgentAdapter {id; label; toStatus(p: unknown): AgentStatus|null; configSnippet(port: number, token: string): string; setupSteps: string[]}`

## Steps

| id | ws | goal | files (C create, M modify) | tier | deps | acceptance | status |
|---|---|---|---|---|---|---|---|
| P0.1 | W0 | HISTORY.md pointer; roadmap renumber (M11 Agents tabs.12, M12 builder + Notifications tabs.13, M13 Gmail) | M AGENTS.md | coordinator | – | diff | done (this commit) |
| P0.2 | W0 | Device results 2026-11-01: user reports not tested yet; recorded in HISTORY.md Open items, AGENTS.md "unverified" notes kept | M docs/HISTORY.md | coordinator | – | diff | done (this commit) |
| P0.3 | W0 | Delete merged remotes (9c-mcp-connectors 3f3ab7e, 10-clock 6a86e8a, claude/upbeat-brahmagupta-28yo2e 0b989d0) | git | coordinator | – | `--merged` listed all three | done |
| P0.4 | W0 | Park builder as `milestone/12-builder-notify` (worktree; cherry-pick 4d808f5, 4509fdb; rename commit 8493b75), gate fast green, delete milestone/11-builder-notify a405d29 and claude/intelligent-planck-wjxk57 4509fdb | git | coordinator | – | gate fast all ok | done |
| P0.5 | W0 | Commit this plan + copied docs | C docs/m11-plan.md, docs/HISTORY.md, docs/m11-agents-prompt.md | coordinator | – | – | done (this commit) |
| W1.1 | W1 | Contract and validation | C src/main/lib/agents/{types.ts, validate.ts, validate.test.ts}; C client/src/modules/agents/types.ts (copy, keep-in-sync comment) | opus | – | rejects bad source (case, 25 chars, chars), sessionId >128 or empty, unknown state, non-object, wrong types; trims + caps label 24 / detail 48; strips C0/C1/DEL/U+2028/2029; `end` boolean only | done (M11 W1.1) |
| W1.2 | W1 | Store, timing, coalescer | C agents/{store.ts, coalesce.ts, store.test.ts, coalesce.test.ts} (`createAgentStore({now, schedule?, onChange})`: `apply(status, sourceLabel)`, `payload()`, `sweep()`) | opus | W1.1 | fake timers: 15 min working silent → stopped "No signal"; ended removed at 10 min; `sinceMs` only changes on state change; max 12 eviction order; counts; key = source:sessionId. Coalescer ≤1 call / 250 ms, trailing call has latest payload | done (M11 W1.2) |
| W1.3 | W1 | Token | C agents/{token.ts, token.test.ts} (`getAgentsToken`, `regenerateAgentsToken`, `tokenMatches(header)`); M connectors/store.ts (`isProtectedStorageKey`) + its test | opus | W1.1 | 64 hex, generated once, stored secure; regenerate changes it; `tokenMatches` false for missing/wrong/other length/non-Bearer; protected key true | done (M11 W1.3) |
| W1.4 | W1 | Listener | C agents/{listener.ts, listener.test.ts} (`startAgentsListener({port, maxTries, token, adapters, onStatus, timeoutMs?}) → Promise<{port, close}>`) | opus | W1.1, W1.3 | binds 127.0.0.1:0; 400 with Origin; 400 bad Host; 401 missing/wrong token; 404 unknown route/adapter; 413 >65536 (header or streamed); 400 bad JSON/body; 202 valid → onStatus; hook route forces source; throwing adapter → 202 no call; slow body closed after timeout; no `Access-Control-*`; occupied port → next; never rejects | todo |
| W1.5 | W1 | Module wiring | C agents/instance.ts (lazy store singleton, coalesced broadcast, 1-min sweep), agents/adapters/registry.ts (empty), setup/agents.ts (`getListenerStatus()`), modules/agents/{index.ts, handler.ts, handler.test.ts}; M modules/registry.ts (append), setup/setup.ts, modules/registry.test.ts, modules/tabs.test.ts | sonnet | W1.2, W1.4 | handler.test: plain request → payload to that ws; registry tests with `agents` last; gate fast | todo |
| W2.1 | W2 | Claude Code hooks docs lookup | report → HISTORY.md | haiku | – | facts recorded in HISTORY.md "Claude Code hooks" | done (this commit) |
| W2.2 | W2 | claude-code `toStatus` (privacy filter) | C agents/adapters/{claude-code.ts, claude-code.test.ts}, adapters/fixtures/claude-code/*.json (synthetic; prompt, tool_input, message, transcript_path carry marker `LEAKCHECK`) | opus | W1.1, W2.1 | each fixture maps per spec (Notification by `notification_type`; `PermissionRequest` → "Needs approval: X"); output JSON never contains `LEAKCHECK` or a path separator; label = basename for Windows and POSIX cwd; tool_name sanitized `[A-Za-z0-9_.-]` ≤24; unknown/garbage → null | done (M11 W2.2) |
| W2.3 | W2 | Snippet, setup steps, registry | M claude-code.ts (`configSnippet`, `setupSteps`), adapters/registry.ts; C agents/{snippets.ts, snippets.test.ts}, adapters/registry.test.ts | sonnet | W2.2, W1.5 | snippet valid JSON, every mapped event, explicit timeout; command equals the spec string with port/token; custom curl posts source "custom"; registry ids unique `[a-z0-9-]{1,24}`, label ≤8 | done (M11 W2.3) |
| W3.1 | W3 | Settings IPC | C agents/{ipc.ts, ipc.test.ts}; M src/main/index.ts, src/preload/index.ts, src/preload/index.d.ts | opus | W1.5 | `getAgentsSettings` has no token; unknown snippet id → null; regenerate returns the new token | todo |
| W3.2 | W3 | Settings → Agents panel | C src/renderer/src/pages/Settings/{AgentsTab.tsx, AgentsTab.module.css, agentsForm.ts, agentsForm.test.ts}; M Settings.tsx, modules/types.ts (panel `'agents'`), modules/agents/index.ts | sonnet | W3.1 | agentsForm.test: status text running/error; masked token; gate fast | todo |
| W4.1 | W4 | Client pure helpers | C client/src/modules/agents/{view.ts, view.test.ts} | sonnet | W1.1 | sort waiting→stopped→working→idle then sinceMs desc; summary omits zeros / "No agents running"; `formatElapsed` "0m","4m","1h 2m"; `parseAgentsPayload` drops malformed cards; cap 12 + more | done (M11 W4.1+W4.2) |
| W4.2 | W4 | AgentsContext | C client/src/contexts/AgentsContext.tsx; M client/src/main.tsx | sonnet | W1.1 | requests on every connect; ignores messages with `action`; gate fast | done (M11 W4.1+W4.2) |
| W4.3 | W4 | Agents tab UI | C client/src/modules/agents/{AgentsTab.tsx, AgentsTab.module.css, index.tsx}; M client/src/modules/registry.ts (+ test) | sonnet | W4.1, W4.2 | Chrome 69 safe; dial scroll only when active, not blurred, player hidden; text ≥18 px; gate fast | todo |
| W4.4 | W4 | Auto-jump | C client/src/modules/agents/{autoJump.ts, autoJump.test.ts, useAgentJump.ts}; M TabPager.tsx, TabPager/keys.ts (+ test), App.tsx | sonnet | W4.1, W4.2 | one jump per episode; re-armed after leaving waiting; blocked → not consumed, fires when unblocked; tab hidden → no jump, no wake; `indexForJump` tested | todo |
| W5.1 | W5 | Preview payloads | C scripts/preview/payloads/agents.json (empty), agents.{mixed,many,stopped}.json; M tabs.*.json (add agents), scripts/preview/README.md | haiku | W4.3, W4.4 | server answers each variant | todo |
| W5.2 | W5 | Screenshots | C scripts/preview/settings-states/agents.json; docs/m11-screenshots/*.png | haiku | W5.1, W3.2 | empty, mixed, many scrolled, stopped, settings-agents | todo |
| W5.3 | W5 | /apple-design review | report | opus | W5.2 | Critical/High list | todo |
| W5.4 | W5 | Fix Critical/High | per finding | sonnet | W5.3 | re-shot PNGs | todo |
| W6.1 | W6 | Full-diff review | report | opus | W5.4, W2.3 | findings | todo |
| W6.2 | W6 | Fix review findings | per finding | sonnet | W6.1 | gate fast | todo |
| D1 | docs | AGENTS.md (files, module, listener/port, `agentsToken`, routes, adapter contract, `agents` message, previews, roadmap); NEW_APP.md "Adding an agent"; HISTORY.md traps | M AGENTS.md, docs/NEW_APP.md, docs/HISTORY.md | sonnet | W6.2 | diff | todo |
| D2 | docs | Bump to 0.0.16-tabs.12 | M package.json, client/package.json, both lockfiles | haiku | D1 | version in all 4 files | todo |
| D3 | – | Full `npm run gate`, draft PR | – | coordinator | D2 | real gate output | todo |

## Parallelism
W1.1 → (W1.2 ∥ W1.3) → W1.4 → W1.5. After W1.1: W4.1 ∥ W4.2. After W1.5 three lanes: W2.2→W2.3, W3.1→W3.2, W4.3 ∥ W4.4. W5 onward serial.

## Risks
- `agents/instance.ts` imports `server.ts` (like `clock/instance.ts`): lazy singleton, never touch the registry or broadcast at load time.
- `modules/tabs.test.ts` asserts `clock` last; both `registry.test.ts` list ids.
- Preview indices shift (Agents index 7; connector tabs 8–11, mcp 8); default `agents.json` must be empty or every preview shot auto-jumps.
- Setup must not throw (`runServerSetup` awaits each).
- Fallback port can change across restarts; hooks then fail silently. Settings shows the live port.
- Never log the token, bodies or labels.
- New IPC: main/index.ts, preload/index.ts and index.d.ts stay in sync.

## Not verifiable here
Real Claude Code hooks firing (Windows hook shell, curl, `|| true`); anything on the device (pulse, scroll, auto-jump wake, dial); `safeStorage` on the user's OS; firewall behaviour of the packaged app.

## Departures from spec
None.
