import { nativeResolution } from '../../supabase/functions/_shared/redirect-native-resolution.ts';

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
