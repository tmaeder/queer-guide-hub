import { test, expect } from '@playwright/test';

// P0-1 — Tag relationship graph view must load without 403 from get_tag_graph_data.
// Bug: the SECURITY DEFINER RPC was missing GRANT EXECUTE for anon/authenticated.
// This spec verifies (a) the RPC call returns 200, and (b) the canvas mounts and
// the graph reports a non-zero "tags, links" badge instead of falling back to an
// empty/error state.
//
// Until the migration applies in the target environment, this spec will fail.
// Tagged so CI can opt into running it after deploy verification.

test.describe('@p0-1 /resources tag graph', () => {
  test('graph view loads tags + links from get_tag_graph_data (no 403)', async ({ page }) => {
    const rpcResponse = page.waitForResponse(
      (resp) =>
        resp.url().includes('/rest/v1/rpc/get_tag_graph_data') &&
        resp.request().method() === 'POST',
    );

    await page.goto('/resources');

    // Switch into the graph view. The control may be a tab, button, or
    // segmented control depending on the latest UI — match by accessible
    // name to keep this resilient.
    const graphSwitch = page.getByRole('tab', { name: /graph|network/i }).first();
    if (await graphSwitch.count()) {
      await graphSwitch.click();
    } else {
      await page.getByRole('button', { name: /graph|network/i }).first().click();
    }

    const response = await rpcResponse;
    expect(response.status(), 'RPC must succeed (would be 403 without the GRANT)').toBe(200);

    // The graph header reports the number of tags + links once data resolves.
    const badge = page.getByText(/\d+\s+tags?,\s+\d+\s+links?/i);
    await expect(badge).toBeVisible({ timeout: 10_000 });

    const text = (await badge.textContent()) || '';
    const [tags, links] = text.match(/\d+/g)?.map(Number) ?? [0, 0];
    expect(tags, 'graph must contain at least one node').toBeGreaterThan(0);
    expect(links, 'graph must contain at least one edge').toBeGreaterThan(0);

    // Error UI must NOT be present.
    await expect(page.getByTestId('tag-graph-error')).toHaveCount(0);
  });
});
