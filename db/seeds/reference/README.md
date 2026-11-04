# Reference seeds

Reference data loaded before the fixtures by `npm run db:fixtures` (`db/scripts/load-fixtures.sh`), in alphabetical order:

| File | Content |
|---|---|
| `010_skill_level.sql` | The four self-declared levels (beginner to expert, BR-ACC-10). |
| `020_sport.sql` | The default sports list (editable from the back office, BR-ACC-17). |
| `030_rating_system.sql` | Chess FIDE Elo (numeric) and French tennis ranking FFT (graded, 24 grades). |
| `040_municipality.sql` | Loads `municipality.csv` (metropolitan communes and Paris, Lyon, Marseille arrondissements). |
| `050_notification_type.sql` | The notification types and their default push / in-app values (BR-NOT-01). |
| `060_cheer_type.sql` | The starter cheer types (BR-SOC-11). |
| `070_report_reason.sql` | The report reasons (BR-MOD-01). |
| `municipality.csv` | Versioned data file, read by `040_municipality.sql`. Do not load it by hand. |
| `tools/fetch-municipalities.mjs` | Regenerates `municipality.csv` from the source below. Run by hand only. |

All files are idempotent (`ON CONFLICT DO NOTHING`), so loading them twice changes nothing.

## Municipality data

- **Source:** Decoupage administratif API of the French government, `https://geo.api.gouv.fr/communes` (endpoints `type=commune-actuelle` and `type=arrondissement-municipal`, fields `nom,code,codeDepartement,population,centre`).
- **Date fetched:** 2026-11-02.
- **Licence:** Licence Ouverte / Open Licence 2.0 (Etalab). Attribution required.
- **Scope:** metropolitan France only. Department codes starting with `97` or `98` are excluded (223 overseas rows skipped).
- **Parents of arrondissements:** the API gives no parent field. The parent is derived from the INSEE code prefix: `751xx` is Paris (75056), `132xx` is Marseille (13055), `6938x` is Lyon (69123). The tool checks that each parent exists in the fetched communes.
- **Counts at the last fetch:** 34,746 communes and 45 arrondissements (Paris 20, Marseille 16, Lyon 9), 34,791 rows in total. Missing populations are stored as 0 (none at the last fetch).

### How to refresh

```
node db/seeds/reference/tools/fetch-municipalities.mjs
```

This needs Node 24 (built-in `fetch`, no dependencies) and internet access. It rewrites `municipality.csv` and prints the counts. Commit the new CSV, then reload the reference data. Existing rows are not updated by the loader (idempotent on `insee_code`), so a changed name or centre needs a manual `UPDATE` or a reset of the dev database.
