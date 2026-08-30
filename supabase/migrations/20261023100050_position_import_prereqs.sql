-- Both preconditions `20261023100100_sex_positions_import` asserts, satisfied
-- before it runs. It has been failing every deploy since 07:43.
--
-- THE VERSION IS THE WHOLE POINT. A first attempt at this shipped as
-- `20261023110000`, which sorts AFTER the import — so the import still ran
-- first, still asserted on data nothing had fixed yet, and still aborted. A
-- prerequisite migration has to sit between the applied `20261023100000` (the
-- stop) and the `...100100` import that depends on it. Hence `...100050`.
--
-- ── 1. two placeholder descriptions ───────────────────────────────────────
--
--   ERROR: 2 position tags have a missing or placeholder description (P0001)
--
-- `double-penetration` and `triple-penetration` both held the literal string
-- "Sexual activity tag" (19 chars) — the bulk-import stamp that
-- `placeholder_description_active` counts. A stamp is worse than an empty
-- column: it reads as content, so it satisfies `indexable_without_description`
-- and ships to a reader as the lead paragraph of a public page.
--
-- Voice follows `_shared/tag-style.ts`: frank, no euphemism, no second person,
-- and NO consent boilerplate — that file bans it explicitly, so each entry
-- states the one act-specific mechanical constraint instead.
--
-- ── 2. four wikidata identifiers ──────────────────────────────────────────
--
--   ERROR: 4 position tags carry a wikidata_id (P0001)
--
-- The import's own header note 4 sets the policy: position names are "exactly
-- the namesake bait that put Cassia fistula on golden-shower and Q4 (death) on
-- passing", and `tag_medical_codes_sync` / `tag_wikidata_hierarchy` rebuild
-- weekly FROM that identifier, so a plausible-but-wrong QID regenerates wrong
-- data forever while a null one regenerates nothing. The assertion covers the
-- whole category, so it catches four rows the stop migration refiled in.
--
-- Two are demonstrably the documented failure, which is why the policy is not
-- over-broad here:
--
--   69                  -> en.wikipedia.org/wiki/69          the NUMBER
--   triple-penetration  -> en.wikipedia.org/wiki/Sex_position the GENERIC article
--   doggy-style         -> /wiki/Doggy_style                  correct today
--   double-penetration  -> Q1243210, no article at all        unverifiable
--
-- All four are cleared, including `doggy-style`, whose link is right today.
-- That is the author's policy applied as written rather than second-guessed:
-- the value of a null here is that the weekly rebuilds regenerate nothing, and
-- one correct link is not worth re-opening the door that produced the other
-- three. None of the four carries a `tag_medical_codes` row, so nothing
-- downstream is orphaned by this.
--
-- The prior values are preserved in `tag_change_log` by the existing audit
-- trigger (this sets `app.actor`, so the write is attributed rather than
-- rejected as `system:%` on a human_reviewed row).
--
-- Guarded throughout: only rows still in the bad state are touched, so a
-- re-run cannot overwrite curated prose or re-clear a relinked identifier.
-- Both of the import's predicates are re-asserted at the end, so a third
-- stamped row or a fifth identifier fails HERE, loudly, instead of in the
-- next deploy.

do $$
declare
  v_updated int;
  v_bad     int;
begin
  perform set_config('app.actor', 'migration:20261023100050_position_import_prereqs', true);

  -- ── 1. descriptions ─────────────────────────────────────────────────────
  update public.unified_tags
     set description = 'Two partners penetrating the same person at the same time, either in separate openings or both in one. It needs far more lubricant than either act alone, and the receiving partner cannot easily pull away, so pace is set by them.',
         updated_at  = now()
   where slug = 'double-penetration'
     and (description is null or length(description) < 40);
  get diagnostics v_updated = row_count;
  raise notice 'double-penetration: % row(s)', v_updated;

  update public.unified_tags
     set description = 'Three points of penetration on one person at once, most often two in one opening plus a third elsewhere. It is uncommon in practice and demanding on the receiving partner, who has the least room to move and therefore sets the pace.',
         updated_at  = now()
   where slug = 'triple-penetration'
     and (description is null or length(description) < 40);
  get diagnostics v_updated = row_count;
  raise notice 'triple-penetration: % row(s)', v_updated;

  -- ── 2. identifiers ──────────────────────────────────────────────────────
  update public.unified_tags t
     set wikidata_id   = null,
         wikipedia_url = null,
         updated_at    = now()
    from public.tag_categories c
   where c.id = t.category_id
     and c.slug = 'sex-positions'
     and t.wikidata_id is not null;
  get diagnostics v_updated = row_count;
  raise notice 'cleared wikidata identifiers on % position tag(s)', v_updated;

  -- ── 3. the import's own predicates, asserted here ───────────────────────
  select count(*) into v_bad
    from public.unified_tags t
    join public.tag_categories c on c.id = t.category_id
   where c.slug = 'sex-positions'
     and (t.description is null or length(t.description) < 40);
  if v_bad > 0 then
    raise exception 'still % position tag(s) on a placeholder description', v_bad;
  end if;

  select count(*) into v_bad
    from public.unified_tags t
    join public.tag_categories c on c.id = t.category_id
   where c.slug = 'sex-positions' and t.wikidata_id is not null;
  if v_bad > 0 then
    raise exception 'still % position tag(s) carrying a wikidata_id', v_bad;
  end if;

  raise notice 'position import prerequisites satisfied';
end $$;
