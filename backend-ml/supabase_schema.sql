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

create table if not exists message_reports (
  id bigserial primary key,
  message_id bigint not null references chat_messages(id) on delete cascade,
  reporter_id bigint not null references users(id) on delete cascade,
  reported_user_id bigint not null references users(id) on delete cascade,
  reason varchar(50) not null,
  description text,
  status varchar(20) not null default 'pending' check (status in ('pending', 'resolved', 'dismissed')),
  reviewed_by bigint null references users(id) on delete set null,
  reviewed_at timestamptz null,
  created_at timestamptz default now(),
  constraint uq_message_reports_message_reporter unique (message_id, reporter_id)
);

-- Helpful indexes
create index if not exists idx_posts_created_at on posts(created_at desc);
create index if not exists idx_posts_parent_id on posts(parent_id);
create index if not exists idx_chat_sender_receiver_created on chat_messages(sender_id, receiver_id, created_at);
create index if not exists idx_chat_receiver_sender_created on chat_messages(receiver_id, sender_id, created_at);
create index if not exists idx_message_reports_reporter on message_reports(reporter_id);
create index if not exists idx_message_reports_reported on message_reports(reported_user_id);
create index if not exists idx_message_reports_status on message_reports(status);

create or replace view v_pending_reports as
select
  r.id as report_id,
  r.message_id,
  r.reporter_id,
  rep.username as reporter_username,
  r.reported_user_id,
  rep2.username as reported_username,
  m.text as message_content,
  r.reason,
  r.description,
  r.status,
  r.created_at
from message_reports r
join users rep on rep.id = r.reporter_id
join users rep2 on rep2.id = r.reported_user_id
left join chat_messages m on m.id = r.message_id
where r.status = 'pending'
order by r.created_at desc;

commit;
