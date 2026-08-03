#!/usr/bin/env node
/**
 * One-shot codemod: container outlines -> ink plates (PASTE-UP border sweep).
 *
 * Deliberately NARROW. It only rewrites the single dominant shape — a
 * `rounded-container` / `rounded-element` box whose edge is a plain 1px
 * all-sides border — and refuses everything else, because a lot of the
 * remaining borders in this tree are load-bearing:
 *
 *   - spinners are drawn WITH a border (loading.tsx, MessagingInterface)
 *   - avatar stacks use `border-background` as a knockout, not decoration
 *   - dashed borders are drop-zone affordances
 *   - the locked risk palette (useRiskVisual) carries the safety signal
 *   - `.rule-heavy` and the masthead `border-b-2` are the rationed print rules
 *   - directional rules (border-t/-b/-l/-r) are dividers and need a human call
 *
 * Run: node scripts/codemod-borders.mjs [--apply]
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const APPLY = process.argv.includes('--apply');
// `--wide` widens the SHAPE gate only — every safety veto below still applies.
// The original gate accepted `rounded-container|element` exclusively, which is
// why `rounded-badge` chips survived the first sweep: EqualityChip alone
// painted 1,218 of the site's 4,964 remaining borders, because it repeats per
// row on every city list. Widening which shapes we look at does not widen what
// we are willing to delete.
const WIDE = process.argv.includes('--wide');

const SKIP_DIR = new Set(['node_modules', '__tests__', 'admin', 'cms', 'PatternLibrary']);
const SKIP_FILE = [
  'src/components/ui/loading.tsx',              // spinner ring
  'src/components/messaging/MessagingInterface.tsx',
  'src/components/ui/scroll-area.tsx',          // transparent gutters
  'src/components/ui/switch.tsx',               // transparent inset
  'src/components/safety/DestinationSafetyCard.tsx',
  'src/components/country/SafetyVerdict.tsx',
  'src/components/trips/TripSafetyBriefing.tsx',
  'src/components/map/ExploreMapLayers.tsx',    // per-layer hue lives on the border
];

// A className string is out of scope if it contains any of these.
//
// These MUST be matched as whole utility tokens, not as substrings. The first
// version of this list was checked with `body.includes(v)`, and
// `'border-border'.includes('border-b')` is TRUE — so the veto that exists to
// protect directional `border-b` rules silently vetoed every string containing
// `border-border`, the most common border token in the tree. The sweep reported
// success while 4,964 borders remained, and that one line is why.
//
// `(?![a-z])` is the load-bearing part: after `border-` a directional utility is
// followed by a boundary or a width (`border-b-2`), never by another letter, so
// it cannot match the `b` in `border-border`.
const VETO_RE_LIST = [
  /(?:^|[\s:])border-dashed(?![a-z])/,
  /(?:^|[\s:])border-(?:background|white|black)(?![a-z])/,
  /(?:^|[\s:])divide-/,
  /rule-heavy/,
  /(?:^|[\s:])border-[tblrxy](?![a-z])/,
  /(?:^|[\s:])border-(?:0|2|4|\[)/,
];
// `border-foreground` with no opacity is a deliberate heavy rule (the PASTE-UP
// signature spelled as a utility). Stripping the width would leave a dangling
// colour class AND silently delete an intentional mark, so veto the whole
// string and let a human decide. The `/NN` opacity variants are decorative.
const VETO_RE = [/\bborder-foreground(?![\/\w-])/];

// Border tokens we are willing to delete (all-sides, neutral, decorative).
const DROP = /(?:^|\s)(?:border|border-border(?:\/\d+)?|border-foreground\/\d+|border-input|border-primary\/\d+)(?=\s|$)/g;

const files = [];
(function walk(dir) {
  for (const e of readdirSync(dir)) {
    if (SKIP_DIR.has(e)) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.tsx')) files.push(p);
  }
})('src');

let changed = 0;
let edits = 0;
const samples = [];

for (const file of files) {
  if (SKIP_FILE.some((s) => file.endsWith(s))) continue;
  const src = readFileSync(file, 'utf8');
  let out = src;

  // Only touch quoted string literals that look like class lists.
  out = out.replace(/(['"`])([^'"`\n]*?)\1/g, (whole, q, body) => {
    if (!/\bborder\b|\bborder-border\b|\bborder-input\b|border-foreground\/|border-primary\//.test(body)) return whole;
    const SHAPE = WIDE
      ? /rounded-(container|element|badge|full)\b/
      : /rounded-(container|element)\b/;
    if (!SHAPE.test(body)) return whole;
    if (VETO_RE_LIST.some((re) => re.test(body))) return whole;
    if (VETO_RE.some((re) => re.test(body))) return whole;

    let next = body.replace(DROP, '');
    // Dropping the base width leaves `hover:border-foreground/40` behind, which
    // then paints nothing — `src/index.css` resets `border-width: 0` on `*`, so
    // a colour-only utility has no width to colour. Strip the dead state
    // variants rather than leave a hover rule that silently does nothing.
    //
    // This runs whenever the string ends up with no base width, not only when
    // DROP fired, so it also cleans strings a previous pass already stripped.
    // `hover:border-2` carries its own width and is not matched.
    const hasBaseWidth =
      /(?:^|\s)border(?:-[0-9]|-\[)?(?=\s|$)/.test(next) || /(?:^|\s)border-[tblrxy](?![a-z])/.test(next);
    if (!hasBaseWidth) {
      next = next.replace(
        /(?:^|\s)(?:hover|focus|focus-visible|group-hover|active):border-(?:border|foreground|input|primary|muted|accent)(?:\/\d+)?(?=\s|$)/g,
        '',
      );
    }
    if (next === body) return whole;
    next = next.replace(/\s{2,}/g, ' ').trim();
    // Give it an edge back: a plate fill, but only if it has no background yet
    // and the element is not an image (an <img> paints over its own fill, so a
    // plate there is dead weight).
    const isImage = /\bobject-(cover|contain)\b|\baspect-/.test(next);
    if (!/\bbg-/.test(next) && !isImage) next = `${next} bg-surface-container`;
    // `bg-background` IS the page colour, so on those the border was the only
    // thing separating the element from the page — deleting it alone makes the
    // element vanish rather than flatten. Promote the fill to a plate instead.
    // Only the bare token: `bg-background/85` is a translucent scrim over a map
    // or photo, where the backdrop already supplies the edge.
    else if (/(?:^|\s)bg-background(?=\s|$)/.test(next) && !isImage)
      next = next.replace(/(?:^|\s)bg-background(?=\s|$)/, ' bg-surface-container');
    edits++;
    if (samples.length < 12) samples.push(`${file}\n    - ${body.slice(0, 100)}\n    + ${next.slice(0, 100)}`);
    return q + next + q;
  });

  if (out !== src) {
    changed++;
    if (APPLY) writeFileSync(file, out);
  }
}

console.log(samples.join('\n'));
console.log(`\n${APPLY ? 'APPLIED' : 'DRY RUN'} — ${edits} class strings in ${changed} files`);
if (!APPLY) console.log('re-run with --apply to write');
