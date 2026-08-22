create extension if not exists btree_gist with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create type public.user_role as enum ('user', 'admin');
create type public.booking_status as enum ('confirmed', 'checked_in', 'overstayed', 'completed', 'cancelled', 'no_show');
create type public.slot_state as enum ('available', 'reserved', 'occupied', 'unexpected_occupied', 'sensor_fault', 'disabled');
create type public.sensor_health as enum ('ok', 'fault', 'unknown');
create type public.gate_state as enum ('closed', 'opening', 'open_entry', 'open_exit', 'closing', 'blocked', 'fault');
create type public.command_status as enum ('queued', 'acknowledged', 'executed', 'failed', 'expired');

create table public.garages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  timezone text not null default 'Asia/Baghdad',
  gate_public_id uuid not null unique default gen_random_uuid(),
  status text not null default 'active' check (status in ('active', 'maintenance', 'closed')),
  created_at timestamptz not null default now()
);

create table public.garage_settings (
  garage_id uuid primary key references public.garages(id) on delete cascade,
  open_time time not null default '00:00',
  close_time time not null default '23:59:59',
  slot_interval_minutes integer not null default 15 check (slot_interval_minutes between 5 and 60),
  min_duration_minutes integer not null default 30 check (min_duration_minutes > 0),
  max_duration_minutes integer not null default 480 check (max_duration_minutes >= min_duration_minutes),
  max_advance_days integer not null default 30 check (max_advance_days between 1 and 365),
  early_entry_minutes integer not null default 15 check (early_entry_minutes between 0 and 120),
  late_entry_minutes integer not null default 15 check (late_entry_minutes between 0 and 120),
  cancellation_cutoff_minutes integer not null default 15 check (cancellation_cutoff_minutes between 0 and 1440),
  turnover_minutes integer not null default 15 check (turnover_minutes between 0 and 120),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text not null default '',
  role public.user_role not null default 'user',
  national_id_last4 text,
  profile_complete boolean not null default false,
  blocked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profile_private (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  national_id_ciphertext text not null,
  national_id_iv text not null,
  national_id_hmac text not null unique,
  updated_at timestamptz not null default now()
);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plate_number text not null,
  plate_normalized text not null,
  make_model text not null,
  color text not null,
  is_primary boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, plate_normalized)
);

create unique index one_primary_vehicle_per_user on public.vehicles(user_id) where is_primary;

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references public.garages(id) on delete cascade,
  name text not null,
  enabled boolean not null default true,
  firmware_version text,
  gate_state public.gate_state not null default 'closed',
  last_seen_at timestamptz,
  last_boot_id uuid,
  last_seq bigint not null default -1,
  created_at timestamptz not null default now()
);

create table public.parking_slots (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references public.garages(id) on delete cascade,
  device_id uuid references public.devices(id) on delete set null,
  slot_number integer not null check (slot_number between 1 and 999),
  display_name text not null,
  enabled boolean not null default true,
  occupied boolean not null default false,
  sensor_health public.sensor_health not null default 'unknown',
  last_distance_cm numeric(7,2),
  occupied_threshold_cm numeric(7,2) not null default 20,
  free_threshold_cm numeric(7,2) not null default 25,
  empty_distance_cm numeric(7,2),
  last_changed_at timestamptz not null default now(),
  unique (garage_id, slot_number),
  check (occupied_threshold_cm < free_threshold_cm)
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  vehicle_id uuid not null references public.vehicles(id),
  garage_id uuid not null references public.garages(id),
  slot_id uuid not null references public.parking_slots(id),
  start_at timestamptz not null,
  end_at timestamptz not null,
  allocation_start_at timestamptz not null,
  allocation_end_at timestamptz not null,
  status public.booking_status not null default 'confirmed',
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  cancelled_at timestamptz,
  contact_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at > start_at),
  check (allocation_end_at > allocation_start_at),
  constraint no_slot_booking_overlap exclude using gist (
    slot_id with =,
    tstzrange(allocation_start_at, allocation_end_at, '[)') with &&
  ) where (status in ('confirmed', 'checked_in', 'overstayed')),
  constraint no_user_booking_overlap exclude using gist (
    user_id with =,
    tstzrange(allocation_start_at, allocation_end_at, '[)') with &&
  ) where (status in ('confirmed', 'checked_in', 'overstayed'))
);

create index bookings_user_start_idx on public.bookings(user_id, start_at desc);
create index bookings_garage_status_idx on public.bookings(garage_id, status, start_at);

create table public.device_commands (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  type text not null check (type in ('open_entry', 'open_gate', 'calibrate_slot', 'toggle_slot')),
  status public.command_status not null default 'queued',
  payload jsonb not null default '{}'::jsonb,
  requested_by uuid references public.profiles(id) on delete set null,
  reason text,
  idempotency_key uuid,
  expires_at timestamptz not null,
  acknowledged_at timestamptz,
  executed_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now()
);

create unique index command_request_idempotency_idx
  on public.device_commands(requested_by, idempotency_key)
  where requested_by is not null and idempotency_key is not null;
create index pending_device_commands_idx on public.device_commands(device_id, status, expires_at);

create table public.device_events (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete cascade,
  boot_id uuid not null,
  seq bigint not null,
  event_index integer not null default 0,
  event_key text not null,
  event_type text not null,
  slot_id uuid references public.parking_slots(id) on delete set null,
  booking_id uuid references public.bookings(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  received_at timestamptz not null default now(),
  unique (device_id, boot_id, seq, event_index),
  unique (device_id, event_key)
);

create index device_events_recent_idx on public.device_events(device_id, occurred_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null,
  kind text not null default 'info',
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.profiles(id) on delete set null,
  actor_device_id uuid references public.devices(id) on delete set null,
  action text not null,
  target_type text,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles(id, full_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and blocked = false
  );
$$;

create or replace function public.refresh_booking_states()
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  update public.bookings b
  set status = 'no_show', updated_at = now()
  from public.garage_settings s
  where b.garage_id = s.garage_id
    and b.status = 'confirmed'
    and now() > b.start_at + make_interval(mins => s.late_entry_minutes);

  update public.bookings
  set status = 'overstayed', updated_at = now()
  where status = 'checked_in' and now() > end_at;
end;
$$;

create or replace function public.create_booking(
  p_vehicle_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz
)
returns public.bookings
language plpgsql
security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_garage_id uuid;
  v_slot_id uuid;
  v_settings public.garage_settings%rowtype;
  v_profile public.profiles%rowtype;
  v_vehicle public.vehicles%rowtype;
  v_booking public.bookings%rowtype;
  v_duration numeric;
begin
  if v_user_id is null then raise exception 'يجب تسجيل الدخول'; end if;
  perform public.refresh_booking_states();

  select * into v_profile from public.profiles where id = v_user_id;
  if not found or not v_profile.profile_complete then raise exception 'أكمل بيانات الملف والسيارة أولاً'; end if;
  if v_profile.blocked then raise exception 'الحساب موقوف'; end if;

  select * into v_vehicle from public.vehicles where id = p_vehicle_id and user_id = v_user_id;
  if not found then raise exception 'السيارة غير موجودة'; end if;

  select g.id into v_garage_id from public.garages g where g.status = 'active' order by g.created_at limit 1;
  if v_garage_id is null then raise exception 'الكراج غير متاح'; end if;
  select * into v_settings from public.garage_settings where garage_id = v_garage_id;

  v_duration := extract(epoch from (p_end_at - p_start_at)) / 60;
  if p_start_at < now() - interval '1 minute' then raise exception 'وقت البداية يجب أن يكون في المستقبل'; end if;
  if p_start_at > now() + make_interval(days => v_settings.max_advance_days) then raise exception 'الحجز أبعد من الحد المسموح'; end if;
  if v_duration < v_settings.min_duration_minutes or v_duration > v_settings.max_duration_minutes then
    raise exception 'مدة الحجز خارج الحدود المسموحة';
  end if;
  if mod(floor(extract(epoch from p_start_at) / 60)::bigint, v_settings.slot_interval_minutes) <> 0
     or mod(floor(extract(epoch from p_end_at) / 60)::bigint, v_settings.slot_interval_minutes) <> 0 then
    raise exception 'الوقت يجب أن يكون بخطوات % دقيقة', v_settings.slot_interval_minutes;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_garage_id::text, 0));

  select ps.id into v_slot_id
  from public.parking_slots ps
  where ps.garage_id = v_garage_id
    and ps.enabled
    and ps.sensor_health <> 'fault'
    and not ps.occupied
    and not exists (
      select 1 from public.bookings existing
      where existing.slot_id = ps.id
        and existing.status in ('confirmed', 'checked_in', 'overstayed')
        and tstzrange(existing.allocation_start_at, existing.allocation_end_at, '[)') &&
            tstzrange(
              p_start_at - make_interval(mins => v_settings.early_entry_minutes),
              p_end_at + make_interval(mins => v_settings.turnover_minutes),
              '[)'
            )
    )
  order by ps.slot_number
  for update of ps skip locked
  limit 1;

  if v_slot_id is null then raise exception 'لا يوجد موقف متاح لهذه الفترة'; end if;

  insert into public.bookings(
    user_id, vehicle_id, garage_id, slot_id, start_at, end_at,
    allocation_start_at, allocation_end_at, contact_snapshot
  ) values (
    v_user_id, v_vehicle.id, v_garage_id, v_slot_id, p_start_at, p_end_at,
    p_start_at - make_interval(mins => v_settings.early_entry_minutes),
    p_end_at + make_interval(mins => v_settings.turnover_minutes),
    jsonb_build_object(
      'fullName', v_profile.full_name,
      'phone', v_profile.phone,
      'nationalIdLast4', v_profile.national_id_last4,
      'plateNumber', v_vehicle.plate_number,
      'makeModel', v_vehicle.make_model,
      'color', v_vehicle.color
    )
  ) returning * into v_booking;

  insert into public.audit_logs(actor_user_id, action, target_type, target_id, metadata)
  values (v_user_id, 'booking.created', 'booking', v_booking.id, jsonb_build_object('slotId', v_slot_id));
  return v_booking;
end;
$$;

create or replace function public.cancel_booking(p_booking_id uuid)
returns public.bookings
language plpgsql
security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_booking public.bookings%rowtype;
  v_cutoff integer;
begin
  select b.* into v_booking
  from public.bookings b
  where b.id = p_booking_id and (b.user_id = v_user_id or public.is_admin());
  if not found then raise exception 'الحجز غير موجود'; end if;
  select s.cancellation_cutoff_minutes into v_cutoff
  from public.garage_settings s where s.garage_id = v_booking.garage_id;
  if v_booking.status <> 'confirmed' then raise exception 'لا يمكن إلغاء هذا الحجز'; end if;
  if not public.is_admin() and now() > v_booking.start_at - make_interval(mins => v_cutoff) then
    raise exception 'انتهت مهلة الإلغاء';
  end if;
  update public.bookings set status = 'cancelled', cancelled_at = now(), updated_at = now()
  where id = p_booking_id returning * into v_booking;
  insert into public.audit_logs(actor_user_id, action, target_type, target_id)
  values (v_user_id, 'booking.cancelled', 'booking', p_booking_id);
  return v_booking;
end;
$$;

create or replace function public.request_entry(
  p_booking_id uuid,
  p_gate_public_id uuid,
  p_idempotency_key uuid
)
returns table(command_id uuid, slot_number integer, expires_at timestamptz)
language plpgsql
security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_booking public.bookings%rowtype;
  v_device public.devices%rowtype;
  v_settings public.garage_settings%rowtype;
  v_slot_number integer;
  v_new_slot_id uuid;
  v_existing public.device_commands%rowtype;
  v_command public.device_commands%rowtype;
begin
  if v_user_id is null then raise exception 'يجب تسجيل الدخول'; end if;
  perform public.refresh_booking_states();
  select b.* into v_booking
  from public.bookings b join public.garages g on g.id = b.garage_id
  where b.id = p_booking_id and b.user_id = v_user_id and g.gate_public_id = p_gate_public_id;
  if not found then raise exception 'الحجز أو البوابة غير صحيح'; end if;
  if v_booking.status <> 'confirmed' then raise exception 'الحجز غير صالح للدخول'; end if;

  select * into v_settings from public.garage_settings where garage_id = v_booking.garage_id;
  if now() < v_booking.start_at - make_interval(mins => v_settings.early_entry_minutes)
     or now() > v_booking.start_at + make_interval(mins => v_settings.late_entry_minutes) then
    raise exception 'أنت خارج نافذة الدخول المسموحة';
  end if;

  select * into v_device from public.devices
  where garage_id = v_booking.garage_id and enabled order by created_at limit 1;
  if not found or v_device.last_seen_at is null or v_device.last_seen_at < now() - interval '15 seconds' then
    raise exception 'جهاز البوابة غير متصل';
  end if;
  if v_device.gate_state not in ('closed') then raise exception 'البوابة مشغولة حالياً'; end if;

  select * into v_existing from public.device_commands
  where requested_by = v_user_id and idempotency_key = p_idempotency_key;
  if found then
    select ps.slot_number into v_slot_number
    from public.parking_slots ps
    where ps.id = (v_existing.payload ->> 'slotId')::uuid;
    return query select v_existing.id, coalesce(v_slot_number, (v_existing.payload ->> 'slotNumber')::integer), v_existing.expires_at;
    return;
  end if;

  if exists(select 1 from public.parking_slots where id = v_booking.slot_id and (occupied or not enabled or sensor_health = 'fault')) then
    perform pg_advisory_xact_lock(hashtextextended(v_booking.garage_id::text, 0));
    select ps.id into v_new_slot_id
    from public.parking_slots ps
    where ps.garage_id = v_booking.garage_id and ps.enabled and not ps.occupied and ps.sensor_health <> 'fault'
      and not exists (
        select 1 from public.bookings other
        where other.id <> v_booking.id and other.slot_id = ps.id
          and other.status in ('confirmed', 'checked_in', 'overstayed')
          and tstzrange(other.allocation_start_at, other.allocation_end_at, '[)') &&
              tstzrange(v_booking.allocation_start_at, v_booking.allocation_end_at, '[)')
      )
    order by ps.slot_number for update of ps skip locked limit 1;
    if v_new_slot_id is null then raise exception 'الموقف مشغول ولا يوجد بديل آمن'; end if;
    update public.bookings set slot_id = v_new_slot_id, updated_at = now() where id = v_booking.id;
    v_booking.slot_id := v_new_slot_id;
  end if;

  select ps.slot_number into v_slot_number from public.parking_slots ps where ps.id = v_booking.slot_id;
  insert into public.device_commands(device_id, booking_id, type, payload, requested_by, idempotency_key, expires_at)
  values (
    v_device.id, v_booking.id, 'open_entry',
    jsonb_build_object('bookingId', v_booking.id, 'slotId', v_booking.slot_id, 'slotNumber', v_slot_number),
    v_user_id, p_idempotency_key, now() + interval '30 seconds'
  ) returning * into v_command;
  insert into public.audit_logs(actor_user_id, action, target_type, target_id, metadata)
  values (v_user_id, 'gate.entry_requested', 'booking', v_booking.id, jsonb_build_object('commandId', v_command.id));
  return query select v_command.id, v_slot_number, v_command.expires_at;
end;
$$;

create or replace function public.accept_device_sequence(p_device_id uuid, p_boot_id uuid, p_seq bigint)
returns boolean
language plpgsql
security definer set search_path = ''
as $$
declare v_accepted boolean := false;
begin
  update public.devices
  set last_boot_id = p_boot_id, last_seq = p_seq
  where id = p_device_id and enabled
    and (last_boot_id is distinct from p_boot_id or p_seq > last_seq)
  returning true into v_accepted;
  return coalesce(v_accepted, false);
end;
$$;

create or replace view public.parking_slot_status
with (security_invoker = true)
as
select
  ps.id,
  ps.garage_id,
  ps.slot_number,
  ps.display_name,
  case
    when not ps.enabled then 'disabled'::public.slot_state
    when ps.sensor_health = 'fault' then 'sensor_fault'::public.slot_state
    when ps.occupied and exists (
      select 1 from public.bookings b where b.slot_id = ps.id and b.status in ('checked_in', 'overstayed')
    ) then 'occupied'::public.slot_state
    when ps.occupied then 'unexpected_occupied'::public.slot_state
    when exists (
      select 1 from public.bookings b
      where b.slot_id = ps.id and b.status = 'confirmed'
        and now() <@ tstzrange(b.allocation_start_at, b.allocation_end_at, '[)')
    ) then 'reserved'::public.slot_state
    else 'available'::public.slot_state
  end as state,
  ps.occupied,
  ps.sensor_health,
  ps.last_distance_cm,
  ps.last_changed_at
from public.parking_slots ps;

create or replace view public.device_status
with (security_invoker = true)
as
select
  d.id,
  d.garage_id,
  d.name,
  d.last_seen_at,
  d.firmware_version,
  d.gate_state,
  (d.enabled and d.last_seen_at > now() - interval '15 seconds') as online
from public.devices d;

alter table public.garages enable row level security;
alter table public.garage_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.profile_private enable row level security;
alter table public.vehicles enable row level security;
alter table public.devices enable row level security;
alter table public.parking_slots enable row level security;
alter table public.bookings enable row level security;
alter table public.device_commands enable row level security;
alter table public.device_events enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;

grant usage on schema public to authenticated, service_role;
grant select on public.garages, public.garage_settings, public.profiles, public.vehicles,
  public.devices, public.parking_slots, public.bookings, public.notifications, public.audit_logs
  to authenticated;
grant insert, update, delete on public.vehicles to authenticated;
grant update(read_at) on public.notifications to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

create policy garages_read on public.garages for select to authenticated using (true);
create policy settings_read on public.garage_settings for select to authenticated using (true);
create policy profiles_own_read on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy profiles_own_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_admin_all on public.profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy vehicles_own_read on public.vehicles for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy vehicles_own_write on public.vehicles for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy devices_read on public.devices for select to authenticated using (true);
create policy slots_read on public.parking_slots for select to authenticated using (true);
create policy slots_admin_write on public.parking_slots for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy bookings_read on public.bookings for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy notifications_own_read on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_own_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy audit_admin_read on public.audit_logs for select to authenticated using (public.is_admin());

revoke insert, delete, update on public.profiles from authenticated;
grant update(full_name, phone, updated_at) on public.profiles to authenticated;
revoke all on public.profile_private from anon, authenticated;
revoke all on public.device_commands from anon, authenticated;
revoke all on public.device_events from anon, authenticated;
revoke all on public.audit_logs from anon;

revoke execute on function public.create_booking(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.create_booking(uuid, timestamptz, timestamptz) to authenticated;
revoke execute on function public.cancel_booking(uuid) from public, anon;
grant execute on function public.cancel_booking(uuid) to authenticated;
revoke execute on function public.request_entry(uuid, uuid, uuid) from public, anon;
grant execute on function public.request_entry(uuid, uuid, uuid) to authenticated;
revoke execute on function public.accept_device_sequence(uuid, uuid, bigint) from public, anon, authenticated;
grant execute on function public.accept_device_sequence(uuid, uuid, bigint) to service_role;
revoke execute on function public.refresh_booking_states() from public, anon, authenticated;
grant execute on function public.refresh_booking_states() to service_role;

grant select on public.parking_slot_status to authenticated;
grant select on public.device_status to authenticated;

alter publication supabase_realtime add table public.parking_slots;
alter publication supabase_realtime add table public.bookings;
alter publication supabase_realtime add table public.devices;
