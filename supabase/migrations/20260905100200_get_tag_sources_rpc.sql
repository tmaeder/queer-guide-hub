-- Surface `tag_sources` on the public glossary.
--
-- `tag_sources` holds 8,710 rows across 4,596 tags and, until now, was read by
-- exactly one thing: `run_tag_quality_recompute`, which adds +0.05 to
-- `confidence_score` when a tag has any row at all. Nothing rendered it. A tag
-- page's only external anchors were `unified_tags.wikipedia_url` and
-- `.wikidata_id`, so a citation that was not one of those two had nowhere to go
-- — which is why the saferparty import needed a surface before it could
-- honestly claim the substance pages are "linked" to their source.
--
-- WHY AN RPC RATHER THAN OPENING THE TABLE
--
-- The table's grants are inverted in the same way `20260802130115` found on
-- `tag_slug_redirects` and `tag_aliases`: anon holds INSERT/UPDATE/DELETE and
-- does NOT hold SELECT, and the single RLS policy is admin/moderator-only. Fixing
-- that would mean adding a public-read policy to a table whose write side is
-- already mis-granted. A SECURITY DEFINER reader is the smaller change: the table
-- stays closed, the projection is fixed in one place, and the stray write grants
-- are revoked here as defence in depth (they are not exploitable today — RLS has
-- no write policy — but the same reasoning applied at `20260802130115:19-22`).
--
-- WHY IT EXCLUDES WIKIPEDIA AND WIKIDATA
--
-- Those two are already rendered from their own columns in the "Elsewhere" card.
-- Returning them here would print every tag's Wikipedia link twice. Measured on
-- prod, the table is exactly three source types — wikidata (4,804), wikipedia
-- (3,906) and editorial (61) — so this filter is what makes the RPC "the
-- citations that have no other home", which is the useful set. `source_type` is
-- CHECK-constrained to five values, and the two not present today (`llm`,
-- `manual`) would be returned; that is deliberate for `manual`, and `llm` rows
-- would be unverified model prose, so `claim_summary` is NOT returned to the
-- client — only the type and the URL. The label a reader sees is derived from
-- the URL's host.
--
-- STABLE, not IMMUTABLE: it reads a table.

create or replace function public.get_tag_sources(p_tag_id uuid)
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
     and s.source_type not in ('wikipedia', 'wikidata')
     -- Do not cite a tag the public cannot see. Mirrors
     -- `unified_tags_public_gated_read`, which the SECURITY DEFINER bypasses.
     and (t.is_sensitive is not true or t.verification_status in ('reviewed', 'locked'))
   order by s.source_type, s.source_url;
$$;

revoke all on function public.get_tag_sources(uuid) from public;
grant execute on function public.get_tag_sources(uuid) to anon, authenticated, service_role;

-- Defence in depth: anon was granted every write verb on tag_sources and no
-- SELECT — the same inverted shape `20260802130115` repaired on the sibling tag
-- tables. This one was missed by that pass.
revoke insert, update, delete, truncate, references, trigger on public.tag_sources from anon;

do $verify$
declare v_n int;
begin
  if has_table_privilege('anon', 'public.tag_sources', 'INSERT')
     or has_table_privilege('anon', 'public.tag_sources', 'UPDATE')
     or has_table_privilege('anon', 'public.tag_sources', 'DELETE') then
    raise exception 'tag_sources: anon still holds a write grant';
  end if;

  select count(*) into v_n from public.get_tag_sources(
    (select id from public.unified_tags where slug = 'mdma'));
  if v_n < 1 then
    raise exception 'get_tag_sources: expected at least one citation for mdma, got %', v_n;
  end if;

  -- The wiki columns own their own rendering; this must not duplicate them.
  if exists (select 1 from public.get_tag_sources(
               (select id from public.unified_tags where slug = 'cannabis'))
              where source_type in ('wikipedia', 'wikidata')) then
    raise exception 'get_tag_sources: returned a wiki source';
  end if;
end
$verify$;
