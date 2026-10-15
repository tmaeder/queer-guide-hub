/// <reference lib="dom" />
/** Serialized into the first-party page. Keep all runtime dependencies inside
 * this function: no assets, cookies, storage, logging or automatic requests. */
export function nativeInstallBrowser(
  navigate: (url: string) => void = (url) => location.assign(url),
) {
  type Choice = {
    id: string;
    platform: 'ios' | 'android';
    displayName: string;
    storeId: string;
    storeUrl: string;
    appClipBundleId?: string;
  };
  type Receipt = { v: 1; app: string; token: string; expires: number };
  const config = JSON.parse(document.getElementById('handoff-config')!.textContent!) as {
    canonicalUrl: string;
    mode: 'install' | 'resume';
    choices: Choice[];
    selectedApp: string | null;
  };
  const form = document.getElementById('handoff-form') as HTMLFormElement | null;
  const consent = document.getElementById('consent') as HTMLInputElement | null;
  const password = document.getElementById('password') as HTMLInputElement | null;
  const status = document.getElementById('handoff-status')!;
  const button = document.getElementById('handoff-submit') as HTMLButtonElement | null;
  const ready = document.getElementById('handoff-ready')!;
  const store = document.getElementById('store-link') as HTMLAnchorElement;
  const privateLink = document.getElementById('resume-link') as HTMLInputElement;
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  let receipt: Receipt | null = null,
    controller: AbortController | null = null,
    generation = 0,
    busy = false;
  const incoming = new URL(location.href);
  const fragment = incoming.hash;
  incoming.hash = '';
  for (const name of [
    'pw',
    'password',
    'qg_click_id',
    'qg_handoff_token',
    'qg_handoff_app',
    'qg_handoff_action',
    'x-qg-handoff-token',
    'x-qg-handoff-app',
    'x-qg-handoff-action',
  ])
    incoming.searchParams.delete(name);
  // Retain the marker on refresh so a stripped fragment can never become a visit.
  history.replaceState(null, '', incoming.pathname + incoming.search);
  const query = new URLSearchParams(incoming.search);
  query.delete('qg_handoff');
  query.delete('qg_app_choice');
  function validReceipt(value: unknown): value is Receipt {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const row = value as Record<string, unknown>;
    return (
      Object.keys(row).sort().join(',') === 'app,expires,token,v' &&
      row.v === 1 &&
      typeof row.app === 'string' &&
      uuid.test(row.app) &&
      typeof row.token === 'string' &&
      /^qg_handoff_[a-f0-9]{64}$/.test(row.token) &&
      typeof row.expires === 'number' &&
      Number.isSafeInteger(row.expires) &&
      row.expires > Date.now() &&
      row.expires <= Date.now() + 86401000
    );
  }
  if (config.mode === 'resume') {
    try {
      if (!fragment.startsWith('#qg_receipt=') || fragment.length > 2048) throw new Error();
      const encoded = fragment.slice(12);
      if (!/^[A-Za-z0-9_-]+$/.test(encoded)) throw new Error();
      const value: unknown = JSON.parse(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')));
      if (!validReceipt(value) || !config.choices.some((choice) => choice.id === value.app))
        throw new Error();
      receipt = value;
      for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="app"]')) {
        radio.checked = radio.value === receipt.app;
        radio.disabled = true;
      }
    } catch {
      status.textContent =
        'This resume link is missing, expired or unavailable. Open your original private resume link, or continue on the web.';
      if (button) button.disabled = true;
    }
  }
  function encodedReceipt(value: Receipt) {
    return btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function playReferrer(app: Choice, value: Receipt) {
    const referrer = new URLSearchParams({
      qg_v: '1',
      qg_source: config.canonicalUrl,
      qg_app: app.id,
      qg_token: value.token,
      qg_expires: String(value.expires),
    }).toString();
    // Conservative provider bound, including the outer URL encoding layer.
    if (encodeURIComponent(referrer).length > 512) throw new Error('carrier');
    const target = new URL('https://play.google.com/store/apps/details');
    target.searchParams.set('id', app.storeId);
    target.searchParams.set('referrer', referrer);
    return target.href;
  }
  function lockChoice(locked: boolean) {
    for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="app"]')) {
      radio.disabled = config.mode === 'resume' || locked;
    }
    if (password) password.disabled = locked;
  }
  function updatePlatform() {
    const selected = (form?.elements.namedItem('app') as RadioNodeList | HTMLInputElement | null)
      ?.value;
    const choice = config.choices.find((app) => app.id === selected);
    const passwordField = document.getElementById('password-field');
    if (passwordField)
      passwordField.hidden = config.mode === 'install' && choice?.platform === 'ios';
  }
  form?.addEventListener('change', updatePlatform);
  updatePlatform();
  consent?.addEventListener('change', () => {
    if (consent.checked) return;
    generation++;
    controller?.abort();
    receipt = null;
    if (password) password.value = '';
    privateLink.value = '';
    store.removeAttribute('href');
    ready.hidden = true;
    lockChoice(false);
    status.textContent = 'App handoff data cleared. You can continue on the web.';
    if (button) {
      button.disabled = config.mode === 'resume';
      button.hidden = false;
    }
  });
  async function payload(response: Response) {
    if (
      response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !==
        'application/vnd.queer-guide.redirect+json' ||
      !response.body
    )
      throw new Error('unknown');
    const reader = response.body.getReader();
    let size = 0,
      text = '';
    const decoder = new TextDecoder();
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 65536) {
        await reader.cancel();
        throw new Error('unknown');
      }
      text += decoder.decode(part.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode()) as Record<string, unknown>;
  }
  async function submit() {
    if (busy || !form || !consent || !button) return;
    const selected = (form.elements.namedItem('app') as RadioNodeList | HTMLInputElement | null)
      ?.value;
    const app = config.choices.find((choice) => choice.id === (receipt?.app ?? selected));
    if (!app) {
      status.textContent = 'Choose the app you want to use.';
      return;
    }
    if (!consent.checked) {
      status.textContent = 'Choose whether to allow this app handoff, or continue on the web.';
      consent.focus();
      return;
    }
    if (config.mode === 'resume' && !receipt) {
      status.textContent = 'Open your original private resume link to continue.';
      return;
    }
    if (config.mode === 'install' && app.platform === 'ios') {
      if (config.selectedApp !== app.id) {
        const next = new URL(incoming.href);
        next.searchParams.set('qg_app_choice', app.id);
        navigate(next.href);
        return;
      }
      status.textContent =
        'Use the App Clip banner at the top of Safari. If it is unavailable, open this page in Safari or continue on the web.';
      return;
    }
    if (config.mode === 'install') {
      try {
        playReferrer(app, {
          v: 1,
          app: app.id,
          token: 'qg_handoff_' + '0'.repeat(64),
          expires: Date.now() + 86400000,
        });
      } catch {
        status.textContent = 'This link is too long for a Play handoff. Continue on the web.';
        return;
      }
    }
    busy = true;
    lockChoice(true);
    button.disabled = true;
    form.setAttribute('aria-busy', 'true');
    status.textContent =
      config.mode === 'install' ? 'Preparing your private link…' : 'Checking your link…';
    const attempt = ++generation;
    controller = new AbortController();
    const timer = setTimeout(() => controller?.abort(), 10000);
    try {
      const requestUrl = new URL(config.canonicalUrl);
      requestUrl.host = location.host;
      requestUrl.search = config.mode === 'install' ? query.toString() : '';
      requestUrl.searchParams.set('qg_handoff', config.mode);
      const headers: Record<string, string> = {
        Accept: 'application/vnd.queer-guide.redirect+json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-QG-Attribution-Consent': 'granted',
        'X-QG-Handoff-Action': config.mode === 'install' ? 'create' : 'resume',
        'X-QG-Handoff-App': app.id,
      };
      if (receipt) headers['X-QG-Handoff-Token'] = receipt.token;
      const response = await fetch(requestUrl, {
        method: 'POST',
        headers,
        body: new URLSearchParams(password?.value ? { password: password.value } : {}),
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal: controller.signal,
      });
      const data = await payload(response);
      if (attempt !== generation || !consent.checked) return;
      if (!response.ok) {
        const messages: Record<number, string> = {
          400: 'The app handoff is unavailable. Check your link or continue on the web.',
          401: 'Enter the current link password and try again.',
          404: 'This app or link is unavailable.',
          410: 'This private link is no longer available. Continue on the web.',
          429: 'Too many attempts. Wait a minute before choosing to try again.',
        };
        status.textContent =
          messages[response.status] ??
          'The result could not be confirmed. Nothing was retried. Try again only if you choose to.';
        return;
      }
      if (
        Object.keys(data).sort().join(',') !==
          'canonicalUrl,clickId,destination,mode,protocol,statusCode' ||
        data.protocol !== 1 ||
        data.canonicalUrl !== config.canonicalUrl ||
        data.mode !== 'navigate' ||
        typeof data.clickId !== 'string' ||
        !uuid.test(data.clickId) ||
        typeof data.destination !== 'string' ||
        data.destination.length > 60000 ||
        ![301, 302, 303, 307, 308].includes(data.statusCode as number)
      )
        throw new Error('unknown');
      const target = new URL(data.destination);
      if (
        !['https:', 'http:'].includes(target.protocol) ||
        target.username ||
        target.password ||
        target.searchParams.getAll('qg_click_id').length !== 1 ||
        target.searchParams.get('qg_click_id') !== data.clickId
      )
        throw new Error('unknown');
      if (config.mode === 'resume') {
        if (
          response.headers.get('X-QG-Handoff-State') !== 'consumed' ||
          response.headers.has('X-QG-Handoff-Token') ||
          response.headers.has('X-QG-Handoff-Expires')
        )
          throw new Error('unknown');
        receipt = null;
        privateLink.value = '';
        if (password) password.value = '';
        button.disabled = true;
        navigate(target.href);
        return;
      }
      const expiry = response.headers.get('X-QG-Handoff-Expires') ?? '';
      const value = {
        v: 1,
        app: app.id,
        token: response.headers.get('X-QG-Handoff-Token'),
        expires: Date.parse(expiry),
      };
      if (
        response.headers.get('X-QG-Handoff-State') !== 'created' ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(expiry) ||
        !validReceipt(value)
      )
        throw new Error('unknown');
      receipt = value;
      const resume = new URL(config.canonicalUrl);
      resume.searchParams.set('qg_handoff', 'resume');
      resume.hash = 'qg_receipt=' + encodedReceipt(receipt);
      privateLink.value = resume.href;
      store.href = playReferrer(app, receipt);
      store.textContent = 'Install from Google Play';
      ready.hidden = false;
      button.hidden = true;
      if (password) password.value = '';
      status.textContent = 'Your private link is ready. Install on this device, then open the app.';
    } catch {
      if (attempt === generation)
        status.textContent =
          'The result could not be confirmed. Nothing was retried. Try again only if you choose to.';
    } finally {
      clearTimeout(timer);
      busy = false;
      form.removeAttribute('aria-busy');
      lockChoice(receipt !== null);
      if (attempt === generation && !(config.mode === 'resume' && !receipt))
        button.disabled = false;
    }
  }
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    void submit();
  });
  // Native form submission is POST, and stays disabled until this handler exists.
  if (button && (config.mode === 'install' || receipt)) button.disabled = false;
}
