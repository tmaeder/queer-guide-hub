import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  console.log('Navigating to IGLTA pride calendar...');
  await page.goto('https://www.iglta.org/events/pride-calendar/', {
    waitUntil: 'networkidle',
    timeout: 30000,
  });

  await page.waitForTimeout(5000);

  const title = await page.title();
  console.log('Page title:', title);

  const structure = await page.evaluate(() => {
    const results: string[] = [];
    const selectors = [
      'article', '.event-item', '.listing-item', '[data-nav-item]',
      '.event-card', '.card', '.pride-event', '[class*="event"]',
      '[class*="listing"]', '[class*="pride"]', '[class*="calendar"]',
      'table', '.grid', '.list',
    ];

    for (const sel of selectors) {
      const els = document.querySelectorAll(sel);
      if (els.length > 0) {
        results.push(`\n${sel}: ${els.length} elements`);
        const first = els[0];
        results.push(`  First: ${first.outerHTML.substring(0, 400)}`);
      }
    }

    const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4')).map(
      (h) => `${h.tagName}: ${h.textContent?.trim().substring(0, 80)}`,
    );
    results.push('\nHeadings: ' + JSON.stringify(headings, null, 2));
    results.push(`\nBody text length: ${document.body.innerText.length}`);
    results.push(`Body preview:\n${document.body.innerText.substring(0, 2000)}`);

    return results.join('\n');
  });

  console.log('\n=== DOM Structure ===');
  console.log(structure);

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
