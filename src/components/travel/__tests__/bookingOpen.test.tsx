/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TravelDealCard } from '../TravelDealCard';
import { UnifiedBookingCard } from '@/components/booking/UnifiedBookingCard';

vi.mock('@/utils/travelAnalytics', () => ({ trackTravelEvent: vi.fn() }));

// With 'noopener' a real browser's window.open() returns null even when the tab
// opened. Both cards used to treat that null as "popup blocked" and also send
// the current tab to the booking site, so one click navigated twice.
function captureNavigation() {
  const open = vi.spyOn(window, 'open').mockReturnValue(null);
  const hrefSet = vi.fn();
  const original = window.location;
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: new Proxy(original, {
      set(_t, key, value) {
        if (key === 'href') hrefSet(value);
        return true;
      },
      get(t, key) {
        const v = Reflect.get(t, key);
        return typeof v === 'function' ? v.bind(t) : v;
      },
    }),
  });
  return {
    open,
    hrefSet,
    restore: () =>
      Object.defineProperty(window, 'location', { configurable: true, value: original }),
  };
}

let restore = () => {};
afterEach(() => {
  restore();
  vi.restoreAllMocks();
});

describe('booking buttons open the partner once, in a new tab', () => {
  it('TravelDealCard', () => {
    const nav = captureNavigation();
    restore = nav.restore;
    render(
      <TravelDealCard
        deal={{ origin: 'JFK', destination: 'BER', price: 500, currency: 'USD' } as never}
        originCity="NY"
        destinationCity="Berlin"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /book flight from jfk to ber/i }));
    expect(nav.open).toHaveBeenCalledTimes(1);
    expect(nav.open.mock.calls[0][1]).toBe('_blank');
    expect(nav.hrefSet).not.toHaveBeenCalled();
  });

  it('UnifiedBookingCard', () => {
    const nav = captureNavigation();
    restore = nav.restore;
    render(
      <UnifiedBookingCard
        result={
          {
            id: 'h1',
            provider: 'booking',
            vertical: 'hotel',
            title: 'Hotel Queer',
            price: 120,
            currency: 'EUR',
            bookingUrl: 'https://partner.example/hotel',
          } as never
        }
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /book hotel/i }));
    expect(nav.open).toHaveBeenCalledWith(
      'https://partner.example/hotel',
      '_blank',
      'noopener,noreferrer',
    );
    expect(nav.hrefSet).not.toHaveBeenCalled();
  });
});
