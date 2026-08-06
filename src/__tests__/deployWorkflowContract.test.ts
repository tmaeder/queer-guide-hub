import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = join(__dirname, '..', '..');
const workflow = readFileSync(join(REPO, '.github/workflows/deploy-pages.yml'), 'utf8');
const pkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'));

describe('deploy-pages workflow', () => {
  it('pins wranglerVersion to the exact devDependency', () => {
    // cloudflare/wrangler-action shells out to `npx wrangler@<version>`. When
    // that version is not already in node_modules, npx goes to the registry —
    // and on 2026-08-06 it failed with "npx canceled due to missing packages
    // and no YES option". The build succeeded, NOTHING was uploaded, and the
    // shell referencing the new chunks was already live: every request for a
    // missing chunk got the 200 SPA fallback, which the edge then cached under
    // `immutable, max-age=31536000`. queer.guide was blank for ~80 minutes.
    //
    // Pinning both to the same exact version makes npx resolve from the tree
    // `npm ci` already installed, so a registry hiccup cannot take the site
    // down. They drift the moment someone bumps one of them, which is exactly
    // what this asserts.
    const declared = pkg.devDependencies?.wrangler;
    expect(declared, 'wrangler must be a devDependency so npx resolves it locally').toBeDefined();
    expect(declared, 'wrangler must be pinned exactly, not a ^ or ~ range').toMatch(
      /^\d+\.\d+\.\d+$/,
    );

    const pinned = workflow.match(/wranglerVersion:\s*'([^']+)'/)?.[1];
    expect(pinned, 'deploy-pages.yml must pin wranglerVersion').toBeDefined();
    expect(pinned).toBe(declared);
  });

  it('still smoke-tests the deployed site', () => {
    // The deploy went green twice on 2026-08-01 while the site was down,
    // because nothing in the workflow looked at the result. Removing this step
    // restores that.
    expect(workflow).toContain('scripts/smoke-pages.sh');
  });
});
