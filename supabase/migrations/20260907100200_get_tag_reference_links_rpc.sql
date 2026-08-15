-- Plain reference links on a glossary tag.
--
-- `20260906100000_tag_sources_legal_citations` gave `tag_sources` a public
-- surface, but a deliberately narrow one: `tag_sources_public_read` requires
-- `is_public`, and `tag_sources_public_requires_citation` only lets `is_public`
-- be true for `statute | treaty | case_law | constitution | resolution` rows
-- that also carry `official_title` and `jurisdiction`. That is exactly right for
-- a legal instrument, and `TagLegalSource` renders it as one — official title,
-- jurisdiction, adopted year, in-force status.
--
-- A harm-reduction reference is not that shape. The 61 saferparty.ch rows the
-- substance import attaches are `source_type='editorial'` with no jurisdiction
-- and no adopted year, because they are not law — they are "the page the people
-- who run Zurich's drug-checking service maintain about this substance". They
-- can never satisfy the citation CHECK, so RLS can never expose them, and
-- forcing them into the legal vocabulary would be a false claim about what they
-- are.
--
-- So this is a second, smaller reader for the residual case: a link, labelled by
-- its host, in the "Elsewhere" rail beside Wikipedia. SECURITY DEFINER because
-- the rows are RLS-invisible by construction, and the projection is the safety
-- boundary:
--
--   * `wikipedia` / `wikidata` are excluded — they already render from
--     `unified_tags.wikipedia_url` / `.wikidata_id` in the same card, and would
--     otherwise print twice.
--   * the five legal types are excluded — `TagLegalSource` owns those, and a
--     bare host link would be a strictly worse duplicate of a full citation.
--   * `claim_summary` is NOT returned. `source_type='llm'` is in the CHECK
--     vocabulary, so returning the text would put unverified model prose on a
--     public page. Only the type and the URL cross the boundary.
--   * the tag's own visibility is re-checked, mirroring
--     `unified_tags_public_gated_read`, which SECURITY DEFINER bypasses.
--
-- Named `reference_links`, not `sources`, because `src/hooks/useTagSources.ts`
-- is already the admin editor for the legal citations. Two things called
-- "tag sources" doing different jobs is how the next person ships a bug.

drop function if exists public.get_tag_sources(uuid);

create or replace function public.get_tag_reference_links(p_tag_id uuid)
returns table (source_type text, source_url text)
language sql
stable
security definer
set search_path = public
as $$
  select s.source_type, s.source_url
    from public.tag_sources s
    join public.unified_tags t on t.id = s.tag_id
   where s.tag_id = p_tag_id
     and s.source_url is not null
     and s.source_type not in (
       'wikipedia', 'wikidata',
       'statute', 'treaty', 'case_law', 'constitution', 'resolution'
     )
     and t.status = 'active'
     and (t.is_sensitive is not true or t.verification_status in ('reviewed', 'locked'))
   order by s.source_type, s.source_url;
$$;

revoke all on function public.get_tag_reference_links(uuid) from public;
grant execute on function public.get_tag_reference_links(uuid) to anon, authenticated, service_role;

do $verify$
declare v_n int;
begin
  select count(*) into v_n from public.get_tag_reference_links(
    (select id from public.unified_tags where slug = 'mdma'));
  if v_n < 1 then
    raise exception 'get_tag_reference_links: expected a citation for mdma, got %', v_n;
  end if;

  -- Must not duplicate either of the two surfaces that own their own rendering.
  if exists (
    select 1 from public.unified_tags t,
      lateral public.get_tag_reference_links(t.id) r
     where t.slug in ('cannabis', 'mdma', 'section-28', 'marriage-equality')
       and r.source_type in ('wikipedia','wikidata','statute','treaty','case_law',
                             'constitution','resolution')
  ) then
    raise exception 'get_tag_reference_links: returned a row another surface owns';
  end if;
end
$verify$;
