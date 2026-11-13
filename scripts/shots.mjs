#!/usr/bin/env node
// The one CLI for Shot Tracking for Claude Code. Every slash command drives this file.
//   node scripts/shots.mjs <command> [args] [--json]
//   node scripts/shots.mjs help
// Human tables by default, --json for machines. Names match case-insensitively, ids by prefix;
// an ambiguous name lists the candidates and exits 1.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getDb, REPO_ROOT } from './lib/db.mjs';
import { parseCsv, pick } from './lib/csv.mjs';
import { table, money, heading } from './lib/format.mjs';

// ------------------------------------------------------------------ records

const ENTITIES = {
  client: { table: 'clients', prefix: 'C', name: 'name', fields: ['ref', 'name', 'contact_name', 'contact_email'] },
  show: { table: 'shows', prefix: 'S', name: 'name', fields: ['ref', 'name', 'client_id', 'status', 'currency', 'rebate_scheme', 'bid_accepted_on', 'rebate_registered_on', 'delivery_due'] },
  person: { table: 'people', prefix: 'P', name: 'name', fields: ['ref', 'name', 'department', 'role', 'location', 'day_rate_cents', 'active'] },
  shot: { table: 'shots', name: 'description', fields: ['ref', 'show_id', 'sequence', 'description', 'status', 'frame_in', 'frame_out', 'due_on', 'bid_days'] },
  asset: { table: 'assets', name: 'name', fields: ['ref', 'show_id', 'name', 'kind', 'status', 'due_on', 'bid_days'] },
  task: { table: 'tasks', prefix: 'T', fields: ['ref', 'shot_id', 'asset_id', 'step', 'assignee_id', 'status', 'bid_days', 'start_on', 'due_on'] },
  time: { table: 'time_logs', prefix: 'L', fields: ['ref', 'task_id', 'person_id', 'work_date', 'minutes', 'location', 'note'] },
  version: { table: 'versions', fields: ['ref', 'status', 'submitted_on', 'sent_to_client_on', 'reviewed_on'] },
  note: { table: 'notes', prefix: 'N', name: 'body', fields: ['ref', 'shot_id', 'asset_id', 'version_id', 'author', 'from_client', 'body', 'noted_on', 'addressed_on'] },
  change: { table: 'change_orders', prefix: 'CO', name: 'description', fields: ['ref', 'shot_id', 'description', 'days', 'amount_cents', 'status', 'raised_on', 'decided_on'] },
  spend: { table: 'vendor_spend', prefix: 'V', name: 'vendor', fields: ['ref', 'show_id', 'vendor', 'description', 'amount_cents', 'incurred_on', 'location', 'evidence_ref'] },
  delivery: { table: 'deliveries', prefix: 'D', fields: ['ref', 'shot_id', 'delivered_on', 'package'] },
};
const FK = { client_id: 'client', show_id: 'show', shot_id: 'shot', asset_id: 'asset', assignee_id: 'person', person_id: 'person', task_id: 'task', version_id: 'version' };
const ALIAS = { client: 'client_id', show: 'show_id', shot: 'shot_id', asset: 'asset_id', assignee: 'assignee_id', person: 'person_id', task: 'task_id', version: 'version_id', due: 'due_on', start: 'start_on', day_rate: 'day_rate_cents', amount: 'amount_cents', evidence: 'evidence_ref', scheme: 'rebate_scheme', registered: 'rebate_registered_on', bid_accepted: 'bid_accepted_on', date: 'work_date' };
const MONEY = new Set(['day_rate_cents', 'amount_cents']);
const DATES = /(_on|_due|_date)$/;
const STEPS = ['roto', 'paint', 'track', 'layout', 'model', 'texture', 'rig', 'animation', 'fx', 'lighting', 'comp', 'matte', 'edit'];

class UserError extends Error {}
const fail = (msg) => { throw new UserError(msg); };

function parseArgs(argv) {
  const pos = [], opt = {};
  for (const a of argv) {
    const m = /^--([a-z][a-z0-9-]*)(?:=(.*))?$/i.exec(a);
    if (m) opt[m[1].toLowerCase().replace(/-/g, '_')] = m[2] === undefined ? true : m[2];
    else pos.push(a);
  }
  return { pos, opt };
}

export function checkDate(v, what = 'date') {
  const s = String(v).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) fail(`Invalid calendar date for ${what}: ${v} (use YYYY-MM-DD)`);
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) fail(`Invalid calendar date for ${what}: ${v}`);
  return s;
}
const toCents = (v, what) => { const n = Number(String(v).replace(/[$,\s]/g, '')); if (!Number.isFinite(n) || n < 0) fail(`Invalid amount for ${what}: ${v}`); return Math.round(n * 100); };
const isoToday = async (db) => (await db.query('select current_date::text as d'))[0].d;

// Working days (Monday to Friday) after `from` up to and including `to`. Public holidays are not
// removed: the compliance doc says so, and the operator checks the holiday list for edge cases.
export function workingDaysBetween(from, to) {
  let n = 0;
  const d = new Date(`${from}T00:00:00Z`), end = new Date(`${to}T00:00:00Z`);
  while (d < end) { d.setUTCDate(d.getUTCDate() + 1); const w = d.getUTCDay(); if (w !== 0 && w !== 6) n++; }
  return n;
}
function addWorkingDays(from, days) {
  const d = new Date(`${from}T00:00:00Z`);
  let n = 0;
  while (n < days) { d.setUTCDate(d.getUTCDate() + 1); const w = d.getUTCDay(); if (w !== 0 && w !== 6) n++; }
  return d.toISOString().slice(0, 10);
}

// Resolve a record from what a person typed: exact ref, exact name, id prefix, then a partial match.
export async function resolve(db, entity, text) {
  const e = ENTITIES[entity] || fail(`Unknown record type: ${entity}`);
  const q = String(text ?? '').trim();
  if (!q) fail(`Say which ${entity}`);
  const label = e.name ? `ref || ' ' || coalesce(${e.name}, '')` : 'ref';
  const tries = [
    [`select id, ref, ${label} as label from ${e.table} where lower(ref) = lower($1)`, q],
    e.name && [`select id, ref, ${label} as label from ${e.table} where lower(${e.name}) = lower($1)`, q],
    /^[0-9a-f-]{4,36}$/i.test(q) && [`select id, ref, ${label} as label from ${e.table} where id::text like lower($1) || '%'`, q],
    [`select id, ref, ${label} as label from ${e.table} where ref ilike '%' || $1 || '%'${e.name ? ` or ${e.name} ilike '%' || $1 || '%'` : ''} order by ref limit 20`, q.replace(/[%_\\]/g, (c) => '\\' + c)],
  ].filter(Boolean);
  for (const [sql, p] of tries) {
    const rows = await db.query(sql, [p]);
    if (rows.length === 1) return rows[0];
    if (rows.length > 1) fail(`Ambiguous ${entity} "${q}". Candidates:\n${rows.map((r) => `  ${r.ref}  ${String(r.label).slice(r.ref.length + 1, r.ref.length + 61)}  (${r.id.slice(0, 8)})`).join('\n')}`);
  }
  fail(`No ${entity} matches "${q}"`);
}

async function nextRef(db, entity) {
  const e = ENTITIES[entity];
  const rows = await db.query(`select ref from ${e.table} where ref ~ $1`, [`^${e.prefix}-[0-9]+$`]);
  const n = rows.reduce((m, r) => Math.max(m, Number(r.ref.split('-')[1])), 100) + 1;
  return `${e.prefix}-${n}`;
}

async function toColumns(db, entity, opt) {
  const e = ENTITIES[entity];
  const cols = {};
  for (const [k0, v] of Object.entries(opt)) {
    if (['json', 'dry_run'].includes(k0)) continue;
    const k = ALIAS[k0] || k0;
    if (k === 'hours' && entity === 'time') { cols.minutes = Math.round(Number(v) * 60); continue; }
    if (!e.fields.includes(k)) fail(`Unknown ${entity} field: ${k0}. Fields: ${e.fields.map((f) => f.replace(/_id$|_cents$/, '')).join(', ')}`);
    if (FK[k]) cols[k] = v === '' || v === 'none' ? null : (await resolve(db, FK[k], v)).id;
    else if (MONEY.has(k)) cols[k] = toCents(v, k0);
    else if (DATES.test(k)) cols[k] = v === '' || v === 'none' ? null : checkDate(v, k0);
    else if (k === 'from_client' || k === 'active') cols[k] = v === true || /^(yes|true|y|1)$/i.test(String(v));
    else cols[k] = v === true ? 'true' : v;
  }
  return cols;
}

async function guardShow(db, showId) {
  const [s] = await db.query(`select s.ref, s.currency, s.rebate_scheme, r.currency as scheme_currency from shows s left join rebate_schemes r on r.code = s.rebate_scheme where s.id = $1`, [showId]);
  if (s?.rebate_scheme && s.currency !== s.scheme_currency) fail(`Show ${s.ref} claims ${s.rebate_scheme}, which is counted in ${s.scheme_currency}; set --currency=${s.scheme_currency}`);
}

async function addRecord(db, entity, opt) {
  const e = ENTITIES[entity] || fail(`Unknown record type: ${entity}. Types: ${Object.keys(ENTITIES).join(', ')}`);
  if (entity === 'version') fail('Versions are created with submit <task>');
  const cols = await toColumns(db, entity, opt);
  if (!cols.ref) { if (!e.prefix) fail(`A ${entity} needs --ref (the code your studio uses, for example HAR_010_0040)`); cols.ref = await nextRef(db, entity); }
  if (entity === 'task') {
    if (!cols.shot_id === !cols.asset_id) fail('A task belongs to exactly one shot or one asset: give --shot or --asset');
    if (cols.step && !STEPS.includes(cols.step)) fail(`Unknown step: ${cols.step}. Steps: ${STEPS.join(', ')}`);
    const [p] = await db.query(`select show_id from ${cols.shot_id ? 'shots' : 'assets'} where id = $1`, [cols.shot_id || cols.asset_id]);
    cols.show_id = p.show_id;
  }
  if (entity === 'change') {
    if (!cols.shot_id) fail('A change order needs --shot');
    cols.show_id = (await db.query('select show_id from shots where id = $1', [cols.shot_id]))[0].show_id;
  }
  if (entity === 'delivery') fail('Deliveries are recorded with deliver <shot>');
  if (entity === 'time') fail('Time is logged with log-time <task>');
  const keys = Object.keys(cols);
  const [row] = await db.query(`insert into ${e.table} (${keys.join(', ')}) values (${keys.map((_, i) => `$${i + 1}`).join(', ')}) returning *`, keys.map((k) => cols[k]));
  if (entity === 'show') await guardShow(db, row.id);
  return row;
}

async function setRecord(db, entity, ref, opt) {
  const e = ENTITIES[entity] || fail(`Unknown record type: ${entity}`);
  const r = await resolve(db, entity, ref);
  const cols = await toColumns(db, entity, opt);
  if (!Object.keys(cols).length) fail('Nothing to change: give at least one --field=value');
  if (entity === 'task' && (cols.shot_id || cols.asset_id)) fail('Move a task by adding a new one; a task keeps its shot or asset');
  if (cols.step && !STEPS.includes(cols.step)) fail(`Unknown step: ${cols.step}`);
  const keys = Object.keys(cols);
  const [row] = await db.query(`update ${e.table} set ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} where id = $1 returning *`, [r.id, ...keys.map((k) => cols[k])]);
  if (entity === 'show') await guardShow(db, row.id);
  return row;
}

async function tx(db, fn) {
  await db.exec('BEGIN');
  try { const out = await fn(); await db.exec('COMMIT'); return out; }
  catch (err) { await db.exec('ROLLBACK'); throw err; }
}
const setting = async (db, key) => Number((await db.query('select value from settings where key = $1', [key]))[0].value);

// ------------------------------------------------------------------ reads

const READS = {
  shows: `select s.ref, s.name, c.name as client, s.status, coalesce(s.rebate_scheme, '') as rebate, s.delivery_due,
            count(sh.id) filter (where sh.status <> 'omitted') as shots,
            count(sh.id) filter (where sh.status in ('approved', 'delivered')) as approved,
            count(sh.id) filter (where sh.status = 'delivered') as delivered
          from shows s join clients c on c.id = s.client_id left join shots sh on sh.show_id = s.id
          group by s.id, c.name order by s.ref`,
  people: `select ref, name, department, role, location, day_rate_cents, active from people order by ref`,
  clients: `select ref, name, contact_name, contact_email from clients order by ref`,
  assets: `select a.ref, s.ref as show, a.name, a.kind, a.status, a.due_on, a.bid_days from assets a join shows s on s.id = a.show_id order by a.ref`,
  'change-orders': `select co.ref, s.ref as show, sh.ref as shot, co.description, co.days, co.amount_cents, s.currency, co.status, co.raised_on, co.decided_on,
            current_date - co.raised_on as age_days
          from change_orders co join shows s on s.id = co.show_id left join shots sh on sh.id = co.shot_id order by co.raised_on`,
  rebate: `select show, name, scheme, currency, qualifying_cents, threshold_cents, gap_cents, rebate_estimate_cents, outside_country_cents, no_evidence_cents, round(unpriced_minutes / 60.0, 1) as unpriced_hours from rebate_spend order by show`,
  audit: `select at, entity, action, data->>'ref' as ref from audit_events order by id desc limit 25`,
};

async function shots(db, opt) {
  const where = [], p = [];
  if (opt.show) { p.push((await resolve(db, 'show', opt.show)).id); where.push(`show_id = $${p.length}`); }
  if (opt.status) { p.push(opt.status); where.push(`status = $${p.length}`); }
  if (opt.sequence) { p.push(opt.sequence); where.push(`sequence = $${p.length}`); }
  return db.query(`select show, shot, sequence, status, due_on, bid_days, actual_days, pct_of_bid, latest_version from shot_progress ${where.length ? 'where ' + where.join(' and ') : ''} order by shot`, p);
}

async function tasks(db, opt) {
  const where = [], p = [];
  if (opt.show) { p.push((await resolve(db, 'show', opt.show)).id); where.push(`ta.show_id = $${p.length}`); }
  if (opt.person) { p.push((await resolve(db, 'person', opt.person)).id); where.push(`ta.assignee_id = $${p.length}`); }
  if (opt.open) where.push(`ta.status not in ('done')`);
  return db.query(`select ta.ref, coalesce(sh.ref, a.ref) as "for", ta.step, coalesce(p.name, '(unassigned)') as assignee, ta.status, ta.due_on, ta.bid_days, ta.actual_days
    from task_actuals ta left join shots sh on sh.id = ta.shot_id left join assets a on a.id = ta.asset_id left join people p on p.id = ta.assignee_id
    ${where.length ? 'where ' + where.join(' and ') : ''} order by ta.due_on nulls last, ta.ref`, p);
}

async function versions(db, opt) {
  const p = [];
  let where = '';
  if (opt.status) { p.push(opt.status); where = 'where v.status = $1'; }
  return db.query(`select v.ref, coalesce(sh.ref, a.ref) as "for", t.step, v.number, p.name as artist, v.status, v.submitted_on, v.sent_to_client_on, v.reviewed_on
    from versions v join tasks t on t.id = v.task_id left join shots sh on sh.id = t.shot_id left join assets a on a.id = t.asset_id left join people p on p.id = v.submitted_by
    ${where} order by v.submitted_on desc, v.ref`, p);
}

async function notes(db, opt) {
  return db.query(`select n.ref, coalesce(sh.ref, a.ref) as "for", n.author, n.from_client, n.noted_on, n.addressed_on, n.body
    from notes n left join shots sh on sh.id = n.shot_id left join assets a on a.id = n.asset_id
    ${opt.open ? 'where n.addressed_on is null' : ''} order by n.noted_on desc, n.ref`);
}

// Versions waiting on somebody: internal reviews piling up and versions sitting with the client.
async function dailies(db, opt) {
  const days = Number(opt.days || 3);
  return db.query(`select v.ref, coalesce(sh.ref, a.ref) as "for", t.step, p.name as artist, v.status, v.submitted_on,
      case when v.status = 'pending_client' then current_date - v.sent_to_client_on else current_date - v.submitted_on end as waiting_days
    from versions v join tasks t on t.id = v.task_id left join shots sh on sh.id = t.shot_id left join assets a on a.id = t.asset_id left join people p on p.id = v.submitted_by
    where v.status in ('pending_internal', 'pending_client') or v.submitted_on >= current_date - $1::int
    order by (v.status = 'pending_internal') desc, v.submitted_on`, [days]);
}

async function clientNotes(db) {
  return db.query(`select n.ref, coalesce(sh.ref, a.ref) as "for", n.author, n.noted_on, current_date - n.noted_on as age_days, n.body
    from notes n left join shots sh on sh.id = n.shot_id left join assets a on a.id = n.asset_id
    where n.from_client and n.addressed_on is null order by n.noted_on`);
}

// Shots and tasks past their bid, with whether the extra work has a change order behind it.
async function overBid(db) {
  return db.query(`select sp.show, sp.shot, sp.status, sp.bid_days, sp.actual_days, sp.pct_of_bid,
      coalesce((select string_agg(co.ref || ' ' || co.status, ', ') from change_orders co where co.shot_id = sp.shot_id), 'none') as change_orders
    from shot_progress sp where sp.bid_days > 0 and sp.actual_days > sp.bid_days order by sp.pct_of_bid desc`);
}

async function overBidByStep(db) {
  return db.query(`select step, count(*) as tasks, sum(bid_days) as bid_days, sum(actual_days) as actual_days,
      round(100 * sum(actual_days) / nullif(sum(bid_days), 0)) as pct_of_bid
    from task_actuals where status = 'done' or actual_days > bid_days group by step order by pct_of_bid desc nulls last`);
}

// Remaining bid days on each artist's open tasks due in the window, against the working days in it.
async function artistLoad(db, opt) {
  const days = Number(opt.days || 14);
  const today = await isoToday(db);
  const end = new Date(`${today}T00:00:00Z`); end.setUTCDate(end.getUTCDate() + days);
  const available = workingDaysBetween(today, end.toISOString().slice(0, 10));
  const rows = await db.query(`select p.ref, p.name, p.department, count(ta.task_id) as open_tasks,
      coalesce(sum(greatest(ta.bid_days - ta.actual_days, 0)), 0) as remaining_days
    from people p left join task_actuals ta on ta.assignee_id = p.id and ta.status not in ('done', 'on_hold') and ta.due_on <= current_date + $1::int
    where p.active and p.role in ('artist', 'lead') group by p.id order by remaining_days desc, p.ref`, [days]);
  return rows.map((r) => ({ ...r, available_days: available, load_pct: Math.round((100 * Number(r.remaining_days)) / available) }));
}

async function deliveriesDue(db, opt) {
  const days = Number(opt.days || 14);
  return db.query(`select sp.show, sp.shot, sp.status, sp.due_on, sp.due_on - current_date as days_left,
      exists (select 1 from versions v join tasks t on t.id = v.task_id where t.shot_id = sp.shot_id and v.status = 'approved') as has_approved_version
    from shot_progress sp where sp.status not in ('delivered', 'omitted') and sp.due_on <= current_date + $1::int order by sp.due_on`, [days]);
}

async function unassigned(db) {
  return db.query(`select ta.ref, coalesce(sh.ref, a.ref) as "for", ta.step, ta.start_on, ta.due_on from task_actuals ta
    left join shots sh on sh.id = ta.shot_id left join assets a on a.id = ta.asset_id
    where ta.assignee_id is null and ta.status <> 'done' order by ta.due_on`);
}

// ------------------------------------------------------------------ compliance

async function compliance(db) {
  const out = [];
  const today = await isoToday(db);
  const shows = await db.query(`select s.ref, s.name, s.status, s.bid_accepted_on, s.rebate_registered_on, r.code, r.name as scheme, r.register_working_days, r.source,
      rs.qualifying_cents, rs.threshold_cents, rs.gap_cents, rs.no_evidence_cents, rs.outside_country_cents, rs.unpriced_minutes, rs.currency
    from shows s join rebate_schemes r on r.code = s.rebate_scheme join rebate_spend rs on rs.show_id = s.id order by s.ref`);
  for (const s of shows) {
    if (s.register_working_days) {
      const rule = `${s.scheme}: register within ${s.register_working_days} working days of the qualifying bid being accepted`;
      if (!s.bid_accepted_on) out.push({ rule, show: s.ref, state: 'check', detail: 'No bid accepted date recorded, so the deadline cannot be worked out', source: s.source });
      else if (s.rebate_registered_on) out.push({ rule, show: s.ref, state: 'ok', detail: `Registered ${s.rebate_registered_on}`, source: s.source });
      else {
        const used = workingDaysBetween(s.bid_accepted_on, today);
        const deadline = addWorkingDays(s.bid_accepted_on, s.register_working_days);
        const state = used > s.register_working_days ? 'breach' : used >= s.register_working_days - 5 ? 'due' : 'ok';
        out.push({ rule, show: s.ref, state, detail: `Bid accepted ${s.bid_accepted_on}; ${used} working days gone; deadline ${deadline}; not registered`, source: s.source });
      }
    }
    const rule = `${s.scheme}: qualifying spend must reach ${money(s.threshold_cents, s.currency)}`;
    out.push({ rule, show: s.ref, state: Number(s.gap_cents) > 0 ? 'watch' : 'ok', detail: Number(s.gap_cents) > 0 ? `${money(s.qualifying_cents, s.currency)} counted, ${money(s.gap_cents, s.currency)} to go` : `${money(s.qualifying_cents, s.currency)} counted`, source: s.source });
    if (Number(s.no_evidence_cents) > 0) out.push({ rule: 'Every in-country cost needs an invoice or receipt reference before it is claimed', show: s.ref, state: 'breach', detail: `${money(s.no_evidence_cents, s.currency)} of vendor spend has no evidence reference`, source: s.source });
    if (Number(s.unpriced_minutes) > 0) out.push({ rule: 'Artist time counts only when it can be costed', show: s.ref, state: 'breach', detail: `${(s.unpriced_minutes / 60).toFixed(1)} in-country hours logged by people with no day rate`, source: s.source });
    if (Number(s.outside_country_cents) > 0) out.push({ rule: 'Work done outside the country does not count toward the rebate', show: s.ref, state: 'info', detail: `${money(s.outside_country_cents, s.currency)} of time and vendor spend is outside the country`, source: s.source });
  }
  const rank = { breach: 0, due: 1, check: 2, watch: 3, info: 4, ok: 5 };
  return out.sort((a, b) => rank[a.state] - rank[b.state] || a.show.localeCompare(b.show));
}

// ------------------------------------------------------------------ attention

async function attention(db) {
  const s = {};
  for (const k of ['internal_review_days', 'client_review_days', 'client_note_days', 'change_order_days', 'due_soon_days']) s[k] = await setting(db, k);
  const out = [];
  const add = (category, item, why) => out.push({ category, item, why });
  for (const r of await overBid(db)) add('Over bid', r.shot, `${r.actual_days} days logged against ${r.bid_days} bid (${r.pct_of_bid}%); change orders: ${r.change_orders}`);
  for (const r of await dailies(db, {})) {
    if (r.status === 'pending_internal' && r.waiting_days > s.internal_review_days) add('Waiting for internal review', r.ref, `${r.waiting_days} days since ${r.artist} submitted it`);
    if (r.status === 'pending_client' && r.waiting_days > s.client_review_days) add('Waiting on the client', r.ref, `${r.waiting_days} days with the client, no answer recorded`);
  }
  for (const r of await clientNotes(db)) if (r.age_days > s.client_note_days) add('Client note not addressed', `${r.ref} on ${r.for}`, `${r.age_days} days old: ${r.body.slice(0, 70)}`);
  for (const r of await db.query(READS['change-orders'])) if (['raised', 'sent'].includes(r.status) && r.age_days > s.change_order_days) add('Change order undecided', r.ref, `${r.age_days} days ${r.status}, ${r.days} days of work on ${r.shot}`);
  for (const r of await deliveriesDue(db, { days: s.due_soon_days })) if (r.has_approved_version && r.days_left < 0) add('Approved, not delivered', r.shot, `approved but ${-r.days_left} days past its due date with no delivery recorded`);
  else if (!r.has_approved_version) add(r.days_left < 0 ? 'Shot overdue' : 'Due soon, nothing approved', r.shot, r.days_left < 0 ? `${-r.days_left} days late, status ${r.status}` : `due in ${r.days_left} days, status ${r.status}`);
  for (const r of await unassigned(db)) add('Nobody assigned', r.ref, `${r.step} on ${r.for}, due ${r.due_on}`);
  for (const r of await artistLoad(db, { days: 14 })) if (r.load_pct > 100) add('Artist overbooked', r.name, `${r.remaining_days} bid days left on tasks due in 14 days, ${r.available_days} working days available`);
  for (const r of await compliance(db)) if (['breach', 'due'].includes(r.state)) add('Rebate', r.show, r.detail);
  return out;
}

// ------------------------------------------------------------------ workflow

async function logTime(db, taskRef, opt) {
  const t = await resolve(db, 'task', taskRef);
  const person = opt.person ? await resolve(db, 'person', opt.person) : (await db.query('select p.id, p.ref from tasks t join people p on p.id = t.assignee_id where t.id = $1', [t.id]))[0] || fail('Say who did the work: --person');
  const date = opt.date ? checkDate(opt.date) : await isoToday(db);
  if (date > await isoToday(db)) fail('Time is logged on or before today');
  const minutes = opt.minutes ? Number(opt.minutes) : Math.round(Number(opt.hours) * 60);
  if (!Number.isInteger(minutes) || minutes <= 0 || minutes > 1440) fail('Give --hours (for example 7.5) between 0 and 24');
  const loc = opt.location || (await db.query('select location from people where id = $1', [person.id]))[0].location;
  return tx(db, async () => {
    const [row] = await db.query(`insert into time_logs (ref, task_id, person_id, work_date, minutes, location, note) values ($1, $2, $3, $4, $5, $6, $7) returning *`,
      [await nextRef(db, 'time'), t.id, person.id, date, minutes, loc, opt.note || '']);
    await db.query(`update tasks set status = 'in_progress' where id = $1 and status = 'not_started'`, [t.id]);
    await db.query(`update shots set status = 'in_progress' where id = (select shot_id from tasks where id = $1) and status = 'waiting'`, [t.id]);
    return row;
  });
}

async function submit(db, taskRef, opt) {
  const t = await resolve(db, 'task', taskRef);
  return tx(db, async () => {
    const [info] = await db.query(`select t.step, t.assignee_id, t.shot_id, coalesce(sh.ref, a.ref) as parent, coalesce(max(v.number), 0) + 1 as n
      from tasks t left join shots sh on sh.id = t.shot_id left join assets a on a.id = t.asset_id left join versions v on v.task_id = t.id where t.id = $1 group by t.id, sh.ref, a.ref`, [t.id]);
    const by = opt.by ? (await resolve(db, 'person', opt.by)).id : info.assignee_id;
    const ref = `${info.parent}_${info.step}_v${String(info.n).padStart(3, '0')}`;
    const [v] = await db.query(`insert into versions (ref, task_id, number, submitted_by) values ($1, $2, $3, $4) returning *`, [ref, t.id, info.n, by]);
    await db.query(`update tasks set status = 'review' where id = $1`, [t.id]);
    if (info.shot_id) await db.query(`update shots set status = 'internal_review' where id = $1 and status in ('waiting', 'in_progress')`, [info.shot_id]);
    return v;
  });
}

const DECISIONS = {
  'internal-notes': { from: ['pending_internal'], to: 'internal_notes', task: 'in_progress', shot: 'in_progress', client: false },
  send: { from: ['pending_internal'], to: 'pending_client', task: 'review', shot: 'client_review' },
  'client-notes': { from: ['pending_client'], to: 'client_notes', task: 'in_progress', shot: 'in_progress', client: true },
  approve: { from: ['pending_client', 'pending_internal'], to: 'approved', task: 'done', client: true },
};

async function review(db, versionRef, opt) {
  const d = DECISIONS[opt.decision] || fail(`Say the decision: --decision=${Object.keys(DECISIONS).join('|')}`);
  const v = await resolve(db, 'version', versionRef);
  return tx(db, async () => {
    const [cur] = await db.query(`select v.status, v.task_id, t.shot_id, t.asset_id from versions v join tasks t on t.id = v.task_id where v.id = $1`, [v.id]);
    if (!d.from.includes(cur.status)) fail(`${v.ref} is ${cur.status}; ${opt.decision} applies to a version that is ${d.from.join(' or ')}`);
    const [row] = await db.query(`update versions set status = $2,
        sent_to_client_on = case when $2 = 'pending_client' then current_date else sent_to_client_on end,
        reviewed_on = case when $2 <> 'pending_client' then current_date else reviewed_on end
      where id = $1 returning *`, [v.id, d.to]);
    await db.query(`update tasks set status = $2 where id = $1`, [cur.task_id, d.task]);
    if (cur.shot_id && d.shot) await db.query(`update shots set status = $2 where id = $1`, [cur.shot_id, d.shot]);
    if (cur.shot_id && d.to === 'approved') await db.query(`update shots set status = 'approved' where id = $1 and not exists (select 1 from tasks where shot_id = $1 and status <> 'done')`, [cur.shot_id]);
    if (opt.note) await db.query(`insert into notes (ref, shot_id, asset_id, version_id, author, from_client, body) values ($1, $2, $3, $4, $5, $6, $7)`,
      [await nextRef(db, 'note'), cur.shot_id, cur.asset_id, v.id, opt.author || '', d.client ?? false, opt.note]);
    return row;
  });
}

async function addNote(db, target, opt) {
  if (!opt.text) fail('Give the note: --text="..."');
  const isAsset = !!opt.asset;
  const parent = await resolve(db, isAsset ? 'asset' : 'shot', target);
  const version = opt.version ? (await resolve(db, 'version', opt.version)).id : null;
  const [row] = await db.query(`insert into notes (ref, shot_id, asset_id, version_id, author, from_client, body) values ($1, $2, $3, $4, $5, $6, $7) returning *`,
    [await nextRef(db, 'note'), isAsset ? null : parent.id, isAsset ? parent.id : null, version, opt.author || '', opt.from_client === true || /^(yes|true)$/i.test(String(opt.from_client || '')), opt.text]);
  return row;
}

async function deliver(db, shotRef, opt) {
  const s = await resolve(db, 'shot', shotRef);
  return tx(db, async () => {
    const [cur] = await db.query('select status, show_id from shots where id = $1', [s.id]);
    if (cur.status !== 'approved') fail(`${s.ref} is ${cur.status}; only an approved shot is delivered`);
    const [row] = await db.query(`insert into deliveries (ref, show_id, shot_id, package) values ($1, $2, $3, $4) returning *`, [await nextRef(db, 'delivery'), cur.show_id, s.id, opt.package || '']);
    await db.query(`update shots set status = 'delivered' where id = $1`, [s.id]);
    return row;
  });
}

// ------------------------------------------------------------------ import and export

const FTRACK_STATUS = { 'not started': 'not_started', 'ready to start': 'not_started', 'in progress': 'in_progress', 'pending review': 'review', 'client review': 'review', approved: 'done', completed: 'done', done: 'done', 'on hold': 'on_hold', omitted: 'on_hold' };
const FTRACK_STEP = { compositing: 'comp', comp: 'comp', roto: 'roto', rotoscoping: 'roto', paint: 'paint', 'prep': 'paint', tracking: 'track', track: 'track', matchmove: 'track', layout: 'layout', modeling: 'model', modelling: 'model', model: 'model', texturing: 'texture', texture: 'texture', lookdev: 'texture', rigging: 'rig', rig: 'rig', animation: 'animation', fx: 'fx', lighting: 'lighting', 'matte painting': 'matte', matte: 'matte', editorial: 'edit', edit: 'edit' };
const DEFAULT_MAP = { shot: ['Shot', 'Parent', 'Link', 'Path'], step: ['Type', 'Task type', 'Name', 'Task'], status: ['Status'], assignee: ['Assignee', 'Assignees', 'Assigned to'], bid: ['Bid', 'Bid (days)', 'Bid days'], start: ['Start date', 'Start'], due: ['Due date', 'End date', 'Due'] };

export async function importFtrack(db, opt) {
  if (!opt.file) fail('Give the export: --file=<tasks.csv>');
  const show = await resolve(db, 'show', opt.show || fail('Say which show these tasks belong to: --show=<ref>'));
  const custom = opt.mapping ? JSON.parse(fs.readFileSync(opt.mapping, 'utf8')) : {};
  const map = Object.fromEntries(Object.entries(DEFAULT_MAP).map(([k, v]) => [k, custom[k] ? [custom[k]] : v]));
  const bidUnit = opt.bid_unit || 'days';
  if (!['days', 'hours'].includes(bidUnit)) fail('--bid-unit is days or hours');
  const rows = parseCsv(fs.readFileSync(opt.file, 'utf8'));
  if (!rows.length) fail('The file has no rows');
  const header = Object.keys(rows[0]);
  const missing = ['shot', 'step'].filter((k) => !map[k].some((c) => header.some((h) => h.toLowerCase() === c.toLowerCase())));
  if (missing.length) fail(`Could not find the ${missing.join(' and ')} column. Columns in the file: ${header.join(', ')}. Pass --mapping=<file.json> naming them.`);
  const stats = { rows: rows.length, shots_new: 0, tasks_new: 0, tasks_updated: 0, warnings: [] };
  await db.exec('BEGIN');
  try {
    for (const [i, r] of rows.entries()) {
      const at = `CSV row ${i + 2}`;
      const path0 = pick(r, ...map.shot).split(/\s*[/>]\s*/).filter(Boolean);
      const code = path0.at(-1) || fail(`${at}: no shot`);
      const sequence = path0.length > 1 ? path0.at(-2) : '';
      const stepRaw = pick(r, ...map.step).trim().toLowerCase();
      const step = FTRACK_STEP[stepRaw] || fail(`${at}: unknown task type "${stepRaw}". Known: ${Object.keys(FTRACK_STEP).join(', ')}`);
      const statusRaw = pick(r, ...map.status).trim().toLowerCase();
      const status = statusRaw ? FTRACK_STATUS[statusRaw] || fail(`${at}: unknown status "${statusRaw}"`) : 'not_started';
      const bidRaw = pick(r, ...map.bid);
      const bid = bidRaw === '' ? 0 : Number(bidRaw) / (bidUnit === 'hours' ? (await setting(db, 'working_day_minutes')) / 60 : 1);
      if (!Number.isFinite(bid) || bid < 0) fail(`${at}: bid "${bidRaw}" is not a number`);
      const date = (v, what) => (v ? checkDate(String(v).slice(0, 10), `${at} ${what}`) : null);
      const start = date(pick(r, ...map.start), 'start date');
      const due = date(pick(r, ...map.due), 'due date');
      const who = pick(r, ...map.assignee).split(/[,;]/)[0].trim();
      let assignee = null;
      if (who) {
        const found = await db.query('select id from people where lower(name) = lower($1)', [who]);
        if (found.length !== 1) fail(`${at}: ${found.length ? 'more than one person' : 'nobody'} called "${who}". Add the person first with add person.`);
        assignee = found[0].id;
      }
      let [shot] = await db.query('select id, show_id from shots where lower(ref) = lower($1)', [code]);
      if (shot && shot.show_id !== show.id) fail(`${at}: shot ${code} belongs to another show`);
      if (!shot) { [shot] = await db.query(`insert into shots (ref, show_id, sequence) values ($1, $2, $3) returning id`, [code, show.id, sequence]); stats.shots_new++; }
      const ref = `${code}_${step}`;
      const [existing] = await db.query('select id from tasks where ref = $1', [ref]);
      if (existing) {
        await db.query(`update tasks set status = $2, bid_days = $3, start_on = $4, due_on = $5, assignee_id = $6 where id = $1`, [existing.id, status, bid, start, due, assignee]);
        stats.tasks_updated++;
      } else {
        await db.query(`insert into tasks (ref, show_id, shot_id, step, assignee_id, status, bid_days, start_on, due_on) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, [ref, show.id, shot.id, step, assignee, status, bid, start, due]);
        stats.tasks_new++;
      }
      if (!who) stats.warnings.push(`${at}: ${ref} has no assignee`);
    }
    await db.query(`update shots s set bid_days = coalesce((select sum(bid_days) from tasks t where t.shot_id = s.id), 0) where s.show_id = $1 and s.bid_days = 0`, [show.id]);
    await db.exec(opt.dry_run ? 'ROLLBACK' : 'COMMIT');
  } catch (err) {
    await db.exec('ROLLBACK');
    throw err;
  }
  return { ...stats, dry_run: !!opt.dry_run };
}

const TABLES = ['clients', 'shows', 'people', 'shots', 'assets', 'tasks', 'time_logs', 'versions', 'notes', 'change_orders', 'vendor_spend', 'deliveries', 'audit_events', 'settings', 'rebate_schemes'];
const csvCell = (v) => { const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

async function exportAll(db, opt) {
  const dir = path.resolve(opt.out || path.join(process.env.OUTPUT_DIR || REPO_ROOT, 'export'));
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const snap = { exported_at: new Date().toISOString(), tables: {} };
  const counts = {};
  for (const t of TABLES) {
    const rows = await db.query(`select * from ${t}`);
    snap.tables[t] = rows; counts[t] = rows.length;
    const cols = rows.length ? Object.keys(rows[0]) : [];
    fs.writeFileSync(path.join(dir, `${t}.csv`), [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n') + '\n', { flag: 'wx', mode: 0o600 });
  }
  fs.writeFileSync(path.join(dir, 'snapshot.json'), JSON.stringify(snap, null, 1), { flag: 'wx', mode: 0o600 });
  return { dir, counts };
}

// ------------------------------------------------------------------ drafts (never sent)

function writeDraft(name, lines) {
  const dir = path.resolve(process.env.OUTPUT_DIR || REPO_ROOT, 'drafts');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, `${new Date().toISOString().slice(0, 10)}-${name}.md`);
  fs.writeFileSync(file, ['> DRAFT: written by Shot Tracking for Claude Code. Read it, change it, a person sends it.', '', ...lines, ''].join('\n'), { mode: 0o600 });
  return { file };
}
const mdTable = (rows, cols) => rows.length ? [`| ${cols.join(' | ')} |`, `|${cols.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${cols.map((c) => String(r[c] ?? '').replace(/\|/g, '/').replace(/\n/g, ' ')).join(' | ')} |`)] : ['Nothing to report.'];

async function draftClientUpdate(db, showRef) {
  const s = await resolve(db, 'show', showRef);
  const [show] = await db.query('select s.name, s.delivery_due, c.contact_name from shows s join clients c on c.id = s.client_id where s.id = $1', [s.id]);
  const shotRows = await shots(db, { show: s.ref });
  const counts = shotRows.reduce((m, r) => ({ ...m, [r.status]: (m[r.status] || 0) + 1 }), {});
  const waiting = (await dailies(db, {})).filter((r) => r.status === 'pending_client' && r.for.startsWith(s.ref));
  const open = (await clientNotes(db)).filter((n) => n.for.startsWith(s.ref));
  const cos = (await db.query(READS['change-orders'])).filter((c) => c.show === s.ref && ['raised', 'sent'].includes(c.status));
  return writeDraft(`client-update-${s.ref}`, [
    `# ${show.name}: status update`, '', `Hi ${show.contact_name || 'there'},`, '',
    `Where the show stands today, with final delivery due ${show.delivery_due}:`, '',
    ...Object.entries(counts).map(([k, n]) => `- ${n} shot${n === 1 ? '' : 's'} ${k.replace(/_/g, ' ')}`), '',
    '## Waiting on your review', ...mdTable(waiting, ['ref', 'for', 'submitted_on', 'waiting_days']), '',
    '## Your notes we are working through', ...mdTable(open, ['for', 'noted_on', 'body']), '',
    '## Change orders for your decision', ...mdTable(cos, ['ref', 'shot', 'description', 'days']), '',
  ]);
}

async function draftChangeOrder(db, ref) {
  const c = await resolve(db, 'change', ref);
  const [r] = await db.query(`select co.*, sh.ref as shot, sh.description as shot_description, s.name as show, s.currency, cl.contact_name
    from change_orders co join shows s on s.id = co.show_id join clients cl on cl.id = s.client_id left join shots sh on sh.id = co.shot_id where co.id = $1`, [c.id]);
  return writeDraft(`change-order-${r.ref}`, [
    `# Change order ${r.ref}: ${r.show}`, '', `Hi ${r.contact_name || 'there'},`, '',
    `Shot ${r.shot} (${r.shot_description}) needs work outside the agreed bid:`, '', `> ${r.description}`, '',
    `- Extra work: ${r.days} days`, `- Cost: ${r.amount_cents ? money(r.amount_cents, r.currency) : 'to be confirmed'}`, `- Raised: ${r.raised_on}`, '',
    'Reply to approve and we will schedule it.',
  ]);
}

async function weeklyReview(db) {
  return { shows: await db.query(READS.shows), attention: await attention(db), over_bid: await overBid(db), rebate: await db.query(READS.rebate) };
}

async function draftWeeklyReview(db) {
  const w = await weeklyReview(db);
  return writeDraft('weekly-review', [
    '# Monday review', '', '## Shows', ...mdTable(w.shows, ['ref', 'name', 'status', 'shots', 'approved', 'delivered', 'delivery_due']), '',
    '## Needs attention', ...mdTable(w.attention, ['category', 'item', 'why']), '',
    '## Over bid', ...mdTable(w.over_bid, ['shot', 'bid_days', 'actual_days', 'pct_of_bid', 'change_orders']), '',
    '## Rebate spend', ...mdTable(w.rebate.map((r) => ({ ...r, qualifying: money(r.qualifying_cents, r.currency), gap: money(r.gap_cents, r.currency) })), ['show', 'scheme', 'qualifying', 'gap']),
  ]);
}

// ------------------------------------------------------------------ router

const HELP = `Shot Tracking for Claude Code

Reads:   shows | shots [--show= --status= --sequence=] | assets | tasks [--show= --person= --open] | people | clients
         versions [--status=] | notes [--open] | dailies [--days=3] | client-notes | over-bid | over-bid-by-step
         artist-load [--days=14] | deliveries [--days=14] | unassigned | change-orders | rebate | compliance
         attention | weekly-review | card <type> <name> | audit
Writes:  add <type> --field=value ... | set <type> <name> --field=value ...
         log-time <task> --hours=7.5 [--person= --date= --location=AU|NZ|offshore --note=]
         submit <task> [--by=]   review <version> --decision=internal-notes|send|client-notes|approve [--note= --author=]
         note <shot> --text= [--from-client --version= --author= --asset]   address <note>
         deliver <shot> [--package=]   raise-change <shot> --days= [--amount= --description=]   decide-change <ref> --status=sent|approved|declined
Moving:  import ftrack --file=<tasks.csv> --show=<ref> [--mapping=<map.json> --bid-unit=days|hours --dry-run] | export [--out=<dir>]
Drafts:  draft-client-update <show> | draft-change-order <ref> | draft-weekly-review   (written to drafts/, never sent)
Types:   ${Object.keys(ENTITIES).join(', ')}
Add --json to any command for machine output.`;

export async function execute(db, argv) {
  const { pos, opt } = parseArgs(argv);
  const [cmd, a, b] = pos;
  switch (cmd) {
    case undefined: case 'help': return { help: HELP };
    case 'shows': case 'people': case 'clients': case 'assets': case 'change-orders': case 'rebate': case 'audit': return db.query(READS[cmd]);
    case 'shots': return shots(db, opt);
    case 'tasks': return tasks(db, opt);
    case 'versions': return versions(db, opt);
    case 'notes': return notes(db, opt);
    case 'dailies': return dailies(db, opt);
    case 'client-notes': return clientNotes(db);
    case 'over-bid': return overBid(db);
    case 'over-bid-by-step': return overBidByStep(db);
    case 'artist-load': return artistLoad(db, opt);
    case 'deliveries': return deliveriesDue(db, opt);
    case 'unassigned': return unassigned(db);
    case 'compliance': return compliance(db);
    case 'attention': return attention(db);
    case 'weekly-review': return weeklyReview(db);
    case 'card': { const e = ENTITIES[a] || fail(`Unknown record type: ${a}`); const r = await resolve(db, a, b); return db.query(`select * from ${e.table} where id = $1`, [r.id]); }
    case 'add': return [await tx(db, () => addRecord(db, a, opt))];
    case 'set': return [await tx(db, () => setRecord(db, a, b, opt))];
    case 'log-time': return [await logTime(db, a, opt)];
    case 'submit': return [await submit(db, a, opt)];
    case 'review': return [await review(db, a, opt)];
    case 'note': return [await addNote(db, a, opt)];
    case 'address': { const n = await resolve(db, 'note', a); return db.query(`update notes set addressed_on = current_date where id = $1 returning ref, addressed_on`, [n.id]); }
    case 'deliver': return [await deliver(db, a, opt)];
    case 'raise-change': return [await tx(db, () => addRecord(db, 'change', { shot: a, days: opt.days, amount: opt.amount ?? 0, description: opt.description || fail('Say what changed: --description="..."') }))];
    case 'decide-change': {
      if (!['sent', 'approved', 'declined'].includes(opt.status)) fail('--status is sent, approved or declined');
      const c = await resolve(db, 'change', a);
      return db.query(`update change_orders set status = $2, decided_on = case when $2 in ('approved', 'declined') then current_date else decided_on end where id = $1 returning ref, status, decided_on`, [c.id, opt.status]);
    }
    case 'import': if (a !== 'ftrack') fail('Import source: ftrack'); return importFtrack(db, opt);
    case 'export': return exportAll(db, opt);
    case 'draft-client-update': return draftClientUpdate(db, a);
    case 'draft-change-order': return draftChangeOrder(db, a);
    case 'draft-weekly-review': return draftWeeklyReview(db);
    default: fail(`Unknown command: ${cmd}\n\n${HELP}`);
  }
}

// ------------------------------------------------------------------ printing

const CENTS = /_cents$/;
function columnsFor(rows) {
  return Object.keys(rows[0]).filter((k) => !/^id$|_id$/.test(k) || k === 'id').filter((k) => k !== 'id').map((k) => ({
    key: k, label: k.replace(CENTS, '').replace(/_/g, ' '), align: CENTS.test(k) || /days|pct|minutes|tasks|shots|approved|delivered|number|hours/.test(k) ? 'right' : 'left', width: 70,
    format: CENTS.test(k) ? (v, r) => money(v, r.currency || 'NZD') : (v) => (typeof v === 'object' && v !== null ? JSON.stringify(v) : v),
  }));
}
function print(out) {
  if (out?.help) return console.log(out.help);
  if (Array.isArray(out)) return console.log(out.length ? table(out, columnsFor(out)) : '  (none)');
  for (const [k, v] of Object.entries(out)) {
    if (Array.isArray(v)) { console.log(heading(k.replace(/_/g, ' '))); console.log(v.length ? table(v, columnsFor(v)) : '  (none)'); }
    else console.log(`${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  const db = await getDb();
  try {
    const out = await execute(db, argv);
    if (json) console.log(JSON.stringify(out, null, 2)); else print(out);
  } catch (err) {
    console.error(err instanceof UserError ? err.message : `Error: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await db.close();
  }
}
