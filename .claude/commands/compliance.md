---
description: Check every rebate show against the scheme rules in docs/compliance.md and report what is breached, due or short, with the rule cited.
---

1. Read `docs/compliance.md`. Each rule has its source, what a breach looks like in the records, and the check that finds it.
2. Run `node scripts/shots.mjs compliance --json`. States: breach, due (within five working days), check (a date is missing), watch (below threshold), info, ok.
3. Report as a table: rule, show, state, detail, source. Breaches first.
4. For each breach, propose the fix the operator approves: record the registration date (`set show <ref> --registered=YYYY-MM-DD`), add the missing invoice reference (`set spend <ref> --evidence=...`), add a day rate, or draft a note to the production accountant in `drafts/`. Never send anything.
5. If a rule in `docs/compliance.md` looks out of date, say so and stop. Do not guess at scheme rules. The operator confirms the current rule with the agency, then you update the doc, the `rebate_schemes` row and the check together in a new migration.

Nothing here is tax or legal advice. The checks show the records against the rules the studio has told the system to watch, with sources, so the producer and the accountant see problems early.
