import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

/**
 * Covers user-facing upload error copy for the Contribute → Submit Event flow.
 * Uses client-side rejection paths (size + type) — these do not require the
 * analyze-flyer edge function and exercise the toUploadError normalization.
 */

async function makeTempFile(name: string, sizeBytes: number, content: Buffer): Promise<string> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qg-upload-'));
  const p = path.join(dir, name);
  const buf = Buffer.alloc(sizeBytes, 0);
  content.copy(buf, 0, 0, Math.min(content.length, sizeBytes));
  fs.writeFileSync(p, buf);
  return p;
}

// /submit/event shows an auth gate for anon visitors — the upload form (and
// its file input) only renders signed-in. Skip rather than time out when the
// run has no session.
async function fileInputOrSkip(page: import('@playwright/test').Page) {
  const input = page.locator('input[type="file"]').first();
  const visible = await input
    .waitFor({ state: 'attached', timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  test.skip(!visible, 'No file input — /submit/event is auth-gated for anon sessions.');
  return input;
}

test.describe('submit-event upload errors', () => {
  test('oversize file shows the too-large copy', async ({ page }) => {
    await page.goto('/submit/event');

    const filePath = await makeTempFile('huge.png', 21 * 1024 * 1024, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const input = await fileInputOrSkip(page);
    await input.setInputFiles(filePath);

    await expect(page.getByText(/too large/i)).toBeVisible({ timeout: 10_000 });
    fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
  });

  test('unsupported file type shows the unsupported copy and no retry', async ({ page }) => {
    await page.goto('/submit/event');

    const filePath = await makeTempFile('bundle.zip', 1024, Buffer.from('PK'));
    const input = await fileInputOrSkip(page);
    await input.setInputFiles(filePath);

    await expect(page.getByText(/can't read this file type|unsupported/i)).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole('button', { name: /retry/i })).toHaveCount(0);
    fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
  });
});
