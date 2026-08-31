-- Kinktionary revival, wave 5 — the 111 rows RLS hid from the matcher.
--
-- WHAT WENT WRONG IN WAVES 1-4, AND HOW IT WAS FOUND
--
-- match-kinktionary-to-tags.mjs reads unified_tags over PostgREST with the ANON
-- key. `unified_tags_public_gated_read` lets anon see a row only when
--   NOT is_sensitive  OR  verification_status IN ('reviewed','locked')
-- and 652 rows on prod are is_sensitive with verification_status='auto' — 649 of
-- them deprecated. The matcher could not see any of them, so it reported them as
-- ABSENT ("no such tag, would need creating") when in fact they were exactly the
-- deprecated-with-prose rows this program exists to revive.
--
-- They are not a random sample. The RLS predicate selects for is_sensitive, and
-- is_sensitive on this corpus means kink: bastinado, figging, omorashi,
-- sadomasochism, blood-play, exhibitionism, leather-fetish, macrophilia,
-- microphilia, mysophilia, praise-kink, and 48 Roles. The heart of the
-- vocabulary was the part the matcher was blind to.
--
-- Caught by verifying the OUTCOME rather than the migration: waves 1-4 applied
-- successfully and reported 956 revived, but /tags/figging, /tags/bastinado and
-- /tags/omorashi were still deprecated on prod. A green migration is not
-- evidence that the right rows moved.
--
-- The matcher now fails loudly when it is given an anon key
-- (SUPABASE_SERVICE_ROLE_KEY is required), so a future run cannot silently
-- under-report the corpus again. Its old row-count assertion could not catch
-- this: it compared a paginated read against a COUNT taken through the same RLS
-- predicate, so both sides were filtered identically and it passed vacuously.
--
-- Measured before writing this file: all 111 are status='deprecated', all 111
-- have a description or short_description, none carries an image_url, 2 have
-- category_id/junction drift (repaired below by the same loop as waves 1-4) and
-- exactly 1 has no category at all (chubby-chaser, assigned by hand).
--
-- LICENCE. Unchanged from waves 1-4: NOT ONE WORD OF THEIR PROSE IS COPIED OR
-- ADAPTED. The Kinktionary is non-commercial-only and queer.guide is commercial.
-- Their term list is used only as corroboration for which of OUR already-written
-- rows deserve to be live.

set local statement_timeout = '600s';

select set_config('app.actor', 'migration:kinktionary-revival-w5', true);

do $mig$
declare
  r      record;
  v_bad  int;
  v_live int;
begin
  create temp table _rev (slug text primary key) on commit drop;
  insert into _rev (slug) values
    ('8-panel-sti-test'),
    ('acolyte'),
    ('aesthetic-fetishist'),
    ('ahegao'),
    ('algophilia'),
    ('analytikink'),
    ('androgyne'),
    ('ass-fetish'),
    ('bastinado'),
    ('bird'),
    ('blood-play'),
    ('body-worship'),
    ('boot-kink'),
    ('boot-licking'),
    ('boot-worship'),
    ('breast-fetish'),
    ('breeder'),
    ('bromance'),
    ('bunny'),
    ('butler'),
    ('capitalization-in-kink'),
    ('chastity-queen'),
    ('chew-toy'),
    ('chubby-chaser'),
    ('constellation'),
    ('core-bdsm'),
    ('crucifixion-fetish'),
    ('cuckcake'),
    ('cunt-busting'),
    ('cupcake'),
    ('demiromantic'),
    ('demoness'),
    ('destroy-dick-december'),
    ('diaper-lover'),
    ('doll'),
    ('empath'),
    ('evolving'),
    ('exhibitionism'),
    ('fairy-kink-daddy'),
    ('fairy-kink-mother'),
    ('female-led-relationship'),
    ('feral'),
    ('fetish-party'),
    ('fictosexual'),
    ('figging'),
    ('fisting-bottom'),
    ('foot-fetishist'),
    ('foot-play'),
    ('foursome'),
    ('frayromantic'),
    ('furry'),
    ('gender-questioning'),
    ('giantess-fetish'),
    ('glove-fetish'),
    ('goblin'),
    ('guinea-pig'),
    ('handfasted'),
    ('hedonist'),
    ('homoflexible'),
    ('hucow'),
    ('hunter'),
    ('inflation-kink'),
    ('international-fisting-day'),
    ('jarl'),
    ('kink-dispenser'),
    ('kinkster'),
    ('kinktober'),
    ('kinky-fuckery'),
    ('kinkycule'),
    ('leather-fetish'),
    ('leather-gloves-fetish'),
    ('locktober'),
    ('macrophilia'),
    ('meat-puppet'),
    ('mermaid'),
    ('microphilia'),
    ('mister'),
    ('mutual-masturbation'),
    ('mysophilia'),
    ('noetisexual'),
    ('obedience-training'),
    ('omega'),
    ('omorashi'),
    ('panda'),
    ('praise-kink'),
    ('prey'),
    ('prostate-milking'),
    ('sadomasochism'),
    ('sadomasochist'),
    ('sapiosexual'),
    ('satyress'),
    ('sensual-bdsm'),
    ('separated'),
    ('seraphim'),
    ('servant'),
    ('sex-slave'),
    ('shemale'),
    ('shoe-fetish'),
    ('sigma'),
    ('sister'),
    ('smegma-fetish'),
    ('sober-kink'),
    ('stretch-marks-fetish'),
    ('swimsuit-fetish'),
    ('taskmaster'),
    ('tribbing'),
    ('tyrant'),
    ('villain'),
    ('warrior-princess'),
    ('wolf'),
    ('yandere');

  select count(*) into v_bad
    from _rev k left join public.unified_tags t on t.slug = k.slug
   where t.id is null;
  if v_bad > 0 then
    raise exception 'kinktionary revive w5: % slug(s) absent from unified_tags', v_bad;
  end if;

  for r in select slug from _rev order by slug loop
    update public.unified_tags set
      status              = 'active',
      deprecated_at       = null,
      deprecation_reason  = null,
      merged_into_id      = null,
      verification_status = 'reviewed',
      human_reviewed      = true,
      seo_indexable       = (coalesce(nullif(btrim(description), ''), short_description) is not null),
      last_verified_at    = now(),
      updated_at          = now()
    where slug = r.slug
      and status <> 'active';
  end loop;

  -- The one row with no category at all. A chaser is an attraction archetype,
  -- which is what Body Types & Archetypes holds.
  update public.unified_tags u set category_id = c.id
    from public.tag_categories c
   where u.slug = 'chubby-chaser' and c.slug = 'body-types-archetypes'
     and u.category_id is distinct from c.id;

  -- Same drift repair, same direction, as waves 1-4: the junction is what
  -- fetchTagWithCategories renders, so category_id is moved to match it.
  for r in select t.id, a.category_id from _rev k
             join public.unified_tags t on t.slug = k.slug
             join public.tag_category_assignments a
               on a.tag_id = t.id and a.is_primary
            where t.category_id is distinct from a.category_id
  loop
    update public.unified_tags set category_id = r.category_id where id = r.id;
  end loop;

  for r in select t.id, t.category_id from _rev k
             join public.unified_tags t on t.slug = k.slug
            where t.category_id is not null
              and not exists (
                select 1 from public.tag_category_assignments a where a.tag_id = t.id)
  loop
    insert into public.tag_category_assignments (tag_id, category_id, is_primary)
    values (r.id, r.category_id, true)
    on conflict (tag_id, category_id) do update set is_primary = true;
  end loop;

  ------------------------------------------------------------------ assertions
  select count(*) into v_bad from _rev k
    join public.unified_tags t on t.slug = k.slug
   where t.status <> 'active' or t.human_reviewed is not true
      or t.verification_status <> 'reviewed'
      or t.deprecated_at is not null or t.deprecation_reason is not null
      or t.merged_into_id is not null;
  if v_bad > 0 then
    raise exception 'kinktionary revive w5: % row(s) did not reach the live state', v_bad;
  end if;

  select count(*) into v_bad from _rev k
    join public.unified_tags t on t.slug = k.slug
   where t.seo_indexable
     and coalesce(nullif(btrim(t.description), ''), t.short_description) is null;
  if v_bad > 0 then
    raise exception 'kinktionary revive w5: % indexable row(s) carry no description', v_bad;
  end if;

  select count(*) into v_bad from _rev k
    join public.unified_tags t on t.slug = k.slug
   where t.image_url is not null;
  if v_bad > 0 then
    raise exception 'kinktionary revive w5: % row(s) carry a retired image_url', v_bad;
  end if;

  select count(*) into v_bad from _rev k
    join public.unified_tags t on t.slug = k.slug
   where t.category_id is null;
  if v_bad > 0 then
    raise exception 'kinktionary revive w5: % revived row(s) have no category_id', v_bad;
  end if;

  select count(*) into v_bad from _rev k
    join public.unified_tags t on t.slug = k.slug
   where not exists (
     select 1 from public.tag_category_assignments a
      where a.tag_id = t.id and a.category_id = t.category_id and a.is_primary);
  if v_bad > 0 then
    raise exception 'kinktionary revive w5: % row(s) have no primary junction row', v_bad;
  end if;

  -- The point of this wave, asserted by name: these four were reported ABSENT by
  -- the anon matcher and must now be live.
  select count(*) into v_bad from public.unified_tags
   where slug in ('figging','bastinado','omorashi','sadomasochism') and status <> 'active';
  if v_bad > 0 then
    raise exception 'kinktionary revive w5: % of the RLS-hidden exemplars are still not active', v_bad;
  end if;

  select count(*) into v_live from _rev k
    join public.unified_tags t on t.slug = k.slug where t.status = 'active';
  raise notice 'kinktionary revive w5: % of % now active', v_live, (select count(*) from _rev);
end
$mig$;
