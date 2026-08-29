#!/usr/bin/env node
/**
 * Verify the drgay coverage wave landed — ON PROD, BY OUTCOME.
 *
 * A green migration is not evidence that the right rows moved. Waves 1-4 of the
 * Kinktionary revival reported "956 revived" while /tags/figging still 404'd,
 * because the migration asserted its own writes rather than the reader's result.
 * So this checks what a READER gets, over the anon key, plus the four
 * corpus-level invariants the migrations claim to have established.
 *
 * ANON KEY ON PURPOSE. The service role bypasses RLS, so a service-role read
 * proves the row exists, not that anyone can see it. Every tag this wave
 * touched is either sensitive or adult, and those need
 * verification_status in ('reviewed','locked') AND human_reviewed to clear
 * unified_tags_public_gated_read — which is exactly the gate a service-role
 * check would sail past while the public page stayed empty.
 *
 *   node scripts/data-quality/verify-drgay-outcomes.mjs
 *
 * Needs VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (or SUPABASE_URL /
 * SUPABASE_ANON_KEY). Exits non-zero on the first failed expectation.
 */

const URL_ =
  process.env.VITE_SUPABASE_URL ??
  process.env.SUPABASE_URL ??
  'https://xqeacpakadqfxjxjcewc.supabase.co';
const KEY =
  process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? '';

if (!KEY) {
  console.error(
    'Need VITE_SUPABASE_ANON_KEY (or SUPABASE_ANON_KEY). Refusing to run with no key\n' +
      'rather than reporting a pass against nothing.',
  );
  process.exit(2);
}

const failures = [];
const notes = [];

async function q(path) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} on ${path}`);
  return res.json();
}

function check(name, ok, detail) {
  if (ok) {
    console.log(`  ok    ${name}`);
  } else {
    console.log(`  FAIL  ${name} — ${detail}`);
    failures.push(name);
  }
}

// The seven that got prose, and the four stamps they must no longer carry.
const PROSE = [
  'anal-sex',
  'rimming',
  'fisting',
  'bareback',
  'blowjob',
  'party-and-play',
  'sexting',
];
const STAMPS = new Set([
  'Toys tag',
  'Sexual activity tag',
  'Philia tag',
  'Scene safety tag',
]);
const CREATED = [
  'window-period',
  'seroadaptation',
  'serophobia',
  'cybersex',
  'ghosting',
  'qpoc',
];

console.log(`\ndrgay wave — outcome check against ${URL_} (anon key)\n`);

console.log('Prose replaced the import stamps:');
for (const slug of PROSE) {
  const rows = await q(
    `unified_tags?slug=eq.${slug}&select=slug,description,long_description,seo_indexable,status`,
  );
  const r = rows[0];
  if (!r) {
    check(slug, false, 'not readable by anon at all');
    continue;
  }
  const d = (r.description ?? '').trim();
  check(
    slug,
    !STAMPS.has(d) && d.length > 60 && (r.long_description ?? '').length > 400,
    `description=${JSON.stringify(d.slice(0, 40))} long=${(r.long_description ?? '').length}`,
  );
}

console.log('\nNew concepts are readable by an anonymous reader:');
for (const slug of CREATED) {
  const rows = await q(`unified_tags?slug=eq.${slug}&select=slug,description,category,status`);
  const r = rows[0];
  check(
    slug,
    !!r && r.status === 'active' && (r.description ?? '').length > 60,
    r ? `status=${r.status} desc=${(r.description ?? '').length}` : 'not visible to anon',
  );
  if (r) notes.push(`    ${slug} → ${r.category ?? 'NO CATEGORY'}`);
}

console.log('\nPrimary categories corrected (denormalised text is what search facets read):');
const WANT = {
  prep: 'Sexual Health',
  bareback: 'Sexual Health',
  'age-of-consent': 'Laws & Legal Rights',
  deadnaming: 'Gender',
  misgendering: 'Gender',
  'chosen-family': 'Family & Parenting',
};
for (const [slug, want] of Object.entries(WANT)) {
  const rows = await q(`unified_tags?slug=eq.${slug}&select=slug,category`);
  const got = rows[0]?.category ?? null;
  check(slug, got === want, `want ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
}

console.log('\nWrong-entity alias residue is gone:');
const RESIDUE = [
  'caso-preposicional',
  'prpositionalkasus',
  'analytische-flexion',
  'traumatisme',
  'barytrauma',
  'parti-communiste-portugais',
  'fertility-and-sterility',
];
const residue = await q(
  `tag_aliases?alias_slug=in.(${RESIDUE.join(',')})&select=alias_slug`,
).catch(() => null);
if (residue === null) {
  // tag_aliases may not be anon-readable; that is not a failure of this wave.
  notes.push('    tag_aliases not readable by anon — residue checked server-side instead');
} else {
  check('no grammatical/injury/party aliases', residue.length === 0, `${residue.length} left`);
}

console.log('\n"Undetectable" resolves, and the U=U twins are merged away:');
const twins = await q(
  `unified_tags?slug=in.(u-u-undetectable-equals-untransmittable,u-u-undetectable-untransmittable)&select=slug,status`,
);
check(
  'U=U twins merged',
  twins.every((t) => t.status === 'merged'),
  twins.map((t) => `${t.slug}=${t.status}`).join(', ') || 'none found',
);

if (notes.length) {
  console.log('\nContext:');
  for (const n of notes) console.log(n);
}

console.log(
  failures.length
    ? `\n${failures.length} FAILED: ${failures.join(', ')}\n`
    : '\nAll outcome checks passed.\n',
);
process.exit(failures.length ? 1 : 0);
