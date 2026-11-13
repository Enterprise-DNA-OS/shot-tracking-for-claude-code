---
description: "List shots for a show, sequence or status, with bid, actual days and the latest version."
---

# shots

Run `node scripts/shots.mjs shots --json`, adding `--show=<ref>`, `--sequence=<code>` or `--status=<status>` from what the operator said. Statuses: waiting, in_progress, internal_review, client_review, approved, delivered, omitted. Show bid against actual days and flag anything over 100 percent of bid.
