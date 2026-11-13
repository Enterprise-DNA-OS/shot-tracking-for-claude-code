---
description: "What changed recently and on which record."
---

# audit

Run `node scripts/shots.mjs audit --json` for the last 25 changes. For one record, query `audit_events` by row_id. Report who changed what when the record says so; the audit log stores the record, not the person at the keyboard.
