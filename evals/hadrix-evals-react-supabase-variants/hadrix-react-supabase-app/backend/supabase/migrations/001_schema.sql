-- 001_schema.sql
-- Core schema for Orbit Projects (multi-tenant project tracker).

create extension if not exists "pgcrypto";

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key,
  email text,
  role text not null default 'member',
  org_id uuid references public.organizations(id),
  created_at timestamptz not null default now()
);

create table if not exists public.org_members (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  member_role text not null default 'member',
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  description_html text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id bigserial primary key,
  actor_user_id uuid,
  action text not null,
  target text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.api_tokens (
  id bigserial primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  secret_payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.webhook_events (
  id bigserial primary key,
  event_type text not null,
  raw_payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now()
);
