# Client preview

Screenshots of the Car Thing client at 800×480 with fake data, without Electron or a device.

```
npm --prefix client run build
node scripts/preview/server.mjs [payloadDir] &   # default: scripts/preview/payloads
node scripts/preview/shoot.mjs <outDir> sports=3 fantasy=3,swipeL bench=3,swipeL,wheel,Enter
```

- `server.mjs` serves `client/dist` and answers each feed request (`{type}`) with `<payloadDir>/<type>.json`. Files are reread on every request, so edit them between shots. A missing file means no data for that feed.
- Payload shapes are in `client/src/types/Feeds.ts`. Copy a file from `payloads/` and change what the shot needs, e.g. `"stale": true` or `"error": "..."`.
- `shoot.mjs` takes `name=keys`. Keys: `1`–`4`, `Enter`, `Escape`, `m`, `swipeL`, `swipeR`, `wheel`, `wheelUp`. It uses the globally installed Playwright and Chromium in cloud sessions.
- Stop the server with `pkill -f "node scripts/preview/[s]erver"` (the brackets stop pkill matching its own shell).
