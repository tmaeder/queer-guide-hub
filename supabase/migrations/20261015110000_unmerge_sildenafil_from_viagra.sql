-- The alias-shadow cleanup merged a drug's GENERIC page into its BRAND page,
-- and took two thirds of the clinical prose out of circulation with it.
--
-- `20261011090000` (tag_alias_shadow_cleanup) merged `sildenafil` into
-- `viagra` at 13:08 on 2026-08-29, reason `alias-shadow-repair`. The merge
-- machinery did exactly what it was told; the DIRECTION is what is wrong.
--
-- WHY THIS IS WRONG BY THIS CORPUS'S OWN CONVENTION, not by outside opinion.
-- Every other PDE5 inhibitor files the same way — the generic carries the
-- prose and stays active, the brand sits alongside as a thin page and is
-- never merged:
--
--   generic      status   long_description        brand     status   long_description
--   tadalafil    active   965 chars               cialis    active     0 chars
--   vardenafil   active   801 chars               levitra   active     0 chars
--   avanafil     active   751 chars
--   sildenafil   MERGED  1088 chars    ->         viagra    active   361 chars
--
-- So `sildenafil` was the only generic merged away, and it was merged into a
-- page carrying a third of its content. Nothing about the class justifies
-- treating it differently from tadalafil.
--
-- WHAT THE READER LOST. /tags/sildenafil 301'd to /tags/viagra, whose prose
-- does not carry the two DailyMed label facts the glossary states precisely
-- because the popular retelling gets them backwards: the sildenafil label
-- states NO safe nitrate interval (the "wait 24 hours" everyone repeats is
-- clinical convention, not a labelled figure). That is drug-interaction
-- safety copy on a platform whose readers mix these with poppers, so losing
-- it is not a cosmetic regression. Caught by
-- e2e/tags-health-facts.spec.ts:104 on the nightly prod suite — the local run
-- had reported it too, but as one of several failures on a saturated machine,
-- which is why it needed the clean-hardware run to be believed.
--
-- THE FIX IS AN UNMERGE, NOT A RE-MERGE IN THE OTHER DIRECTION. Re-merging
-- `viagra` into `sildenafil` would ALSO break the convention: cialis and
-- levitra are active standalone pages, not redirects. Restoring the
-- pre-13:08 state is what makes this drug match its own class.
--
-- `unmerge_tag_concept` is the sanctioned reversal and takes the audit row's
-- id, so the reversal is keyed to the exact merge rather than to a slug pair.
-- Verified on prod inside a rolled-back transaction before this was written:
-- sildenafil returns active with all 1088 chars and viagra stays active.
--
-- Guarded so a re-run is a no-op: if the merge has already been reversed (by
-- this migration or by hand) there is no audit row left in the merged state
-- and the block does nothing. `20261011090000` is a one-shot migration, not a
-- cron, so nothing re-merges this on a schedule — but if that cleanup is ever
-- generalised into a recurring job it MUST prefer the row with the longer
-- prose as canonical, or it will do this again to another drug.

do $$
declare
  v_audit_id  uuid;
  v_sildenafil uuid;
  v_viagra     uuid;
  v_status     text;
  v_len        int;
begin
  perform set_config('app.actor', 'migration:20261015110000_unmerge_sildenafil', true);

  select id into v_sildenafil from public.unified_tags where slug = 'sildenafil';
  select id into v_viagra     from public.unified_tags where slug = 'viagra';

  if v_sildenafil is null or v_viagra is null then
    raise notice 'unmerge sildenafil: one of the two tags is absent, nothing to do';
    return;
  end if;

  -- Only the merge this migration is about: keyed on the audit row for
  -- sildenafil-as-duplicate under viagra-as-canonical, still in force.
  select a.id into v_audit_id
    from public.tag_merge_audit a
   where a.duplicate_id = v_sildenafil
     and a.canonical_id = v_viagra
     and a.source = 'alias-shadow-repair'
   order by a.created_at desc
   limit 1;

  if v_audit_id is null then
    raise notice 'unmerge sildenafil: no alias-shadow merge audit found, already reversed';
    return;
  end if;

  select status into v_status from public.unified_tags where id = v_sildenafil;
  if v_status is distinct from 'merged' then
    raise notice 'unmerge sildenafil: already active, nothing to do';
    return;
  end if;

  perform public.unmerge_tag_concept(v_audit_id);

  -- Assert the outcome rather than trusting the call: the whole point is that
  -- the generic is readable again WITH its prose.
  select status, length(coalesce(long_description, ''))
    into v_status, v_len
    from public.unified_tags where id = v_sildenafil;

  if v_status is distinct from 'active' then
    raise exception 'unmerge sildenafil: expected active after unmerge, got %', v_status;
  end if;
  if v_len < 1000 then
    raise exception 'unmerge sildenafil: prose did not survive the unmerge (% chars)', v_len;
  end if;

  select status into v_status from public.unified_tags where id = v_viagra;
  if v_status is distinct from 'active' then
    raise exception 'unmerge sildenafil: viagra must remain an active standalone page, got %', v_status;
  end if;

  raise notice 'unmerge sildenafil: restored active with % chars; viagra left active', v_len;
end $$;
