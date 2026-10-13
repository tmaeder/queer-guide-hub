-- Preserve rejected raw credits; never invent a person from a publisher or URL.
set lock_timeout = '5s';
set statement_timeout = '120s';

create or replace function public.news_person_author(p_raw text, p_source_name text default null, p_publisher_name text default null)
returns text language plpgsql immutable set search_path = public, pg_temp as $$
declare v text := btrim(public.news_decode_entities(p_raw)); v_json jsonb;
begin
  if left(v,1) = '[' then
    begin
      v_json := v::jsonb;
      if jsonb_typeof(v_json)='array' then
        select string_agg(public.news_person_author(elem #>> '{}',p_source_name,p_publisher_name), ', ' order by ord)
        into v from jsonb_array_elements(v_json) with ordinality as j(elem,ord)
        where jsonb_typeof(elem)='string';
        return v;
      end if;
    exception when invalid_text_representation then null;
    end;
  end if;
  if v is null or v ~* '^https?://' or v ~* '^/(u|r)/' then return null; end if;
  v := regexp_replace(v, '( - The Buckeye Flame|, the 19th)$', '', 'i');
  v := btrim(regexp_replace(regexp_replace(v, 'https?://[^[:space:]]+', '', 'gi'), '^((published|written)[[:space:]]+)?by[[:space:]]*:?[[:space:]]*', '', 'i'));
  v := regexp_replace(v, '[[:space:]]+', ' ', 'g');
  if length(v) < 2 or length(v)>255 or v ~ '^[0-9]+$' or v ~ '[;[:cntrl:]]' or v ~* '^/[a-z0-9_-]+$'
     or v ~* '^(editors?|editorial( team| staff| board)?|staff( writers?| reporters?)?|staff writer|newsroom|news team|redaktion|redaktions(team)?|admin|administrator|the editors|the editorial team|unknown|none|null|undefined|anonymous)$'
     or v ~* '(\m(editors?|staff|reporter)\M|^redazione\M)'
     or v ~* '\m(podcasts?|pod|network|productions|publishing|news agency|media|radio|studio[0-9]+|collective|church|council|presents)\M'
     or v ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or lower(v) in ('pn freelancer','lesbian chronicles','sodomarama','your queer story','transadvocate','homestead on the corner | realm','legal - lgbt bar of new york','q 播客製作委員會','podbean development')
     or regexp_replace(lower(v), '[^[:alnum:]]', '', 'g') = regexp_replace(lower(p_source_name), '[^[:alnum:]]', '', 'g')
     or regexp_replace(lower(v), '[^[:alnum:]]', '', 'g') = regexp_replace(lower(p_publisher_name), '[^[:alnum:]]', '', 'g') then return null;
  end if;
  return nullif(v, '');
end;
$$;

create table public.news_author_credit_audit (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null,
  original_author text not null,
  reason text not null default 'non_person_credit',
  captured_at timestamptz not null default now(),
  recovered_author text,
  evidence_url text,
  recovered_at timestamptz,
  unique(article_id, original_author)
);
alter table public.news_author_credit_audit enable row level security;
revoke all on public.news_author_credit_audit from public, anon, authenticated;
grant select on public.news_author_credit_audit to authenticated;
grant all on public.news_author_credit_audit to service_role;
create policy news_author_credit_audit_staff_read on public.news_author_credit_audit
for select to authenticated using (public.has_any_role_jwt(array['admin','moderator']::public.app_role[]));

create or replace function public.sanitize_news_author()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_raw text := NEW.author; v_clean text; v_source text;
begin
  if v_raw is not null then
    select name into v_source from public.news_sources where id = NEW.source_id;
    v_clean := public.news_person_author(v_raw, v_source, NEW.publisher_name);
    if v_clean is distinct from v_raw then
      insert into public.news_author_credit_audit(article_id, original_author, reason)
        values(NEW.id, v_raw, case when v_clean is null then 'non_person_credit' else 'normalized_credit' end) on conflict(article_id, original_author) do nothing;
    end if;
    NEW.author := v_clean;
  end if;
  return NEW;
end;
$$;
revoke all on function public.sanitize_news_author() from public, anon, authenticated;
-- Existing trigger executes this replacement on every article write.
-- Original credits are captured by the trigger before author is cleared.
update public.news_articles n set author = n.author
from public.news_sources s
where s.id = n.source_id and n.author is not null
  and public.news_person_author(n.author, s.name, n.publisher_name) is distinct from n.author;
-- Also handle articles without a surviving source link.
update public.news_articles n set author = n.author
where n.author is not null and not exists(select 1 from public.news_sources s where s.id=n.source_id)
  and public.news_person_author(n.author, null, n.publisher_name) is distinct from n.author;

create or replace function public.admin_news_author_change(
  p_source text, p_target text, p_merge boolean, p_expected_count bigint
)
returns bigint
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_target text := btrim(public.news_decode_entities(p_target));
  v_count bigint;
begin
  perform public.assert_admin_or_internal();
  if p_source is null or btrim(p_source) = '' or v_target is null or v_target = ''
     or length(v_target) > 255 or v_target ~ '[;[:cntrl:]]'
     or v_target ilike '/u/%' or v_target ilike '/r/%'
     or v_target ~ '^/[a-z0-9_-]+$'
     or lower(v_target) in ('none', 'null', 'undefined', 'unknown')
     or public.news_person_author(v_target) is distinct from v_target then
    raise exception 'Enter a valid author name.' using errcode = '22023';
  end if;
  if v_target = p_source then
    raise exception 'Choose a different author name.' using errcode = '22023';
  end if;
  -- Serialize management and ingestion while checking the preview and applying it.
  lock table public.news_articles in share row exclusive mode;
  select count(*) into v_count from public.news_articles where author = p_source;
  if v_count = 0 then
    raise exception 'This author no longer has articles. Refresh the list.' using errcode = '22023';
  end if;
  if p_expected_count is null or v_count <> p_expected_count then
    raise exception 'The article count changed. Refresh the list before confirming.' using errcode = '40001';
  end if;
  if p_merge is null then
    raise exception 'Choose rename or merge.' using errcode = '22023';
  end if;
  if p_merge and not exists(select 1 from public.news_articles where author = v_target) then
    raise exception 'Choose an existing author to merge into.' using errcode = '22023';
  elsif not p_merge and exists(select 1 from public.news_articles where author = v_target) then
    raise exception 'That author already exists. Use Merge instead.' using errcode = '22023';
  end if;
  if exists(select 1 from public.news_articles n left join public.news_sources s on s.id=n.source_id
    where n.author=p_source and public.news_person_author(v_target,s.name,n.publisher_name) is distinct from v_target) then
    raise exception 'Use a person name, not a source or publisher credit.' using errcode='22023';
  end if;
  update public.news_articles set author = v_target where author = p_source;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;


