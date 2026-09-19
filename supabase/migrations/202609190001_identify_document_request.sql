create extension if not exists pgcrypto;

create table if not exists public.inbox_records (
  email_id text primary key,
  sender text,
  subject text not null,
  body text not null,
  attachments jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  workflow_status text not null default 'received'
    check (workflow_status in (
      'received',
      'classifying',
      'classification_complete',
      'ready_for_extraction',
      'classification_failed'
    )),
  category text
    check (category in (
      'comparison_request',
      'new_si_request',
      'invoice_query',
      'general_message',
      'spam'
    )),
  continue_to_extraction boolean not null default false,
  classification_method text
    check (classification_method in ('deterministic', 'openrouter')),
  classifier_version text,
  classification_input_hash text,
  classified_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.classification_decisions (
  input_hash text primary key,
  category text not null
    check (category in (
      'comparison_request',
      'new_si_request',
      'invoice_query',
      'general_message',
      'spam'
    )),
  continue_to_extraction boolean not null,
  method text not null check (method = 'openrouter'),
  model text not null,
  reasons jsonb not null default '[]'::jsonb,
  raw_model_output jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.classification_runs (
  id uuid primary key default gen_random_uuid(),
  email_id text not null references public.inbox_records(email_id) on delete cascade,
  input_hash text not null,
  category text not null
    check (category in (
      'comparison_request',
      'new_si_request',
      'invoice_query',
      'general_message',
      'spam'
    )),
  continue_to_extraction boolean not null,
  method text not null check (method in ('deterministic', 'openrouter')),
  classifier_version text not null,
  model text,
  cache_hit boolean not null default false,
  reasons jsonb not null default '[]'::jsonb,
  raw_model_output jsonb,
  created_at timestamptz not null default now()
);

create index if not exists inbox_records_workflow_status_idx
  on public.inbox_records (workflow_status);
create index if not exists classification_runs_email_id_created_at_idx
  on public.classification_runs (email_id, created_at desc);

alter table public.inbox_records enable row level security;
alter table public.classification_decisions enable row level security;
alter table public.classification_runs enable row level security;

comment on column public.inbox_records.workflow_status is
  'Application-managed workflow state for the Supabase pipeline.';
comment on column public.classification_decisions.raw_model_output is
  'Complete OpenRouter response retained beside the reproducible final decision.';
