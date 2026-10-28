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
  const styles: string[] = [];
  const document = html.replace(/<link\b[^>]*>/gi, (tag) => {
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
    styles.push(`<style data-inlined-entry-css="${href}">${css}</style>`);
    // A disabled link does not fetch or apply CSS. Its URL lets Vite's lazy
    // preload helper recognize that these rules are already supplied by HTML.
    // https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/link#disabled
    return tag.replace(/\/?>$/, ' disabled data-inlined-entry-css-marker>');
  });
  if (styles.length === 0) return html;
  // Supply styles before module discovery so initial rendering does not compete
  // with the full startup graph. Keep existing theme/font boot hints ahead.
  const module = document.search(
    /<(?:script\b[^>]*\btype=["']module["']|link\b[^>]*\brel=["']modulepreload["'])/i,
  );
  const headEnd = document.search(/<\/head>/i);
  const insertion = module >= 0 ? module : headEnd >= 0 ? headEnd : 0;
  return document.slice(0, insertion) + styles.join('\n') + '\n' + document.slice(insertion);
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
