---
description: "Bring tasks across from an ftrack Studio spreadsheet export."
---

# import

Read `docs/replace-ftrack.md` first. Confirm which show the file belongs to. Run `node scripts/shots.mjs import ftrack --file=<tasks.csv> --show=<ref> --dry-run --json` and show the operator the counts and warnings. Ask whether bids in the file are days or hours (`--bid-unit`). If column names differ, write a mapping file and pass `--mapping=<file.json>`. Missing people must be added first with `/add`. Run without `--dry-run` only when the operator says go. Then run `/shots` for that show.
