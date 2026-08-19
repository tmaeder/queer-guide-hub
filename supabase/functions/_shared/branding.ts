/**
 * Email branding from the site_branding control center (/admin/design).
 *
 * Reads `site_branding.published->email` with a 60s in-isolate memo and hard
 * fallbacks — a missing row, kill switch, or fetch failure yields today's
 * hardcoded identity. All values were validated by `branding_validate` at
 * write time; formats are re-checked here as defense in depth.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';

export type EmailBranding = {
  from_name: string;
  from_address: string;
  logo_url?: string;
  wrapper_bg: string;
  wrapper_fg: string;
};

const DEFAULTS: EmailBranding = {
  from_name: 'The Queer Guide',
  from_address: 'noreply@queer.guide',
  // Frame grey + ink, the live brand. This shell was still dark-mode
  // (#0a0a0a on #fafafa) from before the rebrand: every transactional mail
  // the product sent looked like a different company from the site.
  wrapper_bg: '#EDEDE6',
  wrapper_fg: '#111111',
};

/**
 * ONE accent per message class, and the class is what the accent encodes —
 * never severity, never risk. These are the four track colours doing the job
 * they exist for on the site: telling you which line you are on.
 *
 * `unsubscribable` is a product rule, not a style: account mail is
 * transactional and must always be delivered; only the digest is bulk.
 */
export const MESSAGE_CLASSES = {
  account: { accent: '#00B4E6', label: 'Account', unsubscribable: false },
  receipt: { accent: '#2BE05A', label: 'Receipt', unsubscribable: false },
  contribution: { accent: '#FF1F8F', label: 'Contribution', unsubscribable: false },
  digest: { accent: '#FFD500', label: 'Digest', unsubscribable: true },
} as const;

export type MessageClass = keyof typeof MESSAGE_CLASSES;

/**
 * Anton is the display face on the site and cannot be webfont-loaded in mail
 * (Gmail strips @font-face; Outlook never had it). Impact is the closest
 * ubiquitous condensed grotesque, and the chain degrades to any sans rather
 * than to a serif. Body is Space Grotesk with the same reasoning.
 */
const DISPLAY_STACK = "Impact,'Haettenschweiler','Arial Narrow Bold',Arial,sans-serif";
const BODY_STACK = "'Space Grotesk',Helvetica,Arial,sans-serif";

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const TTL_MS = 60_000;
let memo: { value: EmailBranding; expiresAt: number } | null = null;

export async function getEmailBranding(): Promise<EmailBranding> {
  const now = Date.now();
  if (memo && memo.expiresAt > now) return memo.value;
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY');
    if (!url || !key) return memo?.value ?? DEFAULTS;
    const supabase = createClient(url, key);
    const { data } = await supabase
      .from('site_branding')
      .select('published,overrides_enabled')
      .eq('id', 1)
      .maybeSingle();
    const email =
      data && data.overrides_enabled !== false
        ? ((data.published as { email?: Record<string, string> } | null)?.email ?? {})
        : {};
    const value: EmailBranding = {
      from_name:
        typeof email.from_name === 'string' && email.from_name.length > 0 && !/[<>@"]/.test(email.from_name)
          ? email.from_name
          : DEFAULTS.from_name,
      from_address:
        typeof email.from_address === 'string' && /^[^@\s"<>]+@[^@\s"<>]+\.[^@\s"<>]+$/.test(email.from_address)
          ? email.from_address
          : DEFAULTS.from_address,
      logo_url:
        typeof email.logo_url === 'string' && /^https:\/\/[^\s"'<>]{1,255}$/.test(email.logo_url)
          ? email.logo_url
          : undefined,
      wrapper_bg: HEX_RE.test(email.wrapper_bg ?? '') ? email.wrapper_bg : DEFAULTS.wrapper_bg,
      wrapper_fg: HEX_RE.test(email.wrapper_fg ?? '') ? email.wrapper_fg : DEFAULTS.wrapper_fg,
    };
    memo = { value, expiresAt: now + TTL_MS };
    return value;
  } catch {
    return memo?.value ?? DEFAULTS;
  }
}

/** RFC 5322 display form: `The Queer Guide <noreply@queer.guide>` */
export function fromHeader(branding: EmailBranding): string {
  return `${branding.from_name} <${branding.from_address}>`;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export type WrapOptions = {
  /** Which line this message is on. Defaults to `account` — the safest class:
   *  it is never treated as bulk, so a mis-tagged mail is under-suppressed
   *  rather than silently unsubscribed. */
  messageClass?: MessageClass;
  /** Plain sentence saying why this landed in their inbox. Required by the
   *  footer band; a mail that cannot explain itself reads as spam. */
  reason?: string;
  /** One-click unsubscribe. Only rendered for a bulk class — offering it on a
   *  receipt promises something the product will not honour. */
  unsubscribeUrl?: string;
  preferencesUrl?: string;
  /** Rendered as a solid ink block. One per message, by the spec. */
  action?: { label: string; url: string };
  /** Sits above the body in the display face. Lowercase sentence case. */
  subject?: string;
};

const POSTAL = 'Queer Guide · Europaallee 40 · 8004 Zürich · Switzerland';

/**
 * The 600px single-column shell: ink on paper, one accent per message class,
 * one solid-ink primary action, no gradients, no shadows, no background
 * images. Layout is nested TABLES with inline styles — the source mock is
 * authored in flex/grid and neither survives Outlook's Word renderer.
 *
 * Radius follows the LIVE system (18px container / 12px element), not the
 * "square corners everywhere" line in the older email spec. That line predates
 * the soft re-skin, which reversed it system-wide to "Nothing square"; the
 * mock contradicted itself on the same point by shipping an 18px secondary
 * button. Matching the site is the tie-breaker.
 */
export function wrapHtml(inner: string, branding: EmailBranding, opts: WrapOptions = {}): string {
  const cls = MESSAGE_CLASSES[opts.messageClass ?? 'account'];
  const header = branding.logo_url
    ? `<img src="${escapeHtml(branding.logo_url)}" alt="${escapeHtml(branding.from_name)}" height="28" style="height:28px;width:auto;display:block;border:0;" />`
    : `<span style="font-family:${DISPLAY_STACK};font-size:20px;letter-spacing:0.01em;color:${branding.wrapper_fg};">${escapeHtml(branding.from_name)}</span>`;

  // The accent is a rule, not a wash: a 4px bar on the card's top edge. A
  // filled panel would put body text on a track colour, which fails contrast
  // on three of the four.
  const accentBar = `<tr><td style="background-color:${cls.accent};font-size:0;line-height:0;height:4px;">&nbsp;</td></tr>`;

  const subject = opts.subject
    ? `<tr><td style="padding:24px 24px 0;font-family:${DISPLAY_STACK};font-size:28px;line-height:1.15;color:#111111;">${escapeHtml(opts.subject)}</td></tr>`
    : '';

  const action = opts.action
    ? `<tr><td style="padding:8px 24px 24px;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="background-color:#111111;border-radius:12px;">
          <a href="${escapeHtml(opts.action.url)}" style="display:inline-block;padding:12px 20px;font-family:${BODY_STACK};font-size:15px;font-weight:700;color:#FAFAF5;text-decoration:none;">${escapeHtml(opts.action.label)}</a>
        </td>
      </tr></table>
    </td></tr>`
    : '';

  // Only a bulk class gets an unsubscribe link, and only if one was supplied.
  const unsub =
    cls.unsubscribable && opts.unsubscribeUrl
      ? ` · <a href="${escapeHtml(opts.unsubscribeUrl)}" style="color:#111111;">Unsubscribe</a>`
      : '';
  const prefs = opts.preferencesUrl
    ? ` · <a href="${escapeHtml(opts.preferencesUrl)}" style="color:#111111;">Email preferences</a>`
    : '';
  const reason = opts.reason ? `${escapeHtml(opts.reason)}<br />` : '';

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${branding.wrapper_bg};padding:24px 0;margin:0;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
      <tr><td style="padding:0 24px 16px;">${header}</td></tr>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FAFAF5;border-radius:18px;overflow:hidden;">
        ${accentBar}
        ${subject}
        <tr><td style="padding:16px 24px 24px;color:#111111;font-family:${BODY_STACK};font-size:15px;line-height:1.55;">${inner}</td></tr>
        ${action}
      </table>
      <tr><td style="padding:16px 24px 0;font-size:12px;line-height:1.5;color:${branding.wrapper_fg};font-family:${BODY_STACK};">
        ${reason}${escapeHtml(POSTAL)}<br />
        <a href="https://queer.guide" style="color:${branding.wrapper_fg};">queer.guide</a>${prefs}${unsub}
      </td></tr>
    </table>
  </td></tr>
</table>`;
}

/**
 * The plain-text twin. Every message ships one: a text/plain part is what
 * screen-reader users, text-only clients and most spam filters actually read,
 * and a missing one is itself a deliverability signal.
 *
 * Deliberately a real conversion, not `stripTags(html)` — block elements have
 * to become line breaks or the whole mail arrives as one run-on paragraph, and
 * a link whose href is dropped is unusable in text.
 */
/** Strip tags to a FIXED POINT, not in one pass.
 *
 *  `<scr<script>ipt>` survives a single `/<[^>]*>/g` — the inner match is
 *  removed and the outer halves close up into a live tag behind it. Looping
 *  until the string stops changing is the only way a regex strip is sound.
 *  An unterminated `<tag` at the end is dropped too: nothing in this string
 *  can close it, but whatever a caller concatenates afterwards can.
 */
function stripTags(input: string): string {
  let out = input;
  let prev: string;
  do {
    prev = out;
    out = out.replace(/<[^>]*>/g, '');
  } while (out !== prev);
  return out.replace(/<[^>]*$/, '');
}

/** Decode entities in ONE pass.
 *
 *  Sequential `.replace()` calls double-unescape: decoding `&amp;` first turns
 *  `&amp;lt;` into `&lt;`, and the later `&lt;` rule then turns it into a real
 *  `<`. A single pass consumes each entity exactly once and never re-scans its
 *  own output, so `&amp;lt;` correctly stays the literal text `&lt;`.
 */
const ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  '#39': "'",
};
const decodeEntities = (v: string) =>
  v.replace(/&(nbsp|amp|lt|gt|quot|#39);/g, (_m, name: string) => ENTITIES[name] ?? _m);

/**
 * The plain-text twin. Every message ships one: a text/plain part is what
 * screen-reader users, text-only clients and most spam filters actually read,
 * and a missing one is itself a deliverability signal.
 *
 * Deliberately a real conversion, not `stripTags(html)` alone — block elements
 * have to become line breaks or the whole mail arrives as one run-on
 * paragraph, and a link whose href is dropped is unusable in text.
 */
export function toPlainText(html: string, opts: WrapOptions = {}): string {
  const body = decodeEntities(
    stripTags(
      html
        // Element CONTENT, not just the tags: the text inside <style>/<script>
        // is not prose and must not survive into the body.
        .replace(/<style\b[\s\S]*?<\/style\s*>/gi, '')
        .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
        .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href, text) =>
          // `text (url)`, NOT `text <url>`: the tag strip below matches
          // `<https://…>` exactly like a tag and would delete every link
          // target it had just written.
          `${stripTags(String(text)).trim()} (${href})`)
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|tr|h[1-6]|li)\s*>/gi, '\n')
        .replace(/<li\b[^>]*>/gi, '- '),
    ),
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const cls = MESSAGE_CLASSES[opts.messageClass ?? 'account'];
  const parts = [
    opts.subject ? `${opts.subject}\n` : '',
    body,
    opts.action ? `\n${opts.action.label}: ${opts.action.url}` : '',
    '\n---',
    opts.reason ?? '',
    POSTAL,
    'https://queer.guide',
    opts.preferencesUrl ? `Email preferences: ${opts.preferencesUrl}` : '',
    cls.unsubscribable && opts.unsubscribeUrl ? `Unsubscribe: ${opts.unsubscribeUrl}` : '',
  ].filter(Boolean);
  return parts.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
