# Moving off ftrack Studio

What comes across in one command, what needs a mapping, and what stays behind.

## 1. Export from ftrack Studio

In ftrack Studio, open the project's task spreadsheet, filter to the tasks you want, and export it. ftrack's own help says spreadsheets export to PDF, Excel or CSV, and that filters and lists decide which rows go out ([Managing projects FAQ](https://help.ftrack-studio.backlight.co/hc/en-us/articles/13129929882263-Managing-Projects)). Choose CSV.

Show these columns in the spreadsheet before you export:

| Column the import reads | Names it looks for | Required |
|---|---|---|
| shot | Shot, Parent, Link, Path | yes |
| step | Type, Task type, Name, Task | yes |
| status | Status | no (defaults to not started) |
| assignee | Assignee, Assignees, Assigned to | no |
| bid | Bid, Bid (days), Bid days | no |
| start | Start date, Start | no |
| due | Due date, End date, Due | no |

The shot column can be a path ("Harbour Light / 030 / HAR_030_0010"): the last part becomes the shot code and the one before it the sequence.

If your columns have other names, write a mapping file:

```json
{ "shot": "Shot code", "step": "Department", "status": "State", "assignee": "Artist", "bid": "Bid hours" }
```

## 2. Import

```bash
node scripts/shots.mjs import ftrack --file=tasks.csv --show=HAR --dry-run
node scripts/shots.mjs import ftrack --file=tasks.csv --show=HAR
```

- Add the show (`add show`) and every artist (`add person`) first. A row naming someone the database does not know stops the import.
- `--bid-unit=hours` if your bids are in hours; a bid day is the `working_day_minutes` setting (480).
- The whole file goes in one transaction: one bad row and nothing is written. The error names the row.
- Running the same file again updates the same tasks (status, bid, dates, assignee) instead of duplicating them. Task refs are `<shot>_<step>`.
- Shots that do not exist yet are created with their sequence; their bid is the sum of their task bids.

## What maps

| ftrack | Here |
|---|---|
| Project | show |
| Sequence / Shot | shots.sequence / shots.ref |
| Task (type) | tasks.step (compositing to comp, rotoscoping to roto, modelling to model, and so on) |
| Status | tasks.status (Not started, Ready to start, In progress, Pending Review, Approved, Completed, On Hold) |
| Assignee | tasks.assignee_id, matched by full name |
| Bid, Start date, Due date | tasks.bid_days, start_on, due_on |

Statuses or task types your studio added are not in the list: the import stops and names them. Add them to `FTRACK_STATUS` or `FTRACK_STEP` in `scripts/shots.mjs` (or ask Claude Code to with `/customise`).

## What does not come across

- **Media and review annotations.** Keep them in ftrack's storage or your own until the show wraps, or export them separately.
- **Versions and notes history.** Notes export from the Versions page with the Notes List column added (same help page). Bring them in with `/note`, or have Enterprise DNA map the export.
- **Logged time.** Export ftrack's time report and load it with `log-time`, or start logging here from the switch date.
- **Asset builds.** Add them with `add asset`; the task import covers shot tasks.

Run a show in parallel for a week before you switch the whole studio.
