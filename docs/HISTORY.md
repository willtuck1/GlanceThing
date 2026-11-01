# GlanceThing fork: project history from 24 PR bodies

Dates are PR `merged_at` (UTC). Versions come from PR bodies and `git log` bump commits; "n/s" means the PR does not state one. Tags present locally: tabs.1-7, 10, 11 (tabs.8 and 9 are not in the local tag list).

## Milestone ledger

| Milestone | PR(s) | Merged | Version/tag | What shipped (<=20 words) | Not verified |
|---|---|---|---|---|---|
| M0 | #1 | 2026-10-08 | v0.0.16-tabs.1 | Fork portability (GT_REPO), feed scaffold with stale/cache, tab pager, CI workflow, fixed 4 tsc errors | Device/Chrome 69; release workflow on real runners; installers; Electron host wiring; no client unit tests |
| M1 | #3, #4 (follow-up), #10 (captures) | 2026-10-08 (#3, #4); 2026-10-09 (#10) | n/s (tabs.2 bump arrives in #7) | ESPN NBA+NFL sports tab, favorites, long-press stars; #4 adds real captures, 12 h window, idempotent `on` flag | Live ESPN (sandbox 403); device; Electron favorites persistence; #4 labels on device |
| M2 | #5 | 2026-10-08 | n/s | Google OAuth (PKCE loopback) and Calendar tab, 7-day window, calendar picker, Settings Google tab | Real Google consent/token/revoke; live Calendar schema; safeStorage on real OS; device; Settings in Electron |
| M3 | #6 | 2026-10-08 | n/s | To-do tab with two-way Google Tasks, pending/ack/rollback state machine, task list picker | Live Tasks calls (`@default` PATCH, 404 fallback, revoked rollback); device; real host end to end; storage.json after Disconnect |
| Reconnect fix | #7 | 2026-10-08 | v0.0.16-tabs.2 (commit ea18cc8) | Client connect timeout/retry manager; desktop watchdog runs adb reconnect, server restart, tunnel reset, browser restart | Real USB drop on Windows; adb commands never run; tunnel reset on real device; Chrome 69 |
| M4 | #9 (merged), #8 (closed unmerged), #11 (merged) | #9 2026-10-09T02:32; #11 2026-10-09T02:45 | #9 = tabs.3; #11 = tabs.4 | Offline/error messages, drift hardening, list caps, memoized tabs, SETUP.md, desktop notices; #11 adds team colors at 25% | Device perf and colors; live ESPN/Google; tabs.3/tabs.4 release builds; Electron notices; SETUP.md console menu names, SmartScreen/Gatekeeper wording |
| M5 | #12 | 2026-10-09 | n/s (tabs.5 bump is in #13) | Fantasy tab on Sleeper: matchup, starters by slot, bench toggle, username/league settings | Device; real Sleeper league end to end; Electron IPC/disk write; whether matchup `players` includes IR |
| M6 | #13 | 2026-10-09 | v0.0.16-tabs.5 (commit db528c4) | Fantasy projections from league scoring, game status, per-starter Est. | Device; live Sleeper projections + ESPN end to end; ESPN week rollover |
| M7 | #16 | 2026-10-09 | v0.0.16-tabs.6 | One team color per sports row, button 4 to Fantasy, tint opacity sliders over new `display` ws message | Button 4 key on device; tint on real panel; slider live update in Electron; debounce at runtime |
| M8 | #17 | 2026-10-09 | v0.0.16-tabs.7 | Weather tab (Open-Meteo), city search, units toggle; buttons 1/2 prev/next, 3 = Calendar, 4 reserved | Live Open-Meteo; Settings Weather in Electron; Chrome 69 fonts; button 4 reaching client; live refresh on settings change |
| M9A | #20 | 2026-10-09 | v0.0.16-tabs.8 | App-module registries on host and client, Settings tab picker (`tabs` ws message), dependency-aware polling | Device buttons/`tabs` message; Electron Settings; real old host with no reply; live feed start/stop timing |
| M9B | #21 | 2026-10-10 | v0.0.16-tabs.9 | JSON connectors: four generic layouts, dot-path mapping, secret header, SSRF/rebinding-safe fetch, no client release needed | Chrome 69 layouts; dial to "+N more"; real Home Assistant/LAN; `.local` names; live https SNI with pinned socket; Electron IPC/safeStorage; proxies |
| M9C | #22 | 2026-10-10 | v0.0.16-tabs.10 | MCP connectors: recipes, OAuth 2.1 PKCE sign-in, read-only guard, safeFetch, add-connector workflow | Packaged SDK load; real browser sign-in/firewall prompt; OS keyring; real MCP server registration/annotations; device; workflow lookup by name |
| M10 | #24 | 2026-10-10 | v0.0.16-tabs.11 | Clock tab, host-owned timer with desktop alert, sleep clock with 5 widgets, button 4 sleeps on clock | Button 4 key value on device; long-press on touch; sleep/ADB brightness; notification sound/Focus on Win/macOS; Electron; Chrome 69; once-a-second tick CPU; older clients get blank screensaver |

Infra PRs

| PR | Merged | What shipped | Not verified |
|---|---|---|---|
| #2 subagents | 2026-10-08 | `.claude/agents/` planner (Opus), explorer (Haiku), coder (Sonnet), reviewer (Opus); `npm test` script | `client/` checks and builds |
| #14 ci | 2026-10-09 | Release build on tag push only, `concurrency` per ref; repaired tabs.5 release | A real release run with the new workflow |
| #15 agent memory | 2026-10-09 | AGENTS.md, CLAUDE.md, `npm run gate`, `scripts/preview/`, Stop and SessionStart hooks, shorter MASTER_PROMPT | Hooks in a fresh cloud session; actual token savings; fresh `npm ci` path |
| #19 harness | 2026-10-09 | Roadmap rewrite (M9 connector platform) and cascading-inference rules in AGENTS.md, MASTER_PROMPT, CLAUDE.md | n/a (docs only) |
| #23 release naming | 2026-10-09 | `release-name` job titles releases `GlanceThing_v0.NN` (count + 1) | Workflow itself until the tabs.10 tag is pushed |

Also: #18 (docs, 2026-10-09) merged Clock tab and sleep clock into one roadmap item, Notifications and Gmail renumbered.

## Traps and lessons learned

### Device and Chrome 69
- Client had no connect timeout, so a hung adb tunnel attempt never retried even after recovery; stale `onclose` from a replaced socket marked the new connection down and spawned extra connections. Use one reconnect manager with a 5 s attempt timeout, 1 s retry, and ignore events from replaced sockets (#7).
- Calling `close()` and `onclose` by hand on unanswered pings started two reconnects. Restart through the manager only (#7).
- Chrome 69 lacks flexbox `gap`, `aspect-ratio`, `:is()`; use floats and ellipsis for the connector grid (#21). Analog clock hands use the SVG `transform` attribute, not CSS (#24). `rgba` and hard-stop `linear-gradient` are safe (#8).
- Device clock is never trusted: host sends epoch, offset, hour12 and client counts with `performance.now()` deltas, resyncing every 60 s and on reconnect (#24).
- Screenshots come from modern headless Chromium or Playwright, never Chrome 69; no PR verified anything on the device (#1, #3, #8, #24).
- Headless Chromium treated a horizontal swipe as browser "back" and went to `about:blank`; disable `OverscrollHistoryNavigation` in the harness (#12).
- Button 4 was wired to Fantasy (#16), then reserved (#17), then to sleep clock (#24), and in all three it was never confirmed that the device sends `'4'` at all. Added a "Show button presses" debug log and a "Clock key check" note; long-press on the clock face and a Settings button are fallback triggers (#16, #17, #24).
- Dial Enter/wheel under the open Menu also toggled the highlighted game; ignore dial input while blurred (#3). Highlight must follow the row on reorder (#3).
- A 780 px column in 776 px of space clipped the timer panel; the reviewer flagged it as BLOCKING and screenshots confirmed the fix (#24).
- Burn-in: sleep clock layer shifts every 3 min within +-12/+-8 px (#24).

### USB and reconnect
- Car Thing shows "not found" after adb lists it `offline` or drops it; only unplug/replug worked. Watchdog runs `adb reconnect offline` or restarts the adb server (max once a minute, 3 in a row) only for a device seen this session; tunnel reset and browser restart after 60 s with no client, max once per 5 min (#7).
- Restarting adb also disconnects other adb users such as Android Studio (#7).
- If Windows USB selective suspend powers the port down, software cannot recover it; the power setting must change. Unconfirmed on the reporter's PC (#7).
- Older host that never replies to `tabs`, `display` or `clock` must not break the client: fall back to all tabs and old constants (#16, #20, #21).

### ESPN, Google, Sleeper, Open-Meteo schema drift
- Hand-built ESPN fixtures can mislead (`GS` vs `GSW` unknown); replace with real captures. The sandbox proxy 403s `site.api.espn.com` (#3). Real captures later matched every field read (#4, #10).
- One null competitor threw and dropped a whole league; non-string `shortDetail` could reach React as an object. Read ESPN fields as `unknown` and skip bad events; numeric ids accepted; invalid team key skips the game (#8, #9).
- ESPN's own label was `10/8 - 7:00 PM EDT`; build short labels on the host in local time with `timeFormat`, recomputed each send so they survive midnight (#4).
- Weekend NFL slate showed on a Thursday; filter to live plus +-12 h, and a stale "live" game falls back to the window so it stops holding polling at 30 s (#4).
- Sleeper answers an unknown username with `200 null` (#12). `/players/nfl` is 14.7 MB; slim to 623 KB and cache a day (#12).
- Sleeper projections `position[]` filter is loose (QB returns TEs, multi-position returns punters); query one position at a time and merge (#13). Sleeper totals do not deduct missed FGs, so derive `fgmiss` from `fgmiss_*` splits (#13, review).
- Sleeper `WAS` vs ESPN `WSH` is the only current team abbreviation difference; keep one `SLEEPER_TO_ESPN` table (#13).
- Stale Sleeper `OUT` hid live and final games (player list is up to 24 h old); apply `OUT` before kickoff, and after kickoff only while the player has 0 points (#13).
- A game ESPN dropped showed as Bye; require both ESPN no game and Sleeper no opponent (#13).
- A partial projections failure was cached for 15 min and backoff was shared across weeks; retry partials after 5 min and key by season and week (#13).
- Open-Meteo hour labels shifted across DST and bad responses showed "NaN"; format in the location's IANA timezone (fixed-offset fallback), reject malformed responses, tests cover Chicago DST and India +5:30 (#17).
- Invalid location from Settings wiped the saved one; throw and store nothing (#17).

### OAuth and network security
- Wrong-`state` `/callback` hit ended sign-in (local DoS). Return 400 and keep waiting, in both Google OAuth and MCP OAuth (#5 fix 38d1fcf, #22).
- `finish()` could run twice and the page said "connected" before token exchange; guard it and fix the wording (#5).
- Google refresh tokens expire in 7 days unless the OAuth app is published "In production"; document in SETUP.md (#8).
- JSON connector SSRF and DNS rebinding: resolve DNS once per hop, check addresses, pin the socket to the checked address; http only when every address is local; refuse link-local/reserved; unwrap IPv4-mapped, NAT64 and 6to4 before checking (NAT64/6to4 counted as public until review). Tailscale 100.64/10 counts as public by user decision (#21).
- Endpoint echoing request headers could send the secret to the device; `assertNoSecret` runs in both feed and Test (#21).
- Changing a connector's URL to a different host reused the stored secret; require re-entering the header value when origin changes (#21). Secret dropped on cross-origin redirect; https-to-http redirect refused (#21).
- Non-Latin-1 header value saved but could never be sent; reject at save (#21).
- Generic storage IPC must refuse `connectors`, `connectorSecret.*` and `mcpAuth.*.{tokens,client,verifier}`; IPC responses carry only header name and `headerSet` (#21, #22).
- HIGH: testing an edited MCP draft with a new server origin sent the saved token to that origin. Run such tests without auth and bind tokens to their origin; regression test that server B sees no Authorization (#22).
- A late refresh or sign-in write could restore auth after sign-out or delete; guard auth writes by connector revision and cancel active sign-ins on sign-out/delete (#22).
- A cross-origin 307/308 would resend the body (possibly a refresh token); refuse it, and drop Authorization/Cookie cross-origin (#22).
- DST at midnight gave wrong day start/end for `$host` args; tests for Santiago, Beirut, Havana (#22).
- Accepted risk: the SDK does not check the authorization server `issuer` (RFC 8414); mitigated by binding tokens to the server and resource used (#22).
- MCP safety: call only tools with `readOnlyHint === true` (list paged before each call), client declares no capabilities so servers cannot request sampling/elicitation (#22). Each sign-in re-registers via DCR because the loopback port changes (#22).

### Feed and state bugs
- In-flight fetch can publish after delete, edit, reset or refetch. Added `Feed.reset()` (#5), `Feed.refetch()` dropping in-flight results (#6), `Feed.dispose()` bumping a generation (#21).
- Revoked Google token left old data on screen as "stale" with no message; drop cached items from memory and `storage.json` and show a reconnect message. Disconnect or client change must clear todo as well as calendar (#6, #8).
- Optimistic star could flip the wrong way on a late or repeated message; send `on` flag for exact state (#3, #4). Optimistic tick stays pending, ignores polls until ack, keeps value until a poll agrees (#6).
- Pager rendered one frame with a stale index after visible tabs changed, sending extra feed requests; adjust the index during render (#20). Fast clicks in the Tabs panel lost changes; lock controls while saving (#20).
- Registry import cycle (registry, manifest, `time.ts`, `server.ts`, `handlers.ts`) only worked if `server` loaded first; build handlers lazily with `getHandlers()` (#20).
- Slider drag wrote and broadcast about 100 times per drag; debounce 150 ms and flush on unmount (#16).
- Dismissing a timer that rang during sleep left a black screen at raised brightness; dismissal also wakes (#24). Old desktop notification could dismiss a later timer; keep one notification, close on leaving ringing, ignore stale clicks (#24).
- Sleep widget showed data from a hidden app or an hour-old feed, and the calendar widget could show a past event before first time sync; only enabled widgets request feeds, hide after 30 min, skip until synced (#24).
- Tasks polling at 30 s is about 2,880 requests/user/day; fine for own Cloud project, could exceed a shared client's quota (#6).

### CI and release
- Creating a GitHub release also created its tag, firing two release runs (push and `release: created`) that raced on the same asset; the tabs.5 release lost its client zip and the install failed with a misleading "check your internet" error. Trigger only on tag push plus `concurrency` per ref (#14).
- The desktop app downloads the client zip matching its own version, so every device-visible change needs a version bump in both `package.json` and both lockfiles. Reviewers caught a missing bump in #16, #20, #22 and #11 needed tabs.4 because tabs.3 was already published (#11, #16, #20, #22).
- Release titles: push the tag and let the workflow name it; the in-app update check reads the tag, title is display only (#23).
- Packaged MCP SDK: main build is CommonJS with externals; verified `require` under `ELECTRON_RUN_AS_NODE` only, packaged-archive load unverified (#22).

### Agent process
- Two sessions built M4 in parallel (#8 and #9). tabs.3 was tagged right after #9 merged, so it shipped without #8's team colors; #11 merged #8's tree, kept #8's versions of overlapping work and replaced #8. Serialize milestone sessions or check open PRs first (#8, #9, #11).
- `npm run gate -- fast` skips builds, so a client type error in `FullscreenPlayer` survived to a coordinator screenshot check; run the full gate before PR (#24).
- Stale AGENTS.md and roadmap found by reviewers repeatedly (#16, #17, #20, #21, #22); Stop hook blocks once when code is newer than AGENTS.md; update in the same commit (#15).
- Token cost: setup and exploration were the main spend, so #15 added AGENTS.md, gate script (one line per check), preview harness, word limits per agent, SessionStart `npm ci`. Savings unmeasured (#15).
- Subagent output was checked by the coordinator, not trusted: coordinator re-ran the workflow's gate ("my own rerun matched"), fixed lint/styling from screenshots, and found 3 post-review defects in M10 (#21, #22, #24). No PR records a subagent falsely claiming tests passed; #5 had no reviewer agent run (self-review) and #2 left client checks unrun.
- Gate failures along the way each passed on rerun after a real fix (missing `setupGuideUrl` type, fixture colors) (#8).
- Two Sonnet calls died on an API rate limit before writing anything; rerun on same tier, not counted as an escalation (#22).
- Workflow registry was loaded before `add-connector.js` existed, so dry runs used `scriptPath`; first dry run failed host lint (`no-explicit-any`), so the workflow's Write phase must leave eslint and tsc clean (#22).
- Review was sometimes relayed from the user's other session (#13).

## Decisions (ADR-style)

- Host owns all network calls (ESPN, Google, Sleeper, Open-Meteo, connectors, MCP); the device only talks websocket to the host and gets host-formatted labels, which keeps secrets and DST/timezone logic off Chrome 69 (#1, #5, #17, #21).
- Feed pattern with last-good cache and stale flag, rather than clearing on failure; except privacy-sensitive data (revoked Google) which is dropped (#1, #8).
- Google OAuth via PKCE on a one-shot 127.0.0.1 loopback; client ID/secret from Settings or build-time env; refresh token and secret in secure storage (#5).
- Fork portability through `GT_REPO`/`package.json` `repository`, appId `com.glancething.tabs`, versions `0.0.16-tabs.N` released by tag (#1).
- Host-owned timer that survives tab switches, sleep and reconnects, with the client counting down locally from `remainingMs` (#24).
- Idempotent `on` flag for favorite stars instead of pure toggles (#4).
- Tab-level modules with one registry on each side, same ids; hidden apps stop polling unless a visible app depends on them (Fantasy depends on Sports) (#20).
- Generic device layouts (list, big number, key-value, grid) so connectors need no client release; the MCP tab id prefix needed one client release (#21, #22).
- No LLM at runtime: MCP connectors run committed read-only JSON recipes; an offline workflow with an LLM authors recipes (#19, #22).
- Read-only MCP tools only, enforced by `readOnlyHint === true` on every call (#22).
- All user-supplied URL fetches go through one pinned-address, per-hop checked safeFetch/hop layer; Tailscale range treated as public (#21, #22).
- Cascading inference: coordinator on Opus 5.5; subagents start on the cheapest sufficient tier (Haiku lookups/commands/screenshots, Sonnet implementation/tests/docs, Opus planning/review/security); escalate one tier for one call after two failures on a step; planner and reviewer never below Opus (#19).
- AGENTS.md as the single shared memory, updated in the same commit as any change that makes it wrong, enforced by a Stop hook (#15).
- Unofficial Sleeper projections endpoint accepted, adapter never throws and hides the Est. column on failure (#13).
- Release builds run once per tag push; releases auto-titled `GlanceThing_v0.NN` (#14, #23).
- Button macros, if any, must be long-presses because all four short presses are taken (#18).

## Model escalations

- None occurred in any PR body. #20, #21, #22 and #24 each state "None" (#20, #21, #22, #24).
- #19 defines the policy (one tier up, per call, after two failures on a step; listed in the PR body); #22 also builds this rule into `add-connector.js` (Write step Sonnet to Opus after two failures) but it never fired.
- Not escalations: two Sonnet API rate-limit deaths (steps 7 and 11) in #22, and a workflow bug in the first dry run (#22).
- PRs before #19 (#1-#18) have no escalation section.
- Planned-Opus starts, not escalations: M9B fetch/store/IPC and security fixes (#21), M9C safeFetch/OAuth/runner/guard (#22).

## Open items

- Everything on the Car Thing is unverified: Chrome 69 rendering, touch, dial, buttons, performance, colors (#1, #3, #8, #16, #17, #20-#22, #24).
- Button 4 key value never confirmed on device; fallbacks exist (#16, #17, #24).
- Live ESPN, Google Calendar/Tasks, Sleeper, Open-Meteo, real MCP servers never called by the PR authors' tests (#3, #5, #6, #12, #13, #17, #22).
- Real Google consent/token/revocation and `safeStorage`/keyring on real OSes (#5, #21, #22).
- Electron app end-to-end never run: IPC, Settings UIs, notifications, packaged MCP SDK (#1, #8, #17, #22, #24).
- Release workflow runs not observed for tabs.3 and tabs.4 (#8, #11), post-#14 workflow (#14), and naming job (#23). Unsigned-build wording, Google console menu names, relative Releases link in SETUP.md untested (#8).
- Windows USB selective suspend may defeat the reconnect fix; adb commands never run live (#7).
- Sports: cached games stay shown (stale) while a league keeps failing; pre games past start poll at 30 s (#3). Stars reorder only on host push (#3).
- Timed event that started yesterday shows yesterday's start under Today; changing OAuth client does not revoke the old refresh token (#5).
- Subtasks are not indented (Task has no parent field) (#6). Shared-client Tasks quota risk (#6).
- Sleeper: OUT/Inactive can lag up to 24 h; projections timeout can delay a refresh up to 15 s once per 5 min; unknown whether matchup `players` includes IR; fixture scoring_settings hand-written; ESPN week rollover unobserved (#12, #13).
- JSON connectors: `.local` mDNS resolution, SNI/cert checks with a pinned socket, corporate proxies ignored (#21).
- MCP: whether real providers accept a manual client ID with a random loopback port; DCR re-registers each sign-in; SDK skips issuer check (accepted); example recipe URL `127.0.0.1:8931` has no listener outside tests (#22).
- Clock: older clients told to sleep on `clock` show a blank screensaver; once-a-second tick CPU on the device; notification sound/Focus Assist/DND on Win/macOS (#24).
- Reviewer nits left unchanged: no test for `DisplayContext` message filter; slider initial state hardcodes 25/45 (#16). Feed start order follows registry order (#20). Client has no test harness for optimistic star logic or `useLongPress` (#3).
- Hooks (Stop, SessionStart) and the token savings from #15 not yet confirmed (#15).
- Roadmap remaining after M10: Notifications (item 5), Gmail (item 6, try as MCP recipe first) (#18, #19).
