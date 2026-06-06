-- Admin synonyms editor RPCs for /admin/search-intelligence Synonyms tab.
-- The search-proxy worker only applies synonyms with status='active'; the 15k
-- imported rows sit dormant at status='approved'. These RPCs power browse/search
-- + a status summary so admins can curate and activate.

-- Paginated, filterable list. Substring match across terms + replacements.
create or replace function public.admin_synonyms_list(
  p_q text default null,
  p_status text default null,
  p_locale text default null,
  p_limit int default 50,
  p_offset int default 0
)
returns json
language sql
stable
security definer
set search_path = public
as $$
  with filtered as (
    select *
    from search_synonyms s
    where (p_status is null or s.status = p_status)
      and (p_locale is null or s.locale = p_locale)
      and (
        p_q is null or p_q = '' or exists (
          select 1 from unnest(s.terms || s.replacements) t
          where t ilike '%' || p_q || '%'
        )
      )
  )
  select json_build_object(
    'total', (select count(*) from filtered),
    'rows', coalesce((
      select json_agg(r) from (
        select id, terms, replacements, is_one_way, locale, indexes,
               status, source, confidence_score, notes, tag_id,
               created_at, approved_at, archived_at
        from filtered
        order by
          case status when 'active' then 0 when 'approved' then 1
                      when 'pending' then 2 else 3 end,
          created_at desc
        limit greatest(p_limit, 1)
        offset greatest(p_offset, 0)
      ) r), '[]'::json)
  );
$$;

-- Status rollup for the summary chips.
create or replace function public.admin_synonyms_counts()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'total',    count(*),
    'active',   count(*) filter (where status = 'active'),
    'approved', count(*) filter (where status = 'approved'),
    'pending',  count(*) filter (where status = 'pending'),
    'archived', count(*) filter (where status = 'archived'),
    'locales',  coalesce((
      select json_agg(l) from (
        select locale, count(*) as n
        from search_synonyms
        where status <> 'archived'
        group by locale order by n desc limit 20
      ) l), '[]'::json)
  )
  from search_synonyms;
$$;

grant execute on function public.admin_synonyms_list(text, text, text, int, int) to authenticated, service_role;
grant execute on function public.admin_synonyms_counts() to authenticated, service_role;
