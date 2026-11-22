import { test, expect, type APIRequestContext } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { anonHeaders } from './support/anonKey';

/**
 * Festival display (Phase 2 of docs/plans/2026-11-22-festival-multi-event-structure-design.md),
 * as an anonymous reader sees it on prod. The festival is picked from live data rather
 * than hardcoded, so the spec keeps meaning something after this year's editions end.
 */

test.describe.configure({ timeout: 120_000 });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? 'https://xqeacpakadqfxjxjcewc.supabase.co';

interface Child {
  id: string;
  slug: string;
  title: string;
}

async function pickFestival(request: APIRequestContext) {
  const headers = await anonHeaders(request);
  const res = await request.get(
    `${SUPABASE_URL}/rest/v1/events?select=id,slug,title,programme_size&programme_size=gte.3&duplicate_of_id=is.null&end_date=gte.${new Date().toISOString()}&order=programme_size.desc&limit=1`,
    { headers },
  );
  expect(res.ok(), `events -> HTTP ${res.status()}`).toBe(true);
  const [umbrella] = (await res.json()) as Array<{ id: string; slug: string; title: string }>;
  // Positive control: with no upcoming festival every assertion below is vacuous.
  expect(umbrella, 'no upcoming festival with >= 3 programme children').toBeTruthy();

  const prog = await request.post(`${SUPABASE_URL}/rest/v1/rpc/event_programme`, {
    headers: { ...headers, 'content-type': 'application/json' },
    data: { p_event_id: umbrella.id },
  });
  expect(prog.ok()).toBe(true);
  const { children } = (await prog.json()) as { children: Child[] };
  expect(children.length).toBeGreaterThanOrEqual(3);
  return { umbrella, children };
}

test('a festival page leads with its programme and exports all of it', async ({
  page,
  request,
}) => {
  const { umbrella, children } = await pickFestival(request);
  await page.goto(`/events/${umbrella.slug}`);

  const programme = page.locator('#programme');
  await expect(programme).toBeVisible({ timeout: 30_000 });
  // Every child is listed (each row's link is labelled with its title).
  for (const c of children) {
    await expect(
      programme.getByRole('link', { name: c.title, exact: true }).first(),
    ).toBeAttached();
  }
  // The programme leads: it comes before About in the document.
  const order = await page.evaluate(() => {
    const p = document.getElementById('programme');
    const a = document.getElementById('about');
    if (!p || !a) return 'missing';
    return p.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING
      ? 'programme-first'
      : 'about-first';
  });
  expect(['programme-first', 'missing']).toContain(order);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    programme.getByRole('button', { name: /Add programme to calendar/ }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(`${umbrella.slug}.ics`);
  const ics = await readFile((await download.path())!, 'utf8');
  expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true);
  // Umbrella + one VEVENT per child.
  expect(ics.match(/BEGIN:VEVENT/g)?.length).toBe(children.length + 1);
});

test('a child page says which festival it belongs to', async ({ page, request }) => {
  const { umbrella, children } = await pickFestival(request);
  const child = children[Math.min(1, children.length - 1)];
  await page.goto(`/events/${child.slug}`);

  const partOf = page.getByRole('link', { name: umbrella.title, exact: true }).first();
  await expect(partOf).toBeVisible({ timeout: 30_000 });
  await expect(partOf).toHaveAttribute('href', new RegExp(`/events/${umbrella.slug}$`));
  await expect(page.getByText(/Part of/).first()).toBeVisible();
});
