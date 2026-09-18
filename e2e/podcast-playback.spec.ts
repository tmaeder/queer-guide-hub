import { test, expect } from '@playwright/test';

// Does the player actually PLAY?
//
// WHY THIS EXISTS, separately from podcasts.spec.ts. That file asserts a Play
// button is PRESENT (`playButtons.count() >= 1`) and that the crawler document
// carries an audio URL. Neither statement is playback. A button that renders
// and does nothing, an <audio> whose src is never wired, or a source that
// 403s to a browser while answering curl all pass that spec and fail the only
// thing a listener cares about.
//
// The gap is not hypothetical for this codebase: podcast audio spent months in
// `image_url`, and the recovery moved URLs that had never once been fetched by
// a media element. Proving the bytes arrive AND the element advances is the
// part no HTML assertion reaches.
//
// RUNS AGAINST PRODUCTION (baseURL defaults to https://queer.guide).
//
// Derived from the page's own data — no pinned slug, no pinned show. A spec
// that names an episode goes red the week that show re-publishes its feed.

const RENDER = { timeout: 30_000 };

/** First episode URL advertised by the hub, via a show page. */
async function firstEpisodeUrl(page: import('@playwright/test').Page): Promise<string> {
  await page.goto('/podcasts');
  const show = page.locator('a[href^="/podcasts/"]').first();
  await expect(show, 'the hub lists at least one show').toBeVisible(RENDER);
  await show.click();
  const episode = page.locator('a[href^="/news/"]').first();
  await expect(episode, 'the show lists at least one episode').toBeVisible(RENDER);
  const href = await episode.getAttribute('href');
  expect(href, 'episode href').toBeTruthy();
  return href!;
}

test.describe('@smoke podcast playback', () => {
  test('pressing play loads the audio and the clock advances', async ({ page }) => {
    await page.goto(await firstEpisodeUrl(page));

    const play = page.getByRole('button', { name: /^play$/i }).first();
    await expect(play, 'the episode page offers a play control').toBeVisible(RENDER);

    // BEFORE: the element exists but holds nothing. The player is global and
    // mounts one <audio> at app root; it stays empty until a track is chosen,
    // so "src is empty here" is the design, not a fault.
    const before = await page.evaluate(() => {
      const a = document.querySelector('audio');
      return { present: !!a, src: a?.currentSrc || '', t: a?.currentTime ?? -1 };
    });
    expect(before.present, 'an <audio> element is mounted').toBe(true);

    await play.click();

    // The click is a trusted gesture under Playwright, so autoplay policy is
    // not in the way. Wait on the ELEMENT reaching a playing state rather than
    // on the button's label: a label can flip on optimistic local state while
    // the media never starts, which is the exact failure being tested for.
    await page.waitForFunction(
      () => {
        const a = document.querySelector('audio');
        return !!a && !a.paused && a.currentTime > 0 && a.readyState >= 2;
      },
      undefined,
      { timeout: 30_000 },
    );

    const t1 = await page.evaluate(() => document.querySelector('audio')!.currentTime);
    await page.waitForTimeout(1600);
    const after = await page.evaluate(() => {
      const a = document.querySelector('audio')!;
      return {
        t: a.currentTime,
        src: a.currentSrc,
        duration: a.duration,
        paused: a.paused,
        error: a.error?.code ?? null,
      };
    });

    expect(after.error, 'the media element reports no error').toBeNull();
    expect(after.src, 'a real audio URL is wired in').toMatch(/^https?:\/\//);
    // THE ASSERTION THAT MATTERS: the clock moved. readyState and a non-paused
    // flag can both be true for a stalled stream; only elapsed time proves
    // bytes are being decoded.
    expect(after.t, `currentTime advanced past ${t1}`).toBeGreaterThan(t1);
    expect(after.duration, 'a finite duration was read from the stream').toBeGreaterThan(0);
  });

  test('pause stops the clock', async ({ page }) => {
    await page.goto(await firstEpisodeUrl(page));
    await page.getByRole('button', { name: /^play$/i }).first().click();
    await page.waitForFunction(
      () => {
        const a = document.querySelector('audio');
        return !!a && !a.paused && a.currentTime > 0;
      },
      undefined,
      { timeout: 30_000 },
    );

    await page.getByRole('button', { name: /^pause$/i }).first().click();
    await page.waitForFunction(() => document.querySelector('audio')?.paused === true, undefined, {
      timeout: 10_000,
    });

    const t1 = await page.evaluate(() => document.querySelector('audio')!.currentTime);
    await page.waitForTimeout(1200);
    const t2 = await page.evaluate(() => document.querySelector('audio')!.currentTime);
    expect(t2, 'the clock is frozen while paused').toBeCloseTo(t1, 1);
  });

  test('playback survives navigating to another page', async ({ page }) => {
    // The whole point of hoisting the player to app root. A per-page <audio>
    // unmounts on the first in-app link and the episode dies mid-sentence.
    await page.goto(await firstEpisodeUrl(page));
    await page.getByRole('button', { name: /^play$/i }).first().click();
    await page.waitForFunction(
      () => {
        const a = document.querySelector('audio');
        return !!a && !a.paused && a.currentTime > 0;
      },
      undefined,
      { timeout: 30_000 },
    );
    const src = await page.evaluate(() => document.querySelector('audio')!.currentSrc);

    // Client-side navigation only — a full reload legitimately stops audio.
    await page.getByRole('link', { name: /^news$/i }).first().click();
    await page.waitForURL(/\/news\/?$/, { timeout: 20_000 });

    const survived = await page.evaluate(() => {
      const a = document.querySelector('audio');
      return { present: !!a, paused: a?.paused, src: a?.currentSrc, t: a?.currentTime ?? 0 };
    });
    expect(survived.present, 'the player is still mounted after navigating').toBe(true);
    expect(survived.src, 'still holding the same episode').toBe(src);
    expect(survived.paused, 'still playing after navigating').toBe(false);
  });
});
