-- tag-enrichment-sweep writes to unified_tags under NO actor.
--
-- `log_unified_tag_change()` reads `app.actor` and falls back to the literal
-- 'system:trigger' when nobody declares one. Every other writer in this table
-- is attributable — 'job:tag_thin_page_reindex', 'llm:tag-prose-pass',
-- 'admin:tag-placeholder-prose-20260829', 'migration:<name>' — but
-- tag-enrichment-sweep updates `unified_tags` through PostgREST, which has no
-- way to set a session GUC, so all four of its write sites land in
-- `tag_change_log` as 'system:trigger'.
--
-- ## What that cost, concretely
--
-- On 2026-08-30 the sweep's `0 */2 * * *` cron fired at 08:00Z and wrote
-- Wikipedia extracts into nine tags. Eight are the wrong sense for a queer
-- glossary: `darkroom` got prose about processing photographic film rather
-- than a club backroom, `flint` about sedimentary rock, `villa` about a type
-- of house, and `mitte`/`friedrichshain`/`neukolln`/`schoneberg`/`steglitz`
-- got encyclopaedia geography of Berlin boroughs. Only `sexshop` was right.
-- This is the blind-resolver class that 20260921110000's header already
-- records (`bingo` -> "Bingo, Bluey's younger sister", `alkohol` -> a 1919
-- silent film, `fetisch` -> an Xmal Deutschland album).
--
-- Tracing it took two wrong attributions first, because 'system:trigger' reads
-- like a database trigger rather than a scheduled job — the writes were blamed
-- on "a concurrent session" twice before the 08:00Z timestamp matched the cron.
-- An unattributable writer does not merely lose an audit trail; it actively
-- misdirects the next investigation.
--
-- ## The door
--
-- Same shape as `tag_prose_apply` (20261012090200), for the same stated
-- reason: content writes go through ONE attributed, audited door. Declares
-- 'llm:tag-enrichment-sweep'.
--
-- Two deliberate constraints, both preserving TODAY'S behaviour rather than
-- widening it — this migration is about attribution, not about letting the
-- sweep reach further:
--
--   1. Per-kind UPDATEs, never one coalesce-everything statement.
--      `trg_search_documents_tag` is column-scoped, and a column-scoped
--      trigger fires on the columns named in the STATEMENT. A single UPDATE
--      naming every column would fire a search reindex on every row the sweep
--      merely stamps a cursor on. The column lists below are byte-for-byte the
--      ones the edge function used, including the category branch's
--      `category_id` + `category` pair, which 20261007163100 already had to
--      repair once when only `category_id` was named.
--
--   2. `human_reviewed` rows stay out of reach for content kinds. Today the
--      audit guard RAISEs on them for an undeclared 'system:%' actor, the edge
--      function's `if (!error)` swallows it, and the row is skipped. Declaring
--      an actor pierces that guard, so without this check the sweep would
--      silently GAIN the ability to overwrite human-curated tags — a strictly
--      worse outcome given what it wrote on 2026-08-30. `prose_cursor` is
--      exempt because `prose_reviewed_at` is in the guard's derived-column
--      list and works on human_reviewed rows today; blocking it would pin
--      those rows at the head of the queue forever, which is the exact bug the
--      edge function's own "stamp the cursor FIRST" comment warns about.
--
-- Sensitive/adult rows are refused for the CONTENT kinds, mirroring
-- `tag_prose_apply`: the edge function already routes them to
-- `queueDescription`, and this is defence in depth against a bug in that
-- branch.
--
--   3. `links` is deliberately EXEMPT from that refusal, and the exemption is
--      load-bearing rather than a loosening. `wikidata_id` / `wikipedia_url`
--      are IDENTITY, not content: nothing about them is rendered as prose, and
--      the review path the refusal exists to force is a prose review. A first
--      draft of this migration refused them along with the rest, which read as
--      conservative and was not — measured on prod, 1,360 of the 2,107 active
--      sensitive/adult tags carry neither identifier, 358 of them with
--      `human_reviewed = false`, i.e. writable today and written today. The
--      edge function's links branch (`if (wiki && needsLinks)`) is the ONE RPC
--      call site with no upstream `sensitive` test shadowing this refusal, so
--      the raise would have been swallowed by its `if (!e && linked)`, no
--      counter would have moved, and nothing would have been logged.
--
--      The cost is not merely that those rows stop gaining identity — which
--      also starves the weekly `tag_medical_codes_sync` and
--      `tag_wikidata_hierarchy` rebuilds, both keyed on `wikidata_id`. It is
--      that `needsLinks` stays true forever, and the batch selector orders by
--      `quality_score asc nulls first`: these rows score 10-17, so they are at
--      the HEAD of the work list and would be re-selected every two hours,
--      re-paying a Wikipedia summary plus a `wbgetentities` fetch each time,
--      forever, with zero progress. That is the `cities_due_for_refresh`
--      selector-starvation failure exactly.
--
--      Safety does not rest on this refusal anyway, and that is the real
--      argument. Adopting a wiki identity is already gated by
--      `mayAdoptWikiIdentity` — title agreement, P31 class plausibility, and
--      on a sense category (Fetishes / Gear / Slang / …) a requirement that
--      the extract corroborate the queer sense. That guard is strictly better
--      targeted than `is_adult`, because the wrong-sense risk tracks the
--      CATEGORY, not the sensitivity flag: "Vacuum Pump" under Fetishes is the
--      danger, and it is caught there whether or not the row is flagged adult.

create or replace function public.tag_enrichment_apply(
  p_tag_id uuid,
  p_kind text,
  p_category_id uuid default null,
  p_category text default null,
  p_wikidata_id text default null,
  p_wikipedia_url text default null,
  p_description text default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $fn$
declare v_row unified_tags%rowtype;
begin
  perform set_config('app.actor', 'llm:tag-enrichment-sweep', true);

  select * into v_row from unified_tags where id = p_tag_id and status = 'active';
  if not found then return false; end if;

  -- The cursor stamp is not content and must never be blocked; see note 2.
  if p_kind = 'prose_cursor' then
    update unified_tags set prose_reviewed_at = now() where id = p_tag_id;
    return true;
  end if;

  -- Content kinds only; `links` is identity and stays reachable. See note 3.
  if p_kind <> 'links' and (v_row.is_sensitive or v_row.is_adult) then
    raise exception 'tag_enrichment_apply: % is sensitive/adult — review path only', p_tag_id;
  end if;
  -- Not an error: this is the row the sweep already fails to write today.
  if v_row.human_reviewed then return false; end if;

  if p_kind = 'category' then
    update unified_tags
       set category_id = p_category_id, category = p_category
     where id = p_tag_id;
  elsif p_kind = 'links' then
    update unified_tags
       set wikidata_id = p_wikidata_id, wikipedia_url = p_wikipedia_url, updated_at = now()
     where id = p_tag_id;
  elsif p_kind = 'description' then
    update unified_tags
       set description = p_description, updated_at = now()
     where id = p_tag_id;
  else
    raise exception 'tag_enrichment_apply: unknown kind %', p_kind;
  end if;

  return true;
end;
$fn$;

comment on function public.tag_enrichment_apply(uuid, text, uuid, text, text, text, text) is
  'Attributed writer for tag-enrichment-sweep (app.actor=llm:tag-enrichment-sweep). PostgREST cannot set a session GUC, so without this the sweep''s writes log as the undeclared fallback ''system:trigger'' and misdirect any later investigation. Per-kind UPDATEs keep the column-scoped search trigger from firing on cursor stamps. Refuses sensitive/adult rows for the CONTENT kinds but NOT for ''links'' — wiki identity is not prose, adoption is already gated by mayAdoptWikiIdentity, and refusing it strands 1,360 tags at the head of a selector ordered by quality_score. Returns false on human_reviewed rows for every kind, preserving the skip the audit guard already produces. Returns true when a row was written.';

revoke all on function public.tag_enrichment_apply(uuid, text, uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.tag_enrichment_apply(uuid, text, uuid, text, text, text, text)
  to service_role;

-- Prove the door declares an actor, against the live audit trigger, and leave
-- nothing behind. A trigger that exists is not a trigger that works.
do $$
declare v_id uuid; v_actor text; v_ok boolean;
begin
  perform set_config('app.actor', 'migration:tag-enrichment-attributed-writer', true);

  insert into unified_tags (name, slug, status)
  values ('Zz Enrichment Actor Probe', 'zz-enrichment-actor-probe', 'active')
  returning id into v_id;

  v_ok := public.tag_enrichment_apply(v_id, 'description', p_description => 'Probe prose.');
  if not v_ok then raise exception 'probe: description write returned false'; end if;

  select actor into v_actor from tag_change_log
   where tag_id = v_id and (after_data->>'description') = 'Probe prose.'
   order by created_at desc limit 1;
  if v_actor is distinct from 'llm:tag-enrichment-sweep' then
    raise exception 'probe: expected actor llm:tag-enrichment-sweep, got %', coalesce(v_actor, 'NULL');
  end if;

  -- human_reviewed must be refused, not written.
  update unified_tags set human_reviewed = true where id = v_id;
  if public.tag_enrichment_apply(v_id, 'description', p_description => 'Should not land.') then
    raise exception 'probe: human_reviewed row was written';
  end if;
  if (select description from unified_tags where id = v_id) <> 'Probe prose.' then
    raise exception 'probe: human_reviewed row was modified';
  end if;

  -- A sensitive/adult row: content is refused, identity is NOT. Both halves are
  -- asserted, because each alone passes for the wrong reason — a function that
  -- refused everything would satisfy the first, and one that refused nothing
  -- would satisfy the second.
  update unified_tags
     set human_reviewed = false, is_adult = true, wikidata_id = null, wikipedia_url = null
   where id = v_id;

  begin
    perform public.tag_enrichment_apply(v_id, 'description', p_description => 'Must not land.');
    raise exception 'probe: sensitive/adult row accepted a description write';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%sensitive/adult%' then raise; end if;
  end;

  if not public.tag_enrichment_apply(
       v_id, 'links', p_wikidata_id => 'Q_PROBE', p_wikipedia_url => 'https://example.invalid/probe'
     ) then
    raise exception 'probe: sensitive/adult row refused a links write — the narrowing is back';
  end if;
  if (select wikidata_id from unified_tags where id = v_id) is distinct from 'Q_PROBE' then
    raise exception 'probe: links write returned true but wrote nothing';
  end if;

  -- human_reviewed still outranks the links exemption.
  update unified_tags set human_reviewed = true where id = v_id;
  if public.tag_enrichment_apply(v_id, 'links', p_wikidata_id => 'Q_SHOULD_NOT_LAND') then
    raise exception 'probe: human_reviewed row accepted a links write';
  end if;
  if (select wikidata_id from unified_tags where id = v_id) <> 'Q_PROBE' then
    raise exception 'probe: human_reviewed links row was modified';
  end if;

  delete from tag_change_log where tag_id = v_id;
  delete from unified_tags where id = v_id;
end $$;
