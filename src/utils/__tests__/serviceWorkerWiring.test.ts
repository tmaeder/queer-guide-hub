import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// public/sw.js is asset-heal layer 1 (retries poisoned immutable /assets/*
// responses with cache:'reload'). PWAProvider.test.tsx proves PWAProvider
// calls register('/sw.js'); this proves the chain around it still holds,
// because each link can be removed without that test noticing.
const read = (p: string) => readFileSync(resolve(__dirname, '../../..', p), 'utf8');
const stripComments = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

describe('service worker wiring', () => {
  it('AppProviders mounts PWAProvider (the only registrar)', () => {
    const src = stripComments(read('src/providers/AppProviders.tsx'));
    expect(src).toMatch(/<PWAProvider>/);
    expect(src).toMatch(/<\/PWAProvider>/);
  });

  it('PWAProvider registers /sw.js at root scope', () => {
    const src = stripComments(read('src/components/pwa/PWAProvider.tsx'));
    expect(src).toMatch(/serviceWorker\.register\(\s*'\/sw\.js',\s*\{\s*scope:\s*'\/'/);
  });

  it('sw.js still carries the cache:reload heal for immutable assets', () => {
    const src = stripComments(read('public/sw.js'));
    expect(src).toMatch(/fetch\(new Request\(request,\s*\{\s*cache:\s*'reload'\s*\}\)\)/);
    expect(src).toMatch(/self\.clients\.claim\(\)/);
  });

  it('/sw.js bypasses Pages Functions and is never immutable', () => {
    const routes = JSON.parse(read('public/_routes.json'));
    expect(routes.exclude).toContain('/sw.js');
    // Every `/sw.js` block: the indented header lines directly under the path.
    const blocks = [...read('public/_headers').matchAll(/^\/sw\.js\n((?:[ \t]+.*\n?)+)/gm)].map(
      (m) => m[1],
    );
    expect(blocks.length, '/sw.js header block').toBeGreaterThan(0);
    for (const b of blocks) expect(b).not.toMatch(/immutable/);
  });
});
