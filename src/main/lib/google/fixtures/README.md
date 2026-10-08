# Google Calendar and Tasks fixtures

Hand-built from the Calendar API v3 schema (`calendarList.list` and
`events.list` with `singleEvents=true`) and the Tasks API v1 schema
(`tasklists.list` and `tasks.list` with `showCompleted=true` and
`showHidden=true`). Every field the code reads matches the documented
shape. All names, ids and places are fictional.

Tests pin `now` to Thu 8 Oct 2026, 14:00 in America/New_York.
