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
  wrapper_bg: '#0a0a0a',
  wrapper_fg: '#fafafa',
};

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

/**
 * Minimal table wrapper for email clients (inline styles only). Wraps the
 * rendered template HTML in the branded frame.
 */
export function wrapHtml(inner: string, branding: EmailBranding): string {
  const header = branding.logo_url
    ? `<img src="${escapeHtml(branding.logo_url)}" alt="${escapeHtml(branding.from_name)}" height="32" style="height:32px;width:auto;display:block;" />`
    : `<span style="font-size:16px;font-weight:600;color:${branding.wrapper_fg};">${escapeHtml(branding.from_name)}</span>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${branding.wrapper_bg};padding:24px 0;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
      <tr><td style="padding:0 24px 16px;">${header}</td></tr>
      <tr><td style="background-color:#ffffff;border-radius:8px;padding:24px;color:#111111;font-family:system-ui,-apple-system,sans-serif;">${inner}</td></tr>
      <tr><td style="padding:16px 24px 0;font-size:11px;color:${branding.wrapper_fg};opacity:0.7;font-family:system-ui,-apple-system,sans-serif;">© Queer Guide · <a href="https://queer.guide" style="color:${branding.wrapper_fg};">queer.guide</a></td></tr>
    </table>
  </td></tr>
</table>`;
}
