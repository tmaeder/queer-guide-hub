import { describe, it, expect, vi } from 'vitest';

// Each booking provider imports supabase.functions.invoke or
// @/utils/aviasalesUrl; mock both so importing the index has no side effects.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));
vi.mock('@/utils/aviasalesUrl', () => ({
  buildAviasalesUrl: vi.fn().mockReturnValue({ url: '', valid: false }),
}));

describe('lib/booking/index — registry side-effects', () => {
  it('registers all four providers on import', async () => {
    const mod = await import('../index');

    // Re-exports — sanity check.
    expect(mod.bookingRegistry).toBeDefined();
    expect(mod.travelpayoutsFlights.name).toBe('travelpayouts');
    expect(mod.hotellookProvider.name).toBe('hotellook');
    expect(mod.getyourguideProvider.name).toBe('getyourguide');
    expect(mod.viatorProvider.name).toBe('viator');

    // Hotel + activity verticals should both have at least one registered provider.
    expect(mod.bookingRegistry.getProvider('hotel', 'hotellook')).toBeDefined();
    expect(mod.bookingRegistry.getProvider('activity', 'getyourguide')).toBeDefined();
    expect(mod.bookingRegistry.getProvider('activity', 'viator')).toBeDefined();
    expect(mod.bookingRegistry.getProvider('flight', 'travelpayouts')).toBeDefined();
  });
});
