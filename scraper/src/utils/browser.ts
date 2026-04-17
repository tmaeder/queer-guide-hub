import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { childLogger } from './logger.js';
import { config } from '../config.js';

const log = childLogger('browser');

let activeBrowsers = 0;
const MAX_BROWSERS = config.scraper.maxConcurrentBrowsers;

/** Semaphore to limit concurrent browsers */
async function acquireBrowser(): Promise<void> {
  while (activeBrowsers >= MAX_BROWSERS) {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  activeBrowsers++;
}

function releaseBrowser(): void {
  activeBrowsers = Math.max(0, activeBrowsers - 1);
}

export interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  close: () => Promise<void>;
}

/**
 * Launch a browser with concurrency control.
 * The caller must call session.close() when done.
 */
export async function launchBrowser(userAgent: string): Promise<BrowserSession> {
  await acquireBrowser();

  try {
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });

    const context = await browser.newContext({
      userAgent,
      viewport: { width: 1280, height: 720 },
      locale: 'en-US',
    });

    const page = await context.newPage();

    log.debug('Browser launched');

    return {
      browser,
      context,
      page,
      close: async () => {
        try {
          await context.close();
          await browser.close();
        } catch {
          // ignore close errors
        } finally {
          releaseBrowser();
          log.debug('Browser closed');
        }
      },
    };
  } catch (err) {
    releaseBrowser();
    throw err;
  }
}

/** Navigate to a URL with auto-wait */
export async function navigateAndWait(
  page: Page,
  url: string,
  options?: {
    waitForSelector?: string;
    timeout?: number;
  },
): Promise<void> {
  const timeout = options?.timeout ?? 30_000;
  await page.goto(url, { waitUntil: 'networkidle', timeout });
  if (options?.waitForSelector) {
    await page.waitForSelector(options.waitForSelector, { timeout });
  }
}
