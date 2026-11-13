---
description: "Record a review decision on a version: internal notes, send to client, client notes, or approve."
---

# review

Run `node scripts/shots.mjs review <version> --decision=internal-notes|send|client-notes|approve [--note="..."] [--author="..."]`. Client notes go in with the client contact as author. A shot becomes approved only when every task on it is done. If the CLI refuses because the version is in the wrong state, say what state it is in and stop.
