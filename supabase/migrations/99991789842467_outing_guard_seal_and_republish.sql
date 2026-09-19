-- The outing guard's only real seal lives on prod and in no migration; and the two drag
-- performers it took offline are still dark with their provenance already restored.
--
-- ── THE EPISODE, MEASURED FROM `content_revisions` RATHER THAN RECONSTRUCTED ─────────
--
-- `person_outing_guard` (CRITICAL) counts public, LIVING people whose `lgbti_connection`
-- asserts a positive identity label while the row carries neither a well-formed
-- `wikidata_qid` NOR a non-`SKIP_` `personality_sources` row — i.e. a published identity
-- claim with nothing standing behind it.
--
--   13:06:47  #3813 (99991789819775) nulls 84 wrong identifiers. Three of the 84 are
--             public and living: alaska (was Q797, the US STATE), bones (Q265868, bone
--             the rigid organ), spice (Q116761079, the DUO "Sugar and Spice").
--             `changed_fields = {wikidata_qid, enrichment_status}` — visibility untouched.
--             Gate 0 -> 3, red on every open PR. #3813 was RIGHT to null them and right
--             not to touch visibility; what it never asked is whether removing the
--             identifier breaches the gate that uses the identifier as the provenance proxy.
--   13:14:38  A hand-applied repair drafts all three to clear the gate.
--   13:29:58  **actor_kind='human'** re-publishes `alaska` through the admin UI. Nothing
--             stopped them. Gate 0 -> 1, and this is the "flicker" that made the incident
--             look transient: it was two hand repairs racing one human, not self-healing.
--   13:31:08  `personality-refresh` (system) resolves spice's real QID on its own.
--   13:45:12  A second hand repair re-drafts alaska; 13:45:30 restores bones' QID and
--             merges alaska into its canonical twin `alaska-thunderfuck-5000` (Q16029552).
--
-- Everything above 13:06 was applied to prod BY HAND, under a live-data gate that was
-- blocking the whole repo. This file is where the durable half of that gets recorded.
--
-- ── 1. THE SEAL EXISTS AND IS NOT IN THE REPO ───────────────────────────────────────
--
-- `trg_personalities_outing_guard` -> `personalities_enforce_outing_guard()` is attached
-- on prod and is exactly the right design: a BEFORE trigger that DEMOTES a breaching row
-- to draft rather than refusing the write. Refusing would have made #3813 abort `db push`
-- on main and taken every queued migration with it; demoting lets the correct repair land
-- and closes the window in the same statement.
--
-- It is in NO migration. `grep` over `supabase/migrations` finds only two files that
-- MENTION it (50000101100000 and an in-flight wrong-entity repair), neither creating it.
-- So it is schema drift: a rebuild from migrations would not have it, and
-- `check-migration-drift.mjs` cannot see this class at all — it compares
-- `schema_migrations` against repo FILES, never schema OBJECTS against either.
--
-- IT ALSO DID NOT EXIST DURING THE INCIDENT, which the revision trail proves rather than
-- implies: had it been attached at 13:06, the `set wikidata_qid = null` would have carried
-- `visibility` in its own `changed_fields` and the three rows could never have been public
-- without an identifier. They were, for eight minutes, and again for fifteen after a human
-- republished one. So this is a seal added after the fact, by hand, never proven to fire.
--
-- PROVEN HERE, in a rolled-back transaction on prod against the three real shapes:
--   A  publish a row holding a valid QID          -> stays publishable   (guard is silent)
--   B  null the QID on a public row (#3813)       -> draft/false/attn    (window never opens)
--   C  a human re-publishes it anyway (13:29:58)  -> draft/false         (admin UI sealed)
-- `create or replace` + drop/create trigger, so applying this against a prod that already
-- carries the object is a no-op that makes it reproducible.
--
-- ── 2. BONES AND SPICE ARE STILL DARK, AND THE OBVIOUS REPUBLISH PUBLISHES NOBODY ───
--
-- Both now hold a verified identifier — resolved live on the two gates
-- `_shared/tag-wiki-guard.ts` requires, the entity must be a human and its label must
-- agree with the name we publish:
--     Q136296831  "Bones"  P31=Q5  British drag performer
--     Q116205118  "Spice"  P31=Q5  American drag queen
-- — and both retain the `dragrace-wikipedia` source row. Nothing justifies their pages
-- staying offline; leaving them costs two real performers their pages for our resolver's
-- error, which is the outcome #3813's own header warned against.
--
-- THE TRAP IS THAT RESTORING `visibility` ALONE SILENTLY DOES NOTHING. The 13:14 demotion
-- also set `needs_attention = true`, and `enforce_personality_public_gate()` drafts any row
-- written as `public` while that flag is set. So a republish that restores visibility and
-- seo_indexable from the snapshot — the obvious shape — is reverted by a sibling BEFORE
-- trigger inside the same statement, and a postcondition that only asserts the GATE reads 0
-- passes, because a row nobody published cannot breach an outing gate. Measured: without
-- clearing the flag the update reports 2 rows and both are still `draft` afterwards.
-- `needs_attention` is therefore cleared in the SAME statement (a BEFORE trigger reads NEW,
-- so one statement is required — two would be drafted by the first).
--
-- Hence the postcondition asserts BOTH directions: the gate reads 0 **and** the two rows
-- are actually public and indexable. A one-sided check is satisfied by doing nothing.
--
-- SOFT ON PRECONDITIONS: only a row that still carries the unpublish marker, is still
-- draft, is not a duplicate, and NOW holds both a well-formed QID and a non-`SKIP_` source
-- is restored. `alaska` satisfies none of the last three (it was merged into
-- `alaska-thunderfuck-5000` and correctly holds no identifier of its own) and is skipped,
-- not aborted on — a row a concurrent session has already restored is likewise a no-op.
-- This composes with #3821 and #3822 in either order and re-runs clean.
--
-- NOT DONE HERE, named rather than counted:
--   * The seal covers writes to `personalities` only. Deleting the last non-`SKIP_`
--     `personality_sources` row breaches the gate without touching `personalities`, so the
--     trigger cannot see it. One live row rests on the sources arm alone (`little-demon`,
--     a `SKIP_` qid with two source rows). The GATE still detects that class; a second
--     trigger on `personality_sources` is defence-in-depth for a one-row exposure, and
--     under-reaching is the correct error.
--   * `check-migration-drift.mjs` compares migration HISTORY, not schema objects. This file
--     repairs one instance of that blind spot; it does not close the class.

-- ============================================================================
-- 1. Codify the seal.
-- ============================================================================
create or replace function public.personalities_enforce_outing_guard()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  -- A living person whose row asserts a positive LGBTI identity label may not be
  -- published without provenance: either a well-formed Wikidata identifier, or a
  -- source row that is not a `SKIP_` sentinel. DEMOTE rather than RAISE — a correct
  -- repair that removes a wrong identifier must still be able to land.
  if new.is_living
     and (new.visibility = 'public' or new.seo_indexable)
     and new.lgbti_connection in ('community_member', 'ally', 'activist', 'representation')
     and not (coalesce(new.wikidata_qid, '') ~ '^Q[0-9]+$')
     and not exists (
       select 1 from public.personality_sources s
       where s.personality_id = new.id
         and coalesce(s.source_entity_id, '') !~ '^SKIP_'
     )
  then
    new.visibility      := 'draft';
    new.seo_indexable   := false;
    new.needs_attention := true;
  end if;
  return new;
end;
$function$;

comment on function public.personalities_enforce_outing_guard() is
  'Outing seal: demotes a living, published person asserting a positive LGBTI identity label with no wikidata_qid and no non-SKIP_ personality_sources row. Mirrors release_gate_checks().person_outing_guard. Demotes rather than raising so a correct identifier repair can still land.';

drop trigger if exists trg_personalities_outing_guard on public.personalities;
create trigger trg_personalities_outing_guard
  before insert or update of visibility, seo_indexable, lgbti_connection, wikidata_qid, is_living
  on public.personalities
  for each row execute function public.personalities_enforce_outing_guard();

-- ============================================================================
-- 2. Republish the performers whose provenance is back.
-- ============================================================================
do $$
declare
  v_restored int;
  v_gate     int;
  v_public   int;
  v_stuck    int;
begin
  perform set_config('app.actor', 'migration:outing_guard_seal_and_republish', true);

  update public.personalities p
     set visibility      = coalesce(p.enrichment_status->'outing_guard_unpublish'->>'prior_visibility', 'public'),
         seo_indexable   = coalesce((p.enrichment_status->'outing_guard_unpublish'->>'prior_seo_indexable')::boolean, true),
         -- Load-bearing, and in THIS statement: enforce_personality_public_gate() drafts
         -- any row written as public while needs_attention is set, so restoring visibility
         -- without clearing the flag republishes nobody and still reports rows updated.
         needs_attention = false,
         enrichment_status = (p.enrichment_status - 'outing_guard_unpublish') || jsonb_build_object(
           'outing_guard_republished', jsonb_build_object(
             'reason', 'provenance restored; the unpublish that cleared person_outing_guard is no longer warranted',
             'restored_qid', p.wikidata_qid,
             'was', p.enrichment_status -> 'outing_guard_unpublish',
             'by', 'migration:outing_guard_seal_and_republish',
             'at', now()
           )),
         updated_at = now()
   where p.enrichment_status ? 'outing_guard_unpublish'
     and p.visibility = 'draft'
     and p.duplicate_of_id is null
     -- FAIL-SAFE: only a row that now carries provenance may go back up. A row still
     -- missing it stays down and the gate stays green.
     and p.wikidata_qid ~ '^Q[0-9]+$'
     and exists (select 1 from public.personality_sources s
                 where s.personality_id = p.id
                   and coalesce(s.source_entity_id, '') !~ '^SKIP_');
  get diagnostics v_restored = row_count;

  select count(*) into v_stuck from public.personalities
   where enrichment_status ? 'outing_guard_unpublish' and visibility = 'draft';
  raise notice 'republished % row(s); % still down for want of provenance (expected: alaska, merged away)',
    v_restored, v_stuck;

  -- POSTCONDITION A — the gate's own function, not a restatement of its predicate.
  select failing into v_gate from public.trust_safety_gate_status()
   where gate = 'person_outing_guard';
  if v_gate is null then
    raise exception 'postcondition failed: trust_safety_gate_status() returned no person_outing_guard row';
  end if;
  if v_gate <> 0 then
    raise exception 'postcondition failed: person_outing_guard reads % after republishing (expected 0)', v_gate;
  end if;

  -- POSTCONDITION B — the rows are actually back. Without this, a republish that the
  -- public gate silently reverted satisfies postcondition A and publishes nobody.
  select count(*) into v_public from public.personalities
   where slug in ('bones', 'spice')
     and visibility = 'public' and seo_indexable and not needs_attention
     and wikidata_qid ~ '^Q[0-9]+$';
  if v_public <> 2 then
    raise exception 'postcondition failed: % of 2 performers are public with a valid identifier (expected 2)', v_public;
  end if;

  -- POSTCONDITION C — the seal is attached and fires. Asserting the trigger EXISTS is not
  -- enough: it was attached by hand and never proven, which is how this file started.
  if not exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where c.relname = 'personalities' and t.tgname = 'trg_personalities_outing_guard'
       and not t.tgisinternal
  ) then
    raise exception 'postcondition failed: trg_personalities_outing_guard is not attached';
  end if;
end $$;

-- ============================================================================
-- 3. The seal, proven against the shape that opened the window.
-- ============================================================================
-- Separate block so its rollback cannot discard section 2's writes.
do $$
declare
  v_id  uuid;
  v_vis text;
  v_idx boolean;
begin
  select id into v_id from public.personalities where slug = 'bones';
  if v_id is null then
    raise notice 'seal probe skipped: no bones row';
    return;
  end if;

  begin
    -- Remove the sources arm so the identifier alone stands between it and a breach,
    -- then reproduce #3813 verbatim: null the qid on a published row.
    delete from public.personality_sources s where s.personality_id = v_id;
    update public.personalities p set visibility = 'public', seo_indexable = true where p.id = v_id;
    update public.personalities p set wikidata_qid = null where p.id = v_id;
    select visibility, seo_indexable into v_vis, v_idx from public.personalities where id = v_id;
    if v_vis <> 'draft' or v_idx then
      raise exception 'seal probe: nulling the identifier left the row at %/% (expected draft/false)', v_vis, v_idx;
    end if;

    -- And the 13:29:58 shape: a human republishing it anyway.
    update public.personalities p set visibility = 'public', seo_indexable = true where p.id = v_id;
    select visibility, seo_indexable into v_vis, v_idx from public.personalities where id = v_id;
    if v_vis <> 'draft' or v_idx then
      raise exception 'seal probe: a manual republish reached %/% (expected draft/false)', v_vis, v_idx;
    end if;

    raise exception 'SEAL_PROBE_OK';
  exception
    when others then
      if sqlerrm <> 'SEAL_PROBE_OK' then raise; end if;
  end;
  raise notice 'seal probe passed: identifier removal and manual republish both demote';
end $$;
