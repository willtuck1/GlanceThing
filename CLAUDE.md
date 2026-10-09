# GlanceThing fork

Electron host (`src/main`, `src/preload`, `src/renderer`) that pushes data over a websocket to a React client (`client/`) running on a Car Thing: **Chrome 69, 800×480 landscape**. Tabs, in order: Calendar, To-do, Sports, Fantasy, Spotify.

## Where things are
- Host ws server: `src/main/lib/server.ts` routes `{type, action, data}` to `src/main/lib/handlers/*.ts` (`name`, `hasActions`, `actions`, `handle(ws, data)`).
- Feeds (poll + cache + stale): `src/main/lib/feeds/Feed.ts`, wired in `src/main/lib/setup/feeds.ts`. Data sources: `lib/google/` (Calendar, Tasks), `lib/sports/` (ESPN), `lib/fantasy/` (Sleeper). Each has a `fixtures/` folder.
- Client tabs: `client/src/components/tabs/<Tab>/`, pager and button keys in `client/src/components/TabPager/TabPager.tsx`, data via `client/src/hooks/useFeed.ts`.
- Desktop settings UI: `src/renderer/src/pages/Settings/Settings.tsx`.
- Device inputs arrive as DOM events: buttons `'1'`–`'4'`, M → `'m'`, Back → `Escape`, dial → `wheel`, dial press → `Enter`.
- `claude_plan.md` is the original M0–M4 spec, all done. Read only the section you need. Don't read `docs/m*-screenshots/`.

## Rules
- Client must run on Chrome 69: no flexbox `gap`, `aspect-ratio` or `:is()`. The legacy Vite plugin handles JS syntax, not new browser APIs.
- The host owns all network calls. The device never sees tokens. Secrets go through `setStorageValue(key, value, true)`.
- The device clock is unreliable: send preformatted times from the host.
- Tests use committed fixtures and mocked HTTP, never live calls.
- Releases: bump `version` in `package.json` and `client/package.json` (and both lockfiles) to `0.0.16-tabs.N` before tagging `v0.0.16-tabs.N`. The client updates itself when its version differs from the host's.

## Commands
- `npm run gate`: every CI check, printing one line each (plus the tail of any failure). `npm run gate -- fast` skips the two builds; use it between steps.
- Single test file: `npx vitest run <path>`.
- Screenshots of the client at 800×480 with fake data: see `scripts/preview/README.md`.
