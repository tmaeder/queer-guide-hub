-- Finish the matrix attribution fix: delete the false scalar, attribute each cell.
--
-- WHAT `20261202100000` ALREADY DID, and this does not repeat. It added the
-- derived `sources` array and the page now credits all three bodies in its
-- footer. That was the user-visible half and it is live and correct — measured
-- on prod: `sources` returns tripsit / eve&rave Substanzhandbuch / FDA label
-- with their real URLs.
--
-- WHAT IT LEFT BEHIND, which is why this exists. Two things, both measured on
-- prod today:
--
--   1. The top-level `source` / `source_url` keys are STILL THERE and still
--      return the literals 'tripsit' and 'https://combo.tripsit.me/'. They were
--      marked `@deprecated Kept for one release` in the TypeScript, but a
--      deprecation comment is not a guard: the RPC is a public,
--      anon-executable API, and any caller reading `.source` today gets a
--      single-source answer for a corpus where **55 of 476 rows are not that
--      source**. The footer no longer reads it; the false claim is still
--      shipped.
--
--   2. `cells_without_source` measured **476 of 476** — not one cell carries
--      provenance. The footer can say the grid draws on three bodies, but
--      nothing can say WHICH body rated the cell a reader is looking at. The
--      per-tag band has had this since day one (`get_substance_interactions`
--      returns source per row); the grid is the surface that never did.
--
-- The rule being finished is the one the schema migration wrote down in its own
-- header: *"ATTRIBUTION IS A COLUMN, NOT A FOOTNOTE."* A footnote listing three
-- names over an unattributed grid is closer to that rule than one wrong name,
-- but it is still a footnote.
--
-- REMOVING THE SCALARS NOW RATHER THAN AFTER "ONE RELEASE". The deprecation
-- window exists to protect consumers; there is exactly one
-- (`src/pages/SubstanceInteractionsPage.tsx`), it already prefers `sources`,
-- and its fallback to the scalars is removed in this same change. Keeping a
-- known-false value in a safety API to be polite to a caller that no longer
-- reads it trades a real misattribution for an imaginary compatibility.
--
-- `sources` is computed over the SAME filtered set as `cells` — the matrix only
-- includes a pair when both tags are active, so a source whose every row is
-- filtered out must not be credited under a grid showing none of its data.
-- Deriving it from the table rather than the join would do exactly that.

CREATE OR REPLACE FUNCTION public.substance_interaction_matrix()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  with involved as (
    select distinct t.id, t.slug, t.name
      from public.unified_tags t
      join public.substance_interactions i on i.tag_a_id = t.id or i.tag_b_id = t.id
     where t.status = 'active'
  ),
  -- The cells the grid will actually render. `cells` and `sources` both read
  -- from THIS, so the credit can never name a source whose rows were filtered
  -- out of the payload.
  shown as (
    select i.tag_a_id, i.tag_b_id, i.status, i.note, i.source, i.source_url
      from public.substance_interactions i
      join involved ia on ia.id = i.tag_a_id
      join involved ib on ib.id = i.tag_b_id
  )
  select jsonb_build_object(
    'axis', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'slug', slug, 'name', name)
                                       order by name) from involved), '[]'::jsonb),
    'cells', coalesce((select jsonb_agg(jsonb_build_object(
                'a', s.tag_a_id, 'b', s.tag_b_id, 'status', s.status,
                'severity', public.substance_interaction_rank(s.status),
                'note', s.note,
                -- Per-cell provenance: which body rated THIS pair.
                'source', s.source,
                'source_url', s.source_url))
              from shown s), '[]'::jsonb),
    -- Most-cited first, with the count carried so a source contributing one row
    -- is not presented as an equal partner to one contributing 421.
    'sources', coalesce((select jsonb_agg(jsonb_build_object(
                'source', src, 'source_url', src_url, 'cells', n)
                order by n desc, src)
              from (
                select s.source as src, min(s.source_url) as src_url, count(*) as n
                  from shown s group by s.source
              ) agg), '[]'::jsonb)
    -- NO top-level 'source'/'source_url'. A single provenance cannot be stated
    -- for a multi-source grid, so the key that invited it is gone.
  );
$fn$;

COMMENT ON FUNCTION public.substance_interaction_matrix() IS
  'Whole interaction grid in one round trip. Every cell carries its own source/source_url; the top-level `sources` array is derived from the cells actually returned. Deliberately has NO single top-level source key — the corpus is multi-source and stating one provenance for the grid misattributes the others.';

DO $verify$
DECLARE
  v          jsonb;
  v_cells    int;
  v_nosrc    int;
  v_srcs     int;
  v_distinct int;
BEGIN
  v := public.substance_interaction_matrix();

  -- The false keys must be GONE, not merely unread.
  IF v ? 'source' OR v ? 'source_url' THEN
    RAISE EXCEPTION 'substance_interaction_matrix still exposes a single top-level source key';
  END IF;
  IF NOT (v ? 'sources') THEN
    RAISE EXCEPTION 'substance_interaction_matrix is missing the derived sources array';
  END IF;

  v_cells := jsonb_array_length(v->'cells');
  IF v_cells = 0 THEN
    RAISE EXCEPTION 'substance_interaction_matrix returned no cells';
  END IF;

  -- Every cell attributed. The columns are NOT NULL, so a null here would mean
  -- the payload dropped the field, not that the data lacks it.
  SELECT count(*) INTO v_nosrc
    FROM jsonb_array_elements(v->'cells') c
   WHERE nullif(c->>'source', '') IS NULL OR nullif(c->>'source_url', '') IS NULL;
  IF v_nosrc > 0 THEN
    RAISE EXCEPTION '% of % matrix cells carry no source attribution', v_nosrc, v_cells;
  END IF;

  -- `sources` must agree with the cells it summarises. Asserted as a
  -- RELATIONSHIP, not a count: prod holds three sources today, but a replay
  -- from scratch reaches this file with only the tripsit import applied and a
  -- hardcoded 3 would fail for a reason unrelated to this change.
  v_srcs := jsonb_array_length(v->'sources');
  SELECT count(DISTINCT c->>'source') INTO v_distinct FROM jsonb_array_elements(v->'cells') c;
  IF v_srcs <> v_distinct THEN
    RAISE EXCEPTION 'sources lists % entries but the cells contain % distinct sources', v_srcs, v_distinct;
  END IF;

  IF (SELECT sum((s->>'cells')::int) FROM jsonb_array_elements(v->'sources') s) <> v_cells THEN
    RAISE EXCEPTION 'sources cell counts do not sum to the % cells returned', v_cells;
  END IF;
END
$verify$;
