import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  nativeInstallPage,
  nativeInstallChoices,
  type NativeInstallChoice,
} from '../../../../supabase/functions/_shared/redirect-native-install-page';
import { nativeInstallBrowser } from '../../../../supabase/functions/_shared/redirect-native-install-browser';
import {
  browserHandoffRequested,
  nativeHandoffRequest,
  nativeResolution,
  nativeHandoffResponse,
} from '../../../../supabase/functions/_shared/redirect-native-resolution';
const canonical = 'https://queer.guide/go/example-link';
const app = {
  id: '10000000-0000-4000-8000-000000000001',
  platform: 'android' as const,
  displayName: 'Community app',
  storeId: 'org.example.app',
  storeUrl: 'https://play.google.com/store/apps/details?id=org.example.app',
};
const ios = {
  ...app,
  id: '10000000-0000-4000-8000-000000000002',
  platform: 'ios' as const,
  storeId: '1234567890',
  storeUrl: 'https://apps.apple.com/app/id1234567890',
  appClipBundleId: 'org.example.app.Clip',
};
const token = 'qg_handoff_' + 'a'.repeat(64),
  click = '20000000-0000-4000-8000-000000000002';
const calls = vi.fn(),
  navigation = vi.fn();
let created: Response;
async function mount(
  mode: 'install' | 'resume' = 'install',
  choices: NativeInstallChoice[] = [app],
  fragment = '',
  selected?: string,
) {
  const response = nativeInstallPage(
    canonical,
    new URLSearchParams('utm_source=poster'),
    choices,
    true,
    mode,
    selected,
  );
  document.documentElement.innerHTML = await response.text();
  history.replaceState(
    null,
    '',
    '/go/example-link?qg_handoff=' + mode + '&utm_source=poster' + fragment,
  );
  nativeInstallBrowser(navigation);
}
function allow() {
  const input = document.getElementById('consent') as HTMLInputElement;
  input.checked = true;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}
function submit() {
  document
    .getElementById('handoff-form')!
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}
async function settle() {
  await vi.waitFor(() =>
    expect(document.getElementById('handoff-form')?.hasAttribute('aria-busy')).toBe(false),
  );
}
beforeEach(() => {
  calls.mockReset();
  navigation.mockReset();
  created = nativeResolution(
    canonical,
    'https://queer.guide/venues/example?qg_click_id=' + click,
    303,
    'navigate',
    click,
  );
  nativeHandoffResponse(created.headers, token, new Date(Date.now() + 3600000).toISOString());
  calls.mockImplementation(async () => created.clone());
  vi.stubGlobal('fetch', calls);
});
afterEach(() => {
  document.body.innerHTML = '';
  history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
});
describe('first-party native install page', () => {
  it('recognizes only uncredentialed GET browser markers and keeps marked native failures closed', () => {
    const browser = new Request(canonical + '?qg_handoff=resume');
    expect(browserHandoffRequested(browser)).toBe('resume');
    expect(nativeHandoffRequest(browser)).toBeNull();
    for (const request of [
      new Request(canonical + '?qg_handoff=install&qg_handoff=install'),
      new Request(canonical + '?qg_handoff=install', { method: 'POST' }),
      new Request(canonical + '?qg_handoff=install', { headers: { 'x-qg-handoff-app': app.id } }),
      new Request(canonical + '?qg_handoff=resume', {
        headers: { Accept: 'application/vnd.queer-guide.redirect+json' },
      }),
      new Request(canonical + '?qg_handoff=install&qg_handoff_token=' + token),
    ])
      expect(() => nativeHandoffRequest(request)).toThrow();
  });
  it('escapes public names, validates fixed providers and exposes no private fields or destination', async () => {
    const response = nativeInstallPage(
      canonical,
      new URLSearchParams(),
      [{ ...app, displayName: '</script><img src=x onerror=alert(1)>' }],
      true,
      'install',
    );
    const html = await response.text();
    expect(html).toContain('method="post"');
    expect(html).toContain('type="submit" disabled');
    expect(html).not.toContain('<img');
    expect(html).toContain('\\u003c/script>');
    expect(response.headers.get('Content-Security-Policy')).toContain("connect-src 'self'");
    expect(response.headers.get('Content-Security-Policy')).not.toContain('unsafe-inline');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(() =>
      nativeInstallChoices([{ ...app, storeUrl: 'https://evil.example.org' }]),
    ).toThrow();
    expect(() => nativeInstallChoices([{ ...app, label: 'private' }])).toThrow();
    expect(() => nativeInstallChoices([app, app])).toThrow();
    expect(html).not.toContain('group.');
    expect(html).not.toContain('/venues/');
  });
  it('does not request without consent, then creates once and prepares a bounded private Play carrier', async () => {
    await mount();
    expect(calls).not.toHaveBeenCalled();
    submit();
    expect(calls).not.toHaveBeenCalled();
    allow();
    (document.getElementById('password') as HTMLInputElement).value = 'a+b';
    submit();
    await settle();
    expect(calls).toHaveBeenCalledTimes(1);
    expect((document.querySelector('input[name=app]') as HTMLInputElement).disabled).toBe(true);
    const [url, options] = calls.mock.calls[0];
    expect(String(url)).toContain('utm_source=poster');
    expect(String(url)).not.toContain(token);
    expect(options.credentials).toBe('omit');
    expect(options.redirect).toBe('error');
    expect(options.referrerPolicy).toBe('no-referrer');
    expect(options.headers['X-QG-Handoff-Action']).toBe('create');
    expect(options.body.get('password')).toBe('a+b');
    const store = new URL((document.getElementById('store-link') as HTMLAnchorElement).href);
    const carrier = new URLSearchParams(store.searchParams.get('referrer')!);
    expect(carrier.get('qg_token')).toBe(token);
    expect(carrier.get('qg_source')).toBe(canonical);
    expect(carrier.get('qg_app')).toBe(app.id);
    expect(store.href).not.toContain('poster');
    expect(store.href).not.toContain('password');
    expect(encodeURIComponent(store.searchParams.get('referrer')!).length).toBeLessThanOrEqual(512);
    expect((document.getElementById('resume-link') as HTMLInputElement).value).toContain(
      '#qg_receipt=',
    );
    expect((document.getElementById('password') as HTMLInputElement).value).toBe('');
    expect(navigation).not.toHaveBeenCalled();
  });
  it('strips fragments before any request, resumes only in a header and follows the checked live result', async () => {
    const receipt = { v: 1, app: app.id, token, expires: Date.now() + 3600000 };
    await mount('resume', [app], '#qg_receipt=' + btoa(JSON.stringify(receipt)).replace(/=+$/, ''));
    expect(location.hash).toBe('');
    expect(calls).not.toHaveBeenCalled();
    const response = nativeResolution(
      canonical,
      'https://queer.guide/venues/example?qg_click_id=' + click,
      303,
      'navigate',
      click,
    );
    nativeHandoffResponse(response.headers, null);
    calls.mockResolvedValue(response);
    allow();
    submit();
    await settle();
    expect(calls).toHaveBeenCalledTimes(1);
    const [url, options] = calls.mock.calls[0];
    expect(new URL(String(url)).search).toBe('?qg_handoff=resume');
    expect(options.headers['X-QG-Handoff-Token']).toBe(token);
    expect(navigation).toHaveBeenCalledWith(
      'https://queer.guide/venues/example?qg_click_id=' + click,
    );
  });
  it('does not retry unknown creation outcomes and clears an in-flight result on withdrawal', async () => {
    await mount();
    const invalid = created.clone();
    invalid.headers.delete('X-QG-Handoff-Token');
    calls.mockResolvedValue(invalid);
    allow();
    submit();
    await settle();
    expect(calls).toHaveBeenCalledTimes(1);
    expect(document.getElementById('handoff-status')!.textContent).toContain('Nothing was retried');
    let finish!: (response: Response) => void;
    calls.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    submit();
    expect((document.querySelector('input[name=app]') as HTMLInputElement).disabled).toBe(true);
    const consent = document.getElementById('consent') as HTMLInputElement;
    consent.checked = false;
    consent.dispatchEvent(new Event('change'));
    finish(created.clone());
    await settle();
    expect(document.getElementById('handoff-ready')!.hidden).toBe(true);
    expect((document.getElementById('resume-link') as HTMLInputElement).value).toBe('');
    expect(navigation).not.toHaveBeenCalled();
    expect((document.querySelector('input[name=app]') as HTMLInputElement).disabled).toBe(false);
  });
  it('rejects an oversized Play carrier before reserving a visit', async () => {
    const longSource = 'https://' + 'a'.repeat(60) + '.example.org/' + 'b'.repeat(240);
    const response = nativeInstallPage(longSource, new URLSearchParams(), [app], false, 'install');
    document.documentElement.innerHTML = await response.text();
    history.replaceState(null, '', '/go/example-link?qg_handoff=install');
    nativeInstallBrowser(navigation);
    allow();
    submit();
    expect(calls).not.toHaveBeenCalled();
    expect(document.getElementById('handoff-status')!.textContent).toContain('too long');
  });
  it('invalid resume fragments remain uncounted and iOS uses the configured first-party banner without minting', async () => {
    await mount('resume', [app], '#qg_receipt=bad');
    allow();
    submit();
    expect(calls).not.toHaveBeenCalled();
    await mount('install', [ios], '', ios.id);
    allow();
    submit();
    expect(calls).not.toHaveBeenCalled();
    expect(
      document.querySelector('meta[name=apple-itunes-app]')!.getAttribute('content'),
    ).toContain('app-clip-bundle-id=org.example.app.Clip');
    expect(document.getElementById('password-field')!.hidden).toBe(true);
    expect(document.getElementById('handoff-status')!.textContent).toContain('Safari');
  });
});
