-- Anonymous visitors may report bad directory data, but may not create new
-- directory entities. Corrections stay outside the feedback SELECT policy and
-- outside the entity ingestion bridge.

drop policy if exists community_submissions_anon_insert_feedback
  on public.community_submissions;

create policy community_submissions_anon_insert_feedback
  on public.community_submissions
  for insert
  to anon
  with check (content_type in ('feedback', 'correction'));

do $assertions$
declare
  v_insert_check text;
  v_correction_read_policies bigint;
begin
  select with_check
    into v_insert_check
  from pg_policies
  where schemaname = 'public'
    and tablename = 'community_submissions'
    and policyname = 'community_submissions_anon_insert_feedback'
    and cmd = 'INSERT'
    and 'anon' = any (roles);

  if v_insert_check is null
     or v_insert_check not like '%feedback%'
     or v_insert_check not like '%correction%'
  then
    raise exception
      'community_submissions anon insert policy did not reach feedback+correction state: %',
      coalesce(v_insert_check, '<missing>');
  end if;

  -- Production may have no anonymous SELECT policy at all (the former
  -- feedback board policy was removed to stop exposing submitter metadata).
  -- This migration must preserve that safer state while also remaining
  -- compatible with older environments where the feedback-only policy still
  -- exists.
  select count(*)
    into v_correction_read_policies
  from pg_policies
  where schemaname = 'public'
    and tablename = 'community_submissions'
    and cmd = 'SELECT'
    and ('anon' = any (roles) or 'public' = any (roles))
    and coalesce(qual, '') ilike '%correction%';

  if v_correction_read_policies <> 0 then
    raise exception
      'community_submissions corrections became anonymously readable through % policy/policies',
      v_correction_read_policies;
  end if;
end
$assertions$;
