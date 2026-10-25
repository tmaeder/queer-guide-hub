/**
 * Renders the icon set to an HTML contact sheet, so §8 of the Icon System spec
 * ("look at it at grid size next to its neighbours, then check 16px and 24px —
 * if you can't name it at 24px, simplify it") can actually be done.
 *
 * Run: npx tsx --tsconfig tsconfig.app.json scripts/render-icon-sheet.mjs [outfile]
 *
 * The `--tsconfig` flag is load-bearing. tsx reads `tsconfig.json`, which is
 * the solution-style root config (`"files": []` + references) and carries no
 * `jsx` setting, so JSX compiles to the classic `React.createElement` runtime
 * and the component dies with `ReferenceError: React is not defined`. The
 * `jsx: "react-jsx"` this app is written against lives in `tsconfig.app.json`.
 *
 * This exists because the legibility rules are the half of the spec no test can
 * decide. `__tests__/iconSpec.test.ts` proves the data is well-formed; nothing
 * but a pair of eyes can tell you that concentric shapes read as a target or
 * that a blob with a stick reads as nothing. A green test suite is not a
 * legible icon set, and this is the tool that keeps the difference honest.
 *
 * It imports the real component rather than re-emitting SVG from the data, so
 * the sheet cannot drift from what the app renders — the failure mode where a
 * review tool draws a different picture than production is worse than no tool.
 */
import { writeFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TransitIcon } from '../src/components/transit/TransitIcon';
import { ICON_DEFS, ICON_GROUPS } from '../src/components/transit/iconDefs';

const out = process.argv[2] ?? 'icon-sheet.html';
// ICON_SLUGS=a,b,c renders only those icons (one drawing batch at a time).
const only = process.env.ICON_SLUGS?.split(',').filter(Boolean);
const slugs = Object.keys(ICON_DEFS).filter((s) => !only || only.includes(s));

const icon = (slug, size) =>
  renderToStaticMarkup(createElement(TransitIcon, { name: slug, size, label: slug }));

const byGroup = new Map(ICON_GROUPS.map((g) => [g, []]));
for (const slug of slugs) {
  const def = ICON_DEFS[slug];
  (byGroup.get(def.group) ?? []).push({ slug, def });
}

const card = ({ slug, def }) => `
  <figure class="card">
    <div class="grid">${icon(slug, 80)}</div>
    <figcaption>
      <b>${def.name}</b>
      <span class="slug">${slug}</span>
      <p>${def.use}</p>
      <div class="meta"><span>${def.group}</span><span>t: ${def.t}</span><span class="sw" style="background:${def.hex}"></span></div>
      <div class="small">
        <span title="16px">${icon(slug, 16)}</span>
        <span title="24px">${icon(slug, 24)}</span>
        <span title="32px — ticks appear here">${icon(slug, 32)}</span>
      </div>
      <div class="small dark" title="on an ink ground: the outline follows the text colour">
        <span>${icon(slug, 16)}</span><span>${icon(slug, 24)}</span><span>${icon(slug, 32)}</span>
      </div>
    </figcaption>
  </figure>`;

const groups = ICON_GROUPS.filter((g) => (byGroup.get(g) ?? []).length > 0)
  .map(
    (g) => `
  <section>
    <h2>${g} <small>${byGroup.get(g).length}</small></h2>
    <div class="row">${byGroup
      .get(g)
      .map(card)
      .join('')}</div>
  </section>`,
  )
  .join('');

// A 24px strip of the WHOLE set, ungrouped. §8.7 asks whether a new icon is
// too close to an existing silhouette, and that question is only answerable
// with every icon side by side at the size the comparison matters at.
const strip = slugs.map((s) => `<span title="${s}">${icon(s, 24)}</span>`).join('');

writeFileSync(
  out,
  `<!doctype html><meta charset="utf-8"><title>Icon System v2 — ${slugs.length} icons</title>
<style>
  :root { --paper:#FAFAF5; --frame:#EDEDE6; --ink:#111; }
  body { margin:0; padding:32px; background:var(--frame); color:var(--ink);
         font:16px/1.4 -apple-system,system-ui,sans-serif; }
  h1 { font-size:28px; margin:0 0 4px; }
  .lede { margin:0 0 32px; max-width:62ch; color:#555; }
  h2 { font-size:18px; margin:40px 0 12px; }
  h2 small { color:#777; font-weight:400; }
  .row { display:flex; flex-wrap:wrap; gap:12px; }
  .card { margin:0; width:196px; background:var(--paper); border-radius:18px;
          padding:12px; box-shadow:0 16px 40px rgba(17,17,17,.06); }
  .grid { display:grid; place-items:center; height:104px; }
  figcaption b { display:block; font-size:15px; }
  .slug { font:12px/1 ui-monospace,monospace; color:#888; }
  figcaption p { margin:6px 0; font-size:13px; color:#555; min-height:34px; }
  .meta { display:flex; align-items:center; gap:6px; font-size:11px; color:#777; }
  .sw { width:12px; height:12px; border-radius:999px; border:1px solid var(--ink);
        margin-left:auto; }
  .small { display:flex; align-items:center; gap:10px; margin-top:10px;
           padding-top:10px; border-top:1px solid rgba(17,17,17,.12); }
  .dark { background:var(--ink); color:var(--paper); border-radius:9px; padding:6px 10px; border-top:0; }
  .strip { background:var(--paper); border-radius:18px; padding:16px;
           display:flex; flex-wrap:wrap; gap:14px; align-items:center; }
</style>
<h1>Icon System v2 &mdash; ${slugs.length} icons</h1>
<p class="lede">Each card shows the icon at 80px (grid size), then 16 / 24 / 32px.
  Motion ticks only render at 32px and above. §8: if you cannot NAME it at 24px,
  simplify it. The strip at the bottom is the whole set at 24px &mdash; use it for
  §8.7, the duplicate-silhouette check.</p>
${groups}
<h2>Whole set at 24px <small>duplicate-silhouette check</small></h2>
<div class="strip">${strip}</div>
`,
);

console.log(`${slugs.length} icons → ${out}`);
