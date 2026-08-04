#!/usr/bin/env node
/**
 * Repair cities whose stored coordinates disagree with their assigned country.
 *
 * 100 live cities sit >2,500 km from their assigned country while being <600 km
 * from a different one; 343 are suspect on a looser bar. The cause was
 * match_personality_city() filing a birthplace under the person's NATIONALITY —
 * Kew (London) under Australia, Whyalla (South Australia) under the United
 * States, Sibonga (Philippines) under Venezuela. Fixed at the source in
 * migration 20260811100100; this drains the damage already in the table.
 *
 * THE COORDINATES ARE THE TRUSTWORTHY FIELD. They arrived after the row was
 * minted, from Wikipedia via city-factual-backfill, and are recorded in
 * field_provenance.coords. The country was never sourced from geography at all.
 * So the evidence here is a reverse geocode of the stored point, and country_id
 * is what moves.
 *
 *   node scripts/data-quality/repair-city-countries.mjs --dry-run
 *   node scripts/data-quality/repair-city-countries.mjs --severity hard
 *   node scripts/data-quality/repair-city-countries.mjs --apply
 *
 * Flags:
 *   --dry-run              default; prints per-row evidence, writes nothing
 *   --apply                perform writes
 *   --severity hard|all    default all (hard = the 100 unambiguous ones)
 *   --limit N              stop after N candidates
 *   --with-content         ALSO apply to cities that have venues/events/hotels.
 *                          Off by default: moving those re-gates real content,
 *                          so they are proposed for review instead.
 *
 * Auth: Supabase Management API via the macOS-keychain CLI token (house
 *   pattern, same as backfill-venue-postal.mjs; set SUPABASE_PAT to override).
 *
 * Pacing: 1100ms — the interval this repo has empirically found Photon
 *   tolerates for sustained bulk use. 343 rows is about 7 minutes.
 *
 * SAFETY. Never `UPDATE cities SET country_id`. Nothing on `cities`
 * repropagates a country change, so a direct update leaves every attached
 * venue/event/hotel/organization/guide pointing at the old country with a
 * stale `safety_gated` — content in a criminalizing country stays publicly
 * visible. All writes go through apply_city_country_repair(), which
 * repropagates. Verified: moving a 3-venue city into the UAE takes
 * venues_gated 0 -> 3, and search_documents with it.
 */

import { execFileSync } from 'node:child_process';

const PROJECT = 'xqeacpakadqfxjxjcewc';
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const DRY = !APPLY;
const WITH_CONTENT = args.includes('--with-content');
const SEVERITY = args.includes('--severity') ? args[args.indexOf('--severity') + 1] : 'all';
const LIMIT = Number(args[args.indexOf('--limit') + 1]) || Infinity;
const INTERVAL_MS = Number(process.env.PHOTON_INTERVAL_MS || 1100);
const PHOTON = 'https://photon.komoot.io/reverse';
const UA = 'queer.guide-dataquality/1.0 (tmaeder@me.com)';

function token() {
  if (process.env.SUPABASE_PAT) return process.env.SUPABASE_PAT;
  const raw = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], {
    encoding: 'utf8',
  }).trim();
  return Buffer.from(raw.replace(/^go-keyring-base64:/, ''), 'base64').toString('utf8');
}
const TOKEN = token();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

/** Retries transient failures — this is a multi-minute run against a hosted API. */
async function sql(query, attempt = 0) {
  let res;
  try {
    res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
  } catch (e) {
    if (attempt >= 5) throw e;
    await sleep(2000 * 2 ** attempt);
    return sql(query, attempt + 1);
  }
  if (res.ok) return res.json();
  const body = (await res.text()).slice(0, 300);
  if ((res.status >= 500 || res.status === 429) && attempt < 5) {
    console.error(`  mgmt API ${res.status}, retry ${attempt + 1}/5`);
    await sleep(2000 * 2 ** attempt);
    return sql(query, attempt + 1);
  }
  throw new Error(`mgmt API ${res.status}: ${body}`);
}

/** &lang=en is required or the country/state names come back in mixed languages. */
async function reverse(lat, lon, attempt = 0) {
  try {
    const res = await fetch(`${PHOTON}?lat=${lat}&lon=${lon}&lang=en`, { headers: { 'User-Agent': UA } });
    if (res.status === 429) throw new Error('rate_limited');
    if (!res.ok) throw new Error(`photon_${res.status}`);
    const p = (await res.json())?.features?.[0]?.properties ?? {};
    return {
      countrycode: p.countrycode?.trim().toUpperCase().slice(0, 2) || null,
      country: p.country?.trim() || null,
      state: p.state?.trim() || null,
      // `name` is the nearest ADDRESSABLE FEATURE, not the settlement — reverse
      // geocoding Ludlow returns "Greggs", Tokyo returns "Tocho-dori Ave." and
      // Bexley returns "Tanyard Lane". Comparing a city name against it refuses
      // almost every correct repair. The locality lives in city/district/county.
      locality: [p.city, p.district, p.county, p.locality]
        .map((v) => v?.trim())
        .filter(Boolean),
      name: p.name?.trim() || null,
    };
  } catch (e) {
    if (attempt < 3) {
      await sleep(3000 * 2 ** attempt);
      return reverse(lat, lon, attempt + 1);
    }
    throw e;
  }
}

const rows = await sql(`
  select city_id, name, assigned_country, assigned_code, km_to_assigned, km_to_nearest,
         nearest_country, nearest_code, latitude, longitude,
         n_venues, n_events, n_hotels, n_orgs, n_people, severity
  from public.city_geo_conflicts(1000)
  ${SEVERITY === 'hard' ? "where severity = 'hard'" : ''}
  order by km_to_assigned desc`);

console.log(`${rows.length} candidate(s); mode=${DRY ? 'DRY RUN' : 'APPLY'} severity=${SEVERITY}\n`);

const stats = {
  checked: 0, verified: 0, repaired: 0, proposed: 0,
  name_conflict: 0, collided: 0, unresolved: 0, failed: 0,
};

for (const r of rows) {
  if (stats.checked >= LIMIT) break;
  stats.checked++;

  let geo;
  try {
    geo = await reverse(r.latitude, r.longitude);
  } catch (e) {
    stats.failed++;
    console.log(`  ?  ${r.name}: photon failed (${e.message})`);
    await sleep(INTERVAL_MS);
    continue;
  }

  const hasContent = r.n_venues + r.n_events + r.n_hotels + r.n_orgs > 0;
  const label = `${r.name} [${r.severity}] ${r.assigned_code}→${geo.countrycode ?? '??'} ` +
    `(${r.km_to_assigned}km from ${r.assigned_country}; photon says ${geo.country ?? 'nothing'})`;

  if (!geo.countrycode) {
    stats.unresolved++;
    console.log(`  ?  ${label}`);
    if (APPLY) {
      await sql(`update public.cities set
        enrichment_status = coalesce(enrichment_status,'{}'::jsonb) || jsonb_build_object(
          'country_repair', jsonb_build_object('state','data_unavailable','at',now())),
        needs_attention = true
        where id = ${q(r.city_id)}`);
    }
    await sleep(INTERVAL_MS);
    continue;
  }

  if (geo.countrycode === r.assigned_code) {
    // A false positive from the centroid heuristic — a large country, or an
    // overseas territory legitimately filed under its metropole.
    stats.verified++;
    console.log(`  ok ${r.name}: confirmed ${r.assigned_code} (${r.km_to_assigned}km from centroid)`);
    if (APPLY) {
      await sql(`update public.cities set
        enrichment_status = coalesce(enrichment_status,'{}'::jsonb) || jsonb_build_object(
          'country_repair', jsonb_build_object('state','verified','at',now())),
        field_provenance = coalesce(field_provenance,'{}'::jsonb) || jsonb_build_object(
          'country_id', jsonb_build_object('value', country_id, 'source','verified:photon_reverse','at',now()))
        where id = ${q(r.city_id)}`);
    }
    await sleep(INTERVAL_MS);
    continue;
  }

  const [target] = await sql(
    `select id, name from public.countries where upper(code) = ${q(geo.countrycode)} and duplicate_of_id is null limit 1`,
  );
  if (!target) {
    stats.unresolved++;
    console.log(`  ?  ${label} — no countries row for ${geo.countrycode}`);
    await sleep(INTERVAL_MS);
    continue;
  }

  // COORDINATE CORROBORATION. The whole method rests on "coords are right,
  // country is wrong" — true for the birthplace cohort, whose coords came from
  // Wikipedia after the row was minted. But when the row's NAME is ambiguous the
  // wrong Wikipedia page can have been matched, and then the coords are wrong
  // too; reverse-geocoding merely confirms them and we would "repair" a correct
  // country into a wrong one. Suffolk, Gloucester, Quincy, Versailles, Bryn Mawr
  // and Lubeck all exist on both sides of the proposed move, and "Sambia" (German
  // for Zambia) resolves to the Sambia Peninsula in Kaliningrad.
  //
  // Photon reports the locality containing those coordinates. If we get one and
  // it does not resemble the city's own name, the coordinates — not the country
  // — are what is wrong. FAIL OPEN: when Photon returns no locality at all we
  // proceed, because absence of the field is not evidence of a conflict.
  const norm = (s) =>
    (s ?? '')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
  const cityBase = norm(String(r.name).split(',')[0]);
  const localities = (geo.locality ?? []).map(norm).filter(Boolean);
  const nameAgrees =
    !cityBase ||
    localities.length === 0 ||
    localities.some((l) => l === cityBase || l.includes(cityBase) || cityBase.includes(l));

  if (!nameAgrees) {
    stats.name_conflict++;
    console.log(
      `  !  ${label} — REFUSED: coords sit in "${geo.locality.join(' / ')}", not "${r.name}" — the COORDS look wrong, not the country`,
    );
    if (APPLY) {
      await sql(`update public.cities set needs_attention = true,
        enrichment_status = coalesce(enrichment_status,'{}'::jsonb) || jsonb_build_object(
          'country_repair', jsonb_build_object('state','blocked_coord_name_conflict',
            'photon_locality',${q((geo.locality ?? []).join(' / '))},'photon_country',${q(geo.countrycode)},'at',now()))
        where id = ${q(r.city_id)}`);
    }
    await sleep(INTERVAL_MS);
    continue;
  }

  if (hasContent && !WITH_CONTENT) {
    // Moving this re-gates real content in both directions. Propose, don't act.
    stats.proposed++;
    console.log(`  ~  ${label} — HAS CONTENT ` +
      `(v${r.n_venues}/e${r.n_events}/h${r.n_hotels}/o${r.n_orgs}), proposed for review`);
    if (APPLY) {
      await sql(`update public.cities set needs_attention = true,
        enrichment_status = coalesce(enrichment_status,'{}'::jsonb) || jsonb_build_object(
          'country_repair', jsonb_build_object('state','proposed','to',${q(target.id)},
            'to_code',${q(geo.countrycode)},'source','photon_reverse','at',now()))
        where id = ${q(r.city_id)}`);
    }
    await sleep(INTERVAL_MS);
    continue;
  }

  if (APPLY) {
    const evidence = JSON.stringify({
      source: 'photon_reverse',
      countrycode: geo.countrycode,
      photon_country: geo.country,
      photon_state: geo.state,
      photon_name: geo.name,
      previous_code: r.assigned_code,
      km_to_previous: r.km_to_assigned,
    });
    try {
      const [res] = await sql(
        `select public.apply_city_country_repair(${q(r.city_id)}, ${q(target.id)}, ${q(evidence)}::jsonb) as r`,
      );
      stats.repaired++;
      console.log(`  ->  ${label}${hasContent ? ' (WITH CONTENT — repropagating)' : ''}`);
      if (!res?.r?.ok) console.error(`     FAILED: ${JSON.stringify(res?.r)}`);
      else if (res.r.repropagated) console.log(`     repropagated ${JSON.stringify(res.r.repropagated)}`);
    } catch (e) {
      // A country move that collides on (country_id, name_normalized) is not a
      // failure — it is a DISCOVERY. The target country already holds a city
      // with this name, so the two rows are the same place: "París" filed under
      // Panama collides with "Paris" in France because normalize_name unaccents
      // both. Moving it is impossible and also pointless; the answer is a merge.
      // Queue the pair and move on rather than aborting the whole run.
      if (!/23505|uk_cities_country_name_active|idx_cities_name_country_unique/.test(e.message)) throw e;
      stats.collided++;
      const [twin] = await sql(
        `select id, name, completeness_score from public.cities
          where country_id = ${q(target.id)}
            and name_normalized = public.normalize_name(split_part(${q(r.name)}, ',', 1))
            and duplicate_of_id is null and id <> ${q(r.city_id)} limit 1`,
      );
      console.log(`  =  ${label} — ALREADY EXISTS in ${target.name} as "${twin?.name ?? '?'}" → queued as duplicate`);
      if (twin?.id) {
        // Keep the row already sitting in the correct country; it is the one the
        // rest of the corpus links to.
        await sql(`insert into public.dedup_review_queue
            (entity_type, keep_id, drop_id, confidence, reason, source, cluster)
          values ('city', ${q(twin.id)}, ${q(r.city_id)}, 0.95,
                  'country_repair_name_collision', 'repair_city_countries',
                  ${q(JSON.stringify({ moved_from: r.assigned_code, into: geo.countrycode, drop_name: r.name, keep_name: twin.name, evidence: JSON.parse(evidence) }))}::jsonb)
          on conflict do nothing`);
      }
      await sql(`update public.cities set needs_attention = true,
        enrichment_status = coalesce(enrichment_status,'{}'::jsonb) || jsonb_build_object(
          'country_repair', jsonb_build_object('state','blocked_name_collision_in_target',
            'target_country',${q(geo.countrycode)},'twin',${q(twin?.id ?? '')},'at',now()))
        where id = ${q(r.city_id)}`);
    }
  } else {
    stats.repaired++;
    console.log(`  ->  ${label}${hasContent ? ' (WITH CONTENT — repropagating)' : ''}`);
  }
  await sleep(INTERVAL_MS);
}

console.log(`\n${DRY ? 'DRY RUN — nothing written' : 'done'}:`, stats);
