import { describe, it, expect, vi, beforeEach } from 'vitest';

// The personality row query (supabase.from('personalities')…maybeSingle).
const row = {
  id: 'p1',
  slug: 'tchaikovsky',
  name: 'Pyotr Ilyich Tchaikovsky',
  image_url: 'raw.jpg',
};
function chain(result: unknown) {
  const c: Record<string, unknown> = {};
  for (const m of ['select', 'eq']) c[m] = () => c;
  c.maybeSingle = () => Promise.resolve(result);
  return c;
}

const readModel = vi.hoisted(() => ({ result: { data: null as unknown, error: null as unknown } }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => chain({ data: row, error: null }) },
}));
vi.mock('@/integrations/supabase/untyped', () => ({
  untypedFrom: () => chain(readModel.result),
  untypedRpc: vi.fn(),
}));

import { fetchPublicPersonalityBySlugOrId } from '../usePageFetchers';

describe('fetchPublicPersonalityBySlugOrId', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('still returns the personality when the read model is denied (prod, 2026-11-03)', async () => {
    // Signed-out readers hit `42501 permission denied for view
    // tag_assignments_norm` on personality_public_profiles; this used to throw,
    // and the page redirected every visitor to /personalities.
    readModel.result = {
      data: null,
      error: { code: '42501', message: 'permission denied for view tag_assignments_norm' },
    };
    const p = await fetchPublicPersonalityBySlugOrId<Record<string, unknown>>('tchaikovsky');
    expect(p?.name).toBe('Pyotr Ilyich Tchaikovsky');
    expect(p?.image_url).toBe('raw.jpg');
    expect(p?.tags).toEqual([]);
  });

  it('uses the read model when it answers', async () => {
    readModel.result = {
      data: {
        resolved_image_url: 'resolved.jpg',
        canonical_tags: ['composer'],
        image_status: 'ok',
      },
      error: null,
    };
    const p = await fetchPublicPersonalityBySlugOrId<Record<string, unknown>>('tchaikovsky');
    expect(p?.image_url).toBe('resolved.jpg');
    expect(p?.tags).toEqual(['composer']);
  });
});
