-- The prose judge may not write content. Measured, not suspected.
--
-- `tag-enrichment-sweep mode='prose'` shipped with two auto-apply paths:
-- retract wrong-subject prose at confidence >= 0.9, and overwrite
-- right-subject prose at >= 0.8. Its FIRST live batch (2026-08-29, 18 tags
-- before it was stopped) measured both:
--
--   RETRACT — 16 retractions, 13 of them WRONG. It destroyed correct
--   definitions of soft-limits, safe-sane-and-consensual-ssc, outing,
--   deadnaming, anxiety, genital-warts, lgbtq-health, loneliness,
--   heteronormativity, pillow-princess, educator, genealogy and charite.
--   Only `maler` and `tanzer` — both literal surname disambiguation lists
--   ("Notable people with the surname include…") — were genuinely
--   wrong-subject. The model answers "wrong_subject" with high confidence
--   for prose that is merely SHORT ("Passive sexual partner", "Teaching
--   role"), so the 0.9 gate protected nothing.
--
--   REWRITE — 2 rewrites, 1 a downgrade into exactly the register
--   TAG_STYLE_SYSTEM bans: `ghosting` went from "Ending contact with someone
--   by simply stopping — no reply, no explanation, no block" to "Ghosting
--   refers to the practice of suddenly and without explanation ceasing all
--   communication".
--
-- All 18 rows were restored byte-exact from `tag_change_log.before_data`
-- (description, wikidata_id and seo_indexable all verified identical), which
-- is the only reason this is recoverable — the audit trigger is what made the
-- damage reversible, and is why content writes were routed through an
-- attributed actor in the first place.
--
-- A judge that cannot be trusted to retract cannot be trusted to overwrite.
-- Both paths are now REVIEW-ONLY: wrong-subject opens an
-- `entity_review_queue` row, rewrites queue to `ai_suggestions`, and nothing
-- reaches `unified_tags` without a human. The hybrid-by-confidence policy was
-- approved on the assumption that the judge was reliable; it is not, and the
-- measurement supersedes the assumption.
--
-- `tag_prose_apply` therefore loses its retract branch entirely rather than
-- merely losing its caller — a destructive capability left in place is one
-- accidental re-enable away from repeating this.

create or replace function public.tag_prose_apply(
  p_tag_id uuid,
  p_description text default null,
  p_short_description text default null,
  p_retract boolean default false
) returns void
language plpgsql security definer set search_path = public as $$
declare v_row unified_tags%rowtype;
begin
  if p_retract then
    raise exception
      'tag_prose_apply: automated retraction is removed — the judge was measured wrong 13/16 on 2026-08-29. Wrong-subject verdicts open an entity_review_queue row instead.';
  end if;

  perform set_config('app.actor', 'llm:tag-prose-pass', true);
  select * into v_row from unified_tags where id = p_tag_id and status = 'active';
  if not found then return; end if;
  if v_row.is_sensitive or v_row.is_adult then
    raise exception 'tag_prose_apply: sensitive/adult tag — review path only';
  end if;

  update unified_tags
  set description = coalesce(p_description, description),
      short_description = coalesce(p_short_description, short_description),
      updated_at = now()
  where id = p_tag_id;
end $$;
revoke all on function public.tag_prose_apply(uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.tag_prose_apply(uuid, text, text, boolean) to service_role;

comment on function public.tag_prose_apply(uuid, text, text, boolean) is
  'Attributed writer for glossary prose (app.actor=llm:tag-prose-pass, required because log_unified_tag_change RAISEs on human_reviewed rows for an undeclared system: actor). Retraction is REMOVED — see 20261015094000. Refuses sensitive/adult rows outright.';

-- MEASURED AND REJECTED: routing the wrong-subject verdict into
-- `entity_review_queue` instead. It is the obvious move and it is wrong here.
-- At ~19% precision (3 of 16) five in every six queue rows would be noise,
-- which is exactly how a review queue teaches its reviewers to rubber-stamp —
-- and this queue APPLIES on approval (`review_field_registry` carries
-- `target_table`/`target_column`/`apply_mode`, so an approved `tag`/
-- `description` row would write straight back into `unified_tags`). A
-- detector this imprecise does not get an approve button. The verdict is
-- counted and logged by the edge function and touches nothing; earning the
-- right to act again means showing a better precision number on a fresh
-- sample, not lowering the threshold that already failed.
--
-- (Registering the field was attempted and abandoned: `erq_validate_field`
-- rejects unregistered fields, and the registry keys on the SINGULAR entity
-- type — `city`, `venue`, `village` — so the first insert raised
-- `unregistered review field: unified_tags/description`.)

-- The cron was disabled live the moment the damage was observed. Keep the
-- registry row disabled and unscheduled so `sync_automations_to_cron()`
-- cannot recreate it: re-enabling is a deliberate decision to be taken after
-- the review-only path has been watched for a batch or two, not a side
-- effect of this migration. Retirement means disabling the registry row,
-- never deleting it.
update admin_automations
set enabled = false,
    description = 'tag-enrichment-sweep mode=prose. REVIEW-ONLY since 20261015094000 and DISABLED pending a human look at the entity_review_queue rows it produces — its auto-apply paths were measured wrong (13/16 retractions) on the first live batch.',
    updated_at = now()
where slug = 'tag_prose_pass';

do $$ begin
  if exists (select 1 from cron.job where jobname = 'tag_prose_pass') then
    perform cron.unschedule('tag_prose_pass');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- The SIBLING engine fails the same way, so it stops too.
--
-- `tag_relation_verify` (mode='relations') had already written 46 proposals
-- before anyone looked at them. Read by hand, the `broader` arm — which is
-- stored child→parent — is roughly 29% correct:
--
--   * SIBLINGS asserted as parent/child: Heterosexual→Homosexual,
--     Homosexual→Bisexual, Intersex Female→Intersex Male,
--     Chastity Belt→Chastity Cage, Sub Frenzy→Dom Frenzy,
--     Smart Ass Masochist→Smart Ass Sadist, Polysexual→Omnisexual.
--   * BACKWARDS: Primal→Primal Top, Double Penetration→Triple Penetration.
--   * CLINICALLY WRONG, and the reason this could not wait:
--     `HIV Transmission → AIDS` conflates HIV with AIDS on a queer health
--     glossary. That is the exact class of harm the wrong-entity repair
--     existed to remove.
--
-- Every one of those carried confidence 1.000 — the same "confidently wrong"
-- signature as the prose judge above, from a different prompt against a
-- different table. Two independent measurements of the same lesson: a
-- self-reported confidence score cannot gate a write, and the `related` arm
-- being decent (~80%) does not redeem the `broader` arm.
--
-- Nothing was ever published: `get_tag_ontology` shows `related` only when
-- approved, and these rows are not approved. The hazard is the QUEUE — an
-- admin clicking approve on "Heterosexual is a kind of Homosexual".
--
-- The 46 rows are marked 'rejected' rather than deleted: the unique key
-- (source_tag_id, target_tag_id, relation_type) turns a rejected row into a
-- TOMBSTONE that the verifier's ignoreDuplicates upsert cannot re-propose,
-- so re-enabling the cron cannot regurgitate the same junk.
update public.tag_relations
set review_status = 'rejected'
where review_status = 'pending';

update admin_automations
set enabled = false,
    description = 'tag-enrichment-sweep mode=relations. DISABLED 2026-08-29: its broader arm measured ~29% correct on the first 46 proposals (siblings asserted as parent/child, two backwards, and HIV Transmission→AIDS), all at confidence 1.000.',
    updated_at = now()
where slug = 'tag_relation_verify';

do $$ begin
  if exists (select 1 from cron.job where jobname = 'tag_relation_verify') then
    perform cron.unschedule('tag_relation_verify');
  end if;
end $$;
