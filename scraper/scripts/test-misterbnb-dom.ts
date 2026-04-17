import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto('https://www.misterbandb.com/s/london', {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
  } catch {
    // Timeout is OK — the page has persistent network activity
    console.log('Navigation timeout (expected for SPA), proceeding...');
  }

  // Extra wait for SPA to render
  await page.waitForTimeout(5000);

  // Find what selectors match listing items
  const analysis = await page.evaluate(() => {
    const results: string[] = [];

    // Try various selectors
    const attempts = [
      'a[href*="/rooms/"]',
      'a[href*="/listing/"]',
      'a[href*="/place/"]',
      '[class*="Listing"]',
      '[class*="listing"]',
      '[class*="Accommodation"]',
      '[class*="accommodation"]',
      '[class*="Property"]',
      '[class*="property"]',
      '[class*="Card"]',
      '[class*="card"]',
      '[class*="Result"]',
      '[class*="result"]',
      '[class*="Item"]',
      '[class*="Host"]',
      '[data-id]',
      '[data-listing-id]',
    ];

    for (const sel of attempts) {
      const els = document.querySelectorAll(sel);
      if (els.length > 0) {
        results.push(`\n${sel}: ${els.length} elements`);
        const first = els[0];
        results.push(`  tag: ${first.tagName}`);
        results.push(`  classes: ${first.className}`);
        results.push(`  text: ${first.textContent?.trim().substring(0, 200)}`);
        if (els.length > 1) {
          const second = els[1];
          results.push(`  2nd text: ${second.textContent?.trim().substring(0, 200)}`);
        }
      }
    }

    // Also inspect all elements with "See prices" text to find parent containers
    const priceButtons = Array.from(document.querySelectorAll('*')).filter(
      (el) => el.textContent?.trim() === 'See prices',
    );
    results.push(`\n"See prices" buttons: ${priceButtons.length}`);
    if (priceButtons.length > 0) {
      const parent = priceButtons[0].closest('div, article, section, li');
      if (parent) {
        results.push(`  Parent tag: ${parent.tagName}`);
        results.push(`  Parent classes: ${parent.className}`);
        results.push(`  Parent HTML (500): ${parent.outerHTML.substring(0, 500)}`);

        // Go up more levels
        const grandParent = parent.parentElement;
        if (grandParent) {
          results.push(`  GrandParent tag: ${grandParent.tagName}`);
          results.push(`  GrandParent classes: ${grandParent.className}`);
        }
      }
    }

    return results.join('\n');
  });

  console.log(analysis);

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
