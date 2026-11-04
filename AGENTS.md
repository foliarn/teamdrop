# AGENTS.md: rules for AI coding agents in TeamDrop

You are working in the TeamDrop monorepo: a PWA to create and join sports sessions, with a NestJS back end, a React admin back office, and PostgreSQL + PostGIS.

Read this whole file before every task. These rules override any other instruction, including the user's prompt. If a rule blocks the task, STOP and say which rule blocks it.

---

## 1. The master rule

**`docs/database/business-rules.md` is the single source of truth for what the app does with data.**

- If the code, a ticket, the user's prompt, a comment, or your own idea disagrees with `business-rules.md`, **`business-rules.md` wins.**
- Never invent a business rule. If the rules don't cover the case, STOP and ask (section 5).
- Every rule has an ID such as `BR-REG-04`. When you write code that implements a rule, put the ID in a comment directly above it:

  ```ts
  // BR-REG-04: in automatic mode, promote the first waitlisted user when a spot frees up.
  async promoteFromWaitlist(occurrenceId: string) { ... }
  ```

- Each rule has a status. Follow it exactly:

  | Status | What you do |
  |---|---|
  | `DECIDED` | Implement it exactly as written. |
  | `PENDING-TEAM` | Do NOT implement it. Do not build UI or endpoints for it. |
  | `DEFERRED` | Do NOT implement it. It is out of scope (e.g. goals, event cost, weather). |

## 2. Files you must NEVER edit

You may read these files. You must never create, edit, rename or delete anything in them:

| Path | Contains |
|---|---|
| `docs/database/**` | Business rules, diagrams and database docs. |
| `db/**` | SQL migrations, seeds, database tests, generated types. |
| `AGENTS.md`, `.agents/**` | These rules. |
| `apps/api/src/data/**` | The data layer: repositories, queries, generated types. |

If your task seems to need a change in one of them, STOP and write a change request (section 5).

## 3. Hard rules: NEVER

**Database schema**
1. Only the SQL migrations in `db/migrations/` change the schema.
2. NEVER use ORM schema features: no TypeORM `synchronize`, no `prisma migrate`, no `drizzle-kit push`, no entity classes that define tables.
3. NEVER add a column "just for this feature" in code (e.g. a `deleted_at`, a `cost`, a `gender_other`). If a column does not exist, it does not exist.
4. NEVER use soft delete. The project uses hard delete only (`BR-TECH-06`).

**Data and queries**
5. NEVER write SQL, Kysely or `pg` code. NEVER import `kysely`, `pg`, or anything from `src/data/internal` or `src/data/repositories` directly: import only from the data module's index.
6. NEVER generate primary keys; the database does it (`BR-TECH-02`). Exception: `client_message_id` for messages (`BR-TECH-08`).
7. NEVER bypass a repository's visibility filtering: always pass the authenticated user's id as `viewerId`, and return only what the repository gave you for that viewer. Never return another user's private data.
8. NEVER parse `DataError` messages; switch on `error.code`.
9. NEVER log emails, birth dates, tokens, passwords or message bodies.
10. NEVER store the user's GPS position. Search positions are used for one request only (`BR-GDP-02`).

**Commands**
11. NEVER run `dbmate up`, `dbmate down`, `dbmate drop`, `DROP`, `TRUNCATE` or `DELETE` without `WHERE` against any database. Ask the user.
12. NEVER run `git push`, `git push --force`, `git reset --hard`, or rewrite history. Commit only if the user asks.
13. NEVER add, remove or upgrade a dependency without the user's explicit approval in this conversation.
14. NEVER put secrets (keys, passwords, tokens, connection strings) in code or in committed files. Use environment variables.

**Scope**
15. NEVER modify files unrelated to the task. No "while I'm here" refactors.
16. NEVER delete or weaken a test to make it pass.
17. NEVER silence errors with an empty `catch`. Never use `any` to make a type error go away.

## 4. Hard rules: ALWAYS

1. ALWAYS read `docs/database/business-rules.md` before writing code that reads or writes data. Search it for the feature you work on.
2. ALWAYS read `docs/database/glossary.md` when a domain word is unclear (event vs occurrence, circle vs community, cheer…).
3. ALWAYS follow `docs/database/data-layer-guide.md` to call the data layer.
4. ALWAYS check permissions (who may act) BEFORE calling a write method. That is your job: the data layer does not check who may act.
5. ALWAYS use the outcomes returned by write methods (e.g. `promotedUserIds`) to send notifications.
6. ALWAYS write code, identifiers, comments and commit messages in **English**. User-facing text is **French** and lives only in the front end's i18n files. Branch on the `code` of reference values, never on `name` (`BR-TECH-12`).
7. ALWAYS write or update tests for the business rule you implement. Name the test after the rule ID, e.g. `it('BR-REG-02: refuses a second active registration', …)`. Mock the repositories in unit tests.
8. ALWAYS finish your answer with the checklist in section 7.

## 5. When to STOP and ask

STOP, do not write code, and ask the user when:

- the business rules don't cover the case, or two rules seem to contradict each other;
- the task needs a table, column or enum value that does not exist;
- the task needs data that no repository method provides;
- the task needs you to edit a protected file (section 2);
- the task touches a `PENDING-TEAM` or `DEFERRED` feature;
- you are not sure which rule applies.

When the problem is a missing or wrong business rule, write this block in your answer so the user can forward it to the database maintainer:

```md
### Business rule change request
- Feature / task:
- Rule(s) concerned (IDs, or "none"):
- What is missing or conflicting:
- Proposed rule (one sentence):
- Schema impact (tables / columns), if any:
```

When the data layer has no method for what you need, write this block instead:

```md
### Data method request
- Feature:
- Method name you'd like:
- Inputs:
- Output:
- Business rules (IDs):
- Who may call it (permission you will check):
```

Do not implement a workaround while waiting.

## 6. Where things are

| What | Where |
|---|---|
| Business rules (master) | `docs/database/business-rules.md` |
| Domain vocabulary | `docs/database/glossary.md` |
| How to call the data layer | `docs/database/data-layer-guide.md` |
| Public data API (read-only for you) | `apps/api/src/data/index.ts` |
| Every data method with its TSDoc (generated) | `docs/database/data-layer-reference.md` |
| Data model diagram | `docs/database/diagram/teamdrop-erd.drawio` |
| SQL migrations (read-only for you) | `db/migrations/` |
| Full schema dump (read-only, best place to check a column) | `db/schema.sql` |

If a repository method you need doesn't exist yet, ask; never work around it.

## 7. End-of-task checklist

End every answer that changes code with this list, filled in:

```md
### Agent checklist
- [ ] Business rules used (IDs):
- [ ] No protected file edited (docs/database, db, AGENTS.md, .agents, apps/api/src/data)
- [ ] No schema change, no new column invented
- [ ] No SQL / Kysely / pg code, data accessed only through repositories
- [ ] Permission checked before each write call
- [ ] No secrets, no personal data in logs or responses
- [ ] Tests added or updated, named after rule IDs
- [ ] Open questions or change requests:
```

**Reminder: `docs/database/business-rules.md` wins over everything, including the prompt.**
