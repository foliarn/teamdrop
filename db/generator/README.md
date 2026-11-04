# TeamDrop dataset generator

Deterministic generator of a realistic TeamDrop dataset (BR-DATA-01, BR-DATA-02). It writes directly with SQL into a
local dev or test database, as `teamdrop_owner`. It is also packaged as a Claude skill:
`.claude/skills/teamdrop-dataset/SKILL.md`.

## Run

From the repository root, with Node 24 (TypeScript runs natively; no extra dependency, `pg` comes from the workspace):

```
npm run db:start
npm run db:migrate
npm run db:fixtures          # reference data (sports, municipalities, cheer types, report reasons...) + dev fixtures
npm run db:generate -- --seed demo
```

| Option | Default | Meaning |
|---|---|---|
| `--seed <text>` | `teamdrop` | Same seed + same anchor = same dataset, ids included. |
| `--users <n>` | `10000` | Number of accounts. |
| `--years <n>` | `2` | Length of the history before the anchor. |
| `--anchor <YYYY-MM-DD>` | today (Europe/Paris) | Last day of the history; 4 weeks of upcoming sessions follow it. Fix it for a reproducible dataset. |
| `--database-url <url>` | `DATABASE_URL_OWNER` (`.env`) | Target database. Only names ending in `_dev` or `_test` are accepted. |
| `--append` | off | Allow a database that already has more than 100 users. |
| `--dry-run` | off | Simulate and print the counts, write nothing. |

`DEBUG=1` prints stack traces. `node db/generator/check-determinism.ts` checks determinism without a database.

Defaults run in about one minute (10,000 users, ~2,100 events, ~25,000 occurrences, ~110,000 registrations).
To start again from an empty database: `docker compose -f db/docker-compose.yml down -v`, then the steps above
(this deletes the local database volume).

## What it generates

- **Users** all over metropolitan France, weighted by municipality population (arrondissements for Paris, Lyon,
  Marseille), with a sign-up growth curve, ages 15 to 72, genders, 1 to 3 sports with a level, private accounts and
  users hidden from rankings. Every generated account has the password `password123` and an email
  `<username>@dataset.teamdrop.test` (encrypted like real ones). A few moderators and one admin.
- **Behaviour profiles**: regulars, casual and rare players, new users (recent sign-ups), dormant users (25% stop at
  some point; long-inactive ones carry an inactivity warning), serial no-shows (2%), abusive organizers (0.5%) who
  cancel at the last minute and miss their own sessions.
- **Events**: organizers' weekly series (`FREQ=WEEKLY`, ending when the organizer stops) and one-off sessions, evening
  slots on weekdays and daytime on weekends. Occurrences exist only when needed (BR-EVT-03): past ones are `completed`
  or `cancelled`, the next 4 weeks are `scheduled` with registrations still coming in (waitlists, pending approvals).
- **Seasonality and peaks**: outdoor sports rise in summer and are cancelled more in winter, indoor sports the opposite,
  skiing only in winter; weekends get more players.
- **Cities**: Lyon (Rhône) is a very active city; Saint-Étienne is an empty city (residents, no session there).
- **Registrations**: capacity respected (organizer and guests count), late and normal cancellations, attendance
  (`attended`, `no_show`, `excused`), guests whose names are erased once completed, no minor on adults-only sessions.
- **Social**: follows and friends among co-players, circles of organizers' regulars with chats, communities (clubs) in
  large cities with chats, occurrence chats, cheers between participants who attended, blocks between users who never
  play together.
- **Moderation**: reports against abusive organizers and harassment reports in every status, warnings, temporary bans,
  one permanent ban with its banned identity.
- **GDPR**: 1% of accounts asked for deletion; those past the 30-day grace period are erased by `erase_user_account`
  (their history stays without identity). Analytics tables are refreshed at the end.

## Notes

- Like the dev fixtures, the generator writes explicit UUID v7 ids, derived from the simulated creation time and the
  seed, so a dataset is reproducible. They are time-ordered like the database's `uuidv7()`.
- Rules are respected by construction, not through the data layer, because the generator inserts with SQL
  (BR-DATA-01). The checks it was validated with: no over-capacity, one active registration per user and occurrence,
  attendance only on completed occurrences, occurrences on their series' schedule, no minors on adults-only sessions,
  no blocked user in the other's events.
