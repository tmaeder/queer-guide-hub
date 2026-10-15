/* eslint no-control-regex: "off" -- Rejecting ASCII control characters is intentional input/header validation. */
export interface PasswordPageBranding {
  brandName: string | null;
  logo: { url: string; width: number; height: number } | null;
  imageOrigin: string | null;
}
export function passwordPageBranding(
  input: unknown,
  projectUrl: string,
): PasswordPageBranding | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const data = input as Record<string, unknown>;
  const brandName =
    typeof data.brandName === 'string' &&
    data.brandName.trim() &&
    data.brandName.length <= 80 &&
    !/[\x00-\x1f\x7f]/.test(data.brandName)
      ? data.brandName.trim()
      : null;
  let logo: PasswordPageBranding['logo'] = null,
    imageOrigin: string | null = null;
  const asset = data.logoAsset as Record<string, unknown> | null | undefined;
  if (
    asset &&
    typeof asset === 'object' &&
    !Array.isArray(asset) &&
    typeof asset.id === 'string' &&
    typeof asset.sha256 === 'string' &&
    /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(projectUrl) &&
    /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(asset.id) &&
    typeof asset.mime === 'string' &&
    ['image/png', 'image/jpeg'].includes(asset.mime) &&
    asset.key === asset.id + (asset.mime === 'image/png' ? '.png' : '.jpg') &&
    typeof asset.bytes === 'number' &&
    Number.isInteger(asset.bytes) &&
    asset.bytes > 0 &&
    asset.bytes <= 1500000 &&
    typeof asset.width === 'number' &&
    Number.isInteger(asset.width) &&
    asset.width > 0 &&
    asset.width <= 1024 &&
    typeof asset.height === 'number' &&
    Number.isInteger(asset.height) &&
    asset.height > 0 &&
    asset.height <= 1024 &&
    /^[a-f0-9]{64}$/.test(asset.sha256)
  ) {
    imageOrigin = projectUrl.replace(/\/$/, '');
    logo = {
      url: imageOrigin + '/storage/v1/object/public/redirect-brand-assets/' + asset.key,
      width: asset.width,
      height: asset.height,
    };
  }
  return brandName || logo ? { brandName, logo, imageOrigin } : null;
}
const passwordHtmlEscape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );
export function redirectPasswordPage(
  status: number,
  title: string,
  message: string,
  password = false,
  head = false,
  branding: PasswordPageBranding | null = null,
): Response {
  const esc = passwordHtmlEscape;
  const form = password
    ? '<form method="post"><label for="password">Link password</label><input id="password" name="password" type="password" maxlength="256" autocomplete="current-password" required><button type="submit">Continue</button></form>'
    : '';
  const logo = branding?.logo
    ? '<img class="logo" src="' +
      esc(branding.logo.url) +
      '" width="' +
      branding.logo.width +
      '" height="' +
      branding.logo.height +
      '" alt="' +
      esc(branding.brandName ? branding.brandName + ' logo' : 'Link logo') +
      '" crossorigin="anonymous" referrerpolicy="no-referrer">'
    : '';
  const label = branding?.brandName ? '<p class="brand">' + esc(branding.brandName) + '</p>' : '';
  const html =
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' +
    esc(title) +
    ' · ' +
    esc(branding?.brandName ?? 'queer.guide') +
    '</title><style>body{font:16px system-ui;margin:0;background:#fafaf5;color:#111;display:grid;min-height:100vh;min-height:100dvh;place-items:center}main{width:min(100%,32rem);box-sizing:border-box;padding:2rem}.logo{display:block;max-width:12rem;max-height:7rem;width:auto;height:auto;object-fit:contain;margin-bottom:1.5rem}.brand{font-weight:600;overflow-wrap:anywhere}h1{font-size:1.75rem;line-height:1.2}input,button{display:block;box-sizing:border-box;width:100%;margin:1rem 0;padding:.8rem;font:inherit;border:1px solid #777;border-radius:.5rem}input:focus-visible,button:focus-visible{outline:3px solid #405cff;outline-offset:3px}button{cursor:pointer;background:#111;color:#fff;border-color:#111}p{line-height:1.5}</style></head><body><main>' +
    logo +
    label +
    '<h1>' +
    esc(title) +
    '</h1><p>' +
    esc(message) +
    '</p>' +
    form +
    '</main></body></html>';
  return new Response(head ? null : html, {
    status,
    headers: {
      'Cache-Control': 'no-cache, no-store',
      'X-Robots-Tag': 'noindex',
      'Referrer-Policy': 'no-referrer',
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy':
        "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'; img-src " +
        (branding?.imageOrigin ?? "'none'"),
    },
  });
}
