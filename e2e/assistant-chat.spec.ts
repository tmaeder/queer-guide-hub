/**
 * E2E coverage for the "Ask the guide" assistant chat on /search.
 *
 * Runs LIVE against baseURL (prod by default) — no mocking. Asserts the
 * end-to-end loop: panel opens, the query auto-sends, a real reply streams
 * back, and the reply is prose — never raw tool-call JSON (the quantized
 * Llama used to leak blobs like [{"name": "search_events", ...}] into chat;
 * stripped worker-side since fix #2337).
 */
import { test, expect } from '@playwright/test';

// Live 70B round-trip (rate limit + tools + synthesis) can take a while.
const REPLY_TIMEOUT_MS = 120_000;

const TOOL_JSON_RE = /\{\s*"name"\s*:|\[\s*\{/;

test('ask panel returns a prose reply without tool-call JSON', async ({ page }) => {
  await page.goto('/search?q=gay%20bars%20in%20lisbon');

  const ask = page.getByRole('button', { name: /ask the guide/i }).first();
  await expect(ask).toBeVisible({ timeout: 20_000 });
  await ask.click();

  // Panel header + the auto-sent user bubble.
  await expect(page.getByText('Ask the guide').last()).toBeVisible();
  await expect(page.getByText('gay bars in lisbon').last()).toBeVisible({ timeout: 10_000 });

  // Wait for the turn to finish: the Thinking… indicator appears, then goes.
  const thinking = page.getByText('Thinking…');
  await expect(thinking).toBeVisible({ timeout: 15_000 });
  await expect(thinking).toBeHidden({ timeout: REPLY_TIMEOUT_MS });

  // No error state (Turnstile fail-open, no rate-limit trip).
  await expect(page.getByRole('alert')).toHaveCount(0);

  // An assistant reply rendered, and it is prose — not leaked tool JSON.
  const replies = page.locator('p.text-sm.leading-relaxed');
  await expect(replies.first()).toBeVisible();
  const text = (await replies.allInnerTexts()).join('\n');
  expect(text.length).toBeGreaterThan(20);
  expect(text).not.toMatch(TOOL_JSON_RE);
});
