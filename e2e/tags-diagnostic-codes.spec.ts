import { test, expect } from '@playwright/test';

// The Diagnostic codes band on a glossary entry.
//
// Worth guarding because every way this breaks is SILENT. The band renders
// only when `get_tag_medical_codes` returns rows, so revoking the anon EXECUTE
// grant, dropping the anon SELECT on `tag_medical_codes`, or a sync that
// retracts everything all look identical to "this term simply has no codes" —
// no error, no empty state, just a page that quietly lost a section.
//
// Endometriosis is the fixture rather than HIV/AIDS on purpose: it is the case
// where a single ICD-11 MMS code pairs with a single Foundation id, so it is
// the one that proves the URL is actually composed. HIV/AIDS carries two MMS
// codes against one Foundation id and therefore deliberately renders NO link
// (linking both to one concept would send a reader to the wrong one).

test.describe('@smoke tag diagnostic codes', () => {
  test('a coded term shows the band, linked to the issuing body', async ({ page }) => {
    await page.goto('/tags/endometriosis');

    const band = page.locator('#codes');
    await expect(band).toBeVisible({ timeout: 20_000 });
    await expect(band.getByRole('heading', { name: /diagnostic codes/i })).toBeVisible();

    // The disclaimer is the line that says these are reference codes and not a
    // diagnosis. On an LGBTQ+ health page it is not decoration.
    await expect(band).toContainText(/not medical advice/i);

    // At least one code links OUT, in a new tab, with rel hardened. The code is
    // the link text, so the accessible name has to come from aria-label.
    const link = band.locator('a[target="_blank"]').first();
    await expect(link).toHaveAttribute('rel', /noopener/);
    await expect(link).toHaveAttribute('href', /^https?:\/\//);
    await expect(link).toHaveAttribute('aria-label', /.+/);

    // The route strip and the rail both react to the band existing.
    await expect(page.locator('a[href="#codes"]').first()).toBeVisible();
  });

  test('an uncoded term renders no band at all, not an empty one', async ({ page }) => {
    // Mayonnaise is filed under a HEALTH category ("Substances & Harm
    // Reduction"), which is exactly why it is the control: it proves the band
    // is driven by whether clinical codes exist, not by the tag's category.
    await page.goto('/tags/mayonnaise');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 });

    await expect(page.locator('#codes')).toHaveCount(0);
    await expect(page.locator('a[href="#codes"]')).toHaveCount(0);
    await expect(page.getByText(/diagnostic codes/i)).toHaveCount(0);
  });
});
