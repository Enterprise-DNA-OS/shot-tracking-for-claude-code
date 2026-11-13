<h1 align="center">Shot Tracking for Claude Code</h1>

<p align="center">
  <strong>The open-source VFX and animation shot tracking system that is just a database and Claude Code.</strong>
</p>

<p align="center">
  Created by <a href="https://www.enterprisedna.co"><strong>Enterprise DNA</strong></a>. Free and open source. Works with Claude Code, Codex, OpenCode or Cursor.
</p>

<!-- three-doors -->
<table align="center">
  <tr>
    <td align="center"><strong>Do it yourself</strong><br/>Clone it, run it, own it. Free, MIT.<br/><a href="#quick-start">Quick start</a></td>
    <td align="center"><strong>We customise it</strong><br/>Your fields, your rules, your ftrack Studio data brought across.<br/><a href="https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=ftrack">Book a call</a></td>
    <td align="center"><strong>We run it for you</strong><br/>Installed, connected and operated inside Omni. Setup fee, then a retainer.<br/><a href="https://enterprisedna.co/omni/instead-of/ftrack?utm_source=github&utm_medium=readme&utm_campaign=ftrack">How it works</a></td>
  </tr>
</table>

<p align="center">
  <a href="#what-is-this">What is this</a> &bull;
  <a href="#why-no-front-end">Why no front end</a> &bull;
  <a href="#quick-start">Quick start</a> &bull;
  <a href="#the-commands">Commands</a> &bull;
  <a href="#instead-of-ftrack">Instead of ftrack Studio</a> &bull;
  <a href="#want-it-installed-and-run-for-you">Installed for you</a> &bull;
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node-20+-339933?style=flat-square" alt="Node 20+" />
  <img src="https://img.shields.io/badge/PostgreSQL-any-336791?style=flat-square" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/PGlite-embedded-3ecf8e?style=flat-square" alt="PGlite" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="MIT License" />
</p>

---

## What is this

Shot Tracking for Claude Code does the job you pay ftrack Studio for, as a Postgres database and a set of agent commands. There is no web front end. You open the folder in [Claude Code](https://claude.com/claude-code) (or Codex, OpenCode, Cursor: see `AGENTS.md`) and ask for what you want in plain language. It runs the right query, and it can answer questions the ftrack Studio dashboard cannot.

ftrack Studio lists US$25 per user per month billed annually, US$30 month to month ([ftrack pricing](https://www.ftrack.com/en/pricing), checked 2026-11-13). A 50-person studio on Studio seats pays US$15,000 a year before storage add-ons, and the bill grows with every hire.

Want the same thing with a web front end, or built on a different stack? That is a customisation, and it is exactly what Enterprise DNA does: [book a call](https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=ftrack).

It is built for VFX and animation studios of 10 to 100 people in Australia and New Zealand: shows, sequences, shots, asset builds, tasks by department step, artist time, versions through internal and client review, client notes, change orders, vendor costs and deliveries. It answers the producer's questions (which shots are over bid with no change order, who is overbooked this fortnight, which client notes are a week old) and keeps the rebate evidence straight as you go: qualifying spend against the Australian PDV Offset and the New Zealand Screen Production Rebate thresholds, the NZ registration deadline, and vendor costs with no invoice reference.

### Ten questions ftrack's dashboards do not answer

1. Which shots have used more days than we bid, and does a change order cover the difference?
2. Which department's bids run light across every show we have delivered?
3. How far is each show from the PDV Offset or NZ rebate threshold, counting only in-country time at day rates and evidenced invoices?
4. Has every NZ show registered for the rebate within 20 working days of the bid being accepted?
5. Which vendor costs are missing the invoice reference we need for the rebate claim?
6. Which client notes are more than five days old and still not addressed?
7. Which versions have sat with the client longer than five days with no answer?
8. Which artists have more bid days left on tasks due this fortnight than working days to do them?
9. Which shots are due in the next ten days with no approved version?
10. Which shots are approved but past their due date with no delivery recorded?

### Your first hour: ten things to ask for

1. "What needs my attention today?" (`/attention`)
2. "What is up for dailies?" (`/dailies`)
3. "Which shots are over bid, and is a change order covering them?" (`/over-bid`)
4. "Who is overbooked in the next two weeks?" (`/artist-load`)
5. "How far is Harbour Light from the NZ rebate threshold?" (`/rebate`)
6. "Are we compliant on every rebate show?" (`/compliance`)
7. "Draft a status update for Southern Cross Pictures." (`/draft-client-update`)
8. "Raise a change order for the edit change on HAR_010_0030." (`/change-orders`)
9. "Log 7.5 hours for Priya on the seawall FX." (`/log`)
10. "Add a field for the client's shot ID to every shot." (`/customise`)

## Why no front end

- The front end was only ever there because the database was hard to talk to. That is no longer true.
- Your data sits in plain Postgres tables you own. Any tool can read them. No export, no lock-in.
- No seats, no tiers, no add-ons. Read [docs/why-no-front-end.md](docs/why-no-front-end.md) for the honest trade-offs too.

## Quick start

Sixty seconds, no database install (an embedded Postgres runs inside Node):

```bash
git clone https://github.com/Enterprise-DNA-OS/shot-tracking-for-claude-code.git
cd shot-tracking-for-claude-code
npm install
npm run demo
```

Then open the folder in Claude Code and type `/attention`. The demo studio has three shows and every kind of loose end: a shot over bid, a client note nobody answered, a change order nobody decided, an artist booked past capacity and an unregistered NZ rebate.

`npm run view` writes the dashboards (this week, shot board, bid against actual, rebate) to `views/`. `npm run docs` writes the client status report, rebate spend schedule and change orders to `docs-out/`, in your brand from `brand.json`.

### Use it with your own Postgres or Supabase

Copy `.env.example` to `.env`, set `DATABASE_URL`, then `npm run migrate`. Same commands, shared data, no per-seat fee.

## The commands

| Command | What it does |
|---|---|
| `/add` | Add a client, show, person, shot, asset, task, vendor cost or note from a plain description. |
| `/artist-load` | Who is overbooked or free in the next fortnight. |
| `/assets` | List the builds (characters, props, environments, FX, mattes) and where each stands. |
| `/attention` | Everything that needs a producer today, in one list. |
| `/audit` | What changed recently and on which record. |
| `/card` | Show the full record for one shot, task, version, person, show, note or change order. |
| `/change-orders` | Raise, list and decide change orders: work the client asked for outside the bid. |
| `/client-notes` | Client notes not yet addressed, oldest first. |
| `/compliance` | Check every rebate show against the scheme rules in docs/compliance.md and report what is breached, due or short, with the rule cited. |
| `/customise` | Make this system yours in plain language. Add a field, rename stages, change a rule, add a column to a document. Writes the migration, applies it, updates the commands that touch it. |
| `/dailies` | What is up for review today: internal reviews waiting, versions with the client, and recent submissions. |
| `/deliveries` | Shots due for delivery soon, and whether each has an approved version. |
| `/draft-change-order` | Draft the change order note for the client to approve. |
| `/draft-client-update` | Draft the status note to a client: shot counts, versions waiting on them, their notes in progress, change orders to decide. |
| `/draft-weekly-review` | Save the Monday review as a draft file. |
| `/export` | Export every record to CSV and one JSON snapshot. |
| `/import` | Bring tasks across from an ftrack Studio spreadsheet export. |
| `/log` | Log artist time against a task. |
| `/new-view` | Add a read-only HTML view (a dashboard page) from a plain-language description, rendered in the operator's brand by `npm run view`. |
| `/note` | Add a note to a shot or asset, from the team or from the client. |
| `/over-bid` | Shots that have used more days than were bid, and whether a change order covers it. |
| `/people` | List the studio team: department, role, where they work and their day rate. |
| `/rebate` | Qualifying spend toward the PDV Offset or the NZ Screen Production Rebate, show by show. |
| `/review` | Record a review decision on a version: internal notes, send to client, client notes, or approve. |
| `/shots` | List shots for a show, sequence or status, with bid, actual days and the latest version. |
| `/shows` | List every show with its client, rebate scheme, delivery date and shot counts. |
| `/submit` | Record a new version an artist has put up for review. |
| `/tasks` | List tasks for a show or an artist, with bid and actual days. |
| `/update` | Change a field on a record: due date, bid, status, assignee, day rate, rebate dates. |
| `/weekly-review` | The Monday review: shows, what needs attention, bid against actual, and the rebate position. |

Every command drives one CLI: `node scripts/shots.mjs help`.

## Instead of ftrack Studio

Export the task spreadsheet from ftrack Studio as CSV, add your artists, then `node scripts/shots.mjs import ftrack --file=tasks.csv --show=<ref> --dry-run`. Different column names take a small mapping file. The guide, including what does not come across (media, review annotations, time history): [docs/replace-ftrack.md](docs/replace-ftrack.md).

The rules the compliance checks enforce, with sources: [docs/compliance.md](docs/compliance.md).

## Architecture

```
shot-tracking-for-claude-code/
  CLAUDE.md                 how the operator wants this run (routing table + house rules)
  AGENTS.md                 the same, for Codex / OpenCode / Cursor / Gemini CLI
  .claude/commands/         the slash commands
  scripts/                  the CLI the commands drive
  scripts/lib/db.mjs        one adapter: DATABASE_URL (pg) or embedded PGlite
  supabase/migrations/      plain SQL schema
  supabase/seed.sql         demo data
  docs/                     the thesis and the migration guide
```

## Built for coding agents

The database, CLI and command recipes work with Claude Code, Codex, OpenCode or Cursor. Ask your coding agent for a new command and have it implement and test the change against the same records.

## Contributing

Issues and pull requests are welcome. Keep the shape: plain SQL, a small CLI, a slash command per recurring job, no front end.

## Want it installed and run for you?

Enterprise DNA installs Shot Tracking for Claude Code for your business, migrates your ftrack Studio data, connects it to the rest of your tools, and runs it for you as part of **Omni**, our managed Command Center. One setup fee, then a monthly retainer.

- Book a call: [enterprisedna.co/omni/book](https://enterprisedna.co/omni/book/?offer=replace-software&utm_source=github&utm_medium=readme&utm_campaign=ftrack)
- Read more: [enterprisedna.co/omni/instead-of/ftrack](https://enterprisedna.co/omni/instead-of/ftrack?utm_source=github&utm_medium=readme&utm_campaign=ftrack)

## License

MIT. Copyright (c) 2026 Enterprise DNA.
