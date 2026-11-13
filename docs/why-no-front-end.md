# Why there is no front end

ftrack Studio is a production database with a subscription per user. Underneath it are ordinary records: shows, shots, assets, tasks, time, versions, notes. The subscription pays for the screens on top, so producers and coordinators who do not write queries can get at those records.

A producer's real questions are rarely on the screens anyway. Which shots are over bid with no change order? How far are we from the rebate threshold? Which client notes are a week old? Here you ask in plain words and Claude Code runs the query.

## What you gain

- **Answers the dashboard does not chart.** Bid against actual by department, rebate spend counted the way the scheme counts it, client notes by age.
- **No seats.** Coordinators, supervisors and the production accountant can all ask. The bill does not grow with the crew.
- **Your records in your own Postgres.** Back them up, query them from your pipeline tools, leave any time.
- **Your pipeline, your rules.** Step names, statuses and review rules change with one command, not a feature request.

## What a screen gives that this does not

Be clear-eyed about this before you switch:

- **Media review.** ftrack plays versions, draws on frames and syncs review sessions. This system records versions and notes; it does not play media. Keep your review player (RV, cineSync, or whatever your studio uses) and record the decision here, or have Enterprise DNA connect one.
- **Artists clicking on their own tasks.** Artists usually live in their DCC and a task list. Here the coordinator or a pipeline hook logs time and versions. A small artist page is a common customisation.
- **DCC integrations.** ftrack's connectors publish from Nuke, Maya and Houdini. A pipeline TD can call this CLI or write to the database the same way; it is not wired out of the box.
- **A phone app.** It runs where Claude Code runs.

## Who this fits

Studios where the producers and supervisors drive the schedule and the money, and the review player is already separate. If your artists need a full tracking interface all day, keep it, or ask Enterprise DNA to build the screens you need on top of this database.

Installed and run for you: https://enterprisedna.co/omni/instead-of/ftrack
