
create table if not exists orgs (
  id text primary key,
  name text not null
);

create table if not exists users (
  id text primary key,
  email text not null,
  role text default 'member',
  org_id text references orgs(id)
);

create table if not exists projects (
  id text primary key,
  org_id text references orgs(id),
  name text not null,
  description text,
  description_html text,
  created_by text references users(id)
);

create table if not exists org_members (
  org_id text references orgs(id),
  user_id text references users(id),
  role text default 'member'
);

create table if not exists api_tokens (
  id text primary key,
  user_id text references users(id),
  label text,
  token_plaintext text
);
