import { describe, expect, it, vi } from 'vitest';
import { inlineCssUrls, inlineEntryCssHtml } from '../../../scripts/vite/inline-entry-css';

describe('entry stylesheet delivery', () => {
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
    expect(html).toContain(
      'href="/assets/css/index-abc.css" disabled data-inlined-entry-css-marker',
    );
    expect(html.indexOf('<style')).toBeGreaterThan(html.indexOf('theme()</script>'));
    expect(html.indexOf('<style')).toBeLessThan(html.indexOf('<script type="module"'));
    expect(html.indexOf('<style')).toBeLessThan(html.indexOf('<link rel="modulepreload"'));
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

  it('does not let stylesheet text terminate its HTML style element', () => {
    const result = inlineEntryCssHtml(
      '<link href="/assets/css/index-a.css" rel="stylesheet">',
      () => 'a:after{content:"</style><script>bad()</script>"}',
    );
    const document = new DOMParser().parseFromString(result, 'text/html');
    expect(document.querySelectorAll('style')).toHaveLength(1);
    expect(document.querySelectorAll('script')).toHaveLength(0);
  });

  it('does not inline external stylesheets or preload hints', () => {
    const read = vi.fn();
    const html =
      '<link rel="stylesheet" href="https://cdn.example/assets/css/index-a.css"><link rel="preload" as="style" href="/assets/css/index-a.css">';
    expect(inlineEntryCssHtml(html, read)).toBe(html);
    expect(read).not.toHaveBeenCalled();
  });
});
