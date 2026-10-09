# GlanceThing fork

Electron host (`src/main`, `src/preload`, `src/renderer`) that pushes data over a websocket to a React client (`client/`) running on a Car Thing: **Chrome 69, 800×480 landscape**. Tabs, in order: Weather, Calendar, To-do, Sports, Fantasy, Spotify. Current release line: `v0.0.16-tabs.N` (see `package.json`; M7 is tabs.6).

## Where things are
- Host ws server: `src/main/lib/server.ts` routes `{type, action, data}` to `src/main/lib/handlers/*.ts` (`name`, `hasActions`, `actions`, `handle(ws, data)`).
- Feeds (poll + cache + stale): `src/main/lib/feeds/Feed.ts`, wired in `src/main/lib/setup/feeds.ts`. Data sources: `lib/google/` (Calendar, Tasks; OAuth in `google/oauth.ts`), `lib/sports/` (ESPN), `lib/fantasy/` (Sleeper, including projections and game status). Each has a `fixtures/` folder.
- Client tabs: `client/src/components/tabs/<Tab>/` (Weather: `view.ts` helpers, inline SVG `icons.tsx`, shows host labels only), registered in `client/src/App.tsx`. Pager: `client/src/components/TabPager/TabPager.tsx`; button keys → tab index in `TabPager/keys.ts` (`keyToIndex(key, current, pageKeys)`). Data: `client/src/hooks/useFeed.ts`. Payload types: `client/src/types/Feeds.ts`. Row colors: `client/src/lib/tint.ts` (each sports row takes one team color: the favorite's if exactly one team is a favorite, else the away team's, else none).
- Weather (M8): `src/main/lib/weather/` (`openMeteo.ts` fetch + geocode via the sports `getJson`, `logic.ts` builds `WeatherView` with times in the location's IANA timezone (Intl; fixed UTC offset only as fallback), validates the response (throws `Unexpected Open-Meteo response` so the feed goes stale), `precipLabel` is today's precipitation total in the chosen units, `settings.ts` keys `weatherLocation`/`weatherUnits` (invalid location/units throw; `location: null` clears), `service.ts` feed fetcher + `applyWeatherSettings`). Feed `weather` polls every 15 min (no location → a `kind:'none'` view, not an error); handler `handlers/weather.ts`. IPC `searchWeatherLocations`/`getWeatherSettings`/`setWeatherSettings`; a settings change resets the feed cache, refetches and broadcasts. Never log coordinates.
- Sleep screen: `client/src/components/Screensaver/`. Long-press helper: `client/src/hooks/useLongPress.ts`.
- Display settings (`sportsTintOpacity`, `calendarTintOpacity`, 0–100, defaults 25/45): `src/main/lib/display.ts`. The client sends `{type:'display'}` and gets `{type:'display', data}`; the host rebroadcasts it when Settings changes a value (IPC `getDisplaySettings`/`setDisplaySettings`). Client side: `client/src/contexts/DisplayContext.tsx` and `client/src/lib/display.ts` (percent → alpha, falls back to the `tint.ts` constants). Sliders: Settings → Client tab.
- Desktop settings UI: `src/renderer/src/pages/Settings/Settings.tsx` (Weather tab: city search via Open-Meteo geocoding through the host, units toggle, clear location).
- Client self-update: on connect the client asks for `version` and sends `update` if it differs from its own, and the host reinstalls it (`handlers/version.ts`, `handlers/update.ts`).
- Device inputs arrive as DOM events: buttons `'1'` (previous tab) and `'2'` (next tab), both wrapping, `'3'` (jump to Calendar), `'4'` (does nothing; reserved for sleep-to-clock, roadmap item 5; unverified that it reaches the client), M → `'m'`, Back → `Escape`, dial → `wheel`, dial press → `Enter`.
- `claude_plan.md` is the original M0–M4 spec, all done. Read only the section you need. Don't read `docs/m*-screenshots/`.

## Rules
- Client must run on Chrome 69: no flexbox `gap`, `aspect-ratio` or `:is()`. The legacy Vite plugin handles JS syntax, not new browser APIs.
- The host owns all network calls. The device never sees tokens. Secrets go through `setStorageValue(key, value, true)`.
- The device clock is unreliable: send preformatted times from the host.
- The Car Thing has no speaker. Alerts on the device are visual; sound has to come from the desktop.
- Tests use committed fixtures and mocked HTTP, never live calls.
- Releases: bump `version` in `package.json` and `client/package.json` (and both lockfiles) to the next `0.0.16-tabs.N` in the milestone PR. Tag `v0.0.16-tabs.N`, or create the release on GitHub, after merging. A release marked as a pre-release is invisible to the in-app update check and the "latest" link.

## Commands
- `npm run gate`: every CI check, printing one line each (plus the tail of any failure). `npm run gate -- fast` skips the two builds; use it between steps.
- Single test file: `npx vitest run <path>`.
- Screenshots of the client at 800×480 with fake data: see `scripts/preview/README.md`. Tab indices start at Weather (0). `VARIANT_<type>=<name>` serves `payloads/<type>.<name>.json` (weather: `metric`, `none`).

## Roadmap (planned, not built)
In this order. Effort is relative to M5/M6.
Item 1, **Polish**, is done (M7: one team color per sports row, opacity sliders).

2. **Weather tab** (≈ M1): Open-Meteo (no key), hourly temperature and precipitation, sunrise and sunset, location set in Settings.
3. **Clock tab with timer, plus button macros** (small–medium): timer alerts are visual only. Prefer long-press over double-tap, because double-tap delays every single press by about 300 ms.
4. **Notifications** (medium–large): the host compares each update to the last one against rules (close game, final, fantasy swings, upcoming event), then sends a `notify` message that the client shows over any tab or the sleep screen. Per-type toggles in Settings. Optional desktop notification for sound.
5. **Sleep screen clock with widgets** (medium): uses the existing feeds plus weather.
6. **Gmail tab** (medium–large): needs the restricted `gmail.readonly` scope. Every user has to sign in to Google again, and logins from an OAuth client in test mode expire every 7 days. "Important" means `is:important is:unread`. Build after Notifications.

## Keeping this file current (required)
This file is the shared memory for every agent and session. Whenever a change makes anything here wrong or incomplete, update this file in the same commit:
- new or moved files, tabs, feeds, handlers or message types
- new rules, gotchas or device facts learned (including from device testing)
- commands or scripts
- roadmap items started, finished, changed or dropped

Keep it short: facts and pointers, no history. If nothing here changed, say "AGENTS.md: no update needed" in the PR body. A Stop hook in Claude Code checks this (see `CLAUDE.md`).
