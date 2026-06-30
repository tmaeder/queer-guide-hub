/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { Organization } from '@/hooks/useOrganization';

const orgRef = { current: null as Organization | null };

vi.mock('@/hooks/useOrganization', () => ({
  useOrganization: () => ({
    data: orgRef.current,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useOrganizationArticles: () => ({ data: [], isLoading: false }),
}));

import { useOrganizationDescriptor } from '../useOrganizationDescriptor';

function makeOrg(overrides: Partial<Organization>): Organization {
  return {
    id: 'o1',
    slug: 'o1',
    name: 'Acme',
    legal_name: null,
    description: 'desc',
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

const when = (sections: { id: string; when?: boolean }[], id: string) =>
  sections.find((s) => s.id === id)?.when !== false;

describe('useOrganizationDescriptor section gating', () => {
  it('publisher-only org: articles visible, no visit/shop', () => {
    orgRef.current = makeOrg({ roles: ['publisher'], article_count: 5 });
    const { result } = renderHook(() => useOrganizationDescriptor('o1'));
    const s = result.current.descriptor!.sections;
    expect(when(s, 'articles')).toBe(true);
    expect(when(s, 'visit')).toBe(false);
    expect(when(s, 'shop')).toBe(false);
  });

  it('seller with venues: visit + shop visible, no articles', () => {
    orgRef.current = makeOrg({
      roles: ['seller', 'venue'],
      product_count: 3,
      website_domain: 'shop.example',
      venue_count: 2,
      venues: [
        { id: 'v1', slug: 'v1', name: 'Store', city: 'Berlin', latitude: 52.5, longitude: 13.4, image_url: null },
      ],
    });
    const { result } = renderHook(() => useOrganizationDescriptor('o1'));
    const s = result.current.descriptor!.sections;
    expect(when(s, 'visit')).toBe(true);
    expect(when(s, 'shop')).toBe(true);
    expect(when(s, 'articles')).toBe(false);
  });
});
