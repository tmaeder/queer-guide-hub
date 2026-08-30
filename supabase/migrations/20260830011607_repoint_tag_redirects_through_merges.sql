-- A tag redirect whose target was later merged points at a merged row.
--
-- APPLIED VIA MCP AND COMMITTED AT THE STAMPED VERSION, per the CLAUDE.md
-- early-apply convention.
--
-- WHAT BREAKS. tag_slug_redirects.new_slug is a slug, not an id, so when the
-- tag it names is later merged into another the redirect is not updated. The
-- reader is sent to a row that is no longer canonical: /tags/party-play ->
-- party-and-play, which was merged into chemsex on 2026-08-29. resolve_tag_slug
-- follows one hop, so the second hop is not taken and the page does not resolve
-- to the surviving concept.
--
-- This is the same class guide_picks_maintain() already handles for picks —
-- repoint a reference through the merge rather than leave it on the loser —
-- and tag_hygiene_stats counts it as `redirect_to_non_canonical`, which is how
-- it surfaced: the metric grew 58 -> 59 and failed the data-quality gate on an
-- unrelated PR.
--
-- ONE OF THE TWO WOULD HAVE BECOME A SELF-REDIRECT, which is why this is not a
-- single UPDATE. `risk-aware-consensual-kink -> risk-aware-consensual-kink-rack`
-- has a merge target of `risk-aware-consensual-kink` — the old_slug itself. The
-- twin was merged back into the name the redirect starts from, so repointing it
-- would produce old_slug = new_slug and a redirect that resolves to itself.
-- Those rows are deleted instead: the slug is canonical again, so the redirect
-- has nothing left to do.
--
-- SCOPE. Only redirects whose target carries merged_into_id AND whose merge
-- target is active. Redirects pointing at a merely `deprecated` tag with no
-- successor are deliberately untouched — there is nowhere correct to send them,
-- and inventing a destination would be worse than the current 404. That is the
-- larger part of the metric (umlaut-normalisation redirects for deprecated
-- personality and food tags) and it needs a decision about whether those tags
-- should be revived or the redirects dropped, not a silent repoint here.

do $mig$
declare
  v_self int;
  v_moved int;
  v_left int;
begin
  perform set_config('app.actor', 'admin:repoint-tag-redirects-through-merges', true);

  -- (1) Self-redirects: the merge target IS the old slug. Delete.
  with doomed as (
    select r.old_slug
      from public.tag_slug_redirects r
      join public.unified_tags t on t.slug = r.new_slug
      join public.unified_tags c on c.id = t.merged_into_id
     where t.merged_into_id is not null
       and c.status = 'active'
       and c.slug = r.old_slug
  )
  delete from public.tag_slug_redirects r
   using doomed d
   where r.old_slug = d.old_slug;
  get diagnostics v_self = row_count;

  -- (2) Everything else: follow the merge.
  update public.tag_slug_redirects r
     set new_slug = c.slug
    from public.unified_tags t
    join public.unified_tags c on c.id = t.merged_into_id
   where t.slug = r.new_slug
     and t.merged_into_id is not null
     and c.status = 'active'
     and c.slug <> r.old_slug;
  get diagnostics v_moved = row_count;

  -- Assertions.
  select count(*) into v_left
    from public.tag_slug_redirects r
    join public.unified_tags t on t.slug = r.new_slug
   where t.merged_into_id is not null;
  if v_left > 0 then
    raise exception 'redirect repoint: % redirect(s) still point at a merged tag', v_left;
  end if;

  if exists (select 1 from public.tag_slug_redirects where old_slug = new_slug) then
    raise exception 'redirect repoint: a self-redirect was created';
  end if;

  raise notice 'redirect repoint: % self-redirect(s) deleted, % repointed through the merge',
    v_self, v_moved;
end
$mig$;
