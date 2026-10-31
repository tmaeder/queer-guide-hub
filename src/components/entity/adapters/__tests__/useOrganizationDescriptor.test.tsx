/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
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
vi.mock('@/hooks/useMilestones', () => ({
  useMilestonesForEntity: () => ({ data: [] }),
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
    expect(when(s, 'location')).toBe(false);
    expect(when(s, 'shop')).toBe(false);
  });

  it('seller with venues: visit + shop visible, no articles', () => {
    orgRef.current = makeOrg({
      roles: ['seller', 'venue'],
      product_count: 3,
      website_domain: 'shop.example',
      venue_count: 2,
      venues: [
        {
          id: 'v1',
          slug: 'v1',
          name: 'Store',
          city: 'Berlin',
          latitude: 52.5,
          longitude: 13.4,
          image_url: null,
        },
      ],
    });
    const { result } = renderHook(() => useOrganizationDescriptor('o1'));
    const s = result.current.descriptor!.sections;
    expect(when(s, 'location')).toBe(true);
    expect(when(s, 'shop')).toBe(true);
    expect(when(s, 'articles')).toBe(false);
  });
});

describe('useOrganizationDescriptor single layout', () => {
  it('renders on the subway single, like the venue page', () => {
    orgRef.current = makeOrg({ roles: ['publisher'], article_count: 1 });
    const { result } = renderHook(() => useOrganizationDescriptor('o1'));
    const d = result.current.descriptor!;
    // `single` is what routes EntityDetail to EntitySingle instead of the
    // legacy scroll shell.
    expect(d.single).toBeDefined();
    expect(d.hero).toBeNull();
    expect(d.sidebar).toBeNull();
    expect(d.single!.eyebrow).toBe('Organization');
    for (const section of d.sections) expect(section.title).toBeTruthy();
  });

  it('shows contact (and so the website) with no venue at all', () => {
    orgRef.current = makeOrg({ website: 'https://acme.example' });
    const { result } = renderHook(() => useOrganizationDescriptor('o1'));
    expect(when(result.current.descriptor!.sections, 'location')).toBe(true);
  });

  it('hides the milestones station when there are none', () => {
    orgRef.current = makeOrg({});
    const { result } = renderHook(() => useOrganizationDescriptor('o1'));
    expect(when(result.current.descriptor!.sections, 'milestones')).toBe(false);
  });

  it('a seller whose Shop grid renders gets no second, contradicting product count', () => {
    // product_count also counts listings the grid hides (Marek+Richard: 2,594
    // in "What they do" against "24 of 2,057" in the grid).
    orgRef.current = makeOrg({
      roles: ['seller'],
      product_count: 2594,
      website_domain: 'm.example',
    });
    const { result } = renderHook(() => useOrganizationDescriptor('o1'));
    const s = result.current.descriptor!.sections;
    expect(when(s, 'shop')).toBe(true);
    expect(when(s, 'what-they-do')).toBe(false);
  });

  it('a seller with no Shop grid keeps its product count', () => {
    orgRef.current = makeOrg({ roles: ['seller'], product_count: 12, website_domain: null });
    const { result } = renderHook(() => useOrganizationDescriptor('o1'));
    const s = result.current.descriptor!.sections;
    expect(when(s, 'shop')).toBe(false);
    expect(when(s, 'what-they-do')).toBe(true);
  });

  it('does not repeat "Organization" as a chip under the eyebrow that already says it', () => {
    orgRef.current = makeOrg({ roles: ['seller'] });
    const { result } = renderHook(() => useOrganizationDescriptor('o1'));
    const single = result.current.descriptor!.single!;
    expect(single.eyebrow).toMatch(/^Organization/);
    render(<MemoryRouter>{single.tags}</MemoryRouter>);
    expect(document.querySelector('[data-kind="organization"]')).toBeNull();
    expect(screen.getByText('Shop')).toBeInTheDocument();
  });
});
