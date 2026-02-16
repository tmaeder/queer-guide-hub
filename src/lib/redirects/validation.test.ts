import { describe, it, expect } from 'vitest';
import {
  validateSlug,
  validateTarget,
  validateSourcePath,
  mergeQueryParams,
  detectLoop,
} from './validation';

// ── Slug Validation ─────────────────────────────────────────────────────────

describe('validateSlug', () => {
  it('accepts valid slugs', () => {
    expect(validateSlug('pride-zrh')).toEqual({ valid: true });
    expect(validateSlug('nyc')).toEqual({ valid: true });
    expect(validateSlug('my-event-2026')).toEqual({ valid: true });
    expect(validateSlug('a1b')).toEqual({ valid: true });
    expect(validateSlug('abc')).toEqual({ valid: true });
  });

  it('rejects empty slug', () => {
    expect(validateSlug('')).toEqual({ valid: false, error: 'Slug is required' });
  });

  it('rejects slugs shorter than 3 characters', () => {
    const result = validateSlug('ab');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('at least 3');
  });

  it('rejects slugs longer than 64 characters', () => {
    const result = validateSlug('a'.repeat(65));
    expect(result.valid).toBe(false);
    expect(result.error).toContain('at most 64');
  });

  it('rejects slugs with uppercase letters', () => {
    const result = validateSlug('MySlug');
    expect(result.valid).toBe(false);
  });

  it('rejects slugs starting with hyphen', () => {
    const result = validateSlug('-abc');
    expect(result.valid).toBe(false);
  });

  it('rejects slugs ending with hyphen', () => {
    const result = validateSlug('abc-');
    expect(result.valid).toBe(false);
  });

  it('rejects slugs with spaces', () => {
    const result = validateSlug('my slug');
    expect(result.valid).toBe(false);
  });

  it('rejects slugs with special characters', () => {
    expect(validateSlug('my_slug').valid).toBe(false);
    expect(validateSlug('my.slug').valid).toBe(false);
    expect(validateSlug('my/slug').valid).toBe(false);
  });

  it('rejects reserved words', () => {
    expect(validateSlug('admin').valid).toBe(false);
    expect(validateSlug('api').error).toContain('reserved');
    expect(validateSlug('login').valid).toBe(false);
    expect(validateSlug('sitemap').valid).toBe(false);
    expect(validateSlug('public').valid).toBe(false);
  });
});

// ── Target Validation ───────────────────────────────────────────────────────

describe('validateTarget', () => {
  it('accepts relative paths', () => {
    expect(validateTarget('/events/pride')).toEqual({ valid: true });
    expect(validateTarget('/venues/bar-zurich')).toEqual({ valid: true });
    expect(validateTarget('/')).toEqual({ valid: true });
    expect(validateTarget('/page?q=test')).toEqual({ valid: true });
  });

  it('rejects empty target', () => {
    expect(validateTarget('')).toEqual({ valid: false, error: 'Target URL is required' });
    expect(validateTarget('   ')).toEqual({ valid: false, error: 'Target URL is required' });
  });

  it('blocks javascript: protocol', () => {
    const result = validateTarget('javascript:alert(1)');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('javascript:');
  });

  it('blocks data: protocol', () => {
    expect(validateTarget('data:text/html,<h1>Hi</h1>').valid).toBe(false);
  });

  it('blocks vbscript: protocol', () => {
    expect(validateTarget('vbscript:MsgBox("Hi")').valid).toBe(false);
  });

  it('blocks blob: protocol', () => {
    expect(validateTarget('blob:http://evil.com/abc').valid).toBe(false);
  });

  it('blocks file: protocol', () => {
    expect(validateTarget('file:///etc/passwd').valid).toBe(false);
  });

  it('accepts allowlisted external domains', () => {
    expect(validateTarget('https://queer.guide/events').valid).toBe(true);
    expect(validateTarget('https://www.queer.guide/page').valid).toBe(true);
    expect(validateTarget('https://queer-guide.pages.dev/test').valid).toBe(true);
  });

  it('rejects external domains not in allowlist', () => {
    const result = validateTarget('https://evil.com/phish');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('not in the allowlist');
  });

  it('rejects path traversal in relative paths', () => {
    expect(validateTarget('/../../etc/passwd').valid).toBe(false);
    expect(validateTarget('//evil.com').valid).toBe(false);
  });

  it('rejects invalid URLs', () => {
    const result = validateTarget('not-a-valid-url');
    expect(result.valid).toBe(false);
  });
});

// ── Source Path Validation ──────────────────────────────────────────────────

describe('validateSourcePath', () => {
  it('accepts valid paths', () => {
    expect(validateSourcePath('/old/page')).toEqual({ valid: true });
    expect(validateSourcePath('/venues/123')).toEqual({ valid: true });
    expect(validateSourcePath('/*')).toEqual({ valid: true });
  });

  it('rejects empty path', () => {
    expect(validateSourcePath('').valid).toBe(false);
  });

  it('rejects paths not starting with /', () => {
    expect(validateSourcePath('old/page').valid).toBe(false);
  });

  it('rejects paths with ..', () => {
    expect(validateSourcePath('/../evil').valid).toBe(false);
  });
});

// ── Query Parameter Merging ─────────────────────────────────────────────────

describe('mergeQueryParams', () => {
  it('preserves incoming query params', () => {
    const result = mergeQueryParams('/target', {
      mode: 'PRESERVE',
      incomingQuery: 'utm_source=qr&ref=twitter',
    });
    expect(result).toBe('/target?utm_source=qr&ref=twitter');
  });

  it('preserves target params and adds incoming', () => {
    const result = mergeQueryParams('/target?existing=1', {
      mode: 'PRESERVE',
      incomingQuery: 'utm_source=qr&existing=2',
    });
    // existing=1 from target takes precedence
    expect(result).toContain('existing=1');
    expect(result).toContain('utm_source=qr');
    expect(result).not.toContain('existing=2');
  });

  it('drops incoming query params', () => {
    const result = mergeQueryParams('/target', {
      mode: 'DROP',
      incomingQuery: 'utm_source=qr',
    });
    expect(result).toBe('/target');
  });

  it('keeps target params when dropping', () => {
    const result = mergeQueryParams('/target?page=1', {
      mode: 'DROP',
      incomingQuery: 'utm_source=qr',
    });
    expect(result).toBe('/target?page=1');
  });

  it('applies overrides', () => {
    const result = mergeQueryParams('/target', {
      mode: 'OVERRIDE',
      incomingQuery: 'utm_source=old',
      overrides: { utm_source: 'override', ref: 'campaign' },
    });
    expect(result).toContain('utm_source=override');
    expect(result).toContain('ref=campaign');
    expect(result).not.toContain('utm_source=old');
  });

  it('applies UTM defaults when not present', () => {
    const result = mergeQueryParams('/target', {
      mode: 'PRESERVE',
      incomingQuery: 'ref=twitter',
      utmDefaults: { utm_source: 'qr', utm_medium: 'print' },
    });
    expect(result).toContain('ref=twitter');
    expect(result).toContain('utm_source=qr');
    expect(result).toContain('utm_medium=print');
  });

  it('does not override existing params with UTM defaults', () => {
    const result = mergeQueryParams('/target', {
      mode: 'PRESERVE',
      incomingQuery: 'utm_source=existing',
      utmDefaults: { utm_source: 'default' },
    });
    expect(result).toContain('utm_source=existing');
    expect(result).not.toContain('utm_source=default');
  });

  it('handles absolute URLs', () => {
    const result = mergeQueryParams('https://queer.guide/events?page=1', {
      mode: 'PRESERVE',
      incomingQuery: 'ref=qr',
    });
    expect(result).toBe('https://queer.guide/events?page=1&ref=qr');
  });

  it('returns clean URL when no params', () => {
    const result = mergeQueryParams('/target', {
      mode: 'DROP',
    });
    expect(result).toBe('/target');
  });
});

// ── Loop Detection ──────────────────────────────────────────────────────────

describe('detectLoop', () => {
  it('detects direct loops (same path)', () => {
    const result = detectLoop('/go/abc', '/go/abc');
    expect(result.safe).toBe(false);
    expect(result.error).toContain('loop');
  });

  it('detects target pointing to /go/', () => {
    const result = detectLoop('/go/abc', '/go/other-slug');
    expect(result.safe).toBe(false);
    expect(result.error).toContain('chain');
  });

  it('allows different paths', () => {
    const result = detectLoop('/go/abc', '/events/pride');
    expect(result.safe).toBe(true);
  });

  it('allows external targets', () => {
    const result = detectLoop('/go/abc', 'https://queer.guide/events');
    expect(result.safe).toBe(true);
  });

  it('detects loop for same-origin absolute URL', () => {
    const result = detectLoop('/go/abc', 'https://queer.guide/go/abc');
    expect(result.safe).toBe(false);
  });
});
