#!/usr/bin/env node
// npm test: a temporary embedded database, the migration, the demo data, every command, and the
// rules that keep the records honest. Runs on Windows and Linux. Prints PASS or exits 1.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { getDb, REPO_ROOT } from './lib/db.mjs';
import { migrate } from './migrate.mjs';
import { seed } from './seed.mjs';
import { execute, workingDaysBetween } from './shots.mjs';

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'shot-tracking-test-'));
process.env.DATABASE_URL = '';
process.env.DATA_DIR = path.join(scratch, 'db');
process.env.OUTPUT_DIR = path.join(scratch, 'output');
const db = await getDb();
let checks = 0;
const test = async (name, fn) => { await fn(); checks++; console.log(`ok ${checks} ${name}`); };
const run = (...args) => execute(db, args);
const bad = (args, re) => assert.rejects(() => run(...args), re);
const q = (sql, p) => db.query(sql, p);
const fixture = (name, text) => { const p = path.join(scratch, name); fs.writeFileSync(p, text); return p; };
let closed = false;
try {
  await test('migration and seed are repeatable', async () => {
    assert.equal((await migrate(db)).ran.length, 1);
    assert.equal((await migrate(db)).ran.length, 0);
    await seed(db); await seed(db);
    assert.equal((await run('shows')).length, 3);
    assert.equal((await run('shots')).length, 9);
  });

  await test('every read command returns records', async () => {
    for (const c of ['shows', 'shots', 'assets', 'tasks', 'people', 'clients', 'versions', 'notes', 'dailies', 'client-notes', 'over-bid', 'over-bid-by-step', 'artist-load', 'deliveries', 'unassigned', 'change-orders', 'rebate', 'compliance', 'attention', 'audit'])
      assert(Array.isArray(await run(c)), c);
    assert.match((await run('help')).help, /import ftrack/);
    const w = await run('weekly-review');
    assert.deepEqual(w.attention, await run('attention'));
    assert.deepEqual(w.over_bid, await run('over-bid'));
  });

  await test('the demo surfaces every kind of loose end', async () => {
    const a = await run('attention');
    for (const c of ['Over bid', 'Waiting for internal review', 'Waiting on the client', 'Client note not addressed', 'Change order undecided', 'Due soon, nothing approved', 'Approved, not delivered', 'Nobody assigned', 'Artist overbooked', 'Rebate'])
      assert(a.some((x) => x.category === c), c);
    const ob = await run('over-bid');
    assert.equal(ob.length, 1); assert.equal(ob[0].shot, 'HAR_010_0030'); assert.equal(Number(ob[0].pct_of_bid), 112);
    const load = (await run('artist-load')).find((r) => r.ref === 'P02');
    assert.equal(Number(load.remaining_days), 11);
  });

  await test('rebate spend counts only in-country, evidenced, costed spend', async () => {
    const r = Object.fromEntries((await run('rebate')).map((x) => [x.show, x]));
    // HAR: NZ time at day rates plus the one evidenced NZ vendor invoice.
    const [labour] = await q(`select sum(round(l.minutes / 480.0 * p.day_rate_cents))::bigint as c from time_logs l join tasks t on t.id = l.task_id join people p on p.id = l.person_id join shows s on s.id = t.show_id where s.ref = 'HAR' and l.location = 'NZ'`);
    assert.equal(Number(r.HAR.qualifying_cents), Number(labour.c) + 840000);
    assert.equal(Number(r.HAR.no_evidence_cents), 1250000);
    assert.equal(Number(r.HAR.rebate_estimate_cents), Math.round(Number(r.HAR.qualifying_cents) * 0.2));
    assert.equal(Number(r.KTW.unpriced_hours), 16);
    const c = await run('compliance');
    assert.equal(c[0].state, 'breach');
    assert(c.some((x) => x.show === 'HAR' && /working days gone/.test(x.detail) && x.state === 'breach'));
    await run('set', 'show', 'HAR', '--registered=' + (await q('select current_date::text d'))[0].d);
    assert((await run('compliance')).some((x) => x.show === 'HAR' && /^Registered/.test(x.detail) && x.state === 'ok'));
  });

  await test('working days skip weekends', async () => {
    assert.equal(workingDaysBetween('2026-11-13', '2026-11-16'), 1); // Friday to Monday
    assert.equal(workingDaysBetween('2026-11-02', '2026-11-30'), 20);
  });

  await test('names, refs and id prefixes resolve; ambiguity fails with candidates', async () => {
    assert.equal((await run('card', 'person', 'mere tane'))[0].ref, 'P01');
    const p = (await run('card', 'person', 'P03'))[0];
    assert.equal((await run('card', 'person', p.id.slice(0, 8)))[0].id, p.id);
    await bad(['card', 'person', 'Alex'], /Ambiguous person[\s\S]*P08[\s\S]*P09/);
    await bad(['card', 'shot', 'nothing-like-this'], /No shot/);
    await bad(['card', 'person', '%'], /No person/);
  });

  await test('the version loop moves shots and tasks through review', async () => {
    await run('add', 'shot', '--ref=HAR_030_0099', '--show=HAR', '--sequence=030', '--description=Test shot', '--bid-days=2', '--due=2026-12-01');
    await run('add', 'task', '--shot=HAR_030_0099', '--step=comp', '--assignee=P01', '--bid-days=2');
    const [task] = await q(`select ref from tasks where shot_id = (select id from shots where ref = 'HAR_030_0099')`);
    await run('log-time', task.ref, '--hours=7.5');
    assert.equal((await run('card', 'shot', 'HAR_030_0099'))[0].status, 'in_progress');
    const [v1] = await run('submit', task.ref);
    assert.equal(v1.ref, 'HAR_030_0099_comp_v001');
    assert.equal((await run('card', 'shot', 'HAR_030_0099'))[0].status, 'internal_review');
    await bad(['review', v1.ref, '--decision=client-notes'], /pending_internal/);
    await run('review', v1.ref, '--decision=send');
    assert.equal((await run('card', 'shot', 'HAR_030_0099'))[0].status, 'client_review');
    await run('review', v1.ref, '--decision=client-notes', '--note=Make it warmer', '--author=Dana Hollis');
    assert((await run('client-notes')).some((n) => n.body === 'Make it warmer'));
    const [v2] = await run('submit', task.ref);
    assert.equal(v2.number, 2);
    await run('review', v2.ref, '--decision=send');
    await run('review', v2.ref, '--decision=approve');
    assert.equal((await run('card', 'shot', 'HAR_030_0099'))[0].status, 'approved');
    await run('deliver', 'HAR_030_0099', '--package=HAR_turnover_02');
    assert.equal((await run('card', 'shot', 'HAR_030_0099'))[0].status, 'delivered');
    await bad(['deliver', 'HAR_020_0010'], /only an approved shot/);
  });

  await test('writes validate dates, steps, money, currency and fields', async () => {
    await bad(['add', 'shot', '--ref=BAD_1', '--show=HAR', '--due=2026-02-30'], /Invalid calendar date/);
    await bad(['add', 'task', '--shot=HAR_020_0010', '--step=juggling'], /Unknown step/);
    await bad(['add', 'task', '--step=comp'], /exactly one shot or one asset/);
    await bad(['set', 'shot', 'HAR_020_0010', '--colour=red'], /Unknown shot field/);
    await bad(['set', 'shot', 'HAR_020_0010', '--status=finished'], /check constraint/);
    await bad(['set', 'show', 'KTW', '--currency=NZD'], /counted in AUD/);
    await bad(['log-time', 'T-107', '--hours=30'], /between 0 and 24/);
    await bad(['log-time', 'T-107', '--hours=2', '--date=2999-01-01'], /on or before today/);
    await run('set', 'person', 'P06', '--day-rate=540');
    assert.equal(Number((await run('card', 'person', 'P06'))[0].day_rate_cents), 54000);
    assert.equal(Number((await run('rebate')).find((r) => r.show === 'KTW').unpriced_hours), 0);
    const co = await run('raise-change', 'HAR_020_0010', '--days=1.5', '--amount=900', '--description=Extra window');
    assert.equal(co[0].status, 'raised');
    await run('decide-change', co[0].ref, '--status=approved');
    assert.equal((await run('card', 'change', co[0].ref))[0].status, 'approved');
    await run('note', 'HAR_020_0010', '--text=Check the reflection', '--author=Mere Tane');
    const [n] = await q(`select ref from notes where body = 'Check the reflection'`);
    await run('address', n.ref);
    assert((await q(`select * from audit_events where entity = 'people' and action = 'UPDATE'`)).length > 0);
  });

  await test('ftrack import: dry run, repeat import, mapping and full rollback on a bad row', async () => {
    const file = path.join(REPO_ROOT, 'tests', 'fixtures', 'ftrack-tasks-synthetic.csv');
    const dry = await run('import', 'ftrack', '--file=' + file, '--show=HAR', '--dry-run');
    assert.equal(dry.rows, 3); assert.equal(dry.tasks_new, 3); assert.equal(dry.shots_new, 2);
    assert.equal((await q(`select * from shots where ref = 'HAR_030_0010'`)).length, 0);
    await run('import', 'ftrack', '--file=' + file, '--show=HAR');
    const again = await run('import', 'ftrack', '--file=' + file, '--show=HAR');
    assert.equal(again.tasks_updated, 3); assert.equal(again.tasks_new, 0);
    const [t] = await q(`select status, bid_days from tasks where ref = 'HAR_030_0010_roto'`);
    assert.equal(t.status, 'done'); assert.equal(Number(t.bid_days), 1.5);
    assert.equal((await q(`select sequence from shots where ref = 'HAR_030_0020'`))[0].sequence, '030');
    const mapped = fixture('mapped.csv', 'Shot code,Department,State,Artist,Bid hours\nHAR_030_0030,Lighting,Pending Review,Hana Kim,16\n');
    const map = fixture('map.json', JSON.stringify({ shot: 'Shot code', step: 'Department', status: 'State', assignee: 'Artist', bid: 'Bid hours' }));
    await run('import', 'ftrack', '--file=' + mapped, '--mapping=' + map, '--show=HAR', '--bid-unit=hours');
    assert.equal(Number((await q(`select bid_days from tasks where ref = 'HAR_030_0030_lighting'`))[0].bid_days), 2);
    const before = (await q('select count(*)::int n from audit_events'))[0].n;
    const broken = fixture('broken.csv', 'Link,Type,Status,Assignees\nHAR_030_0040,Compositing,In progress,Mere Tane\nHAR_030_0041,Compositing,In progress,Nobody Known\n');
    await bad(['import', 'ftrack', '--file=' + broken, '--show=HAR'], /CSV row 3: nobody called "Nobody Known"/);
    assert.equal((await q(`select * from shots where ref = 'HAR_030_0040'`)).length, 0);
    assert.equal((await q('select count(*)::int n from audit_events'))[0].n, before);
    await bad(['import', 'ftrack', '--file=' + fixture('cols.csv', 'Foo,Bar\n1,2\n'), '--show=HAR'], /Could not find the shot and step column/);
    await bad(['import', 'ftrack', '--file=' + file, '--show=KTW'], /belongs to another show/);
  });

  await test('drafts carry the real records; export refuses to overwrite', async () => {
    for (const cmd of [['draft-client-update', 'HAR'], ['draft-change-order', 'CO-101'], ['draft-weekly-review']]) {
      const { file } = await run(...cmd);
      const text = fs.readFileSync(file, 'utf8');
      assert(text.includes('DRAFT'), cmd[0]);
      if (cmd[0] === 'draft-client-update') assert(text.includes('Beam reads too blue'));
      if (cmd[0] === 'draft-change-order') assert(text.includes('$1,800'));
    }
    const dir = path.join(scratch, 'export');
    const e = await run('export', '--out=' + dir);
    assert.equal(e.counts.people, 9);
    const snap = JSON.parse(fs.readFileSync(path.join(dir, 'snapshot.json'), 'utf8'));
    assert.equal(snap.tables.shots.length, e.counts.shots);
    assert(fs.readFileSync(path.join(dir, 'shots.csv'), 'utf8').startsWith('id,'));
    await bad(['export', '--out=' + dir], /EEXIST/);
  });

  await test('HTML output escapes record text', async () => {
    await run('set', 'show', 'HAR', '--name=<script>alert(1)</script>');
    await db.close(); closed = true;
    const p = spawnSync(process.execPath, ['scripts/docs.mjs', 'client-status-report'], { cwd: REPO_ROOT, env: process.env, encoding: 'utf8' });
    assert.equal(p.status, 0, p.stderr);
    const dir = path.join(process.env.OUTPUT_DIR, 'docs-out', 'client-status-report');
    const html = fs.readdirSync(dir).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('');
    assert(html.includes('&lt;script&gt;')); assert(!html.includes('<script>alert'));
  });

  await test('the CLI exits 1 with candidates on an ambiguous name', async () => {
    const p = spawnSync(process.execPath, ['scripts/shots.mjs', 'card', 'person', 'Alex', '--json'], { cwd: REPO_ROOT, env: process.env, encoding: 'utf8' });
    assert.equal(p.status, 1);
    assert.match(p.stderr, /P08[\s\S]*P09/);
  });

  await test('every view and document renders', async () => {
    for (const name of ['view', 'docs']) {
      const p = spawnSync(process.execPath, [`scripts/${name}.mjs`], { cwd: REPO_ROOT, env: process.env, encoding: 'utf8' });
      assert.equal(p.status, 0, p.stderr);
    }
    for (const v of ['week', 'shot-board', 'bid-vs-actual', 'rebate']) assert(fs.existsSync(path.join(process.env.OUTPUT_DIR, 'views', `${v}.html`)), v);
    assert.equal(fs.readdirSync(path.join(process.env.OUTPUT_DIR, 'docs-out', 'rebate-spend-schedule')).length, 2);
    assert(fs.readdirSync(path.join(process.env.OUTPUT_DIR, 'docs-out', 'change-order')).length >= 3);
  });

  console.log(`PASS: ${checks} end-to-end checks on an isolated embedded database.`);
} finally {
  if (!closed) await db.close();
  fs.rmSync(scratch, { recursive: true, force: true });
}
