-- StackUp Grinder — PostgreSQL reference schema.
-- This file is a contract/reference for the future API. It is NOT executed by GitHub Pages.
-- Shared identity/billing tables keep product_id explicit; Grinder training data remains product-specific.

create table if not exists stackup_identities (
  id uuid primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  locale text,
  country_code text,
  status text not null default 'active'
);

create table if not exists product_subscriptions (
  id uuid primary key,
  stackup_id uuid not null references stackup_identities(id),
  product_id text not null,
  plan_id text not null,
  status text not null,
  billing_period text,
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (stackup_id, product_id)
);

create index if not exists product_subscriptions_product_status_idx
  on product_subscriptions(product_id, status);

create table if not exists product_entitlements (
  id uuid primary key,
  stackup_id uuid not null references stackup_identities(id),
  product_id text not null,
  entitlement_key text not null,
  source text not null,
  source_ref text,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists product_entitlements_lookup_idx
  on product_entitlements(stackup_id, product_id, entitlement_key, ends_at);

create table if not exists grinder_progress (
  stackup_id uuid primary key references stackup_identities(id),
  xp bigint not null default 0,
  level integer not null default 1,
  total_sessions bigint not null default 0,
  total_spots bigint not null default 0,
  total_correct bigint not null default 0,
  streak_days integer not null default 0,
  last_training_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists grinder_training_sessions (
  id uuid primary key,
  stackup_id uuid not null references stackup_identities(id),
  mode text,
  sample_size integer not null,
  configuration jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  correct integer not null default 0,
  score numeric(10,2)
);

create index if not exists grinder_training_sessions_user_started_idx
  on grinder_training_sessions(stackup_id, started_at desc);

create table if not exists grinder_spot_attempts (
  id uuid primary key,
  session_id uuid references grinder_training_sessions(id) on delete set null,
  stackup_id uuid not null references stackup_identities(id),
  spot_id text not null,
  street text,
  scenario_key text,
  correct boolean,
  response_time_ms integer,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists grinder_spot_attempts_user_created_idx
  on grinder_spot_attempts(stackup_id, created_at desc);

create index if not exists grinder_spot_attempts_scenario_idx
  on grinder_spot_attempts(scenario_key, created_at desc);

create table if not exists cross_sell_exposures (
  id uuid primary key,
  stackup_id uuid not null references stackup_identities(id),
  origin_product_id text not null,
  destination_product_id text not null,
  offer_key text,
  destination_plan_id text,
  viewed_at timestamptz not null default now(),
  converted_at timestamptz
);

create index if not exists cross_sell_exposures_origin_destination_idx
  on cross_sell_exposures(origin_product_id, destination_product_id, viewed_at desc);

-- Analytics may live in a dedicated warehouse later. This operational event table is enough for phase 1.
create table if not exists product_events (
  id uuid primary key,
  stackup_id uuid,
  anonymous_id text,
  product_id text not null,
  plan_id text,
  event_name text not null,
  session_id text,
  app_version text,
  properties jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  ingested_at timestamptz not null default now()
);

create index if not exists product_events_product_event_time_idx
  on product_events(product_id, event_name, occurred_at desc);
