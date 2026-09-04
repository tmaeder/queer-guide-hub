import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `.hatch-ink` marks the two "we hold no answer" segments of the /rights/trans
 * recognition band. It is a chart FILL, so it carries its segment's own
 * percentage label on top of it.
 *
 * It shipped without a solid `background-color`, and stripes over a transparent
 * ground leave that label composited against whatever is behind the band —
 * measured on the running page at **1.11:1 in light mode**, i.e. a 30%-wide
 * segment whose number could not be read at all. With `--muted` underneath it
 * measures 15.58:1 light / 16.31:1 dark.
 *
 * A texture utility used as a fill must therefore declare its own ground. This
 * cannot be asserted from the component — the colour lives entirely in CSS,
 * which no JSX test parses — so the stylesheet is read directly, the same way
 * tokenCatalog's drift test does.
 */
const CSS = readFileSync(resolve(__dirname, '../../../index.css'), 'utf8');

function ruleBody(selector: string): string {
  const at = CSS.indexOf(`${selector} {`);
  expect(at, `${selector} is missing from src/index.css`).toBeGreaterThan(-1);
  return CSS.slice(at, CSS.indexOf('}', at));
}

describe('.hatch-ink', () => {
  const body = ruleBody('.hatch-ink');

  it('declares a solid ground under the stripes', () => {
    expect(body).toMatch(/background-color:\s*hsl\(var\(--[a-z-]+\)\)/);
  });

  it('uses a theme surface token, so it inverts with the page', () => {
    // A literal colour here would be a light plate burned into dark mode —
    // the failure the design system calls out for --color-logo-plate.
    expect(body).not.toMatch(/background-color:\s*#/);
    expect(body).toMatch(/background-color:\s*hsl\(var\(--muted\)\)/);
  });

  it('draws its texture from the foreground token, never a track colour', () => {
    expect(body).toMatch(/--foreground/);
    expect(body).not.toMatch(/--track-/);
    expect(body).not.toMatch(/--destructive/);
  });
});
