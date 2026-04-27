import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  console.log('Navigating to IGLTA pride calendar...');
  await page.goto('https://www.iglta.org/events/pride-calendar/', {
    waitUntil: 'networkidle',
    timeout: 30000,
  });

  await page.waitForTimeout(3000);

  // Scroll to load more events
  for (let i = 0; i < 20; i++) {
    await page.evaluate(() => window.scrollBy(0, 800));
    await page.waitForTimeout(500);
  }

  // Wait a bit for lazy-loaded content
  await page.waitForTimeout(2000);

  // Extract all event items with full detail
  const events = await page.evaluate(() => {
    const items: Array<Record<string, string | null>> = [];

    document.querySelectorAll('.item[data-type="events"], .item[data-recid]').forEach((el) => {
      const recid = el.getAttribute('data-recid');
      const title = el.querySelector('h4, h3, .title')?.textContent?.trim() || null;
      const link = el.querySelector('a')?.getAttribute('href') || null;

      // Get ALL text content from date-related elements
      const dateEls = el.querySelectorAll('.date-range, .dates, .date, time, [class*="date"]');
      const dateTexts = Array.from(dateEls).map((d) => d.textContent?.trim()).filter(Boolean);

      // Get all text in the item for fallback
      const allText = el.textContent?.trim() || '';

      // Look for location
      const locationEl = el.querySelector('.location, .city, [class*="location"]');
      const location = locationEl?.textContent?.trim() || null;

      // Get the inner HTML structure (truncated)
      const innerHtml = el.innerHTML.substring(0, 800);

      items.push({
        recid,
        title,
        link,
        dateTexts: dateTexts.join(' | ') || null,
        location,
        allText: allText.substring(0, 300),
        innerHtml,
      });
    });

    return items;
  });

  console.log(`\nFound ${events.length} event items\n`);

  for (const e of events) {
    console.log(`--- ${e.title} ---`);
    console.log(`  recid: ${e.recid}`);
    console.log(`  link: ${e.link}`);
    console.log(`  dateTexts: ${e.dateTexts}`);
    console.log(`  location: ${e.location}`);
    console.log(`  allText: ${e.allText?.substring(0, 200)}`);
    console.log(`  innerHTML snippet: ${e.innerHtml?.substring(0, 400)}`);
    console.log('');
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
