import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..');
const SCRIPT = join(ROOT, 'scripts', 'data-quality', 'crawl-gays-cruising.mjs');
const source = readFileSync(SCRIPT, 'utf8');

describe('gays-cruising one-time crawler', () => {
  it('requires the written-consent reference before contacting the origin', () => {
    expect(source).toMatch(/function requireConsent/);
    expect(source).toMatch(/const consentRef = requireConsent\(\);/);
    expect(source.indexOf('const consentRef = requireConsent();')).toBeLessThan(
      source.indexOf('chromium.launch'),
    );
  });

  it('uses only the canonical Spanish sitemap inventory', () => {
    expect(source).toMatch(/includes\(['"]\/sitemaps\/es\/['"]\)/);
    expect(source).toMatch(/expected 3 Spanish child sitemaps/);
  });

  it('deduplicates on the positive numeric source ID', () => {
    expect(source).toMatch(/\/_\(\\d\+\)\$\//);
    expect(source).toMatch(/seen\.has\(id\)/);
    expect(source).toMatch(/seen\.add\(id\)/);
  });

  it('records stale sitemap IDs as source-side not-found errors', () => {
    expect(source).toMatch(/Number\(raw\.id\) === 0/);
    expect(source).toMatch(/source_not_found/);
  });

  it('does not persist the API description field', () => {
    expect(source).not.toMatch(/description:\s*raw\./);
    expect(source).not.toMatch(/descripcion:\s*raw\./);
    expect(source).toMatch(/user-authored `descripcion`[\s\S]*discarded/);
  });

  it('bounds concurrency and retries transient failures', () => {
    expect(source).toMatch(/Math\.min\(16,/);
    expect(source).toMatch(/MAX_ATTEMPTS = 5/);
    expect(source).toMatch(/2 \*\* \(attempt - 1\)/);
  });

  it('handles an interrupt after the active batch so the checkpoint stays valid', () => {
    expect(source).toMatch(/process\.once\(['"]SIGINT['"]/);
    expect(source).toMatch(/if \(stopRequested\) break/);
  });

  it('writes a resumable checkpoint and a checksum report', () => {
    expect(source).toMatch(/loadCheckpoint/);
    expect(source).toMatch(/createWriteStream\(OUTPUT, \{ flags: ['"]a['"] \}\)/);
    expect(source).toMatch(/sha256: sha256\(OUTPUT\)/);
  });
});
