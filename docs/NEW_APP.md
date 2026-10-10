# Adding an app module

A module is one host folder, one client folder and one line in each registry, all with the same id. Ids are lowercase. `json:<id>` is used by JSON connectors (below) and `mcp:<id>` is reserved for MCP connectors (Part C). Never name anything "apps"; `src/main/lib/handlers/apps.ts` is desktop shortcuts.

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

## JSON connectors (no code)

Use a JSON connector when the data is one HTTPS (or local-network) URL that returns JSON and you only need to show it as a list, a big number, key-value rows or a grid. It adds a tab with no release. Use a code-built app (above) when you need OAuth, several requests, computed values, or a custom layout.

### Steps

In Settings → Connectors, press Add connector, then:

1. Name: the tab title (at most 24 characters).
2. URL: `http://` or `https://`, no username or password, at most 2000 characters.
3. Refresh every N minutes: 1-1440.
4. Layout: List, Big number, Key-value or Grid.
5. Mapping: the paths for that layout (below).
6. Secret header (optional): header name and value, for an API key or token.
7. Test: fetches the URL and shows the mapped result without saving. Fix any error, then Save. The tab appears on the device at once; show, hide and reorder it in Settings → Tabs.

### Layouts and mapping

- List: items path, primary (at most 80 characters), optional secondary (40) and value (16). Up to 20 rows; more are counted as "+N more".
- Grid: items path, label (40) and value (16). Up to 12 cells.
- Big number: value path, optional caption path, optional unit (literal text, at most 8 characters) and decimals (0-3; default up to 2).
- Key-value: up to 8 rows, each a literal label (at most 40 characters) and the path of its value.

Paths use dots and array indexes: `data.items[0].price`. An empty path means the whole response. For List and Grid, the items path picks an array ("for each item in") and the other paths are relative to each item; leave it empty when the response itself is the array.

### Limits and network rules

- At most 20 connectors. Each request: 10 s, 1 MB, 3 redirects, and the response must have a JSON content type.
- Public hosts must use https. http is allowed only when every address the host name resolves to is local: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8, `::1`, fc00::/7 (this includes `.local` names). Link-local addresses are refused. A redirect from https to http is refused.
- Tailscale addresses (100.64.0.0/10) count as public, so use https there.
- The host makes every request; the device only gets display-ready text.

### Secret header

The value is kept in secure storage and is never shown again. When editing, the field shows Set with Replace and Clear. Over http the form warns that the value is sent unencrypted. Changing the URL's host (protocol, host or port) requires entering the value again. The secret is dropped on a redirect to another origin, and a response that contains the secret is rejected.

### Example: Home Assistant

Create a long-lived access token in your Home Assistant user profile. The values below are fake.

Big number, URL `http://homeassistant.local:8123/api/states/sensor.house_power`, header name `Authorization`, value `Bearer <your long-lived token>`:

- Value path `state`, unit `W`, caption path `attributes.friendly_name`.

List, URL `http://homeassistant.local:8123/api/states`, same header:

- Items path empty (the response is an array), primary `attributes.friendly_name`, secondary `entity_id`, value `state`.

MCP connectors come in Part C. They reuse the same layouts and mapping.
