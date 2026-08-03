-- Re-file ordinary concepts out of the Sexuality & Kink subtree.
--
-- is_adult is DERIVED: unified_tags_recompute_is_adult() sets it from whether a
-- tag has any category assignment under 'Sexuality & Kink'. So "handle the
-- is_adult cases" and "categorise the tags" are one action -- moving the tag to
-- its correct category fixes the flag as a consequence, and writing the flag
-- directly would be overwritten on the next assignment change.
--
-- The 2026-04-11 kink-checklist import filed 1,805 assignments under that
-- subtree in a single pass, including plainly non-sexual words. Effect: Safe
-- Mode hides ordinary venues and news. These are LIVE on content, so it is a
-- user-visible bug rather than vocabulary tidiness:
--     nightlife (1,023 venues)  men-only (479)  food (340)  outdoor (269)
--     music (585 news)  travel (241 news)  love (108 news)  photography, chess
--
-- Deliberately NOT touched -- adult-adjacent by intent, so they stay:
--     clothing-optional, nudist, sauna, bathhouse, adult-oriented, nudity,
--     leather, boots, spandex, rubber, underwear, lingerie
--   (naturist/venue attributes and plausible fetish gear -- hiding those in
--    Safe Mode is correct, so re-filing them would be the real bug.)
--
-- IMPLEMENTATION NOTE -- three separate collisions with 27000 "tuple to be
-- updated was already modified by an operation triggered by the current
-- command". unified_tags_recompute_is_adult is an AFTER trigger on
-- tag_category_assignments that writes unified_tags for every affected row, and
-- sync_tag_category_assignment is a BEFORE trigger on unified_tags that writes
-- tag_category_assignments -- so the two bounce off each other:
--   * a set-based DELETE removing two kink assignments for one tag fires the
--     AFTER trigger twice against the same unified_tags tuple;
--   * setting unified_tags.category_id (in or out of the loop) makes the BEFORE
--     trigger re-insert an assignment, whose AFTER trigger writes the very row
--     being updated.
-- Hence: delete and insert assignments ONE ROW PER STATEMENT, and set
-- category_id to NULL rather than to the new category --
-- sync_tag_category_assignment short-circuits on `NEW.category_id IS NOT NULL`,
-- so NULL is the one value that does not re-enter the cycle. The assignment
-- table is authoritative anyway, and run_tag_category_resync() refills the
-- denormalised `category` text from it.

create temp table _refile(slug text primary key, cat text) on commit drop;
insert into _refile(slug, cat) values
  ('nightlife','venues-nightlife'), ('men-only','venues-nightlife'),
  ('food','venues-nightlife'), ('outdoor','venues-nightlife'),
  ('recreational','venues-nightlife'), ('spa','venues-nightlife'),
  ('gym','venues-nightlife'), ('pool','venues-nightlife'),
  ('asian-cuisine','venues-nightlife'), ('massage','venues-nightlife'),
  ('adult-store','venues-nightlife'), ('burlesque','events-scene'),
  ('hotel','accommodation'), ('bear-friendly','safe-spaces'),
  ('music','media-film-music'), ('anime','media-film-music'),
  ('cosplay','media-film-music'), ('photography','art-literature-zines'),
  ('reading','art-literature-zines'), ('games','events-scene'),
  ('chess','events-scene'), ('poker','events-scene'), ('jenga','events-scene'),
  ('celebration','events-scene'), ('humor','events-scene'),
  ('circus-master','events-scene'), ('circus-mistress','events-scene'),
  ('travel','travel-destinations'),
  ('artist','professions-allies'), ('designer','professions-allies'),
  ('model','professions-allies'), ('educator','professions-allies'),
  ('trainer','professions-allies'), ('athlete','professions-allies'),
  ('dancer','professions-allies'), ('staff','professions-allies'),
  ('bodyguard','professions-allies'), ('facilitator','professions-allies'),
  ('casting','professions-allies'), ('amateur','professions-allies'),
  ('wrestling','events-scene'), ('mma','events-scene'),
  ('muay-thai','events-scene'), ('martial-arts','events-scene'),
  ('track-and-field','events-scene'), ('surfing','events-scene'),
  ('mixed-wrestling','events-scene'),
  ('love','friendship-community'), ('affection','friendship-community'),
  ('flirting','dating-courtship'), ('monogamy','relationship-structures'),
  ('infidelity','relationship-structures'), ('honesty','consent-negotiation'),
  ('friends-with-benefits','relationship-structures'),
  ('erectile-dysfunction','physical-reproductive'),
  ('premature-ejaculation','physical-reproductive'),
  ('body-modification','expression-presentation'),
  ('tattoos','expression-presentation'), ('makeup','expression-presentation'),
  ('body-autonomy','legal-rights'), ('grooming','physical-digital-safety'),
  ('bears','subcultures'), ('cub','subcultures'), ('twink','subcultures'),
  ('jock','subcultures'), ('femboy','gender-identity'),
  ('cross-dresser','expression-presentation'),
  ('military','professions-allies'), ('prison','legal-rights'),
  ('lgbtq-history-month','movements-milestones');

do $do$
declare r record; v_removed int := 0; v_added int := 0; v_cleared int := 0;
begin
  perform set_config('app.actor', 'admin:tag-refile-20260803', true);

  for r in
    select a.id from public.tag_category_assignments a
      join public.unified_tags t on t.id = a.tag_id and t.status = 'active'
      join _refile f on f.slug = t.slug
     where a.category_id in (
       select tc.id from public.tag_categories tc
       left join public.tag_categories tcp on tcp.id = tc.parent_id
        where tc.name = 'Sexuality & Kink' or tcp.name = 'Sexuality & Kink')
  loop
    delete from public.tag_category_assignments where id = r.id;
    v_removed := v_removed + 1;
  end loop;

  for r in
    select t.id tag_id, c.id cat_id from _refile f
      join public.unified_tags t on t.slug = f.slug and t.status = 'active'
      join public.tag_categories c on c.slug = f.cat
  loop
    insert into public.tag_category_assignments (tag_id, category_id, is_primary)
    values (r.tag_id, r.cat_id, true)
    on conflict (tag_id, category_id) do update set is_primary = true;
    v_added := v_added + 1;
  end loop;

  for r in
    select t.id from public.unified_tags t join _refile f on f.slug = t.slug
     where t.status = 'active' and t.category_id is not null
  loop
    update public.unified_tags set category_id = null where id = r.id;
    v_cleared := v_cleared + 1;
  end loop;

  raise notice 'removed % kink assignments, added % correct, cleared % category_id mirrors',
    v_removed, v_added, v_cleared;
end $do$;

do $do$
declare v_bad int; v_names text;
begin
  select count(*), string_agg(slug, ', ') into v_bad, v_names from public.unified_tags
   where slug in ('nightlife','men-only','food','outdoor','music','travel','love','photography','chess','artist')
     and is_adult;
  if v_bad > 0 then raise exception '% re-filed tags still is_adult: %', v_bad, v_names; end if;

  select count(*) into v_bad from public.unified_tags
   where slug in ('clothing-optional','nudist','adult-oriented') and not is_adult;
  if v_bad > 0 then raise exception '% adult-adjacent tags wrongly lost the adult flag', v_bad; end if;
end $do$;;
