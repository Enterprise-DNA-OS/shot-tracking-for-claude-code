# Shot Tracking for Claude Code: operating instructions

This file is the brain. Claude Code reads it at the start of every session. It says who this is for, how work gets done, and the one right way to do each recurring job.

## Who this is for

- **Business:** [YOUR BUSINESS]
- **Operator:** [YOUR NAME], [your role]
- **What matters most:** [the one or two outcomes you care about]

Fill this in once. A worker with context knows. A worker without it guesses.

## How to work

1. **Take a brief, not a script.** The operator describes the outcome. You run the right command and present the answer.
2. **Read before you write.** Before drafting anything about a record, read its full history first.
3. **Plain language.** Short sentences. No filler. Numbers in tables.
4. **Silent success, loud problems.** No play-by-play. Say what broke and what you did about it.
5. **Stop at the line.** Anything that sends, deletes, or faces a customer waits for a yes in this session.

## Routing table: one right way for each recurring job

| When the operator asks for... | Use this |
|---|---|
| What needs me today? | `/attention` |
| What is up for review? | `/dailies` |
| How are the shows going? | `/shows` |
| Where is a shot or sequence? | `/shots` |
| Where is an asset build? | `/assets` |
| What is on an artist's list? | `/tasks` |
| Who is on the team? | `/people` |
| Show me one record | `/card` |
| Add a show, shot, task, person or cost | `/add` |
| Change a date, bid, status or assignee | `/update` |
| Log time | `/log` |
| A new version is up | `/submit` |
| Record a review decision | `/review` |
| Add a note | `/note` |
| Which client notes are open? | `/client-notes` |
| What is over bid? | `/over-bid` |
| Who is overbooked or free? | `/artist-load` |
| What is due for delivery? | `/deliveries` |
| Raise or decide a change order | `/change-orders` |
| Where are we on the rebate? | `/rebate` |
| Are we compliant? | `/compliance` |
| Monday review | `/weekly-review` |
| Save the Monday review | `/draft-weekly-review` |
| Write the client a status note | `/draft-client-update` |
| Write a change order note | `/draft-change-order` |
| Bring data across from ftrack | `/import` |
| Export everything | `/export` |
| What changed? | `/audit` |
| Change a field, step, status or rule | `/customise` |
| Add a dashboard page | `/new-view` |

If an ask fits nothing here, run the CLI directly (`npm run <cli> -- --help`) and then propose a new command for it.

## House rules for a studio

- Day rates and rebate figures are private. Show them only when the operator asks about cost or the rebate.
- Where an artist worked decides whether the time counts for a rebate. Ask when it is not the person's usual location.
- A shot is approved only when every task on it is done. A shot is delivered only when it is approved.
- Client notes go in with the client's words as written.

## Hard rules

- Never send email or messages from here. Draft to `drafts/`, a person sends.
- Never delete records without an explicit yes in this session. Prefer marking closed or archived.
- Never invent a record. If a name is ambiguous, list the candidates and ask.
- The database is the source of truth. If the answer is not in it, say so.

## Where things live

- `scripts/` the CLI. `scripts/lib/db.mjs` picks `DATABASE_URL` (Postgres, Supabase) or the embedded database in `.data/`.
- `supabase/migrations/` the schema, plain SQL. `npm run migrate` applies it.
- `.claude/commands/` the slash commands. Add one every time the same ask comes twice.
- `docs/` the thesis and the guide for moving off ftrack Studio.

Built by Enterprise DNA. Installed and run for you as part of Omni: https://enterprisedna.co/omni/instead-of/ftrack
