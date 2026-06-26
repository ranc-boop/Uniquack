-- Lock per-session long-term memory snapshots for cache-stable practice threads.

alter table public.practice_sessions
  add column if not exists long_term_memory_snapshot text not null default ''
    check (length(long_term_memory_snapshot) <= 1000);

comment on column public.practice_sessions.long_term_memory_snapshot is
  'Long-term practice memory captured when the session is created. Later global preference edits affect only new sessions.';
