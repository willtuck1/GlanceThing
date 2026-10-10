# Client preview

Screenshots of the Car Thing client at 800×480 with fake data, without Electron or a device.

```
npm --prefix client run build
node scripts/preview/server.mjs [payloadDir] &   # default: scripts/preview/payloads
node scripts/preview/shoot.mjs <outDir> weather calendar=3 sports=2,2,2 fantasy=2,2,2,2,swipeL
```

- `server.mjs` serves `client/dist` and answers each feed request (`{type}`) with `<payloadDir>/<type>.json`. Files are reread on every request, so edit them between shots. A missing file means no data for that feed.
- Payload shapes are in `client/src/modules/<id>/types.ts`. Copy a file from `payloads/` and change what the shot needs, e.g. `"stale": true` or `"error": "..."`.
- `shoot.mjs` takes `name=keys`. Keys: `1`–`4`, `Enter`, `Escape`, `m`, `swipeL`, `swipeR`, `wheel`, `wheelUp`. It uses the globally installed Playwright and Chromium in cloud sessions.
- Stop the server with `pkill -f "node scripts/preview/[s]erver"` (the brackets stop pkill matching its own shell).
- Tabs in order: Weather, Calendar, To-do, Sports, Fantasy, Spotify; the client starts on Weather. Keys `1` = previous tab, `2` = next tab (wraps), `3` = Calendar, `4` = nothing. Reach a tab by pressing `2` from Weather (To-do = `2,2`, Sports = `2,2,2`), or `3` for Calendar. A bare `name` with no `=keys` shoots the first tab.
- Variants: `VARIANT_<type>=<name>` when starting the server serves `<type>.<name>.json` instead of `<type>.json`. Weather has `weather.json` (imperial, Chicago), `weather.metric.json` and `weather.none.json` (no location), e.g. `VARIANT_weather=metric node scripts/preview/server.mjs &`. Restart the server to change variant.
- Tab settings: with no `tabs.json` and no variant the server never answers `{type:'tabs'}` (old-host path, all tabs shown). `VARIANT_tabs=reordered` (`tabs.reordered.json`) puts Sports first; `VARIANT_tabs=hidden` (`tabs.hidden.json`) hides Calendar and To-do.
- Connector tabs (M9B): `VARIANT_tabs=connectors` (`tabs.connectors.json`) adds four connector tabs after Spotify, indices 6–9: `json:list0001` (Sensors, list), `json:numb0001` (Power, number), `json:keyv0001` (Server, keyvalue), `json:grid0001` (Rooms, grid). Reach them from Weather with `2` six to nine times. A `json:<id>` feed is read from `json-<id>.json` (colon becomes hyphen on disk).
- MCP example: `VARIANT_tabs=mcp` (`tabs.mcp.json`) adds the example MCP tab `mcp:exmp0001` at index 6, read from `mcp-exmp0001.json` (`mcp:` ids use hyphens on disk too).
- Connector error/stale: `json-list0001.error.json` (stale, error "Public hosts must use https", no items). Start it with `env "VARIANT_json-list0001=error" VARIANT_tabs=connectors node scripts/preview/server.mjs &`. Bash cannot set a hyphenated variable with a plain `VAR=` prefix, so use `env`.

## Settings screenshots

Screenshots of the desktop Settings → Connectors panel without Electron: `node scripts/preview/settings.mjs <state> [<state>...]` builds the renderer (`npx electron-vite build`), serves `out/renderer` on 127.0.0.1 and shoots it in Chromium with a stub `window.api`. Output: `docs/m9c-screenshots/settings-<state>.png`.

- A state is `scripts/preview/settings-states/<state>.json`: `connectors` (listConnectors), `mcpRecipes` (listMcpRecipes), `signInError` (mcpSignIn resolves `{error}`), `api` (`{method: value}` for any other call), `clicks` (button text to click after Settings → Connectors opens, or `{"select": "<recipe id>"}`), `css` (extra CSS, e.g. a taller Settings box). Any method not defined resolves `null`; add it to `api` if the renderer needs more. Never put real secrets in a state.
- States: `mcp-list` (JSON row + four MCP rows, every auth state), `mcp-form` (add form, example recipe chosen), `mcp-expired` (expired row after a failed Sign in).
