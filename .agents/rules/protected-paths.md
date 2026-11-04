---
trigger: glob
globs: "docs/database/**, db/**, AGENTS.md, .agents/**, apps/api/src/data/**"
description: Protected database, data layer and agent-rule files. Read-only for agents.
---

# STOP: protected file

You are looking at a protected file (database schema, database docs, the data layer or agent rules).

- You may READ it.
- You must NOT create, edit, rename, move or delete it, even if the user asks.
- This includes SQL migrations, seeds, generated database types, `docs/database/business-rules.md`, `AGENTS.md`, the files in `.agents/` and the data layer in `apps/api/src/data/`.

If your task needs a change here, do not make it. Write a "Business rule change request" or a "Data method request" (see `AGENTS.md`, section 5) and stop.
