import { describe, it, expect } from 'vitest';
import type { Organization } from '@/hooks/useOrganization';
import {
  arrivedFromShop,
  firstSentence,
  orgAboutText,
  orgLeadText,
  orgPrimaryAction,
  orgTagGroups,
} from '../OrganizationDetail.parts';
import { bookingProviderName, informativeHotelTags } from '../HotelDetail.parts';

function org(overrides: Partial<Organization>): Organization {
  return {
    id: 'o',
    slug: 'o',
    name: 'O',
    legal_name: null,
    description: null,
    editorial_hook: null,
    editorial_long: null,
    logo_url: null,
    cover_image_url: null,
    images: [],
    roles: [],
    website: null,
    website_domain: null,
    email: null,
    phone: null,
    social: {},
    tags: [],
    city_id: null,
    country_id: null,
    article_count: 0,
    product_count: 0,
    venue_count: 0,
    venues: [],
    ...overrides,
  };
}

describe('organization lead vs About', () => {
  it('prints a one-sentence description once', () => {
    const o = org({ description: 'Regenbogenhaus is a community center in Zürich, CH.' });
    expect(orgLeadText(o)).toBe(o.description);
    expect(orgAboutText(o)).toBeNull();
  });
  it('keeps the full text in About when it says more than the lead', () => {
    const o = org({ description: 'First sentence. Second sentence with more.' });
    expect(orgLeadText(o)).toBe('First sentence.');
    expect(orgAboutText(o)).toBe(o.description);
  });
  it('does not split on abbreviations followed by lowercase', () => {
    expect(firstSentence('Open approx. daily. More.')).toBe('Open approx. daily.');
  });
});

describe('orgPrimaryAction', () => {
  it('a publisher gets Visit publication', () => {
    expect(
      orgPrimaryAction(org({ roles: ['publisher'], website: 'https://autostraddle.com/' })),
    ).toEqual({
      kind: 'publication',
      href: 'https://autostraddle.com/',
    });
  });
  it('a support service leads with its phone', () => {
    expect(
      orgPrimaryAction(
        org({ roles: ['support', 'venue'], phone: '+41216310148', website: 'https://p.ch' }),
      )?.kind,
    ).toBe('phone');
  });
  it('an invalid email is skipped, not linked', () => {
    expect(
      orgPrimaryAction(
        org({ roles: ['support'], email: 'info@x.chmailto ', website: 'https://x.ch' }),
      )?.kind,
    ).toBe('website');
  });
  it('a seller arriving from the marketplace gets View products', () => {
    const seller = org({
      roles: ['seller', 'venue'],
      product_count: 5,
      website_domain: 'queerbooks.ch',
      phone: '+41313115959',
    });
    expect(orgPrimaryAction(seller, { fromShop: true })).toEqual({
      kind: 'products',
      href: '#shop',
    });
  });
  it('falls back to the contact anchor', () => {
    expect(orgPrimaryAction(org({ email: 'a@b.ch' }))?.kind).toBe('location');
    expect(orgPrimaryAction(org({}))).toBeNull();
  });
  it('reads the shop arrival from query or hash', () => {
    expect(arrivedFromShop({ search: '?from=shop' })).toBe(true);
    expect(arrivedFromShop({ hash: '#shop' })).toBe(true);
    expect(arrivedFromShop({ search: '' })).toBe(false);
  });
});

describe('orgTagGroups', () => {
  it('separates access/visiting tags from services, order kept', () => {
    expect(orgTagGroups(['hiv-testing', 'walk-in', 'prep', 'wheelchair-accessible'])).toEqual({
      services: ['hiv-testing', 'prep'],
      access: ['walk-in', 'wheelchair-accessible'],
    });
  });
});

describe('hotel booking', () => {
  it('names the provider from the booking URL', () => {
    expect(bookingProviderName('https://www.misterbandb.com/rooms/187301')).toBe('misterb&b');
    expect(bookingProviderName('https://stay.example.org/x')).toBe('stay.example.org');
    expect(bookingProviderName('not a url')).toBeNull();
  });
  it('drops tags every listing carries', () => {
    expect(
      informativeHotelTags([{ tag: 'gay-friendly' }, { tag: 'lgbtq-friendly' }, { tag: 'pool' }]),
    ).toEqual([{ tag: 'pool' }]);
  });
});
