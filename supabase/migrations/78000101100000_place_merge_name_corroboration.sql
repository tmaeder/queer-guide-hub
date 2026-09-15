-- Place dedup: make "never merge two different PLACES" a CHECKED invariant.
--
-- The rule this encodes is that a merge of two place rows must be justified by a
-- real geographical signal or by the two names being the same name, and never by
-- the names merely looking alike.
--
-- THE LITERAL READING OF THAT RULE IS WRONG AND THE CORPUS PROVES IT. Measured
-- over the 332 city merges on record: 11 pairs are name-identical once case,
-- accents, spaces and punctuation are stripped, 161 are a comma qualifier
-- ("New York City, New York" against "New York City"), and 160 are genuinely
-- different STRINGS. A check that flagged those 160 would be condemning correct
-- data: 146 of them are the exonym and official-name class -- Kapstadt/Cape Town,
-- Teheran/Tehran, Venedig/Venice, Frankfurt/Frankfurt am Main -- which are the
-- same real place under another language or its full legal name, and merging them
-- is the repair, not the defect. So the invariant is about PLACES, not strings.
--
-- Corroboration is therefore four arms, in order, and arm 3 is what makes the
-- exonyms defensible: Tokyo and 東京 share no characters and share Q1490. A
-- shared Wikidata id IS the "real geographical source" the requirement asks for.
--
-- WHAT IS LEFT UNCORROBORATED IS SMALL AND WAS READ BY HAND (14 pairs):
--   * genuinely correct but unverifiable -- Venedig/Venice sits 10.6 km apart,
--     just past the gate, and the drop row carries no QID to settle it;
--     Biel/Bienne, Castellon/Castello, Frankfurt am Main have no coordinates.
--   * the real defect class -- a DISTRICT or borough merged into its parent city:
--     Harburg, Altenwerder, Altona-Ottensen, Gross Flottbek and Bergedorf into
--     Hamburg, Freisenbruch into Essen. Each moved one or two personalities.
--
-- THOSE DISTRICT MERGES ARE DELIBERATELY NOT REVERSED, and that is a finding
-- rather than an omission. A district was never a city, so unmerging does not
-- restore a correct row -- it resurrects a non-place row into the corpus, which
-- is the exact defect 74000101100000 has just finished archiving four of. Worse,
-- every one of these audits predates `schema:1`, so `unmerge_cities` cannot
-- replay the reparenting and the personalities would stay on Hamburg anyway:
-- the reversal buys a live non-city row and changes nothing else. The merge
-- already puts the district out of search and leaves "Hamburg-Altona" resolving
-- to Hamburg, while `personalities.birth_place` keeps the precise text. Leaving
-- them is the better state; what matters is that no NEW one can appear unseen.
--
-- The sweep cannot currently produce such a pair -- both city candidate
-- generators are name-identity-bound (`a.dsp = b.dsp`, or a comma-qualifier base
-- whose stripped tail must BE the country or region) -- and the 2026-08-25 batch
-- that produced these came from a hand-authored pass, not the engine. That is
-- precisely why this is a sentinel and not an engine change: the next such pass
-- is the thing to catch.

create or replace function public.place_pair_corroboration(
  p_a_name text, p_b_name text,
  p_a_qid text default null, p_b_qid text default null,
  p_a_country_id uuid default null, p_b_country_id uuid default null,
  p_a_lat numeric default null, p_a_lng numeric default null,
  p_b_lat numeric default null, p_b_lng numeric default null,
  p_a_country_name text default null, p_a_country_code text default null,
  p_a_region text default null
) returns text
language sql
stable
parallel safe
set search_path to 'public', 'extensions', 'pg_catalog'
as $function$
  select case
    -- 1. The same name once case, accents, spaces and punctuation are removed.
    --    This is the sweep's own identity key, so a pair it generates lands here.
    when public.dedup_despace(p_a_name) = public.dedup_despace(p_b_name)
      then 'name_identical'

    -- 2. A comma qualifier is not a different name. The stripped tail must BE the
    --    country or region, checked in BOTH directions because either side may be
    --    the qualified one; without that test this arm would accept
    --    "Springfield, Illinois" against "Springfield, Oregon".
    when public.dedup_despace(regexp_replace(p_a_name, '\s*,\s*[^,]+$', ''))
       = public.dedup_despace(regexp_replace(p_b_name, '\s*,\s*[^,]+$', ''))
     and case
           -- Both sides qualified: the qualifiers must agree, either literally or
           -- by both naming the shared geography ("Vienna, Austria"/"Vienna, AT").
           -- A plain OR here is WRONG and the dry run caught it: it let side A's
           -- own tail vouch for the pair, so "Springfield, Illinois" collapsed
           -- into "Springfield, Oregon" -- two towns 3,000 km apart.
           when p_a_name like '%,%' and p_b_name like '%,%'
             then public.dedup_despace(regexp_replace(p_a_name, '^.*,\s*', ''))
                = public.dedup_despace(regexp_replace(p_b_name, '^.*,\s*', ''))
               or (public.dedup_despace(regexp_replace(p_a_name, '^.*,\s*', '')) in (
                     public.dedup_despace(coalesce(p_a_country_name, '')),
                     lower(coalesce(p_a_country_code, '')),
                     public.dedup_despace(coalesce(p_a_region, '')))
                   and public.dedup_despace(regexp_replace(p_b_name, '^.*,\s*', '')) in (
                     public.dedup_despace(coalesce(p_a_country_name, '')),
                     lower(coalesce(p_a_country_code, '')),
                     public.dedup_despace(coalesce(p_a_region, ''))))
           -- Exactly one side qualified: its tail must BE the shared geography.
           when p_a_name like '%,%'
             then public.dedup_despace(regexp_replace(p_a_name, '^.*,\s*', '')) in (
                    public.dedup_despace(coalesce(p_a_country_name, '')),
                    lower(coalesce(p_a_country_code, '')),
                    public.dedup_despace(coalesce(p_a_region, '')))
           when p_b_name like '%,%'
             then public.dedup_despace(regexp_replace(p_b_name, '^.*,\s*', '')) in (
                    public.dedup_despace(coalesce(p_a_country_name, '')),
                    lower(coalesce(p_a_country_code, '')),
                    public.dedup_despace(coalesce(p_a_region, '')))
           -- Neither qualified: base equality is name equality, already arm 1.
           else false
         end
      then 'comma_qualifier'

    -- 3. A shared Wikidata id decides identity from a real geographical source,
    --    and is the ONLY arm that can vouch for an exonym pair.
    when p_a_qid is not null and p_b_qid is not null and p_a_qid = p_b_qid
      then 'wikidata'

    -- 4. Same country and inside 10 km -- the gate the sweep itself applies.
    --    Both country ids null means the scope is not expressible (countries have
    --    no parent), so distance alone decides there rather than the arm dying.
    when p_a_lat is not null and p_b_lat is not null
     and ((p_a_country_id is null and p_b_country_id is null)
          or p_a_country_id = p_b_country_id)
     and public.haversine_m(p_a_lat, p_a_lng, p_b_lat, p_b_lng) < 10000
      then 'geo'

    else 'none'
  end
$function$;

comment on function public.place_pair_corroboration(text, text, text, text, uuid, uuid,
  numeric, numeric, numeric, numeric, text, text, text) is
  'Why a pair of place rows may be treated as one place: name_identical, comma_qualifier, wikidata, geo, or none. One definition shared by the sentinel and any future writer, so the two cannot measure different sets.';

-- ---------------------------------------------------------------------------
-- Sentinel
-- ---------------------------------------------------------------------------
--
-- STANDALONE, not a new key on an existing signals function: those bodies are
-- long CREATE OR REPLACE statements and adding a counter to one is a merge
-- collision surface -- the same reason tag_merge_graph_signals, venue_dup_signals
-- and news_image_signals are each their own function.
--
-- It reports what it SCANNED separately from what it found, because an empty
-- queue, a revoked grant and a clean corpus otherwise all return the same
-- reassuring zero. Measured when this shipped: the queue holds no open row for
-- any of the three place types (city is 158 approved / 124 rejected, all
-- decided), countries and villages have never been merged at all, and
-- entity_merge_audit holds no place rows -- so the merge arm is cities-only and
-- says so rather than implying a coverage it does not have.
--
-- Every coordinate is cast explicitly: `queer_villages` stores lat/lng as double
-- precision while `cities` and `countries` use numeric, and haversine_m takes
-- numeric -- so the village branch alone failed to resolve the call. The casts
-- are on all four call sites, not just the one that broke, so a later column
-- type change cannot silently take one arm out.
create or replace function public.place_merge_name_signals()
returns jsonb
language plpgsql
security definer
stable
set search_path to 'public', 'extensions', 'pg_catalog'
as $function$
declare
  v_queue_scanned  int := 0;
  v_sugg           int := 0;
  v_sugg_ex        text[] := '{}';
  v_merges         int := 0;
  v_merged_unc     int := 0;
  v_merged_ex      text[] := '{}';
begin
  -- SUGGESTIONS -- open review rows for the three place types. This is the
  -- zero-invariant: a queued pair IS a suggestion to a human, which is the thing
  -- that must never pair two different places.
  with q as (
    select public.place_pair_corroboration(
             a.name, b.name, a.wikidata_qid, b.wikidata_qid,
             a.country_id, b.country_id,
             a.latitude::numeric, a.longitude::numeric,
             b.latitude::numeric, b.longitude::numeric,
             co.name, co.code, a.region_name) as corr,
           a.name as a_name, b.name as b_name
      from public.dedup_review_queue d
      join public.cities a on a.id = d.keep_id
      join public.cities b on b.id = d.drop_id
      left join public.countries co on co.id = a.country_id
     where d.entity_type = 'city' and d.status = 'open'
    union all
    select public.place_pair_corroboration(
             a.name, b.name, null, null, null, null,
             a.latitude::numeric, a.longitude::numeric,
             b.latitude::numeric, b.longitude::numeric,
             a.name, a.code, null),
           a.name, b.name
      from public.dedup_review_queue d
      join public.countries a on a.id = d.keep_id
      join public.countries b on b.id = d.drop_id
     where d.entity_type = 'country' and d.status = 'open'
    union all
    select public.place_pair_corroboration(
             a.name, b.name, null, null, a.country_id, b.country_id,
             a.latitude::numeric, a.longitude::numeric,
             b.latitude::numeric, b.longitude::numeric,
             null, null, null),
           a.name, b.name
      from public.dedup_review_queue d
      join public.queer_villages a on a.id = d.keep_id
      join public.queer_villages b on b.id = d.drop_id
     where d.entity_type = 'queer_village' and d.status = 'open'
  )
  select count(*),
         count(*) filter (where corr = 'none'),
         coalesce(array_agg(a_name || ' <=> ' || b_name) filter (where corr = 'none'), '{}')
    into v_queue_scanned, v_sugg, v_sugg_ex
    from q;

  -- MERGES on record. Advisory and non-zero by design: the residue is the
  -- unverifiable-but-correct rows and the district class named in this file's
  -- header, neither of which a count can resolve. Gating it would ship red on
  -- arrival, which is the cry-wolf shape already removed once from the dedup
  -- backlog rule, so the health script warns at the baseline and fails on GROWTH.
  with m as (
    select public.place_pair_corroboration(
             k.name, d.name, k.wikidata_qid, d.wikidata_qid,
             k.country_id, d.country_id,
             k.latitude::numeric, k.longitude::numeric,
             d.latitude::numeric, d.longitude::numeric,
             co.name, co.code, k.region_name) as corr,
           k.name as a_name, d.name as b_name
      from public.city_merge_audit a
      join public.cities k on k.id = a.keep_id
      join public.cities d on d.id = a.drop_id
      left join public.countries co on co.id = k.country_id
     where a.undone_at is null
  )
  select count(*),
         count(*) filter (where corr = 'none'),
         coalesce(array_agg(a_name || ' <=> ' || b_name) filter (where corr = 'none'), '{}')
    into v_merges, v_merged_unc, v_merged_ex
    from m;

  return jsonb_build_object(
    'probe_ok', true,
    'types_checked', jsonb_build_array('city', 'country', 'queer_village'),
    'queue_rows_scanned', v_queue_scanned,
    'suggested_uncorroborated', v_sugg,
    'suggested_examples', to_jsonb(v_sugg_ex),
    'merges_total', v_merges,
    'merged_uncorroborated', v_merged_unc,
    'merged_examples', to_jsonb(v_merged_ex)
  );
end
$function$;

comment on function public.place_merge_name_signals() is
  'Place dedup name/geography corroboration. suggested_uncorroborated is a zero-invariant; merged_uncorroborated is an advisory baseline that must not grow.';

revoke all on function public.place_merge_name_signals() from public, anon, authenticated;
grant execute on function public.place_merge_name_signals() to service_role;

-- ---------------------------------------------------------------------------
-- Postconditions
-- ---------------------------------------------------------------------------
--
-- SOFT ON PRECONDITIONS, HARD ON POSTCONDITIONS. Nothing here asserts a live
-- COUNT: a concurrent sweep may legitimately queue a pair between authoring and
-- CI, and aborting on that would fail `db push` on main and take every migration
-- queued behind it. What is asserted is that the rule BEHAVES -- on real pairs
-- read out of this corpus -- and that the sentinel runs and answers.
do $verify$
declare
  v jsonb;
  v_got text;
begin
  -- Arm 1. The sweep's own key: the one live city candidate pair.
  v_got := public.place_pair_corroboration('Aguascalientes', 'Aguas Calientes');
  if v_got <> 'name_identical' then
    raise exception 'arm 1 (name_identical) returned % for Aguascalientes/Aguas Calientes', v_got;
  end if;

  -- Arm 2, and it must hold in BOTH directions -- either side may be qualified.
  v_got := public.place_pair_corroboration('New York City', 'New York City, New York',
             null, null, null, null, null, null, null, null, 'United States', 'US', 'New York');
  if v_got <> 'comma_qualifier' then
    raise exception 'arm 2 (comma_qualifier) returned % with the qualifier on the RIGHT', v_got;
  end if;
  v_got := public.place_pair_corroboration('New York City, New York', 'New York City',
             null, null, null, null, null, null, null, null, 'United States', 'US', 'New York');
  if v_got <> 'comma_qualifier' then
    raise exception 'arm 2 (comma_qualifier) returned % with the qualifier on the LEFT', v_got;
  end if;

  -- Arm 2 must NOT collapse two different Springfields: same base, but the tail
  -- is a region neither row belongs to. This is the whole reason for the tail test.
  v_got := public.place_pair_corroboration('Springfield, Illinois', 'Springfield, Oregon',
             null, null, null, null, null, null, null, null, 'United States', 'US', 'Illinois');
  if v_got = 'comma_qualifier' then
    raise exception 'arm 2 collapsed two different Springfields';
  end if;

  -- Both qualified, qualifiers equivalent: still one place. This is the positive
  -- control for the branch the Springfield case only exercises by REFUSING it.
  v_got := public.place_pair_corroboration('Vienna, Austria', 'Vienna, AT',
             null, null, null, null, null, null, null, null, 'Austria', 'AT', null);
  if v_got <> 'comma_qualifier' then
    raise exception 'arm 2 refused two equivalent qualifiers, returned %', v_got;
  end if;

  -- Arm 3. Different strings, one place, settled by a real geographical source.
  v_got := public.place_pair_corroboration('Tokyo', '東京', 'Q1490', 'Q1490');
  if v_got <> 'wikidata' then
    raise exception 'arm 3 (wikidata) returned % for Tokyo/東京 on a shared Q1490', v_got;
  end if;

  -- Arm 4, and its refusal. Same coordinates corroborate; 262 km apart does not.
  v_got := public.place_pair_corroboration('A', 'B', null, null,
             '00000000-0000-0000-0000-000000000001'::uuid,
             '00000000-0000-0000-0000-000000000001'::uuid,
             52.3759, 9.7320, 52.3800, 9.7400);
  if v_got <> 'geo' then
    raise exception 'arm 4 (geo) returned % for two points ~600 m apart', v_got;
  end if;
  v_got := public.place_pair_corroboration('Hannover', 'Hanover', null, null,
             '00000000-0000-0000-0000-000000000001'::uuid,
             '00000000-0000-0000-0000-000000000001'::uuid,
             52.3759, 9.7320, 50.1109, 8.6821);
  if v_got <> 'none' then
    raise exception 'Hannover/Hanover 262 km apart returned % -- it must not corroborate', v_got;
  end if;

  -- The district class this file declines to reverse must READ as uncorroborated,
  -- or the sentinel would be blind to the very defect it exists to catch.
  v_got := public.place_pair_corroboration('Hamburg', 'Hamburg-Altona');
  if v_got <> 'none' then
    raise exception 'Hamburg/Hamburg-Altona returned % -- a district must not corroborate', v_got;
  end if;

  -- The sentinel runs, answers, and reports what it scanned.
  v := public.place_merge_name_signals();
  if coalesce((v->>'probe_ok')::boolean, false) is not true then
    raise exception 'place_merge_name_signals did not report probe_ok';
  end if;
  if jsonb_array_length(v->'types_checked') <> 3 then
    raise exception 'place_merge_name_signals checked % place types, expected 3',
      jsonb_array_length(v->'types_checked');
  end if;
  if (v->>'merges_total') is null or (v->>'merges_total')::int = 0 then
    raise exception 'place_merge_name_signals reports zero merges -- it is measuring nothing';
  end if;
  if (v->>'suggested_uncorroborated') is null then
    raise exception 'place_merge_name_signals has no suggested_uncorroborated key';
  end if;

  raise notice 'place corroboration: % merges, % uncorroborated; queue scanned %, % uncorroborated',
    v->>'merges_total', v->>'merged_uncorroborated',
    v->>'queue_rows_scanned', v->>'suggested_uncorroborated';
end
$verify$;
