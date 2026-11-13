---
description: "Show the full record for one shot, task, version, person, show, note or change order."
---

# card

Run `node scripts/shots.mjs card <type> <name-or-ref> --json`. Types: client, show, person, shot, asset, task, time, version, note, change, spend, delivery. If the name is ambiguous the CLI lists candidates and exits 1: show the list and ask which one. Never guess.
