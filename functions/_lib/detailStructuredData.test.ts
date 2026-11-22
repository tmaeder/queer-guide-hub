import { describe, it, expect } from 'vitest';
import { eventOfferLd, eventStatusLd, listingIndexable, isDetailPath } from './detail';

describe('eventStatusLd', () => {
  it.each([
    ['postponed', 'https://schema.org/EventPostponed'],
    ['moved_online', 'https://schema.org/EventMovedOnline'],
    ['cancelled', 'https://schema.org/EventCancelled'],
    ['sold_out', 'https://schema.org/EventScheduled'],
    [undefined, 'https://schema.org/EventScheduled'],
  ])('%s -> %s', (liveness, want) => {
    expect(eventStatusLd(liveness)).toBe(want);
  });
});

describe('eventOfferLd', () => {
  it("uses the row's own currency, not a hard-coded EUR", () => {
    expect(eventOfferLd({ price_min: 25, currency: 'usd' })).toMatchObject({
      price: 25,
      priceCurrency: 'USD',
    });
  });

  it('drops the price rather than guessing a currency', () => {
    const offer = eventOfferLd({ price_min: 25, ticket_url: 'https://t.example' });
    expect(offer.price).toBeUndefined();
    expect(offer.priceCurrency).toBeUndefined();
    expect(offer.url).toBe('https://t.example');
  });

  it('marks a sold-out event SoldOut', () => {
    expect(eventOfferLd({ liveness_status: 'sold_out' }).availability).toBe(
      'https://schema.org/SoldOut',
    );
  });

  it('prices a free event at 0', () => {
    expect(eventOfferLd({ is_free: true, currency: 'EUR' })).toMatchObject({
      price: 0,
      priceCurrency: 'EUR',
    });
  });
});

describe('listingIndexable', () => {
  const base = { content_rating: 'sfw', images: ['https://img/x.jpg'], price: 10 };
  it('indexes a SFW or suggestive listing with an image and a price', () => {
    expect(listingIndexable(base)).toBe(true);
    expect(listingIndexable({ ...base, content_rating: 'suggestive' })).toBe(true);
  });
  it.each([
    ['adult', { ...base, content_rating: 'adult' }],
    ['explicit', { ...base, content_rating: 'explicit' }],
    ['no image', { ...base, images: [] }],
    ['no price', { ...base, price: null }],
    ['unrated', { ...base, content_rating: null }],
  ])('does not index a listing that is %s', (_label, row) => {
    expect(listingIndexable(row)).toBe(false);
  });
});

describe('marketplace and organization detail paths', () => {
  it('treats /marketplace/:slug and /organizations/:slug as detail routes', () => {
    expect(isDetailPath('/marketplace/rainbow-mug')).toBe(true);
    expect(isDetailPath('/organizations/act-up')).toBe(true);
    expect(isDetailPath('/marketplace/brands/tomboyx')).toBe(true);
  });
  it('leaves the static marketplace siblings to the SPA', () => {
    for (const p of ['share', 'missions', 'categories', 'guides', 'brands']) {
      expect(isDetailPath(`/marketplace/${p}`), p).toBe(false);
    }
  });
});
