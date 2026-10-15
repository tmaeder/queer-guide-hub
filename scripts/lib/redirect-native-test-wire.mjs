import {
  nativeResolution,
  nativeHandoffResponse,
  newNativeHandoffToken,
} from '../../supabase/functions/_shared/redirect-native-resolution.ts';

// Native clients consume the real backend producer, not a duplicated wire shape.
// No DB, credentials, network, destinations or production state are accessed.
export async function nativeTestWire() {
  const response = nativeResolution(
    'https://queer.guide/go/example-link',
    'https://queer.guide/venues/example#details',
    302,
    'navigate',
    null,
  );
  if (response.status !== 200) throw new Error('Backend native fixture failed');
  return response.text();
}

export async function nativeHandoffTestWire() {
  const click = '20000000-0000-4000-8000-000000000002';
  const response = nativeResolution(
    'https://queer.guide/go/example-link',
    'https://queer.guide/venues/example?qg_click_id=' + click,
    303,
    'navigate',
    click,
  );
  nativeHandoffResponse(
    response.headers,
    newNativeHandoffToken(),
    new Date(Date.now() + 3600000).toISOString(),
  );
  return JSON.stringify({
    body: await response.json(),
    headers: Object.fromEntries(response.headers),
    app: '10000000-0000-4000-8000-000000000001',
  });
}

// Execute the actual browser producer in an isolated DOM; no browser/provider
// navigation or network is allowed. Java consumes precisely this Play carrier.
export async function nativePlayReferrerTestWire(wire) {
  const { JSDOM } = await import('jsdom');
  const { nativeInstallPage } =
    await import('../../supabase/functions/_shared/redirect-native-install-page.ts');
  const { nativeInstallBrowser } =
    await import('../../supabase/functions/_shared/redirect-native-install-browser.ts');
  const response = nativeInstallPage(
    'https://queer.guide/go/example-link',
    new URLSearchParams('qg_handoff=install'),
    [
      {
        id: wire.app,
        platform: 'android',
        displayName: 'Fixture app',
        storeId: 'guide.queer.fixture',
        storeUrl: 'https://play.google.com/store/apps/details?id=guide.queer.fixture',
      },
    ],
    false,
    'install',
  );
  const dom = new JSDOM(await response.text(), {
    url: 'https://queer.guide/go/example-link?qg_handoff=install',
    runScripts: 'outside-only',
  });
  try {
    dom.window.fetch = async () =>
      new Response(JSON.stringify(wire.body), { headers: wire.headers });
    dom.window.TextDecoder = TextDecoder;
    dom.window.eval(
      `(${nativeInstallBrowser.toString()})(()=>{throw new Error('Unexpected navigation')})`,
    );
    dom.window.document.querySelector('input[name="app"]').checked = true;
    dom.window.document.getElementById('consent').checked = true;
    dom.window.document
      .getElementById('handoff-form')
      .dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
    for (let step = 0; step < 100; step++) {
      const href = dom.window.document.getElementById('store-link').getAttribute('href');
      if (href) return new URL(href).searchParams.get('referrer');
      await new Promise((done) => setTimeout(done, 10));
    }
    throw new Error('Actual browser producer did not create Play carrier');
  } finally {
    dom.window.close();
  }
}
