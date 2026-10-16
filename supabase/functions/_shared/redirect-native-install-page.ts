import { nativeInstallBrowser } from './redirect-native-install-browser.ts';
export interface NativeInstallChoice {
  id: string;
  platform: 'ios' | 'android';
  displayName: string;
  storeId: string;
  storeUrl: string;
  appClipBundleId?: string;
}
const installEscape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );
export function nativeInstallChoices(value: unknown): NativeInstallChoice[] {
  if (!Array.isArray(value) || value.length > 10) throw new Error('Invalid public app choices');
  const ids = new Set<string>();
  return value.map((input: unknown) => {
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw new Error('Invalid public app');
    const row = input as Record<string, unknown>;
    if (
      Object.keys(row).some(
        (key) =>
          !['id', 'platform', 'displayName', 'storeId', 'storeUrl', 'appClipBundleId'].includes(
            key,
          ),
      ) ||
      typeof row.id !== 'string' ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(row.id) ||
      ids.has(row.id) ||
      !['ios', 'android'].includes(String(row.platform)) ||
      typeof row.displayName !== 'string' ||
      !row.displayName.trim() ||
      row.displayName.length > 100 ||
      Array.from(row.displayName).some(
        (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
      ) ||
      typeof row.storeId !== 'string' ||
      typeof row.storeUrl !== 'string'
    )
      throw new Error('Invalid public app');
    if (row.platform === 'ios') {
      if (
        !/^[1-9][0-9]{0,19}$/.test(row.storeId) ||
        row.storeUrl !== 'https://apps.apple.com/app/id' + row.storeId ||
        typeof row.appClipBundleId !== 'string' ||
        row.appClipBundleId.length > 244 ||
        !/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(row.appClipBundleId)
      )
        throw new Error('Invalid public iOS app');
    } else if (
      !/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/.test(row.storeId) ||
      row.storeId.length > 255 ||
      row.storeUrl !== 'https://play.google.com/store/apps/details?id=' + row.storeId ||
      row.appClipBundleId !== undefined
    )
      throw new Error('Invalid public Android app');
    ids.add(row.id);
    return {
      id: row.id,
      platform: row.platform as 'ios' | 'android',
      displayName: row.displayName.trim(),
      storeId: row.storeId,
      storeUrl: row.storeUrl,
      ...(typeof row.appClipBundleId === 'string' ? { appClipBundleId: row.appClipBundleId } : {}),
    };
  });
}
/** A rendering-only response. The caller must load current source eligibility;
 * password verification and event/receipt creation happen only on native POST. */
export function nativeInstallPage(
  canonicalUrl: string,
  query: URLSearchParams,
  choicesInput: unknown,
  passwordRequired: boolean,
  mode: 'install' | 'resume',
  selectedApp?: string | null,
): Response {
  const source = new URL(canonicalUrl);
  if (
    source.protocol !== 'https:' ||
    source.username ||
    source.password ||
    source.port ||
    source.search ||
    source.hash
  )
    throw new Error('Invalid handoff source');
  const choices = nativeInstallChoices(choicesInput);
  const selected =
    mode === 'install'
      ? choices.find((choice) => choice.id === selectedApp && choice.platform === 'ios')
      : undefined;
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(18)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  const config = JSON.stringify({
    canonicalUrl,
    mode,
    choices,
    selectedApp: selected?.id ?? null,
  }).replace(/</g, '\\u003c');
  const esc = installEscape;
  const clean = new URL(canonicalUrl);
  for (const [key, value] of query)
    if (!['qg_handoff', 'qg_app_choice', 'pw', 'password', 'qg_click_id'].includes(key))
      clean.searchParams.append(key, value);
  const banner = selected
    ? '<meta name="apple-itunes-app" content="app-id=' +
      esc(selected.storeId) +
      ', app-clip-bundle-id=' +
      esc(selected.appClipBundleId!) +
      ', app-clip-display=card">'
    : '';
  const radios = choices
    .map(
      (app) =>
        '<label class="app"><input type="radio" name="app" value="' +
        esc(app.id) +
        '"' +
        (selected?.id === app.id || choices.length === 1 ? ' checked' : '') +
        ' required><span><strong>' +
        esc(app.displayName) +
        '</strong><span>' +
        (app.platform === 'ios' ? 'iPhone · App Clip' : 'Android · Google Play') +
        '</span></span></label>',
    )
    .join('');
  const form = choices.length
    ? '<form id="handoff-form" method="post" action="' +
      esc(source.pathname + '?qg_handoff=' + mode) +
      '"><fieldset><legend>Choose your app</legend>' +
      radios +
      '</fieldset>' +
      (passwordRequired
        ? '<div id="password-field"><label for="password">Link password</label><input id="password" name="password" type="password" maxlength="256" autocomplete="current-password"></div>'
        : '') +
      '<label class="consent"><input id="consent" type="checkbox"><span>Allow this app to keep my link context and connect this visit to actions I take in the app.</span></label>' +
      '<p class="hint">Optional. Use the same device to install. You can continue on the web without allowing an app handoff.</p>' +
      '<button id="handoff-submit" type="submit" disabled>' +
      (mode === 'resume' ? 'Continue with my link' : 'Prepare app handoff') +
      '</button></form>'
    : '<p>No app installation is available for this link. You can still continue on the web.</p>';
  const html =
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' +
    (mode === 'resume' ? 'Continue with your link' : 'Keep your link in the app') +
    ' · queer.guide</title>' +
    banner +
    '<style nonce="' +
    nonce +
    '">body{font:16px system-ui;margin:0;background:#fafaf5;color:#111;display:grid;min-height:100vh;min-height:100dvh;place-items:center}main{width:min(100%,34rem);box-sizing:border-box;padding:2rem}h1{font-size:1.75rem;line-height:1.2;margin:0 0 1rem}p{line-height:1.5}fieldset{border:0;padding:0;margin:1.75rem 0 1.5rem}legend{font-weight:600;margin-bottom:.65rem}.app{display:flex;align-items:center;gap:.8rem;border-bottom:1px solid #d1d1ca;padding:1rem 0;cursor:pointer}.app span span{display:block;font-size:.875rem;color:#555;margin-top:.25rem}.app strong{overflow-wrap:anywhere}.consent{display:flex;align-items:flex-start;gap:.8rem;line-height:1.5;margin-top:1.5rem}input[type=radio],input[type=checkbox]{width:1.25rem;height:1.25rem;flex-shrink:0;accent-color:#111;cursor:pointer}input[type=checkbox]{margin-top:.2rem}input[type=password],input[readonly]{box-sizing:border-box;width:100%;font:inherit;padding:.8rem;margin:.5rem 0;border:1px solid #777;border-radius:.5rem;background:#fff;color:#111}button,.primary{display:block;box-sizing:border-box;width:100%;padding:.9rem;font:inherit;font-weight:600;border:1px solid #111;border-radius:.5rem;background:#111;color:#fff;text-align:center;text-decoration:none;cursor:pointer}button:hover,.primary:hover{background:#333}button:disabled{cursor:not-allowed;opacity:.6}form[aria-busy=true] button{cursor:wait}button[hidden],[hidden]{display:none!important}input:focus-visible,button:focus-visible,a:focus-visible,summary:focus-visible{outline:3px solid #405cff;outline-offset:3px}a{color:inherit;text-underline-offset:.2em}.hint{font-size:.875rem;color:#555}#handoff-status{overflow-wrap:anywhere}#handoff-ready{margin:1.5rem 0}details{margin:1.25rem 0}summary{cursor:pointer;padding:.5rem 0}.web{margin:1.75rem 0 0;padding-top:1.25rem;border-top:1px solid #d1d1ca}::selection{background:#111;color:#fff}@media(max-width:420px){main{padding:1.5rem}}</style></head><body><main><h1>' +
    (mode === 'resume' ? 'Continue with your link' : 'Keep your link in the app') +
    '</h1><p>' +
    (mode === 'resume'
      ? 'We’ll check that your saved link is still available before continuing.'
      : 'Choose an app to keep this link through installation.') +
    '</p>' +
    form +
    '<p id="handoff-status" role="status" aria-live="polite">' +
    (selected
      ? 'On iPhone, open the App Clip using Safari’s banner above. Install the full app from the Clip to keep your link.'
      : '') +
    '</p><section id="handoff-ready" hidden aria-label="Your private app link"><a id="store-link" class="primary" rel="noreferrer">Install from Google Play</a><details><summary>Keep a private resume link</summary><p class="hint">Use this as a fallback if the app cannot recover your link. It expires within 24 hours. Anyone with it can continue this visit; keep it private.</p><label for="resume-link">Private resume link</label><input id="resume-link" readonly autocomplete="off" spellcheck="false"></details></section><p class="web"><a href="' +
    esc(clean.href) +
    '">Continue on the web</a></p><noscript><p>JavaScript is needed for an app handoff. You can continue on the web.</p></noscript></main><script id="handoff-config" type="application/json" nonce="' +
    nonce +
    '">' +
    config +
    '</script><script nonce="' +
    nonce +
    '">(' +
    nativeInstallBrowser.toString() +
    ')();</script></body></html>';
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      Vary: 'Accept',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy':
        "default-src 'none'; script-src 'nonce-" +
        nonce +
        "'; style-src 'nonce-" +
        nonce +
        "'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    },
  });
}
