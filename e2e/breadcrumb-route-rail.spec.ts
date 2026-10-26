import { test, expect, type Page } from '@playwright/test';

// The breadcrumb rail draws an SVG curve with HTML station rings on top.
// Two invariants: every visible ring sits on the curve, and every label
// shares one baseline. Measured, not asserted from classes.
const URL = '/events/new-shit-a-queer-literary-wip-mic-2';

async function measure(page: Page) {
  return page.evaluate(() => {
    const path = [...document.querySelectorAll<SVGPathElement>(
      '.route-network-rail__breadcrumb-map path',
    )].find((p) => getComputedStyle(p).display !== 'none');
    if (!path) return null;
    const m = path.getScreenCTM()!;
    const len = path.getTotalLength();
    const pts: [number, number][] = [];
    for (let i = 0; i <= 3000; i++) {
      const p = path.getPointAtLength((len * i) / 3000);
      pts.push([m.a * p.x + m.e, m.d * p.y + m.f]);
    }
    const rings = [...document.querySelectorAll('.route-network-rail__crumb-ring')].filter(
      (r) => r.getClientRects().length,
    );
    const offsets = rings.map((r) => {
      const b = r.getBoundingClientRect();
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height / 2;
      const n = pts.reduce((a, p) => (Math.abs(p[0] - cx) < Math.abs(a[0] - cx) ? p : a));
      return Math.abs(cy - n[1]);
    });
    const labels = [...document.querySelectorAll('[data-breadcrumb-stop] span.truncate')]
      .filter((l) => l.getClientRects().length)
      .map((l) => Math.round(l.getBoundingClientRect().bottom));
    return { offsets, labels };
  });
}

for (const vp of [
  { name: 'desktop', width: 1440, height: 900, stops: 5 },
  { name: 'mobile', width: 375, height: 812, stops: 3 },
]) {
  test(`breadcrumb rings sit on the line (${vp.name})`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto(URL);
    await expect(page.getByTestId('breadcrumb-route')).toBeVisible();
    const r = await measure(page);
    expect(r).not.toBeNull();
    // Positive control: the trail actually rendered its stations.
    expect(r!.offsets).toHaveLength(vp.stops);
    for (const o of r!.offsets) expect(o).toBeLessThan(1.5);
    expect(new Set(r!.labels).size).toBe(1);
  });
}
