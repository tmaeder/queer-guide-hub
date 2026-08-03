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
const VETO = [
  'border-dashed', 'border-background', 'border-white', 'border-black',
  'divide-', 'rule-heavy',
  'border-t', 'border-b', 'border-l', 'border-r', 'border-y', 'border-x',
  'border-2', 'border-4', 'border-0', 'border-[',
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
  if (SKIP_FILE.some((s) => file.endsWith(s.replace(/^src\//, 'src/')))) continue;
  const src = readFileSync(file, 'utf8');
  let out = src;

  // Only touch quoted string literals that look like class lists.
  out = out.replace(/(['"`])([^'"`\n]*?)\1/g, (whole, q, body) => {
    if (!/\bborder\b|\bborder-border\b|\bborder-input\b|border-foreground\/|border-primary\//.test(body)) return whole;
    if (!/rounded-(container|element)\b/.test(body)) return whole;
    if (VETO.some((v) => body.includes(v))) return whole;
    if (VETO_RE.some((re) => re.test(body))) return whole;

    let next = body.replace(DROP, '');
    if (next === body) return whole;
    next = next.replace(/\s{2,}/g, ' ').trim();
    // Give it an edge back: a plate fill, but only if it has no background yet
    // and the element is not an image (an <img> paints over its own fill, so a
    // plate there is dead weight).
    const isImage = /\bobject-(cover|contain)\b|\baspect-/.test(next);
    if (!/\bbg-/.test(next) && !isImage) next = `${next} bg-surface-container`;
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
