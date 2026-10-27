import { describe, expect, it } from 'vitest';
import { brandStyleTag } from './branding';

describe('brandStyleTag CSP nonce', () => {
  it('authorizes the injected style block, which HTMLRewriter does not revisit', () => {
    const html = brandStyleTag(
      { tokens: { light: { background: '60 33% 97%' } } },
      'response-nonce',
    );
    const doc = new DOMParser().parseFromString(html!, 'text/html');
    expect(doc.querySelector('style')?.nonce).toBe('response-nonce');
    expect(doc.querySelector('style')?.textContent).toContain('--background:60 33% 97%');
  });
  it('does not interpolate nonce text as HTML', () => {
    const html = brandStyleTag(
      { tokens: { light: { background: '60 33% 97%' } } },
      '"><script>bad()</script>',
    );
    const doc = new DOMParser().parseFromString(html!, 'text/html');
    expect(doc.querySelectorAll('script')).toHaveLength(0);
    expect(doc.querySelectorAll('style')).toHaveLength(1);
  });
});
