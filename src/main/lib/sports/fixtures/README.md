# ESPN scoreboard fixtures

- `nba-live.json`, `nfl-live.json`: real responses from
  `site.api.espn.com/apis/site/v2/sports/{sport}/{league}/scoreboard`,
  captured 2026-10-08. All games are scheduled (`pre`).
- `nba-live-2.json`, `nfl-live-2.json`: real responses from the same
  endpoints, captured 2026-10-09 01:45 UTC. NBA: 1 final, 4 live, 1
  scheduled. NFL: 1 live (halftime), 14 scheduled.
- `nba-scoreboard.json`, `nfl-scoreboard.json`: hand-built from the same
  schema to cover live (`in`) and final (`post`) games. Their structure
  matches the real captures for every field the code reads.
- `nba-drift.json`: hand-built to simulate ESPN schema drift: null and
  non-object events, missing or wrongly typed fields, unknown states. Only
  `k1` and `4012` are usable; the normalizer must skip the rest and never
  throw.
