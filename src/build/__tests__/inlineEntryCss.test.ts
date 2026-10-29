import { describe, expect, it, vi } from 'vitest';
import {
  inlineEntryCss,
  inlineCssUrls,
  inlineEntryCssHtml,
  reuseInlinedCss,
} from '../../../scripts/vite/inline-entry-css';

describe('entry stylesheet delivery', () => {
  it('does not replace a compiler failure with a missing-output cleanup error', () => {
    for (const hook of ['buildEnd', 'renderError'] as const) {
      const plugin = inlineEntryCss();
      const handler = plugin[hook];
      const close = plugin.closeBundle;
      if (typeof handler !== 'function' || typeof close !== 'function')
        throw new Error('Expected build lifecycle handlers');
      Reflect.apply(handler, {}, [new Error('Original compiler error')]);
      expect(() => Reflect.apply(close, {}, [])).not.toThrow();
    }
  });
  it('registers actual inline styles with the preload helper and rejects unknown helpers', () => {
    const code = 'const links = document.getElementsByTagName("link");';
    const rewritten = reuseInlinedCss(code);
    document.head.innerHTML =
      '<style data-inlined-entry-css="/assets/css/index-x.css">body{color:red}</style>';
    const preloadedHrefs = { all: new Set(), styles: new Set() };
    new Function('document', 'preloadedHrefs', rewritten)(document, preloadedHrefs);
    expect([...preloadedHrefs.styles]).toEqual([
      new URL('/assets/css/index-x.css', document.baseURI).href,
    ]);
    expect(preloadedHrefs.all).toEqual(preloadedHrefs.styles);
    expect(() => reuseInlinedCss('changed upstream helper')).toThrow('Vite preload helper changed');
    document.head.innerHTML = '';
  });
  it('makes the generated app styles available in the document and preserves route styles', () => {
    const read = vi.fn(() => 'body{font-family:Space Grotesk}');
    const html = inlineEntryCssHtml(
      '<head><script>theme()</script><script type="module" src="/assets/js/index-abc.js"></script><link rel="modulepreload" href="/assets/js/vendor-x.js"><link rel="stylesheet" crossorigin href="/assets/css/index-abc.css"><link rel="stylesheet" href="/assets/css/News-xyz.css"></head>',
      read,
    );
    expect(html).toContain(
      '<style data-inlined-entry-css="/assets/css/index-abc.css">body{font-family:Space Grotesk}</style>',
    );
    expect(html).toContain('<link rel="stylesheet" href="/assets/css/News-xyz.css">');
    expect(html).toContain('<script type="module" src="/assets/js/index-abc.js"></script>');
    expect(read).toHaveBeenCalledExactlyOnceWith('/assets/css/index-abc.css');
    expect(html).not.toContain('data-inlined-entry-css-marker');
    expect(html).not.toContain('rel="stylesheet" crossorigin');
  });

  it('keeps CSS image/font paths correct on deep routes and leaves data URLs intact', () => {
    const data =
      "url(\"data:image/svg+xml,<svg><filter id='n'/><rect filter='url(%23n)'/></svg>\")";
    const css = `.a{background:url('../images/photo.webp?v=1#crop')}.b{src:url(/fonts/body.woff2)}.c{filter:url(#mask)}.d{background:${data}}`;
    const result = inlineCssUrls(css, '/assets/css/index-abc.css');
    expect(result).toContain('url("/assets/images/photo.webp?v=1#crop")');
    expect(result).toContain('url(/fonts/body.woff2)');
    expect(result).toContain('url(#mask)');
    expect(result).toContain(data);
  });

  it('handles long unterminated escaped URLs without overlapping regex alternatives', () => {
    const malformed = 'url(' + '\\('.repeat(20000);
    expect(inlineCssUrls(malformed, '/assets/css/index-a.css')).toBe(malformed);
    for (const prefix of ['url(', 'url("', "url('"]) {
      const spaces = prefix + ' '.repeat(30000);
      expect(inlineCssUrls(spaces, '/assets/css/index-a.css')).toBe(spaces);
    }
    expect(inlineCssUrls('url(   )', '/assets/css/index-a.css')).toBe('url(   )');
    expect(() => inlineCssUrls('url(icons\\(new\\).svg)', '/assets/css/index-a.css')).toThrow(
      'Unsupported escaped relative CSS asset URL',
    );
  });

  it('does not let stylesheet text terminate its HTML style element', () => {
    const result = inlineEntryCssHtml(
      '<link href="/assets/css/index-a.css" rel="stylesheet">',
      () => 'a:after{content:"</style><script>bad()</script>"}',
    );
    const document = new DOMParser().parseFromString(result, 'text/html');
    expect(document.querySelectorAll('style')).toHaveLength(1);
    expect(
      [...document.querySelectorAll('script')].some((script) =>
        script.textContent?.includes('bad()'),
      ),
    ).toBe(false);
  });

  it('does not inline external stylesheets or preload hints', () => {
    const read = vi.fn();
    const html =
      '<link rel="stylesheet" href="https://cdn.example/assets/css/index-a.css"><link rel="preload" as="style" href="/assets/css/index-a.css">';
    expect(inlineEntryCssHtml(html, read)).toBe(html);
    expect(read).not.toHaveBeenCalled();
  });
});
