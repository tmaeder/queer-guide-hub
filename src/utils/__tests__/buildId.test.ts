import { afterEach, describe, expect, it } from 'vitest';
import { readBuildId, readSentryRelease } from '../buildId';

/**
 * The build ID is read from index.html, never compiled into a chunk: a value
 * baked into a chunk renamed ~540 of 672 chunks on every commit (see
 * injectBuildIdMeta in vite.config.ts).
 */
function setMeta(content: string | null) {
  document.head.querySelectorAll('meta[name="qg-build-id"]').forEach((m) => m.remove());
  if (content === null) return;
  const m = document.createElement('meta');
  m.name = 'qg-build-id';
  m.content = content;
  document.head.appendChild(m);
}

afterEach(() => setMeta(null));

describe('readBuildId', () => {
  it('reads the meta tag', () => {
    setMeta('c79580bca10cbb328cc710b522dcf575c8725d4a');
    expect(readBuildId()).toBe('c79580bca10cbb328cc710b522dcf575c8725d4a');
  });

  it("is 'dev' without a tag, so the dev server never offers an update", () => {
    expect(readBuildId()).toBe('dev');
  });
});

describe('readSentryRelease', () => {
  it('is the commit SHA on a CI build', () => {
    setMeta('c79580bca10cbb328cc710b522dcf575c8725d4a');
    expect(readSentryRelease()).toBe('c79580bca10cbb328cc710b522dcf575c8725d4a');
  });

  it('is undefined for a local build or the dev server', () => {
    setMeta('local-1787327428937');
    expect(readSentryRelease()).toBeUndefined();
    setMeta(null);
    expect(readSentryRelease()).toBeUndefined();
  });
});
