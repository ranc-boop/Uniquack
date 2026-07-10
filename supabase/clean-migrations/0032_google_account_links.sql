-- Google Account Linking Foundation
--
-- Adds EduStruct's identity-linking layer for Google OAuth sign-in.
-- Google is identity, EduStruct profile / organization / classroom is authorization.
-- This migration is additive; it does not modify any existing table constraints,
-- RLS policies, or function contracts beyond appending new objects and three
-- denormalized columns on public.profiles.
--
-- G-LOGIN1 plan reference: docs/google-login-account-linking-plan.md
--
-- Review safety:
--   * No AI auto-publish path. This migration is plan / draft, not yet applied
--     to any production database. Apply through the same forward-only
--     clean-migration chain as 0001..0031.
--   * soft-revocation is the only supported unlink path; rows are never
--     hard-deleted so audit / lineage survive.

-- ---------------------------------------------------------------------------
-- 1. new tables
-- ---------------------------------------------------------------------------

create table if not exists public.google_account_links (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  google_sub text not null,
  email_at_link text,
  email_verified boolean not null default false,
  display_name text,
  -- when a row is soft-revoked, revoked_at is set; the partial unique
  -- index below guarantees only one live link per google_sub and per
  -- profile_id. Soft-revoked rows are kept for audit and to detect
  -- re-link attempts to a different EduStruct profile.
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id) on delete set null,
  revoke_reason text,
  linked_at timestamptz not null default now(),
  last_used_at timestamptz,
  -- google's stable sub identifier; we keep it on every row (including
  -- revoked) to prevent the same google_sub from being silently attached
  -- to a different profile after a revoke.
  constraint google_account_links_sub_format_chk
    check (google_sub ~ '^[0-9]+$'),
  constraint google_account_links_revoked_at_chk
    check ((revoked_at is null) = (revoke_reason is null))
);

-- partial unique indices: at most one live link per google_sub and per
-- profile. Soft-revoked rows do not block re-link, but enforce ordering
-- at write time (RPC layer in section 3).
create unique index if not exists google_account_links_sub_live_uniq
  on public.google_account_links (google_sub)
  where revoked_at is null;

create unique index if not exists google_account_links_profile_live_uniq
  on public.google_account_links (profile_id)
  where revoked_at is null;

create index if not exists google_account_links_profile_idx
  on public.google_account_links (profile_id, revoked_at);

create index if not exists google_account_links_last_used_idx
  on public.google_account_links (last_used_at desc)
  where revoked_at is null;

-- audit log: append-only. one row per identity-link event. captures
-- user, google_sub, event, and salted hashes of ip + user agent. raw
-- values are never stored.
create table if not exists public.identity_link_audit_log (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  profile_id uuid references public.profiles(id) on delete set null,
  google_sub text,
  event_type text not null,
  reason text,
  ip_hash text,
  ua_hash text,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  is_super_admin_action boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  constraint identity_link_audit_log_event_chk
    check (event_type in (
      'signin_new',
      'signin_existing',
      'link_new',
      'link_rejected_duplicate_sub',
      'link_rejected_email_collision',
      'link_rejected_already_linked',
      'unlink',
      'unlink_blocked_last_identity',
      'unlink_by_admin',
      'reject_by_admin'
    ))
);

create index if not exists identity_link_audit_log_profile_idx
  on public.identity_link_audit_log (profile_id, occurred_at desc);

create index if not exists identity_link_audit_log_google_sub_idx
  on public.identity_link_audit_log (google_sub, occurred_at desc);

create index if not exists identity_link_audit_log_event_idx
  on public.identity_link_audit_log (event_type, occurred_at desc);

-- ---------------------------------------------------------------------------
-- 2. denormalized columns on public.profiles
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists google_sub text,
  add column if not exists google_email_at_link text,
  add column if not exists google_linked_at timestamptz;

-- we keep google_sub unique on profiles as a second line of defence
-- (the partial unique on google_account_links is authoritative, but this
-- index lets us quickly answer "which profile owns google_sub X").
create unique index if not exists profiles_google_sub_uniq
  on public.profiles (google_sub)
  where google_sub is not null;

-- ---------------------------------------------------------------------------
-- 3. private helper functions
-- ---------------------------------------------------------------------------

-- has_password(uuid): returns true if the auth user backing this profile
-- has set a password. We can't reach encrypted_password on a mock
-- auth.users, so the function takes a hint from auth.users.password_set
-- (added by 0001-style mock). On real Supabase this maps to
-- (encrypted_password is not null).
create or replace function private.profile_has_password(target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select coalesce((
    select u.password_set
    from auth.users u
    where u.id = target_profile_id
  ), false);
$$;

-- count_live_identities(uuid): for last-identity protection. today there
-- is only one external identity provider (google). when a future provider
-- is added, this function is the single place to update.
create or replace function private.count_live_identities(target_profile_id uuid)
returns integer
language sql
stable
security definer
set search_path = public, private
as $$
  select (
    select count(*)::int from public.google_account_links
    where profile_id = target_profile_id and revoked_at is null
  ) + case when private.profile_has_password(target_profile_id) then 1 else 0 end;
$$;

-- private.sync_profile_google_sub: keeps profiles.google_sub /
-- google_email_at_link / google_linked_at in sync with the live link
-- row. declared AFTER INSERT/UPDATE/DELETE on google_account_links.
-- run as trigger for each row, security definer, and only touches the
-- profile that owns the link.
create or replace function private.sync_profile_google_sub()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  target_profile_id uuid;
  linked_sub text;
  linked_email text;
  linked_at timestamptz;
begin
  if (tg_op = 'DELETE') then
    target_profile_id := old.profile_id;
  else
    target_profile_id := new.profile_id;
  end if;

  if (tg_op = 'UPDATE' and old.revoked_at is null and new.revoked_at is not null) then
    -- soft revoke: clear denormalized fields.
    update public.profiles
       set google_sub = null,
           google_email_at_link = null,
           google_linked_at = null
     where id = target_profile_id;
    return new;
  end if;

  -- pick the live link for this profile (at most one, by partial unique index)
  select l.google_sub, l.email_at_link, l.linked_at
    into linked_sub, linked_email, linked_at
  from public.google_account_links l
  where l.profile_id = target_profile_id
    and l.revoked_at is null
  limit 1;

  if linked_sub is null then
    -- no live link: clear denormalized fields.
    update public.profiles
       set google_sub = null,
           google_email_at_link = null,
           google_linked_at = null
     where id = target_profile_id;
  else
    update public.profiles
       set google_sub = linked_sub,
           google_email_at_link = linked_email,
           google_linked_at = linked_at
     where id = target_profile_id;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists google_account_links_sync_profile_ins on public.google_account_links;
create trigger google_account_links_sync_profile_ins
  after insert on public.google_account_links
  for each row execute function private.sync_profile_google_sub();

drop trigger if exists google_account_links_sync_profile_upd on public.google_account_links;
create trigger google_account_links_sync_profile_upd
  after update on public.google_account_links
  for each row execute function private.sync_profile_google_sub();

drop trigger if exists google_account_links_sync_profile_del on public.google_account_links;
create trigger google_account_links_sync_profile_del
  after delete on public.google_account_links
  for each row execute function private.sync_profile_google_sub();

-- ---------------------------------------------------------------------------
-- 4. RPCs (security definer; called from the app server with the
--    caller's auth.uid() = profile id). Each RPC writes a single audit
--    row, in addition to the data change.
-- ---------------------------------------------------------------------------

-- _audit_identity_event: internal helper. salted-hashes ip / ua before
-- insert. returns void. callers should not bypass this.
create or replace function private._audit_identity_event(
  p_profile_id uuid,
  p_google_sub text,
  p_event_type text,
  p_reason text,
  p_ip text,
  p_ua text,
  p_actor_profile_id uuid,
  p_is_super_admin_action boolean,
  p_metadata jsonb
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  salt text;
  ip_h text;
  ua_h text;
begin
  -- salt is intentionally simple here: a function-local constant. A
  -- daily-rotating salt is the next-migration improvement and is
  -- tracked separately so the hash format stays stable across runs.
  salt := 'edustruct-glogin1-static-salt';
  if p_ip is not null then
    ip_h := encode(extensions.digest(convert_to(salt || '|' || p_ip, 'UTF8'), 'sha256'), 'hex');
  end if;
  if p_ua is not null then
    ua_h := encode(extensions.digest(convert_to(salt || '|' || p_ua, 'UTF8'), 'sha256'), 'hex');
  end if;

  insert into public.identity_link_audit_log (
    profile_id, google_sub, event_type, reason,
    ip_hash, ua_hash, actor_profile_id,
    is_super_admin_action, metadata
  ) values (
    p_profile_id, p_google_sub, p_event_type, p_reason,
    ip_h, ua_h, p_actor_profile_id,
    p_is_super_admin_action, coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

-- record_google_signin: called by the auth callback on every Google
-- sign-in event. Returns:
--   (link_id, profile_id, status)
-- where status is one of:
--   'signin_existing'   -- google_sub already had a live link; last_used_at updated
--   'signin_new'        -- google_sub had no live link AND no email-collision;
--                         a new profile (role='student') is created and linked
--   'email_collision'   -- google_sub is fresh, but another EduStruct profile
--                         already owns this email. rejected.
--   'duplicate_sub'     -- google_sub has a soft-revoked row bound to a
--                         different profile. rejected.
-- No caller-side role assignment: a new profile is always role='student'.
create or replace function public.record_google_signin(
  p_google_sub text,
  p_email text,
  p_email_verified boolean,
  p_display_name text,
  p_ip text default null,
  p_ua text default null
)
returns table (
  link_id uuid,
  profile_id uuid,
  status text
)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_existing_link public.google_account_links%rowtype;
  v_existing_profile public.profiles%rowtype;
  v_existing_profile_id uuid;
  v_new_profile public.profiles%rowtype;
  v_new_link public.google_account_links%rowtype;
  v_status text;
  v_email_lower text;
begin
  v_email_lower := lower(coalesce(p_email, ''));

  -- case A: live link exists for this google_sub -> signin_existing.
  select * into v_existing_link
  from public.google_account_links
  where google_sub = p_google_sub and revoked_at is null
  limit 1;
  if found then
    update public.google_account_links
       set last_used_at = now(),
           email_at_link = coalesce(nullif(p_email, ''), email_at_link)
     where id = v_existing_link.id;
    perform private._audit_identity_event(
      v_existing_link.profile_id, p_google_sub, 'signin_existing',
      null, p_ip, p_ua, v_existing_link.profile_id, false,
      jsonb_build_object('email', v_email_lower, 'email_verified', p_email_verified)
    );
    return query select v_existing_link.id, v_existing_link.profile_id, 'signin_existing'::text;
    return;
  end if;

  -- case B: any non-revoked row, even soft-revoked, for this google_sub
  -- is bound to a *different* profile -> duplicate_sub. Reject.
  select l.profile_id into v_existing_profile_id
  from public.google_account_links l
  where l.google_sub = p_google_sub
  order by l.linked_at desc
  limit 1;
  if found and v_existing_profile_id is not null then
    perform private._audit_identity_event(
      v_existing_profile_id, p_google_sub, 'link_rejected_duplicate_sub',
      'google_sub previously bound to a different profile',
      p_ip, p_ua, v_existing_profile_id, false,
      jsonb_build_object('email', v_email_lower)
    );
    return query select null::uuid, v_existing_profile_id, 'duplicate_sub'::text;
    return;
  end if;

  -- case C: email matches an existing profile -> email_collision. Reject.
  if v_email_lower <> '' then
    select * into v_existing_profile
    from public.profiles
    where lower(email) = v_email_lower
    limit 1;
    if found and v_existing_profile.id is not null then
      perform private._audit_identity_event(
        v_existing_profile.id, p_google_sub, 'link_rejected_email_collision',
        'google email already attached to a profile',
        p_ip, p_ua, v_existing_profile.id, false,
        jsonb_build_object('email', v_email_lower)
      );
      return query select null::uuid, v_existing_profile.id, 'email_collision'::text;
      return;
    end if;
  end if;

  -- case D: new profile. role = student, status = active.
  insert into auth.users (id, email, raw_user_meta_data)
  values (gen_random_uuid(), nullif(p_email, ''),
          jsonb_build_object('provider', 'google', 'sub', p_google_sub,
                             'display_name', p_display_name,
                             'email_verified', p_email_verified))
  returning id into v_new_profile.id;

  insert into public.profiles (id, email, display_name, role, status)
  values (v_new_profile.id, nullif(p_email, ''), p_display_name, 'student', 'active')
  returning * into v_new_profile;

  insert into public.google_account_links (
    profile_id, google_sub, email_at_link, email_verified, display_name
  ) values (
    v_new_profile.id, p_google_sub, p_email, coalesce(p_email_verified, false), p_display_name
  )
  returning * into v_new_link;

  perform private._audit_identity_event(
    v_new_profile.id, p_google_sub, 'signin_new',
    null, p_ip, p_ua, v_new_profile.id, false,
    jsonb_build_object('email', v_email_lower, 'email_verified', p_email_verified,
                       'display_name', p_display_name)
  );

  return query select v_new_link.id, v_new_profile.id, 'signin_new'::text;
end;
$$;

-- link_google_to_current_profile: called from /settings/linked-accounts.
-- Caller is already authenticated as the target profile (auth.uid()).
-- Rejects if the caller already has a live link, or if google_sub is
-- already live-bound to a different profile.
create or replace function public.link_google_to_current_profile(
  p_google_sub text,
  p_email text,
  p_email_verified boolean,
  p_display_name text default null,
  p_ip text default null,
  p_ua text default null
)
returns table (link_id uuid, status text)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_caller uuid := auth.uid();
  v_existing_link public.google_account_links%rowtype;
  v_new_link public.google_account_links%rowtype;
begin
  if v_caller is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- reject if caller already has a live link
  select * into v_existing_link
  from public.google_account_links
  where profile_id = v_caller and revoked_at is null
  limit 1;
  if found then
    perform private._audit_identity_event(
      v_caller, p_google_sub, 'link_rejected_already_linked',
      'caller already has a live google link',
      p_ip, p_ua, v_caller, false, '{}'::jsonb
    );
    return query select null::uuid, 'already_linked'::text;
    return;
  end if;

  -- reject if google_sub is already live-bound to someone else
  select * into v_existing_link
  from public.google_account_links
  where google_sub = p_google_sub and revoked_at is null
  limit 1;
  if found then
    perform private._audit_identity_event(
      v_existing_link.profile_id, p_google_sub, 'link_rejected_duplicate_sub',
      'google_sub live-bound to a different profile',
      p_ip, p_ua, v_caller, false, '{}'::jsonb
    );
    return query select null::uuid, 'duplicate_sub'::text;
    return;
  end if;

  insert into public.google_account_links (
    profile_id, google_sub, email_at_link, email_verified, display_name
  ) values (
    v_caller, p_google_sub, p_email, coalesce(p_email_verified, false), p_display_name
  )
  returning * into v_new_link;

  perform private._audit_identity_event(
    v_caller, p_google_sub, 'link_new', null, p_ip, p_ua, v_caller, false,
    jsonb_build_object('email', lower(coalesce(p_email, '')),
                       'email_verified', p_email_verified)
  );

  return query select v_new_link.id, 'link_new'::text;
end;
$$;

-- unlink_google_account: soft-revokes the caller's live link. Refuses
-- if it would leave the caller with zero identities (last identity).
create or replace function public.unlink_google_account(
  p_ip text default null,
  p_ua text default null,
  p_reason text default null
)
returns table (status text)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_caller uuid := auth.uid();
  v_link public.google_account_links%rowtype;
  v_remaining int;
begin
  if v_caller is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_link
  from public.google_account_links
  where profile_id = v_caller and revoked_at is null
  limit 1;
  if not found then
    return query select 'no_live_link'::text;
    return;
  end if;

  -- last-identity protection: if password is not set, this is the
  -- caller's only identity. count_live_identities is 1 (the google
  -- link itself); after revoke it would be 0.
  v_remaining := private.count_live_identities(v_caller);
  if v_remaining <= 1 then
    perform private._audit_identity_event(
      v_caller, v_link.google_sub, 'unlink_blocked_last_identity',
      'unlink refused: would leave zero identities',
      p_ip, p_ua, v_caller, false, '{}'::jsonb
    );
    return query select 'blocked_last_identity'::text;
    return;
  end if;

  update public.google_account_links
     set revoked_at = now(),
         revoked_by = v_caller,
         revoke_reason = coalesce(p_reason, 'self_unlink')
   where id = v_link.id;

  perform private._audit_identity_event(
    v_caller, v_link.google_sub, 'unlink',
    p_reason, p_ip, p_ua, v_caller, false, '{}'::jsonb
  );

  return query select 'unlinked'::text;
end;
$$;

-- reject_google_link: super_admin force-unlink. Bypasses last-identity
-- check. Writes a special audit event. Caller must be super_admin.
create or replace function public.reject_google_link(
  p_target_profile_id uuid,
  p_reason text,
  p_ip text default null,
  p_ua text default null
)
returns table (status text)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_caller uuid := auth.uid();
  v_link public.google_account_links%rowtype;
begin
  if v_caller is null or not private.is_super_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_target_profile_id is null then
    raise exception 'target_profile_id required';
  end if;

  select * into v_link
  from public.google_account_links
  where profile_id = p_target_profile_id and revoked_at is null
  limit 1;
  if not found then
    return query select 'no_live_link'::text;
    return;
  end if;

  update public.google_account_links
     set revoked_at = now(),
         revoked_by = v_caller,
         revoke_reason = p_reason
   where id = v_link.id;

  perform private._audit_identity_event(
    p_target_profile_id, v_link.google_sub, 'reject_by_admin',
    p_reason, p_ip, p_ua, v_caller, true,
    jsonb_build_object('forced', true)
  );

  return query select 'unlinked_by_admin'::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. RLS policies for the new tables
-- ---------------------------------------------------------------------------

alter table public.google_account_links enable row level security;
alter table public.identity_link_audit_log enable row level security;

-- users read their own live link(s); super_admin reads all
drop policy if exists google_account_links_self_read on public.google_account_links;
create policy google_account_links_self_read
  on public.google_account_links for select
  using (profile_id = auth.uid() or private.is_super_admin());

-- super_admin reads all audit rows; users read only their own
drop policy if exists identity_link_audit_log_self_read on public.identity_link_audit_log;
create policy identity_link_audit_log_self_read
  on public.identity_link_audit_log for select
  using (profile_id = auth.uid() or private.is_super_admin());

-- writes go through the RPCs only. deny direct insert/update/delete at
-- the table level so callers cannot bypass the audit log.
drop policy if exists google_account_links_no_direct_write on public.google_account_links;
create policy google_account_links_no_direct_write
  on public.google_account_links for all
  using (false)
  with check (false);

drop policy if exists identity_link_audit_log_no_direct_write on public.identity_link_audit_log;
create policy identity_link_audit_log_no_direct_write
  on public.identity_link_audit_log for all
  using (false)
  with check (false);

-- ---------------------------------------------------------------------------
-- 6. grants
-- ---------------------------------------------------------------------------

grant execute on function public.record_google_signin(text, text, boolean, text, text, text)
  to anon, authenticated;
grant execute on function public.link_google_to_current_profile(text, text, boolean, text, text, text)
  to authenticated;
grant execute on function public.unlink_google_account(text, text, text)
  to authenticated;
grant execute on function public.reject_google_link(uuid, text, text, text)
  to authenticated;
