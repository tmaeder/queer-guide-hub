// One-shot: geocode cities lacking valid coordinates via Photon (rate-limited,
// country-code-validated) and emit UPDATE SQL. Input is pre-URL-encoded TSV:
//   <city_id>\t<url_encoded "Name, Country">\t<expected ISO country code>
// Usage: node scripts/backfill-city-coords.mjs
// Emits: /tmp/city-coord-updates.sql  and  /tmp/city-coord-skipped.txt
import { writeFileSync, readFileSync } from 'fs';

const DATA = readFileSync(process.env.GEO_TSV_FILE ?? '/tmp/city-geo.tsv', 'utf8');
const lines = DATA.split('\n').map((l) => l.trim()).filter(Boolean);
const UA = 'QueerGuide/1.0 (https://queer.guide; coords backfill)';
const out = [];
const skipped = [];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (let i = 0; i < lines.length; i++) {
  const [id, q, code] = lines[i].split('\t');
  if (!id || !q || !code) { skipped.push(`${id ?? '?'} malformed`); continue; }
  let ok = false;
  try {
    const res = await fetch(`https://photon.komoot.io/api?q=${q}&limit=1&lang=en`, {
      headers: { 'User-Agent': UA },
    });
    if (res.ok) {
      const j = await res.json();
      const f = j.features?.[0];
      const c = f?.geometry?.coordinates;
      const cc = f?.properties?.countrycode;
      if (c && cc && cc.toUpperCase() === code.toUpperCase()
          && !(c[0] === 0 && c[1] === 0)
          && Math.abs(c[1]) <= 90 && Math.abs(c[0]) <= 180) {
        out.push(`UPDATE cities SET latitude=${c[1]}, longitude=${c[0]} WHERE id='${id}';`);
        ok = true;
      }
    }
  } catch { /* network error → skip, retry candidate */ }
  if (!ok) skipped.push(`${id} ${code}`);
  if (i % 25 === 0) console.log(`${i}/${lines.length} ok=${out.length} skip=${skipped.length}`);
  await sleep(1100);
}

writeFileSync('/tmp/city-coord-updates.sql', out.join('\n') + '\n');
writeFileSync('/tmp/city-coord-skipped.txt', skipped.join('\n') + '\n');
console.log(`DONE updates=${out.length} skipped=${skipped.length}`);
