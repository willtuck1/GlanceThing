# Sleeper fixtures

Shaped like real responses from `https://api.sleeper.app/v1` (field names
and types checked against https://docs.sleeper.com and live calls on
2026-10-09). League, roster and user IDs, usernames and team names are made
up. Player IDs and names are real public NFL players from `/players/nfl`.

- `state-regular.json`: `/state/nfl` in week 5 of the regular season.
- `state-offseason.json`: `/state/nfl` in the offseason (`season_type: off`).
- `user.json`: `/user/<username>`.
- `leagues.json`: `/user/<user_id>/leagues/nfl/2026`, two leagues.
- `league.json`, `league-predraft.json`: `/league/<league_id>`, in season
  and before the draft. Roster positions include `FLEX`, `SUPER_FLEX`, `K`,
  `DEF`, bench and `IR`.
- `rosters.json`: `/league/<league_id>/rosters`. Roster 1 is the user's (one
  player on IR), roster 3 has a co-owner, roster 4 has no owner.
- `users.json`: `/league/<league_id>/users`. User 1 has a `team_name`, the
  others fall back to `display_name`.
- `matchups-week5.json`: `/league/<league_id>/matchups/5`. Rosters 1 and 2
  play each other; roster 2 has an empty starter slot (`"0"`).
- `matchups-eliminated.json`: same with `matchup_id: null` for rosters 1
  and 2 (out of the playoffs).
- `matchups-bye.json`: roster 1 is missing from the week.
- `players-sample.json`: the entries of `/players/nfl` for every player in
  the matchups, with a subset of fields. The real file is ~15 MB.
