import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    userAgent: 'QueerGuideBot/1.0 (+https://queer.guide/about; LGBTQ+ community project)',
  });

  // Test homepage
  console.log('Testing MisterBnB homepage...');
  const homeResp = await page.goto('https://www.misterbandb.com/', {
    waitUntil: 'networkidle',
    timeout: 30000,
  });
  console.log('Homepage status:', homeResp?.status());
  console.log('Title:', await page.title());

  const hasBlock = await page.evaluate(() => {
    const text = document.body.innerHTML.toLowerCase();
    return (
      text.includes('captcha') ||
      text.includes('access denied') ||
      text.includes('verify you are human') ||
      text.includes('please sign in')
    );
  });
  console.log('Blocked:', hasBlock);

  if (hasBlock) {
    const preview = await page.evaluate(() => document.body.innerText.substring(0, 500));
    console.log('Body preview:', preview);
    await browser.close();
    return;
  }

  // Try a destination page
  console.log('\nTesting destination page /s/london ...');
  const destResp = await page.goto('https://www.misterbandb.com/s/london', {
    waitUntil: 'networkidle',
    timeout: 30000,
  });
  console.log('Destination status:', destResp?.status());

  await page.waitForTimeout(3000);

  const listings = await page.evaluate(() => {
    const items = document.querySelectorAll(
      '[class*="listing"], [class*="property"], article, .card',
    );
    const results: string[] = [];
    items.forEach((el) => {
      const text = el.textContent?.trim().substring(0, 100);
      if (text) results.push(text);
    });
    return { count: items.length, samples: results.slice(0, 5) };
  });

  console.log('Found listing-like elements:', listings.count);
  console.log('Samples:', listings.samples);

  const bodyPreview = await page.evaluate(() =>
    document.body.innerText.substring(0, 800),
  );
  console.log('\nBody preview:', bodyPreview);

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
