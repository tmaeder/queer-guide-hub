-- Codify the production publication guard for milestone quality. The function
-- and trigger were installed out of band and would otherwise be absent from a
-- rebuild based only on repository migrations.

create or replace function public.milestone_publication_quality_guard()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_meta_ok boolean;
  v_healthy integer;
  v_domains integer;
  v_authoritative integer;
  v_date integer;
  v_authoritative_date integer;
begin
  if new.status = 'published'
     and (tg_op = 'INSERT' or old.status is distinct from 'published')
  then
    if nullif(trim(new.description), '') is null
       or not public.milestone_sources_valid(new.sources)
    then
      raise exception 'Published milestones require a description and structurally valid sources'
        using errcode = '23514';
    end if;

    if (new.significance >= 4 or new.is_featured)
       and (new.category is null or new.category = 'other')
    then
      raise exception 'Tier A/B milestones require a reviewed category before publication'
        using errcode = '23514';
    end if;

    if new.review_status <> 'approved' then
      raise exception 'Milestones must be approved before publication'
        using errcode = '23514';
    end if;

    select count(*),
           count(distinct domain),
           count(*) filter (where source_class in ('primary_legal', 'institutional')),
           count(*) filter (where 'date' = any(supports)),
           count(*) filter (
             where 'date' = any(supports)
               and source_class in ('primary_legal', 'institutional')
           )
      into v_healthy, v_domains, v_authoritative, v_date, v_authoritative_date
    from public.milestone_source_health
    where milestone_id = new.id
      and health_state in ('healthy', 'redirected');

    if v_date = 0 then
      raise exception 'Publication requires a healthy citation supporting the stored date precision'
        using errcode = '23514';
    end if;

    if (new.significance = 5 or new.is_featured)
       and (v_domains < 2 or v_authoritative < 1 or v_authoritative_date < 1)
    then
      raise exception 'Tier A publication requires two independent healthy sources and authoritative date evidence'
        using errcode = '23514';
    elsif new.significance = 4 and not (v_authoritative >= 1 or v_domains >= 2) then
      raise exception 'Tier B publication requires one authoritative or two independent healthy sources'
        using errcode = '23514';
    elsif new.significance <= 3 and v_healthy < 1 then
      raise exception 'Tier C publication requires one healthy source'
        using errcode = '23514';
    end if;

    if (new.significance = 5 or new.is_featured)
       and new.image_url is null
       and new.image_waiver_reason is null
    then
      raise exception 'Tier A publication requires licensed imagery or an explicit waiver'
        using errcode = '23514';
    end if;

    if exists (
      select 1
      from public.milestone_duplicate_candidates d
      where d.status in ('pending', 'confirmed')
        and d.confidence >= .9
        and (d.milestone_id_1 = new.id or d.milestone_id_2 = new.id)
    ) then
      raise exception 'Resolve the high-confidence duplicate candidate before publication'
        using errcode = '23514';
    end if;
  end if;

  if new.image_url is not null then
    v_meta_ok := nullif(trim(new.image_metadata->>'alt'), '') is not null
      and nullif(trim(new.image_metadata->>'source'), '') is not null
      and nullif(trim(new.image_metadata->>'license'), '') is not null;

    if not v_meta_ok then
      raise exception 'Displayed milestone images require alt, source and license metadata'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_milestone_publication_quality_guard on public.milestones;
create trigger trg_milestone_publication_quality_guard
before insert or update of status, image_url, image_metadata on public.milestones
for each row
execute function public.milestone_publication_quality_guard();

do $verify$
declare
  v_trigger_def text;
begin
  select pg_get_triggerdef(t.oid, true)
    into v_trigger_def
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'milestones'
    and t.tgname = 'trg_milestone_publication_quality_guard'
    and not t.tgisinternal;

  if v_trigger_def is null
     or v_trigger_def not ilike '%before insert or update of status, image_url, image_metadata on milestones%'
     or v_trigger_def not ilike '%execute function milestone_publication_quality_guard()%'
  then
    raise exception 'postcondition failed: milestone publication guard is missing or malformed: %',
      coalesce(v_trigger_def, '<missing>');
  end if;
end;
$verify$;
