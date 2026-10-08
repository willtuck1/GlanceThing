# ESPN scoreboard fixtures

- `nba-live.json`, `nfl-live.json`: real responses from
  `site.api.espn.com/apis/site/v2/sports/{sport}/{league}/scoreboard`,
  captured 2026-10-08. All games are scheduled (`pre`).
- `nba-scoreboard.json`, `nfl-scoreboard.json`: hand-built from the same
  schema to cover live (`in`) and final (`post`) games. Their structure
  matches the real captures for every field the code reads.

Recapture during live games to replace the hand-built files.
