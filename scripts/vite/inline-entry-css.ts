import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

/** Preserve asset resolution when a generated stylesheet moves into HTML. */
export function inlineCssUrls(css: string, stylesheetHref: string): string {
  const urls = /url\(\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|((?:\\.|[^)])*))\s*\)/gi;
  return css.replace(urls, (original, doubleQuoted, singleQuoted, bare) => {
    const value = String(doubleQuoted ?? singleQuoted ?? bare).trim();
    if (!value || /^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(value)) return original;
    if (value.includes('\\')) throw new Error('Unsupported escaped relative CSS asset URL');
    const url = new URL(value, new URL(stylesheetHref, 'https://build.invalid/'));
    return `url(${JSON.stringify(`${url.pathname}${url.search}${url.hash}`)})`;
  });
}

/** Inline only the app's generated global stylesheet; route CSS stays cached. */
export function inlineEntryCssHtml(html: string, readAsset: (href: string) => string): string {
  return html.replace(/<link\b[^>]*>/gi, (tag) => {
    const rel = /\brel=["']([^"']+)["']/i.exec(tag)?.[1];
    const href = /\bhref=["']([^"']+)["']/i.exec(tag)?.[1];
    if (rel !== 'stylesheet' || !href || !/^\/?assets\/css\/index-[\w-]+\.css$/.test(href)) {
      return tag;
    }
    const css = inlineCssUrls(readAsset(href), href)
      .replace(/\/\*# sourceMappingURL=[^\n]*\*\/\s*$/, '')
      .replace(/<\/style/gi, (closing) => closing.replace('/', '\\/'));
    // The Pages middleware's existing ScriptNonceInjector stamps this original
    // style element with the response nonce, just as it does authored styles.
    return `<style data-inlined-entry-css="${href}">${css}</style>`;
  });
}

export function inlineEntryCss(): Plugin {
  let outDir: string;
  return {
    name: 'inline-entry-css',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const htmlPath = path.join(outDir, 'index.html');
      const html = fs.readFileSync(htmlPath, 'utf8');
      const inlined = inlineEntryCssHtml(html, (href) =>
        fs.readFileSync(path.join(outDir, href.replace(/^\//, '')), 'utf8'),
      );
      if (inlined === html) throw new Error('Generated entry stylesheet was not found');
      fs.writeFileSync(htmlPath, inlined);
    },
  };
}
