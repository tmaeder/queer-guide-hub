-- Adult-flag false-positive review affordance for unified_tags.
--
-- ~915 active tags carry is_adult=true. A meaningful chunk are civic/generic
-- terms ("Freedom Of Speech", "Music", "Prison", "Gym") that the sensitivity
-- backfill over-flagged; they sit mixed with genuinely euphemistic kink tags
-- (Pet Play, Crops, BBC) under the same null/{sti} sensitive_topics, so they
-- cannot be safely un-flagged by regex. This adds a human-in-the-loop
-- confirm-and-clear surface, reversible like
-- 20260618192000_tag_sensitivity_false_positive_cleanup.

-- Reversible backup of every per-tag clear. One row per clear action.
create table if not exists public.tag_adult_false_positive_backup (
  id                    uuid not null references public.unified_tags(id) on delete cascade,
  prev_is_sensitive     boolean,
  prev_is_adult         boolean,
  prev_sensitive_topics text[],
  prev_seo_indexable    boolean,
  prev_human_reviewed   boolean,
  prev_verification_status text,
  reason                text,
  cleared_by            uuid,
  cleared_at            timestamptz not null default now()
);

alter table public.tag_adult_false_positive_backup enable row level security;

-- Service-role / definer only; no anon or authenticated policy (admins reach it
-- exclusively through the SECURITY DEFINER RPCs below).
comment on table public.tag_adult_false_positive_backup is
  'Reversible audit of admin-confirmed is_adult false-positive clears on unified_tags. Restore via restore_tag_adult_flag.';

-- ---------------------------------------------------------------------------
-- Selector: ranked review candidates.
-- Returns ALL active, not-yet-reviewed is_adult tags (nothing hidden), with a
-- heuristic `likely_false_positive` that floats civic/generic names to the top.
-- The heuristic only RANKS — it never clears. Ambiguous kink-venue words
-- (sauna, gym, military, prison, uniform) deliberately do NOT count as civic,
-- so they are not advertised as safe; an operator still confirms each.
-- ---------------------------------------------------------------------------
create or replace function public.tags_adult_review_candidates(p_limit integer default 200)
returns table (
  id uuid,
  name text,
  category text,
  description text,
  sensitive_topics text[],
  usage_count integer,
  quality_score numeric,
  likely_false_positive boolean
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  with kink as (
    select '(dom|sub|slave|master|mistress|\msir\M|daddy|mommy|brat|\mpet\M|\mpup\M|kitten|pony|owner|handler|bdsm|kink|fetish|bondage|rope|shibari|leather|latex|rubber|\mgear\M|harness|collar|cuff|cane|crop|flogg|paddle|whip|\mgag\M|spank|impact|sadis|masoch|edg(e|ing)|tease|denial|chastity|\mcage\M|cuck|hotwife|\mbull\M|breed|bareback|\mcum\M|\mcock\M|\mdick\M|anal|\moral\M|\mrim|fist|scat|water.?sport|\mpiss\M|golden|\mfoot\M|\msole\M|sniff|orgasm|nipple|spit|choke|\mhood\M|muzzle|sissy|cross.?dress|femdom|maledom|sadomasoch|primal|\mcnc\M|interrogation|humiliat|degrad|worship|domina|findom|tribute|diaper|caregiver|\mcg\M|dd.?lg|ab.?dl|little|age.?play|service|\mtop\M|\mbottom\M|\mvers\M|\mswitch\M|\mplay\M|sauna|cruis|glory|bath.?house|\msling\M|dildo|\mplug\M|vibrat|strap|\mpeg\M|gloryhole|naked|\mnude|exhibition|voyeur|orgy|gangbang|threesome|uniform|military|prison|\mgym\M|wrestl)' as rx
  )
  select t.id, t.name, t.category, t.description,
         t.sensitive_topics, t.usage_count, t.quality_score,
         (t.name !~* k.rx) as likely_false_positive
  from public.unified_tags t cross join kink k
  where t.status = 'active'
    and t.is_adult is true
    and t.human_reviewed is not true
  order by (t.name !~* k.rx) desc, t.usage_count desc nulls last
  limit greatest(1, coalesce(p_limit, 200));
$$;

-- ---------------------------------------------------------------------------
-- Confirm-and-clear: an admin asserts the tag is NOT adult.
-- Backs up the prior state, then clears the sensitivity flags, restores SEO
-- indexing, and marks it human-reviewed so the gate stops blocking it.
-- Reversible via restore_tag_adult_flag.
-- ---------------------------------------------------------------------------
create or replace function public.clear_tag_adult_false_positive(
  p_tag_id uuid,
  p_reason text default null
)
returns public.unified_tags
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_row public.unified_tags;
  v_actor uuid := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub';
begin
  perform public.assert_admin_or_internal();
  -- log_unified_tag_change blocks system:% actors on human_reviewed rows.
  perform set_config('app.actor', 'admin:tag-adult-review', true);

  select * into v_row from public.unified_tags where id = p_tag_id for update;
  if not found then
    raise exception 'tag % not found', p_tag_id using errcode = 'P0002';
  end if;

  insert into public.tag_adult_false_positive_backup (
    id, prev_is_sensitive, prev_is_adult, prev_sensitive_topics,
    prev_seo_indexable, prev_human_reviewed, prev_verification_status,
    reason, cleared_by
  ) values (
    v_row.id, v_row.is_sensitive, v_row.is_adult, v_row.sensitive_topics,
    v_row.seo_indexable, v_row.human_reviewed, v_row.verification_status,
    p_reason, v_actor::uuid
  );

  update public.unified_tags
     set is_adult = false,
         is_sensitive = false,
         sensitive_topics = null,
         seo_indexable = true,
         human_reviewed = true,
         verification_status = 'reviewed'
   where id = p_tag_id
   returning * into v_row;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Undo: restore a tag from its most recent backup row.
-- ---------------------------------------------------------------------------
create or replace function public.restore_tag_adult_flag(p_tag_id uuid)
returns public.unified_tags
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_row public.unified_tags;
  v_bak public.tag_adult_false_positive_backup;
begin
  perform public.assert_admin_or_internal();
  perform set_config('app.actor', 'admin:tag-adult-review', true);

  select * into v_bak
  from public.tag_adult_false_positive_backup
  where id = p_tag_id
  order by cleared_at desc
  limit 1;

  if not found then
    raise exception 'no backup for tag %', p_tag_id using errcode = 'P0002';
  end if;

  update public.unified_tags
     set is_sensitive = v_bak.prev_is_sensitive,
         is_adult = v_bak.prev_is_adult,
         sensitive_topics = v_bak.prev_sensitive_topics,
         seo_indexable = v_bak.prev_seo_indexable,
         human_reviewed = v_bak.prev_human_reviewed,
         verification_status = v_bak.prev_verification_status
   where id = p_tag_id
   returning * into v_row;

  delete from public.tag_adult_false_positive_backup
  where id = p_tag_id and cleared_at = v_bak.cleared_at;

  return v_row;
end;
$$;

revoke all on function public.tags_adult_review_candidates(integer) from public;
revoke all on function public.clear_tag_adult_false_positive(uuid, text) from public;
revoke all on function public.restore_tag_adult_flag(uuid) from public;
grant execute on function public.tags_adult_review_candidates(integer) to authenticated, service_role;
grant execute on function public.clear_tag_adult_false_positive(uuid, text) to authenticated, service_role;
grant execute on function public.restore_tag_adult_flag(uuid) to authenticated, service_role;
