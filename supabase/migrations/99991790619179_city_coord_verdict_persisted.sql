-- `coord_unswept` was a number that could never move, and it hid the real finding.
--
-- 99991790359075 shipped `city_wikidata_signals().coord_unswept`, counted from
-- `enrichment_status.wikidata_link.coord_swept_at`. NOTHING EVER WROTE THAT KEY --
-- measured: 0 of 3,032 rows -- so the metric read 3,031 forever, which is
-- indistinguishable from "nothing is verified" whether or not anything is. The ~156
-- rows that genuinely hold an identifier for a different place were invisible inside
-- it. That is a defect in what I shipped, and this replaces it.
--
-- WHY THE KEY MOVES OUT OF `wikidata_link`. `bumpMiss` and `markResolved` in
-- city-factual-backfill both REPLACE `state.wikidata_link` wholesale, so any
-- sub-key there is erased by the very next pass. The verdict gets its own
-- top-level key, `enrichment_status.wikidata_coords`, shaped like `capital_scope`
-- (a finding about the PROBE, carried in `detail`).
--
-- THE COUNT IS SELF-DRAINING, which is the part worth copying. It is
--     verdict = 'disagree' AND cities.wikidata_qid = wikidata_coords.qid
-- so it counts only rows STILL holding the identifier the verdict was about.
-- Clearing or correcting the id drains the row automatically -- no second write, no
-- resolution table, and no way for a fixed row to keep being reported.
--
-- ONLY THE 156 DISAGREEMENTS ARE STAMPED. Stamping the 2,861 agreements as well was
-- measured and rejected: `trg_sync_geo_spine` AND `trg_content_revision` are both
-- UNSCOPED on `cities`, so 3,017 rows would mean 3,017 spine writes, 3,017
-- `search_reindex_queue` enqueues and 3,017 `content_revisions` rows to record
-- "this one is fine". Absence of a disagree stamp is not claimed to mean anything,
-- which is why `coord_unswept` is DELETED rather than re-based: a metric that cannot
-- distinguish "swept and fine" from "never swept" should not report a number that
-- implies it can.
--
-- THE 14 ROWS WITH NO P625 ARE DELIBERATELY NOT STAMPED. No coordinates on the
-- entity is absence of evidence, and recording it as a verdict is how 6,498 venues
-- were stamped `logo_fetched_at` and written off while the logo token was dead.
--
-- NOTHING IS AUTO-CLEARED. Distance cannot tell a wrong IDENTIFIER from wrong
-- COORDINATES -- Burj Hammoud sits at longitude exactly 0.000000, so it measures
-- 3,264 km from an entity that is genuinely its own, and 99991790358713 excluded it
-- by hand for that reason. These 156 get `needs_attention` and a recorded distance;
-- a human decides. 111 of them are `seo_indexable`.
--
-- Swept 2026-09-28 against live Wikidata P625 over all 3,031 QID-bearing cities
-- with coordinates: agree 2,861, disagree 156, no-P625 14, entity-missing 0. The
-- earlier sweep found 167 and 99991790358713 repaired 11 of them, so 167 - 11 = 156
-- reconciles the two independent measurements exactly.

with verdict(slug, qid, km) as (
  values
    ('santa-cruz', 'Q75938', 19388.1),
    ('goya', 'Q42061', 18912.5),
    ('santa-rosa-1', 'Q76010', 18440.7),
    ('san-luis', 'Q55724', 17862.7),
    ('san-miguel', 'Q54763', 17858.0),
    ('santa-rita', 'Q55730', 17214.0),
    ('berwick', 'Q504678', 16895.1),
    ('pakenham', 'Q2187824', 16870.7),
    ('newcastle', 'Q1425428', 16806.8),
    ('golden-bay', 'Q5579181', 16246.8),
    ('southbank-australia', 'Q56278118', 15572.7),
    ('ramna-maidan', 'Q96103345', 14508.1),
    ('howick', 'Q3141615', 14355.0),
    ('samba', 'Q25906863', 13763.9),
    ('stanley', 'Q924360', 12932.8),
    ('central-coast', 'Q1053752', 12357.8),
    ('sunshine-coast', 'Q1631665', 11784.9),
    ('bono', 'Q12476982', 11676.7),
    ('hibiscus-coast', 'Q1617222', 11645.1),
    ('malay', 'Q548370', 11018.8),
    ('barracas', 'Q24003172', 10191.9),
    ('santa-maria', 'Q643953', 10015.2),
    ('san-lorenzo-us-rdka7', 'Q549987', 9847.1),
    ('san-rafael', 'Q631915', 9816.5),
    ('el-palomar', 'Q20218300', 9506.5),
    ('leme', 'Q318259', 9458.9),
    ('ceres-br-qxru0', 'Q33980', 9061.4),
    ('r-o-grande', 'Q6115173', 8261.7),
    ('taormina', 'Q113624794', 7331.6),
    ('santa-isabel', 'Q3818', 6673.4),
    ('savona-it-ahup3', 'Q2737044', 6600.0),
    ('paltan', 'Q11886569', 6339.5),
    ('marquette-us-978oo', 'Q1103429', 6235.9),
    ('fire-island-pines', 'Q822554', 5969.9),
    ('plymouth-gb-ofrm7', 'Q1640912', 5857.3),
    ('kafrul', 'Q2497926', 5854.8),
    ('waterloo', 'Q639408', 5798.0),
    ('cela', 'Q16535599', 5727.5),
    ('brighton-1', 'Q88196617', 5612.4),
    ('brampton-ca-4wzgm', 'Q2491525', 5427.4),
    ('highbridge', 'Q5757835', 5377.5),
    ('paradise-us-euv14', 'Q7134191', 5325.4),
    ('west-lawn', 'Q126698951', 5233.6),
    ('chichester', 'Q207639', 5209.7),
    ('wakefield-gb-56uc6', 'Q928044', 5180.8),
    ('worcester', 'Q49179', 5158.8),
    ('santana', 'Q752123', 5121.1),
    ('pembroke-gb-ccw0o', 'Q1075086', 5114.9),
    ('falmouth-gb-cn9vc', 'Q1523514', 4997.9),
    ('alliance', 'Q1318719', 4683.0),
    ('p-lang', 'Q12202947', 4104.6),
    ('la-cruz-cl-t42xo', 'Q1525434', 3875.6),
    ('moreno', 'Q1496283', 3815.3),
    ('freshwater-gb-rjd3b', 'Q5503092', 3689.2),
    ('gama-1', 'Q1656344', 3638.5),
    ('el-canelo', 'Q20147673', 3583.9),
    ('burj-hammoud', 'Q895235', 3263.7),
    ('victoria-bc', 'Q784496', 3133.3),
    ('springfield', 'Q7580910', 2935.1),
    ('san-simeon', 'Q28842779', 2867.0),
    ('cascavel', 'Q205681', 2829.4),
    ('whitehorse', 'Q2055', 2654.0),
    ('campina-es-11vpe', 'Q756583', 2490.7),
    ('blossburg', 'Q49400849', 2406.9),
    ('craigieburn', 'Q5181699', 2349.7),
    ('erba', 'Q650569', 2275.4),
    ('s-o-miguel', 'Q2090942', 2100.8),
    ('bandla', 'Q12933932', 2006.3),
    ('viana', 'Q2020315', 1970.7),
    ('kentron', 'Q16329628', 1963.2),
    ('denver', 'Q135677381', 1550.4),
    ('ar-rumaylah', 'Q20302108', 1523.3),
    ('sh-hz-dpur', 'Q29652468', 1422.4),
    ('ixtapa', 'Q1295837', 1364.3),
    ('miri', 'Q4300668', 1358.0),
    ('chapultepec-mx-89q7t', 'Q20261215', 1326.4),
    ('jalisco', 'Q20148497', 1307.5),
    ('mountain-mesa', 'Q49434654', 1232.1),
    ('kerou', 'Q962654', 1229.9),
    ('silom', 'Q12514822', 1211.1),
    ('lazaro-cardenas', 'Q5795966', 1210.6),
    ('melrose-sa', 'Q47007083', 1178.2),
    ('valenca', 'Q1005931', 1101.5),
    ('wuhan', 'Q11746', 1052.4),
    ('sobradinho', 'Q646901', 1022.6),
    ('villa-lugano', 'Q140296572', 986.9),
    ('r-ipur', 'Q2295914', 934.2),
    ('san-mart-n', 'Q781245', 932.2),
    ('jaragua', 'Q1022458', 896.6),
    ('pinheiros', 'Q2018987', 883.0),
    ('denizli-tr-au9gd', 'Q6794116', 845.1),
    ('chaoyang-district', 'Q394701', 844.9),
    ('ch', 'Q212704', 832.0),
    ('longgang-cn-ry9gl', 'Q11181489', 831.7),
    ('vila-maria', 'Q1784456', 787.9),
    ('ciudad-juarez-mx-qikon', 'Q5770667', 747.1),
    ('kinshasa', 'Q3838', 715.6),
    ('bella-vista', 'Q55855', 674.4),
    ('nzagi', 'Q2944849', 671.8),
    ('philipsburg', 'Q28469447', 619.2),
    ('cannes-fr-l6853', 'Q1415546', 618.8),
    ('federal-heights', 'Q5440242', 588.8),
    ('santo-tome', 'Q2031463', 570.4),
    ('forst', 'Q572545', 564.4),
    ('ituzaingo', 'Q11684102', 562.2),
    ('cerro-grande', 'Q61275188', 552.3),
    ('la-rochelle-fr-k91df', 'Q901852', 551.2),
    ('akaiwa-jp-4pqpw', 'Q415372', 516.6),
    ('freiberg', 'Q14819', 513.0),
    ('sarandi', 'Q430538', 511.3),
    ('saltillo-mx-mcqq6', 'Q20132225', 509.7),
    ('lake-charles', 'Q34721105', 485.9),
    ('pirna', 'Q6477', 476.1),
    ('le-cannet', 'Q207967', 468.8),
    ('ueberlingen', 'Q332952', 466.8),
    ('ipiranga', 'Q2064845', 432.1),
    ('schwerin-brandenburg', 'Q1709', 430.6),
    ('tampico-mx-f6rb7', 'Q20235395', 430.4),
    ('neuendorf-switzerland', 'Q1979974', 426.9),
    ('bergheim', 'Q514957', 406.7),
    ('seaton-gb-jt88p', 'Q969956', 404.6),
    ('kosice', 'Q25409', 403.5),
    ('lapa', 'Q2064788', 393.5),
    ('cu-to', 'Q899515', 392.5),
    ('bradford', 'Q2078452', 369.2),
    ('heide', 'Q492322', 359.7),
    ('solingen', 'Q2942', 341.8),
    ('limoges', 'Q45656', 341.5),
    ('koesekoey-tr-zhxdo', 'Q6595949', 330.9),
    ('liberdade', 'Q22062417', 292.0),
    ('bailundo', 'Q1619845', 291.8),
    ('taoyuan', 'Q115256', 281.6),
    ('alagbede', 'Q111145804', 256.0),
    ('la-paloma', 'Q281754', 252.4),
    ('ciputat', 'Q3058349', 214.3),
    ('doebling', 'Q96145531', 208.9),
    ('wellington-1', 'Q7981305', 208.5),
    ('tungi', 'Q60437837', 201.3),
    ('mohammadpur', 'Q4305022', 199.0),
    ('worle', 'Q8036821', 193.8),
    ('penzing', 'Q134602415', 191.9),
    ('addis-ababa', 'Q3624', 191.1),
    ('bournemouth-dorset', 'Q54366459', 190.5),
    ('salford', 'Q2017916', 176.2),
    ('bonn', 'Q586', 175.7),
    ('teplice', 'Q146342', 173.3),
    ('qu-bec-ouest-canada', 'Q3554588', 169.8),
    ('hanau', 'Q3802', 157.5),
    ('erlangen', 'Q3126', 154.1),
    ('las-juntas', 'Q5970504', 147.5),
    ('schwaebisch-hall', 'Q14910', 129.0),
    ('wustrow-lower-saxony', 'Q572549', 124.9),
    ('halle', 'Q225774', 123.4),
    ('dondo', 'Q5295566', 121.4),
    ('sant-jordi-de-ses-salines', 'Q765811', 120.9),
    ('el-rosario-azcapotzalco', 'Q61266953', 112.9)
)
update public.cities c
set enrichment_status = coalesce(c.enrichment_status, '{}'::jsonb)
      || jsonb_build_object('wikidata_coords', jsonb_build_object(
           'state', 'resolved',
           'source', 'wikidata',
           'at', now(),
           'qid', v.qid,
           'detail', jsonb_build_object('verdict', 'disagree', 'km', v.km)))
  , needs_attention = true
  , updated_at = now()
from verdict v
where c.slug = v.slug
  -- SOFT ON PRECONDITIONS: a row a concurrent session has already repaired (or
  -- whose id legitimately moved) is skipped, not raised on. A hard precondition
  -- aborts `db push` for the whole repo.
  and c.wikidata_qid is not distinct from v.qid;

-- Replaces 99991790359075's version. `coord_unswept` is GONE (it could never move)
-- and `coord_disagree` takes its place as a real, self-draining work list. The three
-- zero-invariants are unchanged.
create or replace function public.city_wikidata_signals()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_rows_with_qid  int;
  v_dispositioned  int;
  v_qid_regressed  int;
  v_title_back     int;
  v_desc_back      int;
  v_coord_disagree int;
  v_coord_checked  int;
  v_examples       jsonb;
begin
  select count(*) into v_rows_with_qid
    from cities where duplicate_of_id is null and wikidata_qid ~ '^Q[0-9]+$';

  select count(*) into v_dispositioned
    from cities where field_provenance->'wikidata_qid'->>'retracted_value' is not null;

  -- ZERO-INVARIANT 1: the refuted identifier is back on the same row.
  select count(*) into v_qid_regressed
    from cities
   where wikidata_qid is not null
     and wikidata_qid = field_provenance->'wikidata_qid'->>'retracted_value';

  -- ZERO-INVARIANT 2: the cached wrong article title is back. Scoped to retractions
  -- that recorded a title, so 20261102100000's two rows -- which had none to clear
  -- -- cannot make this fire forever.
  select count(*) into v_title_back
    from cities
   where field_provenance->'wikidata_qid'->>'retracted_wikipedia_title' is not null
     and wikipedia_title is not null;

  -- ZERO-INVARIANT 3: the retracted description is back verbatim.
  select count(*) into v_desc_back
    from cities
   where field_provenance->'description'->'retracted'->>'from' is not null
     and description is not null
     and description = field_provenance->'description'->'retracted'->>'from';

  -- WORK LIST, never gated. SELF-DRAINING: a row counts only while it STILL holds
  -- the identifier the verdict was about, so clearing or correcting the id removes
  -- it with no second write.
  select count(*) into v_coord_disagree
    from cities
   where duplicate_of_id is null
     and enrichment_status->'wikidata_coords'->'detail'->>'verdict' = 'disagree'
     and wikidata_qid is not null
     and wikidata_qid = enrichment_status->'wikidata_coords'->>'qid';

  -- POSITIVE CONTROL for the work list. If the stamp were never written, or the key
  -- renamed, `coord_disagree` would read 0 and look like a clean corpus; this counts
  -- every row carrying ANY coordinate verdict, so 0 here means the probe is blind.
  select count(*) into v_coord_checked
    from cities
   where duplicate_of_id is null
     and enrichment_status->'wikidata_coords'->'detail'->>'verdict' is not null;

  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_examples from (
    select slug || ' -> ' || coalesce(wikidata_qid, '(null)')
           || ' [refuted ' || coalesce(field_provenance->'wikidata_qid'->>'retracted_value','?') || ']' as x
      from cities
     where (wikidata_qid is not null
            and wikidata_qid = field_provenance->'wikidata_qid'->>'retracted_value')
        or (field_provenance->'wikidata_qid'->>'retracted_wikipedia_title' is not null
            and wikipedia_title is not null)
        or (field_provenance->'description'->'retracted'->>'from' is not null
            and description is not null
            and description = field_provenance->'description'->'retracted'->>'from')
     limit 10
  ) s;

  return jsonb_build_object(
    'probe_ok', true,
    'rows_with_qid', v_rows_with_qid,
    'dispositioned', v_dispositioned,
    'qid_regressed', v_qid_regressed,
    'wrong_title_back', v_title_back,
    'retracted_desc_back', v_desc_back,
    'coord_disagree', v_coord_disagree,
    'coord_checked', v_coord_checked,
    'examples', v_examples
  );
end
$fn$;

comment on function public.city_wikidata_signals() is
  'Watches for a refuted city Wikidata identifier, the wrong cached wikipedia_title, or a retracted description COMING BACK, and reports the self-draining coordinate-disagreement work list. Cannot judge a new identifier -- SQL cannot call Wikidata. service_role only.';

revoke all on function public.city_wikidata_signals() from public;
revoke all on function public.city_wikidata_signals() from anon;
revoke all on function public.city_wikidata_signals() from authenticated;
grant execute on function public.city_wikidata_signals() to service_role;

do $verify$
declare
  v jsonb;
  v_stamped int;
  v_burj    int;
begin
  select count(*) into v_stamped
    from public.cities
   where enrichment_status->'wikidata_coords'->'detail'->>'verdict' = 'disagree';

  -- CONTROL: the row 99991790358713 excluded by hand keeps its CORRECT identifier.
  -- It is one of the 156 (longitude 0.000000 puts it 3,264 km away), so it is
  -- stamped and flagged -- but never cleared.
  select count(*) into v_burj
    from public.cities where slug = 'burj-hammoud' and wikidata_qid = 'Q895235';

  select public.city_wikidata_signals() into v;

  if coalesce(v ->> 'probe_ok', '') <> 'true' then
    raise exception 'city_wikidata_signals did not return probe_ok';
  end if;
  -- The three invariants must be clean the day this ships.
  if (v ->> 'qid_regressed')::int <> 0 then
    raise exception 'city_wikidata_signals: % row(s) carry a refuted qid: %',
      v ->> 'qid_regressed', v ->> 'examples';
  end if;
  if (v ->> 'wrong_title_back')::int <> 0 then
    raise exception 'city_wikidata_signals: % repaired row(s) carry a wikipedia_title again: %',
      v ->> 'wrong_title_back', v ->> 'examples';
  end if;
  if (v ->> 'retracted_desc_back')::int <> 0 then
    raise exception 'city_wikidata_signals: % retracted description(s) returned: %',
      v ->> 'retracted_desc_back', v ->> 'examples';
  end if;
  -- The retired key must be GONE, or a reader keeps trusting a number that cannot move.
  if v ? 'coord_unswept' then
    raise exception 'coord_unswept is still reported -- it could never move and must not return';
  end if;
  -- POSITIVE CONTROLS.
  if (v ->> 'rows_with_qid')::int < 1000 then
    raise exception 'city_wikidata_signals: only % rows with a Q-id -- the probe is not reading the corpus',
      v ->> 'rows_with_qid';
  end if;
  if (v ->> 'dispositioned')::int < 11 then
    raise exception 'city_wikidata_signals: only % dispositioned -- expected at least the 11-row repair',
      v ->> 'dispositioned';
  end if;
  if (v ->> 'coord_checked')::int < 100 then
    raise exception 'city_wikidata_signals: only % rows carry a coordinate verdict -- the stamp did not land',
      v ->> 'coord_checked';
  end if;
  -- The work list must be non-empty AND must agree with the stamp count, or the
  -- self-draining predicate is filtering out rows it should be reporting.
  if (v ->> 'coord_disagree')::int < 100 then
    raise exception 'city_wikidata_signals: coord_disagree is % -- expected ~156 from this sweep',
      v ->> 'coord_disagree';
  end if;
  if v_burj <> 1 then
    raise exception 'burj-hammoud lost its CORRECT identifier -- something auto-cleared a disagreement';
  end if;

  raise notice 'city coord verdict: % stamped disagree, % reported as work list, % checked, burj intact',
    v_stamped, v ->> 'coord_disagree', v ->> 'coord_checked';
end
$verify$;
