-- Two position tags published the bulk-import stamp as their definition, and
-- that is what has been blocking every deploy since 07:43 today.
--
-- `20261023100100_sex_positions_import` asserts that no tag filed under
-- `sex-positions` carries a missing or placeholder description, and aborts the
-- whole push when one does:
--
--   ERROR: 2 position tags have a missing or placeholder description (P0001)
--
-- The assertion is right and is left alone. `double-penetration` and
-- `triple-penetration` both carried the literal string "Sexual activity tag"
-- (19 chars) — the same bulk-import stamp `placeholder_description_active`
-- counts across the corpus. A stamp is worse than an empty column: it reads as
-- content, so it satisfies `indexable_without_description` and ships to a
-- reader as the lead paragraph of a public page.
--
-- Fixing the data rather than lowering the bar is the whole point. Relaxing the
-- length check would let the import proceed and publish both stamps.
--
-- Voice follows `_shared/tag-style.ts`: direct, frank about sexual terms, no
-- euphemism, no second person, and NO consent boilerplate — where the risk is
-- genuinely part of the term it is stated as a specific clause instead. Both
-- entries name the mechanical constraint (the receiving partner cannot easily
-- withdraw) because that is act-specific and load-bearing, not generic padding.
--
-- Guarded to a no-op if the prose has since been written: only rows still at
-- the placeholder are touched, so a re-run cannot overwrite curated text.

do $$
declare
  v_updated int;
  v_bad     int;
begin
  perform set_config('app.actor', 'migration:20261023110000_position_placeholders', true);

  update public.unified_tags
     set description = 'Two partners penetrating the same person at the same time, either in separate openings or both in one. It needs far more lubricant than either act alone, and the receiving partner cannot easily pull away, so pace is set by them.',
         updated_at  = now()
   where slug = 'double-penetration'
     and (description is null or length(description) < 40);
  get diagnostics v_updated = row_count;
  raise notice 'double-penetration: % row(s) updated', v_updated;

  update public.unified_tags
     set description = 'Three points of penetration on one person at once, most often two in one opening plus a third elsewhere. It is uncommon in practice and demanding on the receiving partner, who has the least room to move and therefore sets the pace.',
         updated_at  = now()
   where slug = 'triple-penetration'
     and (description is null or length(description) < 40);
  get diagnostics v_updated = row_count;
  raise notice 'triple-penetration: % row(s) updated', v_updated;

  -- The same predicate 20261023100100 aborts on. Asserting it here means this
  -- migration fails loudly if a THIRD position tag is still on a stamp, rather
  -- than leaving the next deploy to discover it.
  select count(*) into v_bad
    from public.unified_tags t
    join public.tag_categories c on c.id = t.category_id
   where c.slug = 'sex-positions'
     and (t.description is null or length(t.description) < 40);

  if v_bad > 0 then
    raise exception
      'still % position tag(s) on a placeholder description — the import migration will abort again', v_bad;
  end if;

  raise notice 'sex-positions: 0 placeholder descriptions remain';
end $$;
