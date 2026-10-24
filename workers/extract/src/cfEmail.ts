/**
 * Cloudflare email obfuscation leaves `[email protected]` in the HTML and the real
 * address XOR-encoded in `data-cfemail` / `/cdn-cgi/l/email-protection#<hex>`.
 * The decoder script never runs here, so without this the address is lost.
 * Mirror: supabase/functions/_shared/news-quality/cf-email.ts (keep in step).
 */
import type * as cheerio from 'cheerio';

const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

export function decodeCfEmail(hex: string): string | null {
  if (!/^(?:[0-9a-f]{2}){2,}$/i.test(hex)) return null;
  const key = parseInt(hex.slice(0, 2), 16);
  let out = '';
  for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
  return EMAIL.test(out) ? out : null;
}

/** Replaces each obfuscated address with its plain-text address, in place. */
export function restoreCfEmails($: cheerio.CheerioAPI): void {
  $('[data-cfemail]').each((_i, el) => {
    const addr = decodeCfEmail($(el).attr('data-cfemail') ?? '');
    if (addr) $(el).replaceWith($('<b>').text(addr).contents());
  });
  $('a[href*="/cdn-cgi/l/email-protection"]').each((_i, el) => {
    const hash = ($(el).attr('href') ?? '').split('#')[1] ?? '';
    const text = $(el).text().trim();
    const addr = decodeCfEmail(hash) ?? (EMAIL.test(text) ? text : null);
    if (addr) $(el).replaceWith($('<b>').text(addr).contents());
  });
}
