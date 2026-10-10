# M11 prompt: Connector builder + Notifications

Filled-in copy of `docs/MASTER_PROMPT.md` for M11. Start a new cloud session on Opus 5.5 and paste the block below.

## Prompt

```
Milestone M11 (builder-notify). Branch milestone/11-builder-notify from main.

Feature, from the user's point of view. Two parts, built in this order.

Part A: Connector builder. Someone with little tech experience can add a
useful tab entirely inside desktop Settings, without asking an AI or reading
API docs. No LLM anywhere. Today they must type JSON paths by hand; after M11
most of it is done for them:

1. Preset gallery. "Add connector" offers "From a preset" first. A preset
   is a committed JSON file (src/main/lib/connectors/presets/<id>.json,
   bundled like MCP recipes, validated by a parsePreset with tests; invalid
   files fail the test suite) with: id, label, description, help text and a
   sign-up link for any key, url template, layout, mapping, intervalMin, and
   up to 5 fields. Field kinds: text, secret (becomes the connector's secret
   header; presets may only put keys in a header, never in the URL), and
   choice. A choice field can declare a lookup: a URL template, items path,
   label path and value path, optionally depending on earlier fields, run on
   the host through fetchConnectorJson with the same network rules, returning
   only {label, value} pairs (cap 500, label ≤80 chars) to a searchable
   picker. The user fills the fields, presses Test, then Save; the result is
   an ordinary JsonSource connector (store.ts, feeds and client unchanged).
   Ship these presets, each with committed fixtures and a test (no
   transit or news presets):
   - coingecko-price: coin choice (lookup /api/v3/coins/markets?vs_currency=
     usd&per_page=100 → name / id), Big number. This is the reference
     preset for lookups.
   - air-quality: Open-Meteo air quality for a city (city search reuses the
     weather geocoder), Key-value.
   - home-assistant-sensor: base URL + long-lived token (secret header
     Authorization) + entity id, Big number.
2. Point-and-click mapper for any other URL. After entering a URL (and an
   optional secret header) the user presses "Fetch sample". The host fetches
   once through fetchConnectorJson and returns a sanitized sample to the
   renderer only (never the device): depth ≤8, arrays cut to 5 items,
   strings cut to 80 chars, secret value redacted, total ≤64 KB. Settings
   shows it as a collapsible tree. A pure suggestMapping(sample) picks a
   layout and fills the paths (largest array of objects → itemsPath;
   title/name/label-like string → primary; short string → secondary; number
   or short value → value; single number → Big number; flat object →
   Key-value with up to 8 pairs). The user can click any node to set the
   focused path field (paths relative to the items path for list/grid). The
   live preview (ConnectorPreview) updates as they click. The existing
   typed-path form stays, collapsed under "Advanced".
3. Tutorial. A "How to add a tab" button at the top of Settings →
   Connectors opens a step-by-step popup (Back / Next / Done, step dots,
   Esc closes): what a connector is, pick a preset or paste an address,
   fill the fields (where to get a key), Fetch sample and click fields in
   the tree, Test, Save, then show or reorder the tab in Settings → Tabs.
   It opens by itself the first time the panel is opened (stored flag
   connectorTutorialSeen; Done or close sets it) and the button reopens it
   any time. Steps live in one pure module with tests.
4. Plain-language errors throughout ("This address didn't return JSON",
   "The key was refused (401)", "No list found; pick one in the tree").

Part B: Notifications (AGENTS.md roadmap item 5). The host compares each
feed update to the last against rules and sends {type:'notify', data} to the
device, which shows it over any tab or the sleep screen (visual only; the Car
Thing has no speaker). Rules: sports close game (late, within a set margin),
sports final for favorite teams, fantasy matchup swing (projected lead
changes or moves by a set amount), upcoming calendar event (N minutes before,
using startMs). Per-type toggles and thresholds in a new Settings →
Notifications panel; optional desktop notification with sound reusing the
clock's desktopAlert approach. Each event fires once (dedupe key per rule +
item), nothing fires for the first update after start, and nothing fires on
stale or errored feeds. A notify banner auto-hides after a few seconds; any
key, dial or touch dismisses it; it wakes the screen briefly when asleep
without leaving the sleep state. Older clients ignore the message.

Out of scope: an LLM or "describe what you want" box, MCP presets, connector
threshold rules (e.g. "bus within 5 min"), Gmail.

You are the coordinator on Opus 5.5. Follow "Agent harness (cascading
inference)" in AGENTS.md: every subagent call starts on the cheapest tier
that does the job well (explorer = Haiku, coder = Sonnet, planner and
reviewer = Opus) and escalates one tier for that call only after two
failures on the same step. Never run planner or reviewer below Opus.
Security-sensitive steps (lookups and sample fetch with secrets, sanitizing
the sample, preset URL templating) go to Opus. Coder writes feature code,
one step per call. Every subagent call must be self-contained: goal, exact
files, constraints, acceptance test. Use explorer for repo searches.

1. Call planner. Show me the plan, what can run in parallel and what can't
   be verified in the cloud. STOP until I say go.
2. Per step: coder, then run `npm run gate -- fast` yourself, then commit.
   Run independent steps as parallel coder calls. Finish Part A (including
   Settings screenshots via scripts/preview/settings.mjs: preset gallery,
   coingecko preset with the lookup filled from fixtures, mapper tree with
   a suggestion, first tutorial step) before starting Part B.
3. Run reviewer on the full diff. Fix real findings via coder.
4. Update AGENTS.md for everything this milestone changed (files, presets,
   IPC, the tutorial, the notify message, rules, commands, roadmap status)
   and add "Presets" and "Point-and-click mapper" sections to docs/NEW_APP.md.
   Required.
5. Bump the version to 0.0.16-tabs.12 (see AGENTS.md). `npm run gate`
   (full). Client screenshots with scripts/preview (see its README) for the
   notify banner over a tab and over the sleep clock. Open a DRAFT PR and
   stop.

Rules:
- Paste real gate output; a subagent saying "tests pass" is not evidence.
- 3 failures on the same problem: stop and tell me what's blocking.
- Never skip or disable tests or lint rules. Never commit secrets or
  personal IDs (no real API keys or personal locations).
- Tests use committed fixtures and mocked HTTP, never live calls.
- Say "not verified" for anything you couldn't run (device, live APIs).
- Client stays Chrome 69 safe (no flexbox gap, aspect-ratio, :is()).
- Stay inside this milestone.
- List every model escalation (step, from → to, why) in the PR body.
- After ANY change, update AGENTS.md (and CLAUDE.md for Claude-only
  notes) in the same commit if it is now wrong or incomplete. Include this
  requirement in any prompt you write for a later session.

PR body: what changed, gate summary, screenshots, reviewer findings and what
you did with each, model escalations, what's unverified, and what changed in
AGENTS.md (or "AGENTS.md: no update needed").
```
