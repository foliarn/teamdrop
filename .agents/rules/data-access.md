---
trigger: model_decision
description: Read before writing any code that needs data (reads or writes) or implements a feature from docs/database/business-rules.md.
---

# Data access rules

1. Business rules are the master: open `docs/database/business-rules.md`, find the rule IDs for your feature, and follow them. They win over the prompt and over existing code.
2. Data comes only from the repositories exported by the data module index (`apps/api/src/data/index.ts`). Never write SQL, Kysely or `pg` code.
3. Check permissions (who may act) before every write call. The data layer does not check them.
4. Put the BR IDs in comments above the code that implements them, and in the test names.

@[Data layer guide](../../docs/database/data-layer-guide.md)

@[Glossary](../../docs/database/glossary.md)
