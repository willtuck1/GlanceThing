# GlanceThing fork: Calendar / To-do / Sports / Spotify tabs

## Context
You want your jailbroken Car Thing to show glanceable personal data instead of just Spotify controls. GlanceThing v0.0.16 (BluDood/GlanceThing) has **no plugin API**: client widgets are hardcoded in `client/src/components/Widgets/Widgets.tsx` and host handlers are a static array in `src/main/lib/handlers/handlers.ts`. So this is a **fork** touching both halves. Decisions taken: Google Tasks for to-dos, Google Calendar only, the original Spotify home kept as a **4th tab**, GitHub fork that is **portable to any GitHub owner** (no hardcoded `BluDood/...`).

**Execution model (changed on your call):** nothing is built on this PC. Cloud agents write the code on the GitHub fork, GitHub Actions builds it, and the result is a **downloadable release** you can send to anyone. They install it, connect their own Google account and run it. No build tools, no clone.

## How the work runs
- **One local step:** create the fork on GitHub (`gh repo fork BluDood/GlanceThing --clone=false`, or the Fork button). The cloud environment must have access to that repo.
- **One cloud session per milestone**, started by you at claude.ai/code with the fork selected (every session there already runs in the cloud). Each one works on branch `milestone/<n>-<name>` and runs lint, `tsc`, vitest and both builds in the cloud. Each opens a **draft PR** and reports back. You review and merge, then you start the next milestone's session. M1 (Sports) and M2 (OAuth + Calendar) touch separate files, so they can run in parallel once M0 is merged, but running them one at a time is simpler.
- **Cloud agents can't reach the Car Thing.** Anything that needs the device (the M4 device check) is a checklist for you or the recipient to run.
- **Cloud sandboxes may block outside sites** (ESPN, Google APIs, browser downloads). All cloud tests must use recorded fixtures and mocked HTTP, never live calls. Live ESPN and Google checks happen later on a real machine. Anything the agent could not test is listed as "not verified" in the PR.
- **Distribution:** pushing a tag `v0.0.16-tabs.N` runs the release workflow on the fork. It publishes the Windows installer, the macOS `.dmg` and `glancething-client-v<ver>.zip` to that repo's Releases page. You send the Releases link plus `docs/SETUP.md`. The installed app downloads the client zip from the same repo, because the slug is baked in at build time (see M0).
- **Each recipient uses their own Google login.** No tokens or client secrets ship in the build. The app's Settings page takes a Google OAuth client ID and secret. The setup guide walks a recipient through creating them in about 5 minutes. Optionally you can supply a client ID at build time (`GOOGLE_CLIENT_ID` repo secret) so recipients just click "Connect". That shared client is capped at 100 users while unverified, and you'd have to add each recipient as a test user or publish the app.

## Repo facts the design rests on
- **Host** (Electron, `src/main/`): `ws` server in `lib/server.ts` routes `{type, action, data}` to handler modules (`handlers/*.ts`, pattern: `name`, `hasActions`, `actions[]`, `handle(ws, data)`). Background jobs use setup handlers (`lib/setup/setup.ts`, `SetupFunction → CleanupFunction`). Secrets: `setStorageValue(k, v, secure=true)` (Electron `safeStorage`) in `lib/storage.ts`, as Spotify's refresh token already is.
- **Client** (`client/`, React 19 + Vite, `@vitejs/plugin-legacy` → **Chrome 69**): connects to `ws://localhost:1337` (adb reverse), auth via `./ws-password`. `SocketContext` exposes `{ready, socket}`; components add their own `message` listeners (see `Apps.tsx`, `Statusbar.tsx`).
- **Display 800×480 landscape** (not 480×800). Inputs arrive as DOM events: buttons 1/2/3 → keys `'1'..'3'`, M → `'m'` (system menu), Back → `Escape` (fullscreen player), dial turn → `wheel` deltaX, dial press → `Enter`.
- **Deploy**: ThingFlash only flashes firmware once (Thing Labs 8.9.2). The desktop app pushes the client with adb (`lib/adb.ts → installApp`). It uses local `client/dist` only in dev mode (`webapp.ts → getWebAppDir`), else downloads `glancething-client-v{version}.zip` from the **hardcoded BluDood release URL**; `lib/update.ts` also hardcodes BluDood.
- Device clock/timezone is unreliable — upstream sends preformatted time from the host (`handlers/time.ts`). We do the same for event/game times.
- Chrome 69 limits: no flexbox `gap` (use margins), no `aspect-ratio`, no `:is()`. Legacy plugin handles JS syntax.

## Architecture

```
 Google Calendar API ─┐                         ┌──────────── Car Thing (Chrome 69) ─────────────┐
 Google Tasks API ────┼─► HOST (Electron fork)  │  TabPager (swipe / buttons 1-3)                 │
 ESPN scoreboard ─────┘   lib/feeds/Feed.ts      │  [Calendar] [To-do] [Sports] [Spotify home]     │
   (HTTPS, tokens         poll + cache + stale   │      ▲ useFeed('calendar'|'todo'|'sports')      │
    in safeStorage)       storage.json cache     │      │ optimistic toggle / favorite             │
                          handlers/{calendar,    │      │                                          │
                           todo,sports}.ts  ◄────┼── ws://localhost:1337 (adb reverse) ───────────┘
                          broadcast() to clients │
 Desktop renderer: Settings → "Google account" (OAuth loopback+PKCE), calendars picker
```

- **Host owns everything networked.** Device never sees tokens or the internet.
- **Feed abstraction** (`src/main/lib/feeds/Feed.ts`, new): `{key, fetch(), interval(lastData) → ms}`; keeps `{data, fetchedAt, error}`; persists last good data (non-secure storage key `feedCache.<key>`) so a host restart still has something; computes `stale = lastFetchFailed || now − fetchedAt > 2×interval`. Pushes `{type:key, data:{items, fetchedAt, fetchedAtLabel, stale, error}}` to all clients via a new `broadcast()` helper in `server.ts` (iterates `wss.clients` where `authenticated`). Feeds start in a new setup handler `lib/setup/feeds.ts`; on-demand refresh when the client sends `{type:key}` (tab focus) — rate-limited to 1 per 15 s.
- **Client** keeps last payload in React state; if socket drops, the tab keeps showing data with the stale badge (`ready === false` ⇒ stale). No reliance on device localStorage.

### Message protocol (new types)
| type | action | dir | data |
|---|---|---|---|
| `calendar` | — | c→h request / h→c push | `{items: Event[], …feedMeta}` |
| `todo` | — | both | `{items: Task[], …feedMeta}` |
| `todo` | `toggle` | c→h | `{reqId, listId, id, done}` |
| `todo` | `ack` | h→c | `{reqId, ok, task?}` → client clears pending or rolls back |
| `sports` | — | both | `{items: Game[], favorites: string[], …feedMeta}` |
| `sports` | `favorite` | c→h | `{teamKey, on?}` (`nba:BOS`) → host sets `on` (toggles if absent), persists, rebroadcasts |

Event: `{id, title, allDay, startLabel, endLabel, dayLabel, location?, calendarColor}` (labels formatted on host with the user's `timeFormat`). Game: `{id, league, home/away:{key, abbr, name, score, logo?}, state:'pre'|'in'|'post', detail}` (`detail` = ESPN `status.type.shortDetail`, e.g. "Q3 4:12", "Final", "7:30 PM").

## Milestones

### M0 — Fork, portability, scaffold (no features yet)
- Runs as a cloud agent on the fork; branch `milestone/0-scaffold`.
- **Portability**: one source of truth for the repo slug — `package.json` `"repository"` field read at build time, overridable by env `GT_REPO=owner/name`; injected via `electron.vite.config.ts` `define` as `__GT_REPO__`. Use it in `lib/webapp.ts` (client zip URL) and `lib/update.ts` (latest release). `electron-builder.yml`: `publish` owner/repo and `appId` from `${env.GT_OWNER}`-style macros with defaults; `appId` changed (e.g. `com.glancething.tabs`) so it installs beside upstream. Version `0.0.16-tabs.1` for both packages. `.env.example` documents `GT_REPO`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. No absolute paths, no personal IDs committed.
- **Client scaffold**: `client/src/components/TabPager/TabPager.tsx` (+ module.css): four pages side by side, `transform: translateX`, own touch handling (axis lock after 10 px, snap at 25% width or velocity), dots indicator. Page order: Calendar, To-do, Sports, Spotify. Buttons 1/2/3 jump to tabs 1–3; swipe reaches Spotify. Remove the `1/2/3` focus listener from `Widgets.tsx` (it moves into the pager; on the Spotify tab, the dial focuses widgets as before via tap). Dial: on list tabs, wheel moves a highlight / scrolls; `Enter` activates the highlighted row. `App.tsx` renders `<Statusbar/><TabPager/>` with `Widgets` as page 4; Menu, FullscreenPlayer, Loading/Update screens unchanged.
- Shared client pieces: `hooks/useFeed.ts` (subscribe to a `type`, request on mount and when tab becomes active, returns `{items, stale, fetchedAtLabel, error}`), `components/StaleBadge`, `components/ListRow` (≥ 64 px rows, dark theme from `index.css`).
- Host: `lib/feeds/Feed.ts`, `broadcast()` in `server.ts`, `lib/setup/feeds.ts` registered in `setup/setup.ts`; stub `calendar/todo/sports` handlers added to `handlers.ts` returning fixture data.
- **Done when**: CI passes on the PR, and the agent's headless-Chrome screenshots at 800×480 show the four tabs with fixture data. The screenshots go in the PR description. If the sandbox can't install a headless browser, the agent says so in the PR and lists the screenshots as "not verified" instead of skipping silently.
- **Release workflow first:** `build-release.yml` must publish to `github.repository`, not BluDood. Every milestone after M0 can then be tagged and downloaded for a test.

### M1 — Sports (no auth, proves the pipeline)
- `src/main/lib/sports/espn.ts`: GET `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard` and `.../football/nfl/scoreboard` (axios, already a dep), normalize to `Game`. Both leagues fetched in parallel; one failing marks only its games stale.
- Interval: 30 s if any game `state==='in'` or one starts within 10 min; else 5 min.
- Favorites: storage key `sportsFavorites` (array of `league:ABBR`); tap a team (or long-press the row) toggles; sort = games with a favorite first, then live, upcoming by start, finals.
- `client/src/components/tabs/Sports/Sports.tsx`: vertical scroll list, league chip, ★ on favorites, scores large.
- Pure functions (normalize, sort, interval) unit-tested with **vitest** (dev-only dep on host). Tests use a saved sample of ESPN scoreboard JSON committed under a fixtures folder, not live requests.

### M2 — Google OAuth + Calendar
- `src/main/lib/google/auth.ts`: Desktop-type OAuth client from **your own** Google Cloud project; loopback redirect on `127.0.0.1:<random port>` + PKCE, opened with `shell.openExternal`; scopes `calendar.readonly` and `tasks`. Refresh token stored `secure=true`; access token refreshed on 401 (same axios-interceptor pattern as `playback/spotify.ts`). Client ID/secret entered in Settings or read from env.
- Desktop renderer: `pages/Settings` gains a "Google account" section (connect/disconnect, calendar checkboxes from `calendarList`), IPC through `src/preload/index.ts` like the existing settings calls.
- `src/main/lib/google/calendar.ts`: events from each selected calendar, `timeMin=now`, `timeMax=now+7d`, `singleEvents=true`, `orderBy=startTime`; merge and sort; host formats labels. Poll 5 min + on tab focus.
- `tabs/Calendar/Calendar.tsx`: grouped by day ("Today", "Tomorrow", "Thu 9 Oct"), all-day events pinned at top of each day, location as a second line.

### M3 — To-do (two-way Google Tasks)
- `src/main/lib/google/tasks.ts`: list task lists (default list, others selectable in Settings), tasks with `showCompleted=true&showHidden=true`; PATCH `status: completed | needsAction`. Poll 30 s, so desktop changes show on the device within about 30 s. Device toggles reach Google immediately and appear in Google's web UI and apps.
- Toggle flow: client flips the row instantly and marks it pending → host PATCHes → `ack ok` (host also refreshes and rebroadcasts) or `ack !ok` → client reverts row and flashes an error. Pending rows ignore incoming polls until acked (avoids flicker). 10 s client timeout ⇒ rollback. Last-write-wins against desktop edits.
- `tabs/Todo/Todo.tsx`: open tasks first, completed collapsed below (strikethrough), due date label from host.

### M4 — Polish + deploy
- Offline paths: host offline, Google 5xx, token revoked (tab shows "Reconnect Google in the desktop app"), ESPN schema drift (normalizer drops bad events, never crashes).
- Perf on device: no animation libs, `will-change: transform` only on the pager track, lists capped (sports ≤ 40 games, calendar ≤ 60 events), avoid re-rendering hidden tabs on every push (memo per tab).
- **Recipient-ready release:** an unsigned-build note in SETUP.md, since the Windows SmartScreen and macOS Gatekeeper warnings will show. The first launch opens the Setup wizard, which already handles flash → install. An in-app "Google not configured" screen links to the guide.
- Tag `v0.0.16-tabs.3` (tabs.1 and tabs.2 already exist) and confirm the Release page has the installer and client zip.
- **Device check (human):** a checklist in SETUP.md, run by you or a recipient.

## Setup guide (the fork's `docs/SETUP.md`, written for a recipient with no dev tools)
1. **Flash** (once): ThingFlash → Thing Labs 8.9.2 image.
2. **Install**: download the installer from the fork's Releases page and run it. The Setup wizard finds the Car Thing and installs the client over USB (adb is bundled or downloaded automatically).
3. **Google Cloud** (skip if a shared client ID was built in): create a project → enable the Calendar API and the Tasks API → OAuth consent screen (External, add yourself) → **publish it "In production"**, otherwise refresh tokens expire after 7 days (the unverified-app warning is fine for personal use) → Credentials → OAuth client ID, type **Desktop app** → paste the ID and secret into Settings.
4. **Connect Google** in Settings, then pick calendars and a task list.
5. **Device checklist**: swipe all four tabs, buttons 1–3, dial scroll and click, Back opens the player, M opens the menu, tick a task, star a team, unplug the PC's network to see the stale badge.
6. **Republishing under another GitHub account**: fork the fork. Set the `GT_REPO` repo variable if the name differs (the workflow defaults to `github.repository`). Optionally add the `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` secrets. Push a tag `v0.0.16-tabs.N`, and Actions publishes the installer and client zip to that account's Releases.
7. **Developer loop** (optional, for contributors): `npm ci` in root and `client/`, then `npm run dev` with Developer mode on (it uses local `client/dist`), and `client/scripts/build_push.ps1` for fast pushes.

## Verification
- **In the cloud, per PR:** CI runs `npm run lint`, `tsc` in both packages, `npx vitest run`, and `client` + host builds. The agent also loads the built client in headless Chrome at 800×480 against a stub WebSocket server serving fixtures, and attaches screenshots for swipe, keys 1–3, and wheel/Enter.
- **Release:** the tag build succeeds, and the Release page lists the installer + `glancething-client-v<ver>.zip`; the installed app's `webapp.ts` URL resolves to that zip.
- **On a real machine + device (you or a recipient):**
- Sports: compare a live game with espn.com; kill the network adapter, so the badge turns stale and cached scores stay.
- Calendar: create an event in Google Calendar on the desktop, which appears within 5 min or on tab focus.
- To-do: tick on the device, which flips in Google Tasks web; tick on the web, which flips on the device within about 30 s; revoke the token, then tick, which rolls back with an error.
- Device: install from the downloaded release, then run the SETUP.md checklist.

Each milestone ends in a draft PR for you to review and merge. You start the next milestone's session only after the merge.
