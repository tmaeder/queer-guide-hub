import { test, expect } from '@playwright/test';

// The styleguide's two public surfaces: `/styleguide` (human) and
// `/api/v1/styleguide/prompt` (machine).
//
// WHY THIS EXISTS, specifically. Twenty-one unit tests guard this system and
// every one of them parses the MIGRATION SOURCE. None looks at a compiled
// prompt. That gap is not hypothetical: v1.0.0 shipped with `styleguide_strip_fence`
// swallowing NULL, so every optional field rendered its wrapper unconditionally
// — each term without a context note printed a bare `()`, and a term with no
// replacement rendered `-> ""`, i.e. "replace it with nothing", the exact
// opposite of "rewrite the sentence". All twenty tests were green across it and
// it was caught only by a human reading the output. This file asserts on the
// OUTPUT, which is the only place that class of defect is visible.
//
// THESE RUN AGAINST PRODUCTION (`playwright.config.ts` defaults baseURL to
// https://queer.guide).
//
// Counts are FLOORS, not pins: editors add rules, and a test that breaks on
// ordinary editorial growth gets deleted rather than fixed. What is pinned is
// structure and the absence of the defects.

const API = '/api/v1/styleguide/prompt';

test.describe('@smoke styleguide — machine interface', () => {
  test('serves a structurally sound prompt with no empty-wrapper artifacts', async ({
    request,
  }) => {
    const res = await request.get(API);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(body.profile).toBe('full');

    const prompt: string = body.prompt;
    expect(prompt.length).toBeGreaterThan(5_000);

    // The fence is the injection boundary: exactly one pair, or a row escaped
    // its block and the "frame is code, content is data" guarantee is void.
    const begin = prompt.split('===== BEGIN QUEER.GUIDE VOICE DATA =====').length - 1;
    const end = prompt.split('===== END QUEER.GUIDE VOICE DATA =====').length - 1;
    expect(begin).toBe(1);
    expect(end).toBe(1);

    // The non-negotiables are hardcoded in the compiler and must sit AFTER the
    // fence closes, so nothing an editor writes can precede or displace them.
    expect(prompt).toContain('## Non-negotiables');
    expect(prompt.indexOf('## Non-negotiables')).toBeGreaterThan(
      prompt.indexOf('===== END QUEER.GUIDE VOICE DATA ====='),
    );
    for (const clause of [
      'Never invent a fact',
      'Never out anyone',
      'Never pathologise an identity',
    ]) {
      expect(prompt).toContain(clause);
    }

    // THE REGRESSION THIS FILE EXISTS FOR.
    expect(prompt).not.toContain(' ()');
    expect(prompt).not.toContain('-> ""');
    // A term with no replacement must say what to do instead of rendering empty.
    expect(prompt).toContain('no drop-in replacement; rewrite the sentence');

    // The JSON half must describe the same rules the text does — one compiler
    // produces both, and if they can disagree the machine contract is a lie.
    expect(body.counts.rules).toBe(body.rules.length);
    expect(body.counts.terms).toBe(body.terms.length);
    expect(body.rules.length).toBeGreaterThanOrEqual(25);
    expect(body.terms.length).toBeGreaterThanOrEqual(30);
  });

  test('profiles are real tiers, and an unknown one is refused', async ({ request }) => {
    const sizes: Record<string, number> = {};
    for (const profile of ['full', 'core', 'compact']) {
      const res = await request.get(`${API}?profile=${profile}&format=text`);
      expect(res.status()).toBe(200);
      expect(res.headers()['x-styleguide-profile']).toBe(profile);
      sizes[profile] = (await res.text()).length;
    }

    // Ordering is the contract a caller budgets against.
    expect(sizes.compact).toBeLessThan(sizes.core);
    expect(sizes.core).toBeLessThan(sizes.full);
    // `core` shipped saving only 19% — a tier not worth choosing. It must stay
    // a real step down, or the cheap option is the only option again.
    expect(sizes.core).toBeLessThan(sizes.full * 0.75);

    // Every profile keeps the fixed frame; cheapness never costs the safety half.
    for (const profile of ['core', 'compact']) {
      const text = await (await request.get(`${API}?profile=${profile}&format=text`)).text();
      expect(text).toContain('## Non-negotiables');
      expect(text).toContain('===== END QUEER.GUIDE VOICE DATA =====');
    }

    // A typo in a pipeline's config must fail visibly rather than quietly
    // spending four times the tokens on `full`.
    const bad = await request.get(`${API}?profile=cheap`);
    expect(bad.status()).toBe(400);
  });

  test('a pinned version is immutable and cacheable; an unknown one 404s', async ({ request }) => {
    const current = await (await request.get(API)).json();
    const pinned = await request.get(`${API}?v=${current.version}`);
    expect(pinned.status()).toBe(200);

    const pinnedBody = await pinned.json();
    expect(pinnedBody.version).toBe(current.version);
    // Byte-identical: this is the whole promise of pinning.
    expect(pinnedBody.prompt).toBe(current.prompt);
    expect(pinned.headers()['cache-control']).toContain('immutable');

    expect((await request.get(`${API}?v=99.99.99`)).status()).toBe(404);
    expect((await request.get(`${API}?v=not-a-version`)).status()).toBe(400);
  });
});

test.describe('@smoke styleguide — human interface', () => {
  test('/styleguide renders the same rules the API serves', async ({ page, request }) => {
    const api = await (await request.get(API)).json();

    await page.goto('/styleguide');
    await expect(page.getByRole('heading', { name: /How we write/i })).toBeVisible({
      timeout: 20_000,
    });

    // Derive the expectation from the API rather than hardcoding a rule title:
    // a spec pinned to seeded content goes stale the first time an editor
    // renames something, and then gets deleted instead of fixed.
    const firstRule = api.rules[0];
    await expect(page.getByText(firstRule.title, { exact: false }).first()).toBeVisible();

    // The terminology table is the part a contributor actually uses.
    const termWithNoReplacement = api.terms.find(
      (t: { preferred: string | null }) => t.preferred === null,
    );
    if (termWithNoReplacement) {
      await expect(
        page.getByText(/rewrite the sentence/i).first(),
      ).toBeVisible();
    }

    // The published version is stated on the page, so a reader can tell which
    // standard they are looking at.
    await expect(page.getByText(new RegExp(`v${api.version.replace(/\./g, '\\.')}`)).first())
      .toBeVisible();
  });

  test('the page is indexable and in the sitemap', async ({ request }) => {
    const html = await (
      await request.get('/styleguide', { headers: { 'User-Agent': 'Googlebot/2.1' } })
    ).text();
    expect(html).toContain('<title>Editorial Styleguide and Tone of Voice</title>');
    expect(html).not.toContain('noindex');

    const sitemap = await (await request.get('/sitemap-static.xml')).text();
    expect(sitemap).toContain('/styleguide');
  });
});
