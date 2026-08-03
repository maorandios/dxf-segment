-- OMEGA / SEGMENT — Invite-only Email OTP auth + user credits v1
-- Canonical calendar timezone for credit periods: UTC
-- Quotation/DXF/.segment project data must NOT be stored in Supabase.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.omega_account_status as enum (
  'trial',
  'permanent'
);

-- ---------------------------------------------------------------------------
-- omega_users (manual allowlist + profile + credits)
-- ---------------------------------------------------------------------------
create table public.omega_users (
  email text primary key,

  auth_user_id uuid unique
    references auth.users(id)
    on delete set null,

  company_name text not null,
  company_registration_number text,
  address text,
  phone text,
  contact_name text,

  account_status public.omega_account_status
    not null
    default 'trial',

  is_active boolean
    not null
    default true,

  credits_balance integer
    not null
    default 10
    check (credits_balance >= 0),

  credits_period_start date
    not null
    default (date_trunc('month', timezone('UTC', now())))::date,

  trial_grant_applied_at timestamptz,
  permanent_activated_at timestamptz,
  last_credit_renewal_at timestamptz,

  created_at timestamptz
    not null
    default now(),

  updated_at timestamptz
    not null
    default now(),

  last_login_at timestamptz,

  constraint omega_users_email_normalized
    check (email = lower(trim(email)))
);

comment on table public.omega_users is
  'Manually provisioned OMEGA allowlist. Email is the business identity (normalized lowercase).';

-- ---------------------------------------------------------------------------
-- Credit ledger (audit)
-- ---------------------------------------------------------------------------
create table public.omega_credit_ledger (
  id uuid primary key default gen_random_uuid(),

  user_email text not null
    references public.omega_users(email)
    on update cascade
    on delete restrict,

  delta integer not null,

  balance_after integer not null
    check (balance_after >= 0),

  reason text not null,

  idempotency_key text,

  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);

create unique index omega_credit_ledger_idempotency_uidx
  on public.omega_credit_ledger (idempotency_key)
  where idempotency_key is not null;

create index omega_credit_ledger_user_email_idx
  on public.omega_credit_ledger (user_email, created_at desc);

-- ---------------------------------------------------------------------------
-- Shared updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger omega_users_set_updated_at
  before update on public.omega_users
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Email normalize on insert/update
-- ---------------------------------------------------------------------------
create or replace function public.normalize_omega_user_email()
returns trigger
language plpgsql
as $$
begin
  new.email := lower(trim(new.email));
  return new;
end;
$$;

create trigger omega_users_normalize_email
  before insert or update of email on public.omega_users
  for each row
  execute function public.normalize_omega_user_email();

-- ---------------------------------------------------------------------------
-- Automatic account defaults (trial / permanent / status transitions)
-- ---------------------------------------------------------------------------
create or replace function public.apply_omega_account_defaults()
returns trigger
language plpgsql
as $$
declare
  period_start date := (date_trunc('month', timezone('UTC', now())))::date;
begin
  -- INSERT
  if tg_op = 'INSERT' then
    if new.account_status = 'trial' then
      new.credits_balance := 10;
      new.trial_grant_applied_at := coalesce(new.trial_grant_applied_at, now());
      new.credits_period_start := coalesce(new.credits_period_start, period_start);
    elsif new.account_status = 'permanent' then
      new.credits_balance := 500;
      new.permanent_activated_at := coalesce(new.permanent_activated_at, now());
      new.credits_period_start := period_start;
      new.last_credit_renewal_at := now();
    end if;
    return new;
  end if;

  -- UPDATE: trial → permanent
  if old.account_status = 'trial' and new.account_status = 'permanent' then
    new.credits_balance := 500;
    new.permanent_activated_at := now();
    new.credits_period_start := period_start;
    new.last_credit_renewal_at := now();
    return new;
  end if;

  -- UPDATE: permanent → trial
  -- Stop monthly renewals. Do NOT grant another 10-credit trial package.
  -- Preserve current remaining balance unless admin explicitly changed credits_balance.
  if old.account_status = 'permanent' and new.account_status = 'trial' then
    if new.credits_balance = old.credits_balance then
      -- keep balance as-is
      null;
    end if;
    -- Do not set trial_grant_applied_at again if already set
    return new;
  end if;

  return new;
end;
$$;

create trigger omega_users_account_defaults
  before insert or update of account_status on public.omega_users
  for each row
  execute function public.apply_omega_account_defaults();

-- Ledger rows for initial grants (after insert)
create or replace function public.log_omega_initial_credit_grant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.account_status = 'trial' then
    insert into public.omega_credit_ledger (
      user_email, delta, balance_after, reason, idempotency_key, metadata
    ) values (
      new.email,
      new.credits_balance,
      new.credits_balance,
      'TRIAL_INITIAL_GRANT',
      'trial-initial:' || new.email,
      jsonb_build_object('source', 'trigger')
    )
    on conflict do nothing;
  elsif new.account_status = 'permanent' then
    insert into public.omega_credit_ledger (
      user_email, delta, balance_after, reason, idempotency_key, metadata
    ) values (
      new.email,
      new.credits_balance,
      new.credits_balance,
      'PERMANENT_ACTIVATION',
      'permanent-activation:' || new.email || ':' || to_char(timezone('UTC', now()), 'YYYY-MM'),
      jsonb_build_object('source', 'trigger')
    )
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger omega_users_log_initial_grant
  after insert on public.omega_users
  for each row
  execute function public.log_omega_initial_credit_grant();

-- Ledger when trial → permanent
create or replace function public.log_omega_status_credit_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.account_status = 'trial' and new.account_status = 'permanent' then
    insert into public.omega_credit_ledger (
      user_email, delta, balance_after, reason, idempotency_key, metadata
    ) values (
      new.email,
      new.credits_balance - old.credits_balance,
      new.credits_balance,
      'PERMANENT_ACTIVATION',
      'permanent-activation:' || new.email || ':' || to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS'),
      jsonb_build_object('source', 'trigger', 'from', 'trial')
    )
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger omega_users_log_status_change
  after update of account_status on public.omega_users
  for each row
  execute function public.log_omega_status_credit_change();

-- ---------------------------------------------------------------------------
-- Monthly permanent renewal (UTC calendar month) — reset to 500, not add
-- ---------------------------------------------------------------------------
create or replace function public.renew_permanent_user_credits()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  period_start date := (date_trunc('month', timezone('UTC', now())))::date;
  renewed integer := 0;
  r record;
begin
  for r in
    select email, credits_balance
    from public.omega_users
    where is_active = true
      and account_status = 'permanent'
      and credits_period_start < period_start
    for update
  loop
    update public.omega_users
    set
      credits_balance = 500,
      credits_period_start = period_start,
      last_credit_renewal_at = now()
    where email = r.email;

    insert into public.omega_credit_ledger (
      user_email, delta, balance_after, reason, idempotency_key, metadata
    ) values (
      r.email,
      500 - r.credits_balance,
      500,
      'MONTHLY_RENEWAL',
      'monthly-renewal:' || r.email || ':' || to_char(period_start, 'YYYY-MM'),
      jsonb_build_object('timezone', 'UTC', 'period_start', period_start)
    )
    on conflict do nothing;

    renewed := renewed + 1;
  end loop;

  return renewed;
end;
$$;

-- Lightweight ensure for a single user (called from profile load / consume)
create or replace function public.ensure_current_credit_period()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  period_start date := (date_trunc('month', timezone('UTC', now())))::date;
  u public.omega_users%rowtype;
begin
  if uid is null then
    return;
  end if;

  select * into u
  from public.omega_users
  where auth_user_id = uid
  for update;

  if not found then
    return;
  end if;

  if u.is_active
     and u.account_status = 'permanent'
     and u.credits_period_start < period_start then
    update public.omega_users
    set
      credits_balance = 500,
      credits_period_start = period_start,
      last_credit_renewal_at = now()
    where email = u.email;

    insert into public.omega_credit_ledger (
      user_email, delta, balance_after, reason, idempotency_key, metadata
    ) values (
      u.email,
      500 - u.credits_balance,
      500,
      'MONTHLY_RENEWAL',
      'monthly-renewal:' || u.email || ':' || to_char(period_start, 'YYYY-MM'),
      jsonb_build_object('timezone', 'UTC', 'source', 'ensure_current_credit_period')
    )
    on conflict do nothing;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Atomic credit consumption (+ refund for failed provider start)
-- ---------------------------------------------------------------------------
create or replace function public.consume_quotation_credit(
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  u public.omega_users%rowtype;
  existing public.omega_credit_ledger%rowtype;
  new_balance integer;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED', 'message', 'לא מחובר');
  end if;

  if p_idempotency_key is null or length(trim(p_idempotency_key)) = 0 then
    return jsonb_build_object('ok', false, 'code', 'MISSING_IDEMPOTENCY_KEY', 'message', 'חסר מפתח חיוב');
  end if;

  perform public.ensure_current_credit_period();

  select * into u
  from public.omega_users
  where auth_user_id = uid
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'USER_NOT_FOUND', 'message', 'הגישה לחשבון זה אינה פעילה');
  end if;

  if not u.is_active then
    return jsonb_build_object('ok', false, 'code', 'INACTIVE', 'message', 'הגישה לחשבון זה אינה פעילה');
  end if;

  select * into existing
  from public.omega_credit_ledger
  where idempotency_key = p_idempotency_key;

  if found then
    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'credits_balance', existing.balance_after,
      'ledger_id', existing.id
    );
  end if;

  if u.credits_balance <= 0 then
    return jsonb_build_object(
      'ok', false,
      'code', 'INSUFFICIENT_CREDITS',
      'message', 'אין מספיק קרדיטים ליצירת הצעת מחיר חדשה',
      'credits_balance', u.credits_balance
    );
  end if;

  new_balance := u.credits_balance - 1;

  update public.omega_users
  set credits_balance = new_balance
  where email = u.email;

  insert into public.omega_credit_ledger (
    user_email, delta, balance_after, reason, idempotency_key, metadata
  ) values (
    u.email,
    -1,
    new_balance,
    'QUOTATION_CREDIT_CONSUMED',
    p_idempotency_key,
    jsonb_build_object('auth_user_id', uid)
  );

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'credits_balance', new_balance
  );
end;
$$;

-- Refund only when provider failed before a usable analysis result.
-- Idempotent via refund idempotency key derived from consume key.
create or replace function public.refund_quotation_credit(
  p_consume_idempotency_key text,
  p_reason text default 'PROVIDER_FAILED_BEFORE_RESULT'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  u public.omega_users%rowtype;
  consumed public.omega_credit_ledger%rowtype;
  refund_key text;
  existing_refund public.omega_credit_ledger%rowtype;
  new_balance integer;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED');
  end if;

  refund_key := 'refund:' || p_consume_idempotency_key;

  select * into existing_refund
  from public.omega_credit_ledger
  where idempotency_key = refund_key;

  if found then
    return jsonb_build_object('ok', true, 'duplicate', true, 'credits_balance', existing_refund.balance_after);
  end if;

  select * into consumed
  from public.omega_credit_ledger
  where idempotency_key = p_consume_idempotency_key
    and reason = 'QUOTATION_CREDIT_CONSUMED';

  if not found then
    return jsonb_build_object('ok', false, 'code', 'NO_CONSUME_ENTRY');
  end if;

  select * into u
  from public.omega_users
  where auth_user_id = uid
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'USER_NOT_FOUND');
  end if;

  new_balance := u.credits_balance + 1;

  update public.omega_users
  set credits_balance = new_balance
  where email = u.email;

  insert into public.omega_credit_ledger (
    user_email, delta, balance_after, reason, idempotency_key, metadata
  ) values (
    u.email,
    1,
    new_balance,
    'ADMIN_ADJUSTMENT',
    refund_key,
    jsonb_build_object(
      'refund_of', p_consume_idempotency_key,
      'reason', p_reason
    )
  );

  return jsonb_build_object('ok', true, 'duplicate', false, 'credits_balance', new_balance);
end;
$$;

-- Controlled company profile update (no credit/status fields)
create or replace function public.update_omega_company_profile(
  p_company_name text,
  p_company_registration_number text,
  p_address text,
  p_phone text,
  p_contact_name text
)
returns public.omega_users
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  updated public.omega_users%rowtype;
begin
  if uid is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  update public.omega_users
  set
    company_name = coalesce(nullif(trim(p_company_name), ''), company_name),
    company_registration_number = nullif(trim(p_company_registration_number), ''),
    address = nullif(trim(p_address), ''),
    phone = nullif(trim(p_phone), ''),
    contact_name = nullif(trim(p_contact_name), '')
  where auth_user_id = uid
    and is_active = true
  returning * into updated;

  if not found then
    raise exception 'INACTIVE_OR_MISSING';
  end if;

  return updated;
end;
$$;

-- ---------------------------------------------------------------------------
-- Before User Created Auth Hook
-- ---------------------------------------------------------------------------
create or replace function public.hook_allow_omega_user(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  raw_email text := event->'user'->>'email';
  normalized text;
  active_exists boolean;
begin
  if raw_email is null or length(trim(raw_email)) = 0 then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', E'כתובת הדוא"ל אינה רשומה במערכת'
      )
    );
  end if;

  normalized := lower(trim(raw_email));

  select exists(
    select 1
    from public.omega_users
    where email = normalized
      and is_active = true
  ) into active_exists;

  if not active_exists then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', E'כתובת הדוא"ל אינה רשומה במערכת'
      )
    );
  end if;

  return event;
end;
$$;

revoke execute on function public.hook_allow_omega_user(jsonb) from authenticated, anon, public;
grant execute on function public.hook_allow_omega_user(jsonb) to supabase_auth_admin;

-- Minimal table access for the hook
grant select on table public.omega_users to supabase_auth_admin;

-- ---------------------------------------------------------------------------
-- Link first-time Auth users → omega_users.auth_user_id
-- ---------------------------------------------------------------------------
create or replace function public.link_omega_user_on_auth_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized text;
  linked uuid;
begin
  if new.email is null then
    raise exception 'OMEGA_LINK_FAIL: auth user missing email';
  end if;

  normalized := lower(trim(new.email));

  select auth_user_id into linked
  from public.omega_users
  where email = normalized
    and is_active = true
  for update;

  if not found then
    raise exception 'OMEGA_LINK_FAIL: no allowlisted active omega_users row for %', normalized;
  end if;

  if linked is not null and linked <> new.id then
    raise exception 'OMEGA_LINK_FAIL: auth_user_id already linked to a different user';
  end if;

  if linked is null then
    update public.omega_users
    set auth_user_id = new.id
    where email = normalized
      and auth_user_id is null;
  end if;

  return new;
end;
$$;

-- auth.users trigger (requires privileges in Supabase)
drop trigger if exists on_auth_user_created_link_omega on auth.users;
create trigger on_auth_user_created_link_omega
  after insert on auth.users
  for each row
  execute function public.link_omega_user_on_auth_insert();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.omega_users enable row level security;
alter table public.omega_credit_ledger enable row level security;

-- Users may read only their own active row
create policy omega_users_select_own
  on public.omega_users
  for select
  to authenticated
  using (auth.uid() = auth_user_id and is_active = true);

-- No direct insert/update/delete for authenticated clients
-- (company updates go through update_omega_company_profile)

-- Optional own-ledger read (restricted; billing modal does not require it)
create policy omega_credit_ledger_select_own
  on public.omega_credit_ledger
  for select
  to authenticated
  using (
    user_email = (
      select email from public.omega_users
      where auth_user_id = auth.uid() and is_active = true
    )
  );

-- RPC grants
grant execute on function public.consume_quotation_credit(text) to authenticated;
grant execute on function public.refund_quotation_credit(text, text) to authenticated;
grant execute on function public.ensure_current_credit_period() to authenticated;
grant execute on function public.update_omega_company_profile(text, text, text, text, text) to authenticated;
grant execute on function public.renew_permanent_user_credits() to service_role;

-- Cron (enable pg_cron + schedule in Dashboard; documented in setup checklist):
-- select cron.schedule(
--   'omega-monthly-credit-renewal',
--   '15 0 1 * *',  -- 00:15 UTC on the 1st of each month
--   $$ select public.renew_permanent_user_credits(); $$
-- );
