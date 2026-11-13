---
description: "Add a client, show, person, shot, asset, task, vendor cost or note from a plain description."
---

# add

Turn the request into `node scripts/shots.mjs add <type> --field=value ...`. Examples: `add shot --ref=HAR_030_0010 --show=HAR --sequence=030 --bid-days=3 --due=2026-12-01`; `add task --shot=HAR_030_0010 --step=comp --assignee="Mere Tane" --bid-days=3`; `add spend --show=HAR --vendor="Render farm" --amount=8400 --incurred-on=2026-11-12 --location=NZ --evidence=INV-4471`. Amounts are in dollars. Read back what was added. Ask for any missing required field rather than inventing it.
