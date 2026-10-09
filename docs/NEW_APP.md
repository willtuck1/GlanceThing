# Adding an app module

A module is one host folder, one client folder and one line in each registry, all with the same id. Ids are lowercase. `json:<id>` and `mcp:<id>` are reserved for connectors (later milestones). Never name anything "apps"; `src/main/lib/handlers/apps.ts` is desktop shortcuts.

## Host

1. Put the data source in `src/main/lib/<source>/` with a `fixtures/` folder and tests. Tests use mocked HTTP and committed fixtures, never live calls.
   - The host owns all network calls. The device never sees tokens; store secrets with `setStorageValue(key, value, true)`.
   - The device clock is unreliable, so send preformatted times (labels) in the payload.
2. Add the feed key to the `FeedKey` union in `src/main/lib/feeds/types.ts`.
3. Write the handler in `src/main/lib/modules/<id>/handler.ts`. Copy `src/main/lib/modules/weather/handler.ts`: export `name`, `hasActions`, and `handle`, which calls `respondWithFeed(key, ws)`. Handler names must be unique across all modules.
4. Write the manifest in `src/main/lib/modules/<id>/index.ts` (see `weather/index.ts`), typed `ModuleManifest` from `src/main/lib/modules/types.ts`:
   - `id`, `label`
   - `feeds()`: returns `FeedSource[]`, each with `key`, `fetch`, `interval(items)` (ms), `describeError` (`describeFetchError(e, 'Name')` from `feeds/errors.ts`), and optional `decorate` and `prepare`
   - `feedKeys`: the same keys, in the same order, as `feeds()` returns
   - `handlers`: `[handler]`
   - `dependsOn`: ids of modules whose feeds must keep running while this one is visible (optional)
   - `settings`: `{ panel }` if the app has a Settings panel (optional)
5. Add `import { manifest as <id> }` and one entry to `modules` in `src/main/lib/modules/registry.ts`. Array order is the default tab order.

## Client

1. Create `client/src/modules/<id>/` with the tab component, `types.ts` (payload types) and `index.tsx`:
   `export const module: ClientModule = { id, label, render: active => <Tab active={active} /> }` (type in `client/src/modules/types.ts`).
2. Fetch data with `useFeed<Item>('<id feed key>', active)` from `client/src/hooks/useFeed.ts`.
3. Add the key to `FeedType` in `client/src/types/Feeds.ts`, and re-export the payload types there.
4. Add one line to `modules` in `client/src/modules/registry.ts`, in the same position as on the host.
5. The target is Chrome 69 at 800×480. No flexbox `gap`, `aspect-ratio` or `:is()`. Show host labels, do not format times on the device.

## What you get for free

- A tab picker entry in Settings, with show/hide and reorder, pushed live to the device.
- Polling stops while the tab is hidden, unless a visible module lists it in `dependsOn`.
- A hidden feed is still fetched once on a settings change or a client request.

## Checklist

- `src/main/lib/modules/registry.test.ts` and `client/src/modules/registry.test.ts`: update the expected id list; the other tests check unique handler names, `dependsOn` targets and `feedKeys` against `feeds()`.
- Add tests for the data source and any `view.ts` helpers.
- `npm run gate -- fast`.
- Preview: add `scripts/preview/payloads/<type>.json` (copy another payload, shapes are in `client/src/modules/<id>/types.ts`), then follow `scripts/preview/README.md`. Add the tab to the tab order notes there.
- Update `AGENTS.md` (tab list, module entries, preview notes).
- In the milestone PR, bump `version` in `package.json` and `client/package.json` (and both lockfiles) to the next `0.0.16-tabs.N`.

## JSON and MCP connectors

Coming in M9 Parts B and C.
