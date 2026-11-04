---
name: teamdrop-dataset
description: Generate a realistic, deterministic TeamDrop dataset (users all over France, events, registrations, attendance, chats, cheers, moderation, GDPR cases) into the local dev or test PostgreSQL database. Use when someone asks to fill the database with demo or test data, to load a dataset for analytics, heatmaps, rankings or performance checks, or to regenerate the same data from a seed.
---

# TeamDrop dataset generator

The generator lives in `db/generator/` (TypeScript, run natively by Node 24). It inserts directly with SQL
(BR-DATA-01) and follows `docs/database/business-rules.md`. Read `db/generator/README.md` for everything it generates.

## Before running

1. Ask the user before writing into any database: it adds about 10,000 users and 110,000 registrations by default.
   It only accepts databases whose name ends in `_dev` or `_test`, and refuses one that already has more than 100 users
   unless `--append` is given.
2. Check the database is up and migrated, with the reference seeds loaded:
   - `npm run db:start`, `npm run db:migrate`, `npm run db:fixtures` (on Windows, run them in WSL where Docker runs).
3. Never empty a database to make room (no `DROP`, `TRUNCATE` or `DELETE`): AGENTS.md forbids it. If the user wants a
   fresh database, tell them the command (`docker compose -f db/docker-compose.yml down -v`) and let them run it.

## Run

```
npm run db:generate -- --seed <seed> [--users 10000] [--years 2] [--anchor YYYY-MM-DD] [--database-url <url>]
```

- Choose a seed the user can reuse; pass `--anchor` (last day of history) when the dataset must be identical later,
  otherwise it ends today.
- `--dry-run` prints the counts without writing: use it first when the user is unsure of the size.
- Scale: about one minute for the defaults. The WSL machine has 6 GB of RAM; keep `--users` under 50,000.

## After running

- Report the counts the generator printed (users, events, occurrences, registrations, cheers, messages, reports...).
- The analytics tables are already refreshed (heatmap, sport activity, rankings, back-office statistics).
- Every generated account logs in with `<username>@dataset.teamdrop.test` / `password123`.
- If something fails, rerun with `DEBUG=1` for the stack trace. `node db/generator/check-determinism.ts` checks that a
  seed always gives the same dataset.
