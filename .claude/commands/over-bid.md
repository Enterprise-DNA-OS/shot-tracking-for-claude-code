---
description: "Shots that have used more days than were bid, and whether a change order covers it."
---

# over-bid

Run `node scripts/shots.mjs over-bid --json` and `node scripts/shots.mjs over-bid-by-step --json`. For each shot say days over, percent of bid and the change orders against it. A shot over bid with no change order is lost money: say so plainly and offer `/change-orders`. The step table shows which department's bids run light.
