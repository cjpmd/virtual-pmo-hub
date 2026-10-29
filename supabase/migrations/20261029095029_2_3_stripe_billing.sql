alter table public.organisation_subscriptions
  add column if not exists stripe_customer_id     text,
  add column if not exists stripe_subscription_id text,
  add column if not exists status                 text,
  add column if not exists price_id               text,
  add column if not exists billing_interval       text,
  add column if not exists current_period_end     timestamptz,
  add column if not exists cancel_at_period_end   boolean not null default false;

alter table public.organisation_subscriptions
  add constraint organisation_subscriptions_billing_interval_check
    check (billing_interval is null or billing_interval in ('month', 'year'));

create unique index if not exists organisation_subscriptions_stripe_customer_uidx
  on public.organisation_subscriptions (stripe_customer_id) where stripe_customer_id is not null;
create unique index if not exists organisation_subscriptions_stripe_subscription_uidx
  on public.organisation_subscriptions (stripe_subscription_id) where stripe_subscription_id is not null;

comment on column public.organisation_subscriptions.status is
  'Stripe subscription status (trialing, active, past_due, unpaid, canceled, incomplete, ...). Null = never subscribed.';
comment on column public.organisation_subscriptions.seats_total is
  'Paid seats bought (Stripe subscription item quantity). Viewers are free and not counted.';

create table if not exists public.stripe_webhook_events (
  id           text primary key,
  type         text not null,
  received_at  timestamptz not null default now(),
  processed_at timestamptz,
  error        text
);
alter table public.stripe_webhook_events enable row level security;
revoke all on public.stripe_webhook_events from anon, authenticated;
comment on table public.stripe_webhook_events is
  'Stripe webhook events seen by the stripe-webhook edge function, for idempotency. No RLS policies: service role only.';

create or replace function private.paid_seat_count(p_org uuid)
returns integer
language sql
stable
security definer
set search_path to ''
as $$
  select count(*)::integer
  from public.organisation_members m
  where m.organisation_id = p_org
    and m.role <> 'viewer'::public.app_role;
$$;
revoke execute on function private.paid_seat_count(uuid) from public, anon, authenticated;

create or replace function private.organisation_is_writable(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce((
    select
      s.plan = 'demo'
      or s.status in ('trialing', 'active')
      or (s.status = 'past_due' and coalesce(s.current_period_end, now()) + interval '14 days' > now())
      or (coalesce(s.status, '') not in ('canceled', 'unpaid', 'incomplete_expired', 'past_due')
          and s.trial_ends_at is not null and s.trial_ends_at > now())
    from public.organisation_subscriptions s
    where s.organisation_id = p_org
  ), true);
$$;
revoke execute on function private.organisation_is_writable(uuid) from public, anon, authenticated;
