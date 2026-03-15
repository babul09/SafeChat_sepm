-- SafeChat schema for Supabase Postgres
-- Run this in Supabase SQL Editor

begin;

create table if not exists users (
  id bigserial primary key,
  username varchar(255) unique not null,
  email varchar(255) unique not null,
  password varchar(255) not null,
  created_at timestamptz default now()
);

create table if not exists posts (
  id bigserial primary key,
  user_id bigint not null references users(id) on delete cascade,
  text text not null,
  status varchar(20) not null default 'approved' check (status in ('approved', 'pending', 'blocked')),
  parent_id bigint null references posts(id) on delete cascade,
  created_at timestamptz default now()
);

create table if not exists user_profiles (
  id bigserial primary key,
  user_id bigint not null unique references users(id) on delete cascade,
  bio text,
  profile_image_url varchar(255),
  updated_at timestamptz default now()
);

create table if not exists chat_messages (
  id bigserial primary key,
  sender_id bigint not null references users(id) on delete cascade,
  receiver_id bigint not null references users(id) on delete cascade,
  text text not null,
  status varchar(20) not null default 'approved' check (status in ('approved', 'pending')),
  created_at timestamptz default now()
);

-- Helpful indexes
create index if not exists idx_posts_created_at on posts(created_at desc);
create index if not exists idx_posts_parent_id on posts(parent_id);
create index if not exists idx_chat_sender_receiver_created on chat_messages(sender_id, receiver_id, created_at);
create index if not exists idx_chat_receiver_sender_created on chat_messages(receiver_id, sender_id, created_at);

commit;
