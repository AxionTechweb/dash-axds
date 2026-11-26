-- E-mail automático (Resend): regras por gatilho e fila/histórico de envio.
create table if not exists email_rules (
  id text primary key default (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))),
  area_id text not null references areas(id) on delete cascade,
  trigger text not null check (trigger in ('approved','waiting_payment','abandoned','lead')),
  subject text not null,
  body text not null,
  button_label text,
  button_url text,
  from_name text,
  reply_to text,
  delay_minutes integer not null default 0 check (delay_minutes >= 0 and delay_minutes <= 10080),
  enabled integer  not null default 0,
  created_at text  not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text  not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  unique (area_id, trigger)
);

create table if not exists email_log (
  id text primary key default (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))),
  area_id text not null references areas(id) on delete cascade,
  rule_id text references email_rules(id) on delete set null,
  trigger text not null check (trigger in ('approved','waiting_payment','abandoned','lead','test')),
  source_ref text,
  email text not null,
  context text  not null default '{}',
  subject text,
  status text not null default 'queued' check (status in ('queued','sending','sent','failed','skipped')),
  error text,
  provider_id text,
  scheduled_at text  not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  sent_at text ,
  claimed_at text ,
  created_at text  not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create unique index if not exists email_log_rule_source_uidx on email_log (rule_id, source_ref)
  where rule_id is not null and source_ref is not null;
create index if not exists email_log_queue_idx on email_log (status, scheduled_at);
create index if not exists email_log_area_created_idx on email_log (area_id, created_at);

create trigger if not exists email_rules_set_updated_at after update on email_rules
for each row when new.updated_at is old.updated_at begin
  update email_rules set updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) where rowid = new.rowid;
end;

