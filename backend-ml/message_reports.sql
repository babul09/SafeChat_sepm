-- message_reports table + admin helper view
-- Apply via Supabase SQL Editor or psql

begin;

create table if not exists message_reports (
  id              bigserial primary key,
  message_id      bigint       not null references chat_messages(id) on delete cascade,
  reporter_id     bigint       not null references users(id) on delete cascade,
  reported_user_id bigint      not null references users(id) on delete cascade,
  reason          varchar(50)  not null,
  description     text,
  status          varchar(20)  not null default 'pending'
                  check (status in ('pending', 'resolved', 'dismissed')),
  reviewed_by     bigint       null  references users(id) on delete set null,
  reviewed_at     timestamptz  null,
  created_at      timestamptz  default now(),
  constraint uq_message_reports_message_reporter unique (message_id, reporter_id)
);

create index if not exists idx_message_reports_reporter  on message_reports(reporter_id);
create index if not exists idx_message_reports_reported   on message_reports(reported_user_id);
create index if not exists idx_message_reports_status     on message_reports(status);

-- View: all pending reports with message text and usernames
create or replace view v_pending_reports as
select
  r.id             as report_id,
  r.message_id,
  r.reporter_id,
  rep.username     as reporter_username,
  r.reported_user_id,
  rep2.username    as reported_username,
  m.text           as message_content,
  r.reason,
  r.description,
  r.status,
  r.created_at
from message_reports r
join users rep   on rep.id   = r.reporter_id
join users rep2  on rep2.id  = r.reported_user_id
left join chat_messages m on m.id = r.message_id
where r.status = 'pending'
order by r.created_at desc;

commit;
