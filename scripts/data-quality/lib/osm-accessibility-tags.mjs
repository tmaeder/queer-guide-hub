// Node mirror of supabase/functions/_shared/osm-accessibility.ts.
//
// WHY A MIRROR AND NOT AN IMPORT: that file is Deno TypeScript imported by edge
// functions; this runs under plain node in a GitHub Action. Duplication is the
// cost of the two runtimes, so the SLUG VOCABULARY is drift-tested against the
// original in src/lib/__tests__/osmAccessibilityMirror.test.ts — a slug that
// exists here and not there would be rejected by `public.amenities` at write
// time and silently drop the finding.
//
// The rule that matters most, copied along with the code: all four `wheelchair`
// values are read. A `no` is a MEASUREMENT, not an absence, and it is never
// collapsed into silence — a traveller wrongly told a door is step-free arrives
// and cannot get in, while one wrongly told it is not merely goes elsewhere.

const YES = new Set(['yes', 'designated']);

export function osmAccessibilityFromTags(tags) {
  const v = (k) => String(tags?.[k] ?? '').trim().toLowerCase();
  const out = new Set();

  const wheelchair = v('wheelchair');
  if (YES.has(wheelchair)) out.add('wheelchair-accessible');
  else if (wheelchair === 'limited') out.add('limited-wheelchair-access');
  else if (wheelchair === 'no') out.add('not-wheelchair-accessible');

  const toiletWheelchair = v('toilets:wheelchair');
  if (YES.has(toiletWheelchair)) out.add('accessible-restroom');
  else if (toiletWheelchair === 'no') out.add('no-accessible-restroom');

  if (YES.has(v('toilets:unisex')) || YES.has(v('unisex'))) out.add('gender-neutral-restroom');
  if (YES.has(v('ramp')) || YES.has(v('ramp:wheelchair'))) out.add('ramp-access');
  if (YES.has(v('elevator')) || v('highway') === 'elevator') out.add('elevator-access');
  if (YES.has(v('tactile_paving'))) out.add('tactile-paving');
  if (YES.has(v('hearing_loop')) || YES.has(v('induction_loop'))) out.add('hearing-loop');

  const steps = Number(v('step_count'));
  if (Number.isFinite(steps) && v('step_count') !== '') {
    out.add(steps === 0 ? 'step-free-entrance' : 'not-step-free');
  }

  const parking = v('capacity:disabled');
  if (YES.has(parking) || Number(parking) > 0) out.add('accessible-parking');

  return [...out].sort();
}
