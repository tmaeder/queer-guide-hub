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
    console.log('Navigation timeout (expected), proceeding...');
  }

  await page.waitForTimeout(3000);

  // Just dump what we see
  const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 3000));
  console.log('=== BODY TEXT ===');
  console.log(bodyText);

  // Check for listing-like anchor tags
  const links = await page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll('a'));
    return anchors
      .filter((a) => {
        const href = a.getAttribute('href') || '';
        return (
          href.includes('/rooms/') ||
          href.includes('/listing/') ||
          href.includes('/place/') ||
          href.includes('/accommodation/')
        );
      })
      .map((a) => ({
        href: a.getAttribute('href'),
        text: a.textContent?.trim().substring(0, 100),
      }))
      .slice(0, 10);
  });

  console.log('\n=== LISTING LINKS ===');
  console.log(JSON.stringify(links, null, 2));

  // Find what kind of repeating elements exist
  const repeating = await page.evaluate(() => {
    // Look for elements that contain accommodation names
    const candidates = Array.from(document.querySelectorAll('*')).filter((el) => {
      const text = el.textContent?.trim() || '';
      return (
        el.children.length < 10 &&
        text.length > 10 &&
        text.length < 200 &&
        (text.includes('★') || text.includes('Wi-Fi') || text.includes('Welcoming'))
      );
    });

    return candidates.slice(0, 5).map((el) => ({
      tag: el.tagName,
      classes: el.className?.toString().substring(0, 200),
      text: el.textContent?.trim().substring(0, 200),
    }));
  });

  console.log('\n=== REPEATING PATTERNS ===');
  console.log(JSON.stringify(repeating, null, 2));

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
