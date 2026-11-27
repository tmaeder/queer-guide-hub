import { describe, expect, it } from 'vitest';
import {
  descriptionRemainder,
  groupChipLabel,
  isbnFromUrl,
  listingOfferKind,
  makerDiffersFromSeller,
  makerRoleLabel,
  merchantOrgRedirectPath,
  offerCtaLabel,
  sameLabel,
  sellerNameOf,
} from '../marketplaceListingKind';
import { distinctSellers } from '@/hooks/useMarketplaceBrands';

describe('listingOfferKind (titles from the live Services department)', () => {
  const svc = (title: string, subcategory: string | null = null) =>
    listingOfferKind({ department: 'services', title, subcategory });

  it('anything outside services is a product', () => {
    expect(listingOfferKind({ department: 'books_art', title: 'Phantomparadies' })).toBe('product');
    expect(listingOfferKind({ department: 'apparel', title: 'Event tee' })).toBe('product');
  });
  it('custom work is a service', () => {
    expect(svc('Modification Service', 'Apparel and Accessories')).toBe('service');
    expect(svc('Rubber Repair/Alteration', 'Hygiene and Care')).toBe('service');
  });
  it('checkout add-ons are not destination products', () => {
    expect(svc('Free Returns + Package Protection')).toBe('addon');
    expect(svc('Route Shipping Protection', 'safer_sex')).toBe('addon');
    expect(svc('Carbon Neutral Order', 'Carbon Offset')).toBe('addon');
    expect(svc('Carry Case Personalization', 'Add-on')).toBe('addon');
  });
  it('tickets, memberships, donations, gift cards', () => {
    expect(svc('Lightning In A Bottle Fundraiser: GA Event Ticket')).toBe('ticket');
    expect(svc('Gay Men Axe Throwing', 'Event')).toBe('ticket');
    expect(svc('Barcode Hustlaball VIP - Multicolor', 'others accessories')).toBe('ticket');
    expect(svc('AF+', 'Membership')).toBe('membership');
    expect(svc('Insiders Club', 'Subscription')).toBe('membership');
    expect(svc('Donation (Support Our Nonprofit Work)', 'safer_sex')).toBe('donation');
    expect(svc('Gift Card 200', 'Gift Card')).toBe('gift_card');
    expect(svc('Gift Card Twink-X / Nuuk-X', 'Geschenkgutscheine')).toBe('gift_card');
  });
});

describe('seller vs maker', () => {
  const book = {
    brand: 'Hans Georg & Guibert, Hervé Berger',
    business_name: 'QueerBooks',
    merchant_domain: 'queerbooks.ch',
    department: 'books_art',
  };
  it('the CTA names the seller, not the authors', () => {
    const seller = sellerNameOf(book);
    expect(seller).toBe('QueerBooks');
    expect(offerCtaLabel('product', seller!)).toBe('Buy at QueerBooks');
    expect(makerDiffersFromSeller(book.brand, seller)).toBe(true);
    expect(makerRoleLabel(book.department)).toBe('By');
    expect(makerRoleLabel('apparel')).toBe('Brand');
  });
  it('a brand that sells itself takes the curated spelling', () => {
    const l = { brand: 'tomboyx', business_name: 'tomboyx', merchant_domain: 'tomboyx.com' };
    expect(sellerNameOf(l, 'TomboyX')).toBe('TomboyX');
    expect(makerDiffersFromSeller(l.brand, 'TomboyX')).toBe(false);
  });
  it('names the domain when business_name is really the brand', () => {
    expect(sellerNameOf({ business_name: 'Alba Optics', merchant_domain: 'jeufcycling.com' })).toBe(
      'jeufcycling.com',
    );
    expect(
      sellerNameOf({ business_name: 'ABUniverse', merchant_domain: 'eu.abuniverse.com' }),
    ).toBe('ABUniverse');
  });
  it('falls back to the merchant host, then the brand', () => {
    expect(sellerNameOf({ merchant_domain: 'www.kinkstar.store' })).toBe('kinkstar.store');
    expect(sellerNameOf({ brand: 'Indie' })).toBe('Indie');
    expect(sellerNameOf({})).toBeNull();
  });
  it('service CTA', () => {
    expect(offerCtaLabel('service', 'kinkstar')).toBe('Request at kinkstar');
  });
});

describe('book facts and duplicate labels', () => {
  it('reads a checksum-valid ISBN from the seller URL', () => {
    expect(
      isbnFromUrl(
        'https://www.queerbooks.ch/berger-hans-georg-phantomparadies-salzgeber-buchverlage-gmb-isbn-9783863005092',
      ),
    ).toBe('9783863005092');
    expect(isbnFromUrl('https://x.test/isbn-9783863005093')).toBeNull();
    expect(isbnFromUrl(null)).toBeNull();
  });
  it('Books & Art equals Books And Art', () => {
    expect(sameLabel('Books & Art', 'Books And Art')).toBe(true);
    expect(sameLabel('Tops', 'Apparel')).toBe(false);
  });
});

describe('descriptionRemainder', () => {
  it('returns null when the lead showed everything', () => {
    expect(descriptionRemainder('Short text.', 'Short text.')).toBeNull();
  });
  it('returns the rest after a sentence-bounded opening', () => {
    expect(descriptionRemainder('One. Two.', 'One.')).toBe('Two.');
  });
  it('returns the whole text when the opening was cut mid-word', () => {
    expect(descriptionRemainder('One two three', 'One two…')).toBe('One two three');
  });
});

describe('category and merchant contracts', () => {
  it('names the catch-all group for what it holds', () => {
    expect(groupChipLabel('apparel', 'apparel', 'Clothing', 'Apparel')).toBe('Other apparel');
    expect(groupChipLabel('tops', 'apparel', 'Tops', 'Apparel')).toBe('Tops');
  });
  it('merchant redirect keeps shopping intent', () => {
    expect(merchantOrgRedirectPath('queerbooks-location-f8a5')).toBe(
      '/organizations/queerbooks-location-f8a5?from=shop#shop',
    );
  });
  it('distinct sellers per merchant', () => {
    expect(
      distinctSellers([
        { business_name: 'Alba Optics', merchant_domain: 'jeufcycling.com' },
        { business_name: 'Alba Optics', merchant_domain: 'jeufcycling.com' },
        { business_name: null, merchant_domain: null },
      ]),
    ).toEqual([{ name: 'jeufcycling.com', domain: 'jeufcycling.com' }]);
  });
});
