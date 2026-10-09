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
