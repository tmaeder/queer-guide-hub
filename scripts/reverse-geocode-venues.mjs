// One-shot: reverse-geocode venues by their own coordinates to find the TRUE
// country (Photon /reverse), rate-limited. Input TSV: <venue_id>\t<lat>\t<lng>
// Emits /tmp/venue-rev-out.tsv: <venue_id>\t<ISO2 countrycode>
import { readFileSync, writeFileSync } from 'fs';

const lines = readFileSync('/tmp/venue-rev.tsv', 'utf8').split('\n').map(l => l.trim()).filter(Boolean);
const UA = 'QueerGuide/1.0 (https://queer.guide; relink)';
const out = [];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

for (let i = 0; i < lines.length; i++) {
  const [id, lat, lng] = lines[i].split('\t');
  try {
    const res = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}`, { headers: { 'User-Agent': UA } });
    if (res.ok) {
      const j = await res.json();
      const cc = j.features?.[0]?.properties?.countrycode;
      if (cc) out.push(`${id}\t${cc.toUpperCase()}`);
    }
  } catch { /* skip */ }
  if (i % 20 === 0) console.log(`${i}/${lines.length}`);
  await sleep(1100);
}
writeFileSync('/tmp/venue-rev-out.tsv', out.join('\n') + '\n');
console.log(`DONE resolved=${out.length}/${lines.length}`);
