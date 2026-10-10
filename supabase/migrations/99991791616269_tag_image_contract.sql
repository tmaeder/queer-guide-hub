-- Glossary photography, re-introduced under a write-time contract (2026-10-10)
-- ----------------------------------------------------------------------------
-- This REVERSES part of 20261003100000_tag_image_retirement (2026-08-28), which
-- cleared 1,590 tag photos and left `active_tags_with_image_url` as a
-- zero-invariant. That retirement was right about its corpus and this file does
-- not dispute it. Quoting its own header, the photos were sourced "by taking the
-- TOP-1 Pexels/Unsplash hit for a keyword-mapped tag name -- no scoring, no
-- content-match check -- and 1,262 of them with no recoverable license".
--
-- So the thing being changed is not the verdict, it is the MECHANISM. The
-- retirement had no way to express "a photo may exist if it is licensed, if it
-- matches, and if it is used once", so it banned photos outright. This file
-- makes those three conditions structural, which is what the hygiene gate's own
-- comment prescribes for a counter that should stop being a level gate:
--
--     "If a metric here should be hard again, gate on the quantity that
--      actually means something broke -- an AGE, or a write-time invariant that
--      makes the count structural -- never on a level."
--
-- Accordingly:
--   * `zz_enforce_tag_image_contract` makes an unlicensed, unattributed,
--     alt-less, `data:`-URI or wrongly-gated image IMPOSSIBLE TO WRITE.
--   * `tag_cover_one_tag_uniq` makes one asset on two glossary pages IMPOSSIBLE.
--   * `tag_image_signals()` reports the residue, so a bypass (a superuser write,
--     a disabled trigger) is still visible rather than merely improbable.
-- `tag_hygiene_stats()` is NOT touched -- it is 392 lines, has hit the 8s
-- statement_timeout four times, and restating it to add counters is the
-- merge-collision surface this repo already avoids for every other sentinel.
-- Its `active_tags_with_image_url` counter becomes advisory in the baseline
-- instead, which the drift test already requires to come with `zero` removed
-- from src/lib/tagHygieneMetrics.ts.
--
-- THE RETIREMENT'S SNAPSHOT CANNOT BE REPLAYED THROUGH THIS, AND THAT IS
-- DELIBERATE. `tag_image_retirement` holds 7,143 rows of which 3,407 are
-- `image_source='gradient'` CC0 placeholder SVGs stored as `data:` URIs and
-- 2,794 carry no license at all. Every one of those shapes is refused below, so
-- a well-meaning "restore the snapshot" is a loud failure rather than a quiet
-- regression. The 938 genuine Wikimedia rows in it are not restorable either:
-- hand-read, 16 of the highest-usage gave ~6 defensible (`cum` ->
-- Sca_fell_massif2010.JPG, `harness` -> musee de l'Armee armour).
--
-- ORDERING: depends on 99991791616254_tag_image_links_retire having run. The
-- unique index below cannot be built while the legacy links exist -- 411 assets
-- are the cover of two or more tags. Measured on prod in a rolled-back
-- transaction: `sqlstate=23505, could not create unique index`.
--
-- The DDL here updates no `unified_tags` row, but the verify block at the bottom
-- pushes a scratch row through the contract, so the actor is named -- same
-- convention as the retirement, whose first push died on
-- `log_unified_tag_change()`'s human_reviewed guard. Transaction-local, so it
-- cannot leak past this file.

set lock_timeout = '5s';
select set_config('app.actor', 'migration:tag-image-contract', true);

-- ── 1. The explicitness flag ────────────────────────────────────────────────
-- A column rather than a join. The invariant "explicit implies is_adult" has to
-- be checkable in a BEFORE trigger on `unified_tags`, which holds no asset id,
-- and it is read again by the frontend gate and the sentinel. One boolean
-- removes a join from all three. `not null default false` so an unprobed row is
-- never ambiguous -- absence of a measurement is `false` plus no image, which
-- the trigger below treats as "nothing to enforce".
alter table public.unified_tags
  add column if not exists image_explicit boolean not null default false;

comment on column public.unified_tags.image_explicit is
  'True when image_url depicts explicit sexual activity. Enforced by '
  'zz_enforce_tag_image_contract to imply is_adult, and read by the TagFigure '
  'band to gate the figure behind age affirmation. Set by the tag-imagery '
  'classifier, never by hand.';

-- ── 2. The write-time contract ──────────────────────────────────────────────

create or replace function public.enforce_tag_image_contract()
returns trigger
language plpgsql
set search_path to 'public'
as $fn$
begin
  -- Blank is absent. Normalising here makes `image_url is not null` the single
  -- reliable predicate for the sentinel, the selector and the frontend; an
  -- empty string is a non-null value that renders nothing, which is the worst
  -- of both.
  if new.image_url is not null and btrim(new.image_url) = '' then
    new.image_url := null;
  end if;

  if new.image_url is null then
    -- A retraction clears the whole sidecar. Leaving attribution behind on a
    -- row with no image is how a derived field outlives the thing it describes.
    new.image_alt         := null;
    new.image_source      := null;
    new.image_license     := null;
    new.image_attribution := null;
    new.image_explicit    := false;
    return new;
  end if;

  -- `data:` is the legacy gradient shape: 3,407 of the retired links were
  -- `data:image/svg+xml` placeholders. They are not photographs, they bloat
  -- every row that carries one, and they defeat the asset registry entirely.
  if new.image_url !~* '^https://' then
    raise exception
      'tag image must be an https URL (got %): a data: URI is the retired '
      'placeholder shape, not a photograph', left(new.image_url, 40)
      using errcode = 'check_violation';
  end if;

  -- The 1,262-unlicensed lesson, as four separate requirements so the error
  -- names which one is missing rather than saying "incomplete".
  if new.image_license is null or btrim(new.image_license) = '' then
    raise exception 'tag image needs image_license (tag %)', new.slug
      using errcode = 'check_violation';
  end if;
  if new.image_attribution is null or btrim(new.image_attribution) = '' then
    raise exception 'tag image needs image_attribution (tag %)', new.slug
      using errcode = 'check_violation';
  end if;
  if new.image_source is null or btrim(new.image_source) = '' then
    raise exception 'tag image needs image_source (tag %)', new.slug
      using errcode = 'check_violation';
  end if;
  -- An image with no alt text is a WCAG failure, and `image_alt` has existed
  -- for this since the baseline. The retired corpus had alt on 307 of 1,590.
  if new.image_alt is null or btrim(new.image_alt) = '' then
    raise exception 'tag image needs image_alt (tag %)', new.slug
      using errcode = 'check_violation';
  end if;

  if new.image_source not in ('wikidata:p18', 'wikimedia', 'pexels', 'unsplash') then
    raise exception
      'unknown tag image_source % -- the vocabulary is wikidata:p18, wikimedia, '
      'pexels, unsplash', new.image_source
      using errcode = 'check_violation';
  end if;

  -- LICENCE COMPLIANCE, not taste. The Unsplash and Pexels licences both bar
  -- using a photo in a way that implies an identifiable person's association
  -- with or endorsement of a sensitive subject. 70% of the indexable glossary
  -- is `is_adult`, so a stock portrait beside a sex act is a model-release
  -- problem. Wikimedia/P18 is exempt because there the entity IS the subject.
  if new.image_source in ('pexels', 'unsplash')
     and (coalesce(new.is_adult, false) or coalesce(new.is_sensitive, false)) then
    raise exception
      'stock photography (%) may not illustrate an adult or sensitive tag (%) -- '
      'the Pexels and Unsplash licences bar implying a model''s association with '
      'sensitive subject matter', new.image_source, new.slug
      using errcode = 'check_violation';
  end if;

  if new.image_explicit and not coalesce(new.is_adult, false) then
    raise exception
      'explicit imagery requires is_adult on the tag (%) -- the figure is gated '
      'behind age affirmation, and a non-adult tag has no gate', new.slug
      using errcode = 'check_violation';
  end if;

  return new;
end
$fn$;

comment on function public.enforce_tag_image_contract() is
  'Write-time contract for unified_tags image columns, added 2026-10-10 when '
  'glossary photography was re-introduced. Replaces the blanket '
  'active_tags_with_image_url zero-gate with the invariants that gate was '
  'standing in for: licensed, attributed, alt-texted, https, known source, no '
  'stock on adult/sensitive tags, explicit implies is_adult.';

-- UNSCOPED, deliberately. A column-scoped `UPDATE OF image_url` trigger fires
-- on the columns named in the STATEMENT, not on what another BEFORE trigger
-- wrote -- the 20260807100200 lesson, where exactly that let a venue change
-- country without recomputing `safety_gated`. Here the live hazard is an UPDATE
-- that flips `is_adult` to false on a row already carrying an explicit image:
-- scoped to image_url, this trigger would not fire and the gate would silently
-- come off.
--
-- `zz_` so it sorts last among this table's BEFORE triggers and therefore
-- validates final values -- the convention `zz_enforce_tag_publication_role`,
-- `zy_validate_tag_entity_target` and `trg_zz_tag_reject_alias_shadow` already
-- follow here.
drop trigger if exists zz_enforce_tag_image_contract on public.unified_tags;
create trigger zz_enforce_tag_image_contract
  before insert or update on public.unified_tags
  for each row execute function public.enforce_tag_image_contract();

-- ── 3. One asset, one glossary page ─────────────────────────────────────────
-- `image_asset_links` is a many-to-many registry BY DESIGN -- its own migration
-- header says "N entities can attach to the same image" and the marketplace
-- relies on it. That is correct for a product photo appearing on two listings
-- and wrong for a glossary illustration: the same picture on `/tags/leather`
-- and `/tags/harness` reads as filler, which is one of the three failures that
-- caused the retirement. Scoping the constraint to tag covers keeps reuse legal
-- everywhere it belongs.
--
-- No CONCURRENTLY: migrations run inside a transaction.
create unique index if not exists tag_cover_one_tag_uniq
  on public.image_asset_links (asset_id)
  where entity_type = 'tag' and role = 'cover';

comment on index public.tag_cover_one_tag_uniq is
  'One asset may be the cover of at most one tag. Enforces the no-duplicate-'
  'illustration half of the 2026-10-10 photography re-introduction; deliberately '
  'narrower than the table, which allows cross-entity reuse by design.';

-- ── 4. The sentinel ─────────────────────────────────────────────────────────
-- A standalone RPC, not a key on tag_hygiene_stats(): that body is 392 lines
-- and has timed out at the 8s `authenticator` ceiling four times, so adding
-- arms to it buys a flaky REQUIRED check. Same reasoning that made
-- glossary_link_signals, event_dup_signals and tag_disowned_prose_signals their
-- own functions.
create or replace function public.tag_image_signals()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_tags  jsonb;
  v_links jsonb;
begin
  select jsonb_build_object(
    'published',          count(*) filter (where image_url is not null),
    'published_active',   count(*) filter (where image_url is not null and status = 'active'),
    'explicit_published', count(*) filter (where image_url is not null and image_explicit),
    -- Every key below is a zero-invariant made structural by
    -- zz_enforce_tag_image_contract. A non-zero does not mean "a backlog to
    -- work down" -- it means the trigger was bypassed or dropped.
    'unlicensed', count(*) filter (
      where image_url is not null
        and (image_license is null or btrim(image_license) = ''
          or image_attribution is null or btrim(image_attribution) = ''
          or image_source is null or btrim(image_source) = '')),
    'missing_alt', count(*) filter (
      where image_url is not null and (image_alt is null or btrim(image_alt) = '')),
    'not_https', count(*) filter (
      where image_url is not null and image_url !~* '^https://'),
    'unknown_source', count(*) filter (
      where image_url is not null
        and image_source not in ('wikidata:p18', 'wikimedia', 'pexels', 'unsplash')),
    'stock_on_adult', count(*) filter (
      where image_url is not null
        and image_source in ('pexels', 'unsplash')
        and (coalesce(is_adult, false) or coalesce(is_sensitive, false))),
    'explicit_ungated', count(*) filter (
      where image_url is not null and image_explicit and not coalesce(is_adult, false))
  ) into v_tags
  from public.unified_tags;

  select jsonb_build_object(
    'legacy_tag_links', count(*),
    -- Structurally impossible while tag_cover_one_tag_uniq exists. Reported so
    -- that dropping the index shows up here rather than nowhere.
    'cover_asset_reused', coalesce((
      select count(*) from (
        select asset_id from public.image_asset_links
         where entity_type = 'tag' and role = 'cover'
         group by asset_id having count(distinct entity_id) > 1) s), 0)
  ) into v_links
  from public.image_asset_links
  where entity_type = 'tag';

  return jsonb_build_object('probe_ok', true)
      || v_tags
      || v_links
      || jsonb_build_object(
           'trigger_attached', exists (
             select 1 from pg_trigger
              where tgrelid = 'public.unified_tags'::regclass
                and tgname = 'zz_enforce_tag_image_contract'
                and tgenabled <> 'D'),
           'uniq_index_present', exists (
             select 1 from pg_indexes
              where schemaname = 'public'
                and tablename = 'image_asset_links'
                and indexname = 'tag_cover_one_tag_uniq'),
           'review_open', coalesce((
             select count(*) from public.entity_review_queue
              where entity_type = 'tag' and field = 'image_url' and status = 'open'), 0));
exception when others then
  -- probe_ok=false carries the reason. An unreadable corpus must never read as
  -- a clean one.
  return jsonb_build_object('probe_ok', false, 'error', sqlerrm, 'sqlstate', sqlstate);
end
$fn$;

comment on function public.tag_image_signals() is
  'Sentinel for glossary photography (re-introduced 2026-10-10). Reports '
  'probe_ok, trigger_attached and uniq_index_present SEPARATELY from the '
  'counts, because an undeployed enforcement layer and a clean corpus both '
  'produce zeroes. Read by scripts/check-pipeline-health.mjs.';

-- SECURITY DEFINER aggregate: service_role only. Granting a definer function to
-- `authenticated` grants it to every signed-in member, which is how
-- review_queue_signals had to be narrowed after the fact.
revoke all on function public.tag_image_signals() from public;
revoke all on function public.tag_image_signals() from anon, authenticated;
grant execute on function public.tag_image_signals() to service_role;

-- ── 5. Verify ───────────────────────────────────────────────────────────────
-- Exercises the trigger against real refusals rather than asserting its
-- existence. A trigger that exists and refuses nothing is the vacuous case, and
-- `select count(*) from pg_trigger` cannot tell the two apart.

do $verify$
declare
  v_id      uuid;
  v_sig     jsonb;
  v_raised  boolean;
  v_asset   uuid;
  v_tag_b   uuid;
begin
  -- A scratch tag to push through the contract. Named so a leak is obvious.
  -- `publication_role` is NOT NULL with NO default and `validate_tag_entity_target`
  -- tests `new.publication_role <> 'entity_redirect'`, which is NULL -- not true --
  -- when the column is unset, so the row falls through to the redirect branch and
  -- raises 23514. Found by dry-running this file, not by reading it. `article` is
  -- the page-publishing role (3,172 rows); `utility` does not render a page.
  insert into public.unified_tags (name, slug, status, description, publication_role)
  values ('ZZ Contract Probe', 'zz-contract-probe-99991791616269', 'active', 'Probe row.',
          'article')
  returning id into v_id;

  -- (a) unlicensed must be refused
  v_raised := false;
  begin
    update public.unified_tags set image_url = 'https://img.queer.guide/x.jpg' where id = v_id;
  exception when check_violation then v_raised := true;
  end;
  if not v_raised then
    raise exception 'contract did not refuse an unlicensed image';
  end if;

  -- (b) a data: URI must be refused even when fully attributed
  v_raised := false;
  begin
    update public.unified_tags
       set image_url = 'data:image/svg+xml;utf8,<svg/>', image_license = 'CC0',
           image_attribution = 'x', image_source = 'wikimedia', image_alt = 'x'
     where id = v_id;
  exception when check_violation then v_raised := true;
  end;
  if not v_raised then
    raise exception 'contract did not refuse a data: URI';
  end if;

  -- (c) stock on an adult tag must be refused
  v_raised := false;
  begin
    update public.unified_tags
       set is_adult = true, image_url = 'https://images.pexels.com/x.jpg',
           image_license = 'Pexels License', image_attribution = 'A',
           image_source = 'pexels', image_alt = 'x'
     where id = v_id;
  exception when check_violation then v_raised := true;
  end;
  if not v_raised then
    raise exception 'contract did not refuse stock photography on an adult tag';
  end if;

  -- (d) explicit without is_adult must be refused
  v_raised := false;
  begin
    update public.unified_tags
       set is_adult = false, image_explicit = true,
           image_url = 'https://upload.wikimedia.org/x.jpg', image_license = 'CC BY-SA 4.0',
           image_attribution = 'A', image_source = 'wikimedia', image_alt = 'x'
     where id = v_id;
  exception when check_violation then v_raised := true;
  end;
  if not v_raised then
    raise exception 'contract did not refuse explicit imagery on a non-adult tag';
  end if;

  -- (e) THE POSITIVE CONTROL. Four refusals prove nothing on their own: a
  -- trigger that raises unconditionally satisfies all of them and publishes no
  -- image ever.
  update public.unified_tags
     set is_adult = false, image_explicit = false,
         image_url = 'https://upload.wikimedia.org/wikipedia/commons/5/5c/Leathertools.jpg',
         image_license = 'CC BY-SA 4.0', image_attribution = 'Scott Bauer',
         image_source = 'wikimedia', image_alt = 'A set of leather working tools.'
   where id = v_id;
  if not exists (select 1 from public.unified_tags where id = v_id and image_url is not null) then
    raise exception 'contract refused a well-formed image -- the gate is closed, not guarded';
  end if;

  -- (f) retraction clears the sidecar
  update public.unified_tags set image_url = null where id = v_id;
  if exists (select 1 from public.unified_tags
              where id = v_id and (image_license is not null or image_attribution is not null
                                   or image_source is not null or image_alt is not null)) then
    raise exception 'retraction left the image sidecar populated';
  end if;

  delete from public.unified_tags where id = v_id;

  -- (g) the unique index must refuse a second tag on one asset
  select id into v_asset from public.image_assets limit 1;
  select id into v_tag_b from public.unified_tags where status = 'active' limit 1;
  if v_asset is not null and v_tag_b is not null then
    insert into public.image_asset_links (asset_id, entity_type, entity_id, role)
    values (v_asset, 'tag', v_tag_b, 'cover');
    v_raised := false;
    begin
      insert into public.image_asset_links (asset_id, entity_type, entity_id, role)
      values (v_asset, 'tag', (select id from public.unified_tags
                                where status = 'active' and id <> v_tag_b limit 1), 'cover');
    exception when unique_violation then v_raised := true;
    end;
    delete from public.image_asset_links
     where asset_id = v_asset and entity_type = 'tag';
    if not v_raised then
      raise exception 'tag_cover_one_tag_uniq did not refuse one asset on two tags';
    end if;
  end if;

  -- (h) the sentinel answers, and answers clean
  v_sig := public.tag_image_signals();
  if (v_sig->>'probe_ok')::boolean is not true then
    raise exception 'tag_image_signals() probe failed: %', v_sig->>'error';
  end if;
  if (v_sig->>'trigger_attached')::boolean is not true
     or (v_sig->>'uniq_index_present')::boolean is not true then
    raise exception 'sentinel reports the enforcement layer absent: %', v_sig::text;
  end if;
  if (v_sig->>'legacy_tag_links')::int <> 0 then
    raise exception
      'legacy tag links still present (%) -- 99991791616254_tag_image_links_retire '
      'has not run', v_sig->>'legacy_tag_links';
  end if;

  raise notice 'tag image contract verified: %', v_sig::text;
end
$verify$;
