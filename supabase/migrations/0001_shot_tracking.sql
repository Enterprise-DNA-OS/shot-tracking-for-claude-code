-- Shot Tracking for Claude Code: the schema.
-- Shows, shots, assets, tasks, time, versions, notes, change orders, vendor spend and deliveries
-- for a VFX or animation studio, plus the rebate schemes the studio claims against.
-- Plain Postgres. Runs on any Postgres 14+ and on the embedded PGlite.

create table settings (key text primary key, value integer not null check (value > 0), meaning text not null default '');
insert into settings values
 ('working_day_minutes', 480, 'Minutes in one bid day. Bids and day rates are in days.'),
 ('internal_review_days', 2, 'A version waiting longer than this for an internal review is flagged.'),
 ('client_review_days', 5, 'A version with the client longer than this is flagged.'),
 ('client_note_days', 5, 'A client note not addressed after this many days is flagged.'),
 ('change_order_days', 7, 'A change order raised but not decided after this many days is flagged.'),
 ('due_soon_days', 10, 'Shots due within this many days without an approved version are flagged.'),
 ('max_week_minutes', 2400, 'Artist load above this many minutes in a working week is flagged.');

-- The rebate schemes. Each row cites where its rate and threshold come from (docs/compliance.md).
create table rebate_schemes (
  code text primary key,
  name text not null,
  country text not null check (country in ('AU', 'NZ')),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  rate_bps integer not null check (rate_bps between 0 and 10000),
  threshold_cents bigint not null check (threshold_cents > 0),
  register_working_days integer,
  source text not null
);
insert into rebate_schemes values
 ('au_pdv', 'Australian PDV Offset', 'AU', 'AUD', 3000, 50000000, null,
  'https://arts.gov.au/funding-and-support/tax-rebates-film-and-television-producers'),
 ('nz_pdv', 'New Zealand Screen Production Rebate (International PDV)', 'NZ', 'NZD', 2000, 25000000, 20,
  'https://www.nzfilm.co.nz/incentives-co-productions/nzspg-international');

create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create table clients (
  id uuid primary key default gen_random_uuid(), ref text unique not null, name text not null,
  contact_name text not null default '', contact_email text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());

create table shows (
  id uuid primary key default gen_random_uuid(), ref text unique not null, name text not null,
  client_id uuid not null references clients,
  status text not null default 'awarded' check (status in ('bidding', 'awarded', 'in_progress', 'delivered', 'closed')),
  currency text not null default 'NZD' check (currency ~ '^[A-Z]{3}$'),
  rebate_scheme text references rebate_schemes,
  bid_accepted_on date, rebate_registered_on date, delivery_due date,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());

create table people (
  id uuid primary key default gen_random_uuid(), ref text unique not null, name text not null,
  department text not null default '' , role text not null default 'artist' check (role in ('artist', 'lead', 'supervisor', 'producer', 'coordinator')),
  location text not null default 'NZ' check (location in ('AU', 'NZ', 'offshore')),
  day_rate_cents bigint not null default 0 check (day_rate_cents >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());

create table shots (
  id uuid primary key default gen_random_uuid(), ref text unique not null, show_id uuid not null references shows,
  sequence text not null default '', description text not null default '',
  status text not null default 'waiting' check (status in ('waiting', 'in_progress', 'internal_review', 'client_review', 'approved', 'delivered', 'omitted')),
  frame_in integer, frame_out integer, due_on date,
  bid_days numeric(7,2) not null default 0 check (bid_days >= 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (frame_out is null or frame_in is null or frame_out >= frame_in));

create table assets (
  id uuid primary key default gen_random_uuid(), ref text unique not null, show_id uuid not null references shows,
  name text not null, kind text not null default 'prop' check (kind in ('character', 'prop', 'environment', 'fx', 'matte')),
  status text not null default 'waiting' check (status in ('waiting', 'in_progress', 'internal_review', 'client_review', 'approved', 'omitted')),
  due_on date, bid_days numeric(7,2) not null default 0 check (bid_days >= 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());

create table tasks (
  id uuid primary key default gen_random_uuid(), ref text unique not null, show_id uuid not null references shows,
  shot_id uuid references shots, asset_id uuid references assets,
  step text not null check (step in ('roto', 'paint', 'track', 'layout', 'model', 'texture', 'rig', 'animation', 'fx', 'lighting', 'comp', 'matte', 'edit')),
  assignee_id uuid references people,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'review', 'done', 'on_hold')),
  bid_days numeric(7,2) not null default 0 check (bid_days >= 0),
  start_on date, due_on date,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check ((shot_id is null) <> (asset_id is null)),
  check (due_on is null or start_on is null or due_on >= start_on));

create table time_logs (
  id uuid primary key default gen_random_uuid(), ref text unique not null,
  task_id uuid not null references tasks, person_id uuid not null references people,
  work_date date not null, minutes integer not null check (minutes > 0 and minutes <= 1440),
  location text not null check (location in ('AU', 'NZ', 'offshore')),
  note text not null default '', source text not null default 'manual',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());

create table versions (
  id uuid primary key default gen_random_uuid(), ref text unique not null, task_id uuid not null references tasks,
  number integer not null check (number > 0), submitted_by uuid references people,
  submitted_on date not null default current_date,
  status text not null default 'pending_internal' check (status in ('pending_internal', 'internal_notes', 'pending_client', 'client_notes', 'approved')),
  sent_to_client_on date, reviewed_on date,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (task_id, number));

create table notes (
  id uuid primary key default gen_random_uuid(), ref text unique not null,
  shot_id uuid references shots, asset_id uuid references assets, version_id uuid references versions,
  author text not null default '', from_client boolean not null default false,
  body text not null check (length(trim(body)) > 0),
  noted_on date not null default current_date, addressed_on date,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check ((shot_id is null) <> (asset_id is null)));

create table change_orders (
  id uuid primary key default gen_random_uuid(), ref text unique not null, show_id uuid not null references shows,
  shot_id uuid references shots, description text not null, days numeric(7,2) not null check (days > 0),
  amount_cents bigint not null default 0 check (amount_cents >= 0),
  status text not null default 'raised' check (status in ('raised', 'sent', 'approved', 'declined')),
  raised_on date not null default current_date, decided_on date,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());

create table vendor_spend (
  id uuid primary key default gen_random_uuid(), ref text unique not null, show_id uuid not null references shows,
  vendor text not null, description text not null default '', amount_cents bigint not null check (amount_cents > 0),
  incurred_on date not null, location text not null check (location in ('AU', 'NZ', 'offshore')),
  evidence_ref text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());

create table deliveries (
  id uuid primary key default gen_random_uuid(), ref text unique not null, show_id uuid not null references shows,
  shot_id uuid not null references shots, delivered_on date not null default current_date, package text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());

create table audit_events (
  id bigserial primary key, at timestamptz not null default now(), entity text not null, action text not null,
  row_id uuid, data jsonb);

create or replace function audit_row() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    insert into audit_events(entity, action, row_id, data) values (tg_table_name, tg_op, old.id, to_jsonb(old));
    return old;
  end if;
  insert into audit_events(entity, action, row_id, data) values (tg_table_name, tg_op, new.id, to_jsonb(new));
  return new;
end $$;

do $$ declare t text; begin
  foreach t in array array['clients','shows','people','shots','assets','tasks','time_logs','versions','notes','change_orders','vendor_spend','deliveries'] loop
    execute format('create trigger %I before update on %I for each row execute function set_updated_at()', t || '_updated', t);
    execute format('create trigger %I after insert or update or delete on %I for each row execute function audit_row()', t || '_audit', t);
  end loop;
end $$;

create index on shots (show_id, status);
create index on tasks (assignee_id, status);
create index on time_logs (task_id);
create index on time_logs (person_id, work_date);
create index on versions (task_id, status);
create index on notes (shot_id) where addressed_on is null;

-- Bid against actual, per task. A bid day is working_day_minutes of logged time.
create view task_actuals as
select t.id as task_id, t.ref, t.show_id, t.shot_id, t.asset_id, t.step, t.status, t.bid_days, t.start_on, t.due_on, t.assignee_id,
       coalesce(sum(l.minutes), 0)::integer as logged_minutes,
       round(coalesce(sum(l.minutes), 0)::numeric / (select value from settings where key = 'working_day_minutes'), 2) as actual_days
from tasks t left join time_logs l on l.task_id = t.id
group by t.id;

-- One row per shot: where it is, what it was bid, what it has cost so far, and its latest version.
create view shot_progress as
select sh.ref as show, s.ref as shot, s.sequence, s.status, s.due_on, s.bid_days,
       coalesce(sum(ta.actual_days), 0) as actual_days,
       case when s.bid_days > 0 then round(100 * coalesce(sum(ta.actual_days), 0) / s.bid_days) end as pct_of_bid,
       (select v.ref || ' ' || v.status from versions v join tasks t2 on t2.id = v.task_id
         where t2.shot_id = s.id order by v.submitted_on desc, v.number desc limit 1) as latest_version,
       s.id as shot_id, sh.id as show_id
from shots s join shows sh on sh.id = s.show_id left join task_actuals ta on ta.shot_id = s.id
group by s.id, sh.id;

-- Spend that counts toward each show's rebate: in-country artist time at day rate, plus in-country vendor spend.
create view rebate_spend as
with wd as (select value::numeric as m from settings where key = 'working_day_minutes'),
labour as (
  select t.show_id,
         sum(case when l.location = rs.country then round(l.minutes / wd.m * p.day_rate_cents) else 0 end)::bigint as labour_in_country_cents,
         sum(case when l.location <> rs.country then round(l.minutes / wd.m * p.day_rate_cents) else 0 end)::bigint as labour_outside_cents,
         sum(case when l.location = rs.country and p.day_rate_cents = 0 then l.minutes else 0 end)::integer as unpriced_minutes
  from time_logs l join tasks t on t.id = l.task_id join people p on p.id = l.person_id
  join shows sh on sh.id = t.show_id join rebate_schemes rs on rs.code = sh.rebate_scheme cross join wd
  group by t.show_id),
vendor as (
  select v.show_id,
         sum(case when v.location = rs.country and v.evidence_ref <> '' then v.amount_cents else 0 end)::bigint as vendor_in_country_cents,
         sum(case when v.location = rs.country and v.evidence_ref = '' then v.amount_cents else 0 end)::bigint as vendor_no_evidence_cents,
         sum(case when v.location <> rs.country then v.amount_cents else 0 end)::bigint as vendor_outside_cents
  from vendor_spend v join shows sh on sh.id = v.show_id join rebate_schemes rs on rs.code = sh.rebate_scheme
  group by v.show_id)
select sh.ref as show, sh.name, rs.code as scheme, rs.currency,
       coalesce(l.labour_in_country_cents, 0) as labour_in_country_cents,
       coalesce(v.vendor_in_country_cents, 0) as vendor_in_country_cents,
       coalesce(l.labour_in_country_cents, 0) + coalesce(v.vendor_in_country_cents, 0) as qualifying_cents,
       rs.threshold_cents,
       greatest(rs.threshold_cents - coalesce(l.labour_in_country_cents, 0) - coalesce(v.vendor_in_country_cents, 0), 0) as gap_cents,
       round((coalesce(l.labour_in_country_cents, 0) + coalesce(v.vendor_in_country_cents, 0)) * rs.rate_bps / 10000.0)::bigint as rebate_estimate_cents,
       coalesce(l.labour_outside_cents, 0) + coalesce(v.vendor_outside_cents, 0) as outside_country_cents,
       coalesce(v.vendor_no_evidence_cents, 0) as no_evidence_cents,
       coalesce(l.unpriced_minutes, 0) as unpriced_minutes,
       sh.id as show_id
from shows sh join rebate_schemes rs on rs.code = sh.rebate_scheme
left join labour l on l.show_id = sh.id left join vendor v on v.show_id = sh.id;
