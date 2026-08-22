-- Run against a disposable local database after `supabase db reset`.
begin;

insert into auth.users(id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
select
  ('50000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated', 'authenticated', 'test' || i || '@example.test', crypt('password', gen_salt('bf')), now(),
  jsonb_build_object('full_name', 'Test ' || i, 'phone', '000' || i), now(), now()
from generate_series(1, 7) i;

update public.profiles set profile_complete = true where id::text like '50000000-0000-4000-8000-%';
insert into public.vehicles(user_id, plate_number, plate_normalized, make_model, color)
select id, 'TEST-' || row_number() over (), 'TEST' || row_number() over (), 'Model', 'White'
from public.profiles where id::text like '50000000-0000-4000-8000-%';

do $$
declare
  v_user uuid := '50000000-0000-4000-8000-000000000001';
  v_vehicle uuid;
  v_booking public.bookings;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  select id into v_vehicle from public.vehicles where user_id = v_user;
  v_booking := public.create_booking(
    v_vehicle,
    date_trunc('hour', now() + interval '2 hours'),
    date_trunc('hour', now() + interval '3 hours')
  );
  if v_booking.slot_id is null or v_booking.status <> 'confirmed' then
    raise exception 'booking allocation test failed';
  end if;
end $$;

rollback;

