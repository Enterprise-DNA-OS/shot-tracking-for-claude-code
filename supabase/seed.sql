-- Demo data: a small studio in Wellington with an Australian team, three shows, and the usual
-- loose ends (a shot over bid, a client note nobody answered, a version stuck in review, a
-- change order nobody decided, an unregistered rebate). Every name here is invented.
-- A second run does nothing.
do $$ begin
if exists (select 1 from clients where ref = 'SCP') then return; end if;
if exists (select 1 from clients) then raise exception 'Demo seed requires an empty database'; end if;

insert into clients (ref, name, contact_name, contact_email) values
 ('SCP', 'Southern Cross Pictures', 'Dana Hollis', 'dana@example.com'),
 ('LSF', 'Lantern Street Films', 'Ivo Brandt', 'ivo@example.com'),
 ('OGB', 'Orchard Grocers Brand Team', 'Kate Moss-Lee', 'kate@example.com');

insert into shows (ref, name, client_id, status, currency, rebate_scheme, bid_accepted_on, rebate_registered_on, delivery_due)
select 'HAR', 'Harbour Light', id, 'in_progress', 'NZD', 'nz_pdv', current_date - 42, null, current_date + 30 from clients where ref = 'SCP';
insert into shows (ref, name, client_id, status, currency, rebate_scheme, bid_accepted_on, rebate_registered_on, delivery_due)
select 'KTW', 'Kite Weather S1', id, 'in_progress', 'AUD', 'au_pdv', current_date - 60, null, current_date + 45 from clients where ref = 'LSF';
insert into shows (ref, name, client_id, status, currency, rebate_scheme, delivery_due)
select 'ADV', 'Orchard Grocers Spring Spot', id, 'delivered', 'NZD', null, current_date - 14 from clients where ref = 'OGB';

insert into people (ref, name, department, role, location, day_rate_cents) values
 ('P01', 'Mere Tane', 'Comp', 'lead', 'NZ', 65000),
 ('P02', 'Jonah Reid', 'Comp', 'artist', 'NZ', 52000),
 ('P03', 'Priya Nair', 'FX', 'artist', 'NZ', 60000),
 ('P04', 'Lucas Ferreira', 'Roto', 'artist', 'offshore', 22000),
 ('P05', 'Hana Kim', 'Animation', 'artist', 'AU', 58000),
 ('P06', 'Tom Walsh', 'Lighting', 'artist', 'AU', 0),
 ('P07', 'Ruth Moana', 'Production', 'producer', 'NZ', 55000),
 ('P08', 'Alex Chen', 'Comp', 'artist', 'NZ', 50000),
 ('P09', 'Alex Hart', 'FX', 'artist', 'AU', 56000);

insert into shots (ref, show_id, sequence, description, status, frame_in, frame_out, due_on, bid_days)
select v.ref, s.id, v.seq, v.descr, v.status, v.fin, v.fout, current_date + v.due, v.bid
from shows s join (values
 ('HAR_010_0010', 'HAR', '010', 'Wide of harbour at dusk, sky replacement', 'approved', 1001, 1096, -5, 4.0),
 ('HAR_010_0020', 'HAR', '010', 'Lighthouse beam through fog', 'client_review', 1001, 1144, 4, 6.0),
 ('HAR_010_0030', 'HAR', '010', 'Wave crash over seawall, FX water', 'in_progress', 1001, 1180, 12, 6.5),
 ('HAR_020_0010', 'HAR', '020', 'Boat interior, window replacement', 'waiting', 1001, 1072, 6, 4.0),
 ('HAR_020_0020', 'HAR', '020', 'Rain on windscreen, wire removal', 'internal_review', 1001, 1120, 9, 6.0),
 ('HAR_020_0030', 'HAR', '020', 'Insert of map, screen comp', 'delivered', 1001, 1040, -10, 1.5),
 ('KTW_101_0010', 'KTW', '101', 'Kite creature flies past the camera', 'in_progress', 1001, 1150, 20, 10.0),
 ('KTW_101_0020', 'KTW', '101', 'Kite creature lands on a fence post', 'waiting', 1001, 1110, 28, 7.0),
 ('ADV_001_0010', 'ADV', '001', 'Apples fall into a basket, CG apples', 'delivered', 1001, 1060, -20, 3.0)
) as v(ref, show, seq, descr, status, fin, fout, due, bid) on s.ref = v.show;

insert into assets (ref, show_id, name, kind, status, due_on, bid_days)
select v.ref, s.id, v.name, v.kind, v.status, current_date + v.due, v.bid
from shows s join (values
 ('KTW_kite_creature', 'KTW', 'Kite creature', 'character', 'approved', -15, 12.0),
 ('HAR_lighthouse', 'HAR', 'Lighthouse', 'environment', 'approved', -20, 5.0)
) as v(ref, show, name, kind, status, due, bid) on s.ref = v.show;

insert into tasks (ref, show_id, shot_id, step, assignee_id, status, bid_days, start_on, due_on)
select v.ref, sh.show_id, sh.id, v.step, p.id, v.status, v.bid, current_date + v.st, current_date + v.du
from shots sh join (values
 ('T-101', 'HAR_010_0010', 'comp', 'P01', 'done', 3.0, -20, -6),
 ('T-102', 'HAR_010_0010', 'roto', 'P04', 'done', 1.0, -22, -18),
 ('T-103', 'HAR_010_0020', 'comp', 'P02', 'review', 4.0, -12, 3),
 ('T-104', 'HAR_010_0020', 'fx', 'P03', 'done', 2.0, -15, -8),
 ('T-105', 'HAR_010_0030', 'fx', 'P03', 'in_progress', 2.5, -10, 8),
 ('T-106', 'HAR_010_0030', 'comp', 'P02', 'not_started', 4.0, 3, 12),
 ('T-107', 'HAR_020_0010', 'comp', 'P02', 'not_started', 3.0, 0, 6),
 ('T-108', 'HAR_020_0010', 'roto', 'P04', 'in_progress', 1.0, -3, 2),
 ('T-109', 'HAR_020_0020', 'paint', 'P08', 'review', 2.5, -8, 8),
 ('T-110', 'HAR_020_0030', 'comp', 'P08', 'done', 1.5, -18, -11),
 ('T-115', 'HAR_020_0020', 'comp', 'P02', 'not_started', 3.5, 2, 9),
 ('T-111', 'KTW_101_0010', 'animation', 'P05', 'in_progress', 6.0, -9, 10),
 ('T-112', 'KTW_101_0010', 'lighting', 'P06', 'in_progress', 4.0, -4, 18),
 ('T-113', 'KTW_101_0020', 'animation', null, 'not_started', 4.0, 12, 22),
 ('T-114', 'ADV_001_0010', 'fx', 'P09', 'done', 3.0, -30, -21)
) as v(ref, shot, step, person, status, bid, st, du) on sh.ref = v.shot
left join people p on p.ref = v.person;

insert into tasks (ref, show_id, asset_id, step, assignee_id, status, bid_days, start_on, due_on)
select v.ref, a.show_id, a.id, v.step, p.id, 'done', v.bid, current_date + v.st, current_date + v.du
from assets a join (values
 ('T-201', 'KTW_kite_creature', 'model', 'P09', 7.0, -40, -25),
 ('T-202', 'KTW_kite_creature', 'rig', 'P05', 5.0, -30, -15),
 ('T-203', 'HAR_lighthouse', 'model', 'P03', 5.0, -35, -20)
) as v(ref, asset, step, person, bid, st, du) on a.ref = v.asset
join people p on p.ref = v.person;

-- Time: minutes per day. Lucas works offshore, so his hours do not count toward the NZ rebate.
-- Priya's FX on the seawall wave is well past its five-day bid.
insert into time_logs (ref, task_id, person_id, work_date, minutes, location)
select 'L-' || lpad(row_number() over (order by v.task, v.d)::text, 3, '0'), t.id, p.id, current_date + v.d, v.mins, v.loc
from (values
 ('T-101', 'P01', -19, 480, 'NZ'), ('T-101', 'P01', -18, 480, 'NZ'), ('T-101', 'P01', -17, 420, 'NZ'),
 ('T-102', 'P04', -21, 480, 'offshore'),
 ('T-103', 'P02', -11, 480, 'NZ'), ('T-103', 'P02', -10, 480, 'NZ'), ('T-103', 'P02', -9, 480, 'NZ'), ('T-103', 'P02', -8, 240, 'NZ'),
 ('T-104', 'P03', -14, 480, 'NZ'), ('T-104', 'P03', -13, 480, 'NZ'),
 ('T-105', 'P03', -10, 480, 'NZ'), ('T-105', 'P03', -9, 480, 'NZ'), ('T-105', 'P03', -8, 540, 'NZ'), ('T-105', 'P03', -7, 540, 'NZ'),
 ('T-105', 'P03', -6, 480, 'NZ'), ('T-105', 'P03', -5, 480, 'NZ'), ('T-105', 'P03', -4, 480, 'NZ'),
 ('T-108', 'P04', -3, 480, 'offshore'), ('T-108', 'P04', -2, 360, 'offshore'),
 ('T-109', 'P08', -7, 480, 'NZ'), ('T-109', 'P08', -6, 480, 'NZ'),
 ('T-110', 'P08', -17, 480, 'NZ'), ('T-110', 'P08', -16, 240, 'NZ'),
 ('T-111', 'P05', -9, 480, 'AU'), ('T-111', 'P05', -8, 480, 'AU'), ('T-111', 'P05', -7, 480, 'AU'), ('T-111', 'P05', -4, 480, 'AU'),
 ('T-112', 'P06', -4, 480, 'AU'), ('T-112', 'P06', -3, 480, 'AU'),
 ('T-114', 'P09', -29, 480, 'AU'), ('T-114', 'P09', -28, 480, 'AU'), ('T-114', 'P09', -27, 480, 'AU'),
 ('T-201', 'P09', -40, 480, 'AU'), ('T-201', 'P09', -39, 480, 'AU'), ('T-201', 'P09', -38, 480, 'AU'), ('T-201', 'P09', -37, 480, 'AU'),
 ('T-201', 'P09', -36, 480, 'AU'), ('T-201', 'P09', -35, 480, 'AU'),
 ('T-202', 'P05', -30, 480, 'AU'), ('T-202', 'P05', -29, 480, 'AU'), ('T-202', 'P05', -28, 480, 'AU'), ('T-202', 'P05', -27, 480, 'AU'),
 ('T-203', 'P03', -35, 480, 'NZ'), ('T-203', 'P03', -34, 480, 'NZ'), ('T-203', 'P03', -33, 480, 'NZ'), ('T-203', 'P03', -32, 480, 'NZ')
) as v(task, person, d, mins, loc)
join tasks t on t.ref = v.task join people p on p.ref = v.person;

insert into versions (ref, task_id, number, submitted_by, submitted_on, status, sent_to_client_on, reviewed_on)
select v.ref, t.id, v.n, p.id, current_date + v.sub, v.status,
       case when v.sent is null then null else current_date + v.sent end,
       case when v.rev is null then null else current_date + v.rev end
from (values
 ('HAR_010_0010_comp_v003', 'T-101', 3, 'P01', -8, 'approved', -7, -5),
 ('HAR_010_0020_comp_v002', 'T-103', 2, 'P02', -10, 'client_notes', -9, -9),
 ('HAR_010_0020_comp_v003', 'T-103', 3, 'P02', -8, 'pending_client', -8, null),
 ('HAR_010_0030_fx_v004', 'T-105', 4, 'P03', -1, 'pending_internal', null, null),
 ('HAR_020_0020_paint_v001', 'T-109', 1, 'P08', -4, 'pending_internal', null, null),
 ('HAR_020_0030_comp_v002', 'T-110', 2, 'P08', -12, 'approved', -12, -11),
 ('KTW_101_0010_anim_v005', 'T-111', 5, 'P05', -2, 'internal_notes', null, -1),
 ('ADV_001_0010_fx_v004', 'T-114', 4, 'P09', -22, 'approved', -22, -21)
) as v(ref, task, n, person, sub, status, sent, rev)
join tasks t on t.ref = v.task join people p on p.ref = v.person;

insert into notes (ref, shot_id, version_id, author, from_client, body, noted_on, addressed_on)
select v.ref, s.id, ver.id, v.author, v.client, v.body, current_date + v.d, case when v.done is null then null else current_date + v.done end
from (values
 ('N-101', 'HAR_010_0020', 'HAR_010_0020_comp_v002', 'Dana Hollis', true, 'Beam reads too blue against the fog. Warm it toward sodium orange and soften the edge.', -9, null),
 ('N-102', 'HAR_010_0020', 'HAR_010_0020_comp_v002', 'Dana Hollis', true, 'Lose the second lighthouse window, the director wants one light only.', -9, -8),
 ('N-103', 'HAR_010_0010', 'HAR_010_0010_comp_v003', 'Dana Hollis', true, 'Approved for DI. Lovely sky.', -5, -5),
 ('N-104', 'KTW_101_0010', 'KTW_101_0010_anim_v005', 'Mere Tane', false, 'Wing beats feel heavy in the first 30 frames, take the timing down a third.', -1, null),
 ('N-105', 'HAR_010_0030', null, 'Dana Hollis', true, 'Can the wave hit the wall two seconds earlier? Edit has changed.', -6, null)
) as v(ref, shot, version, author, client, body, d, done)
join shots s on s.ref = v.shot left join versions ver on ver.ref = v.version;

insert into change_orders (ref, show_id, shot_id, description, days, amount_cents, status, raised_on, decided_on)
select v.ref, s.show_id, s.id, v.descr, v.days, v.amt, v.status, current_date + v.raised, case when v.dec is null then null else current_date + v.dec end
from (values
 ('CO-101', 'HAR_010_0030', 'Edit change moves the wave impact two seconds earlier; re-sim and re-comp.', 3.0, 180000, 'sent', -12, null),
 ('CO-102', 'HAR_010_0020', 'Remove second lighthouse window across the shot.', 0.5, 30000, 'approved', -8, -7)
) as v(ref, shot, descr, days, amt, status, raised, dec)
join shots s on s.ref = v.shot;

insert into vendor_spend (ref, show_id, vendor, description, amount_cents, incurred_on, location, evidence_ref)
select v.ref, s.id, v.vendor, v.descr, v.amt, current_date + v.d, v.loc, v.ev
from shows s join (values
 ('V-101', 'HAR', 'Capital Render Farm Ltd', 'Render farm hours, seq 010', 840000, -12, 'NZ', 'INV-4471'),
 ('V-102', 'HAR', 'Wellington Plate Scans', 'Plate scanning and LIDAR of seawall', 1250000, -30, 'NZ', ''),
 ('V-103', 'HAR', 'Overseas Roto House', 'Roto package, seq 020', 460000, -6, 'offshore', 'INV-88'),
 ('V-104', 'KTW', 'Sydney Mocap Stage', 'Two days of creature reference capture', 920000, -35, 'AU', 'TAX-2291')
) as v(ref, show, vendor, descr, amt, d, loc, ev) on s.ref = v.show;

insert into deliveries (ref, show_id, shot_id, package)
select v.ref, s.show_id, s.id, v.pkg from (values
 ('D-101', 'HAR_020_0030', 'HAR_turnover_01'),
 ('D-102', 'ADV_001_0010', 'ADV_final_01')
) as v(ref, shot, pkg) join shots s on s.ref = v.shot;
update deliveries set delivered_on = current_date - 10 where ref = 'D-101';
update deliveries set delivered_on = current_date - 20 where ref = 'D-102';
end $$;
