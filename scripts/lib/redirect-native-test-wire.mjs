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
