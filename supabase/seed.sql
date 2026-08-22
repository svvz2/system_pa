insert into public.garages(id, name, timezone, gate_public_id, status)
values (
  '10000000-0000-4000-8000-000000000001',
  'كراج مشروع التخرج',
  'Asia/Baghdad',
  '20000000-0000-4000-8000-000000000001',
  'active'
) on conflict (id) do update set name = excluded.name;

insert into public.garage_settings(garage_id)
values ('10000000-0000-4000-8000-000000000001')
on conflict (garage_id) do nothing;

insert into public.devices(id, garage_id, name, gate_state)
values (
  '30000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'ESP32 الرئيسي',
  'closed'
) on conflict (id) do update set name = excluded.name;

insert into public.parking_slots(id, garage_id, device_id, slot_number, display_name, sensor_health)
select
  ('40000000-0000-4000-8000-' || lpad(slot_number::text, 12, '0'))::uuid,
  '10000000-0000-4000-8000-000000000001'::uuid,
  '30000000-0000-4000-8000-000000000001'::uuid,
  slot_number,
  'P' || slot_number,
  'ok'::public.sensor_health
from generate_series(1, 6) as slot_number
on conflict (garage_id, slot_number) do update set device_id = excluded.device_id;

