-- Forward correction for 0068: insert the PL/pgSQL actor variable into the
-- actual actor_id receipt column.

create or replace function public.create_assignment_from_bank(
  p_target_bank_id uuid,
  p_target_classroom_id uuid,
  p_assignment_title text,
  p_assignment_instructions text,
  p_assignment_due_at timestamptz,
  p_selected_bank_question_ids uuid[],
  p_assign_now boolean,
  p_client_request_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  current_actor_id uuid := auth.uid();
  created_assignment_id uuid;
  existing_receipt private.assignment_creation_requests%rowtype;
  request_fingerprint jsonb;
begin
  if current_actor_id is null then
    raise exception 'Authentication required.';
  end if;

  if p_client_request_key is null then
    raise exception 'A client request key is required.';
  end if;

  request_fingerprint := jsonb_build_object(
    'targetBankId', p_target_bank_id,
    'targetClassroomId', p_target_classroom_id,
    'title', trim(coalesce(p_assignment_title, '')),
    'instructions', coalesce(p_assignment_instructions, ''),
    'dueAt', p_assignment_due_at,
    'selectedBankQuestionIds', coalesce(p_selected_bank_question_ids, '{}'::uuid[]),
    'assignNow', coalesce(p_assign_now, false)
  );

  perform pg_advisory_xact_lock(
    hashtextextended(
      current_actor_id::text || ':' || p_client_request_key::text,
      68
    )
  );

  select *
  into existing_receipt
  from private.assignment_creation_requests as receipt
  where receipt.actor_id = current_actor_id
    and receipt.client_request_key = p_client_request_key;

  if existing_receipt.assignment_id is not null then
    if existing_receipt.request_fingerprint <> request_fingerprint then
      raise exception 'This Assignment request key was already used for different content.';
    end if;

    return existing_receipt.assignment_id;
  end if;

  created_assignment_id := public.create_assignment_from_bank(
    p_target_bank_id,
    p_target_classroom_id,
    p_assignment_title,
    p_assignment_instructions,
    p_assignment_due_at,
    p_selected_bank_question_ids,
    p_assign_now
  );

  insert into private.assignment_creation_requests (
    actor_id,
    client_request_key,
    assignment_id,
    request_fingerprint
  )
  values (
    current_actor_id,
    p_client_request_key,
    created_assignment_id,
    request_fingerprint
  );

  return created_assignment_id;
end;
$$;

revoke all on function public.create_assignment_from_bank(
  uuid, uuid, text, text, timestamptz, uuid[], boolean, uuid
) from public, anon;

grant execute on function public.create_assignment_from_bank(
  uuid, uuid, text, text, timestamptz, uuid[], boolean, uuid
) to authenticated;

comment on function public.create_assignment_from_bank(
  uuid, uuid, text, text, timestamptz, uuid[], boolean, uuid
) is
  'Creates one reviewed Library Assignment with a private, actor-scoped idempotency receipt; forward-corrected by 0069.';
