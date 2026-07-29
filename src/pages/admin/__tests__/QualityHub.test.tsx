/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

const counts = vi.fn(() => ({ data: { review_org_links: 50, quality_city: 2 } }));

vi.mock('@/hooks/useAdminCounts', () => ({
  useAdminCounts: () => counts(),
}));

// The engine dashboards are covered by their own tests; stub them so this
// spec is about the card grid + section wiring only. (Factories are hoisted,
// so each one has to be self-contained — no shared helper.)
vi.mock('@/components/admin/CityQualityPanel', () => ({ CityQualityPanel: () => <div /> }));
vi.mock('@/components/admin/AmenityQualityPanel', () => ({ AmenityQualityPanel: () => <div /> }));
vi.mock('@/components/admin/VillageQualityPanel', () => ({ VillageQualityPanel: () => <div /> }));
vi.mock('@/components/admin/PersonalityQualityPanel', () => ({
  PersonalityQualityPanel: () => <div />,
}));
vi.mock('@/components/admin/MarketplaceTagQualityPanel', () => ({
  MarketplaceTagQualityPanel: () => <div />,
}));
vi.mock('@/components/admin/MarketplacePruneCard', () => ({
  MarketplacePruneCard: () => <div />,
}));
vi.mock('@/components/admin/FreigabeFunnel', () => ({ FreigabeFunnel: () => <div /> }));
vi.mock('@/components/admin/PersonalityFreigabeQueue', () => ({
  PersonalityFreigabeQueue: () => <div />,
}));
vi.mock('@/components/admin/DedupPendingLink', () => ({ DedupPendingLink: () => <div /> }));

// Left unmocked so the REAL OrgLinkReviewQueue renders inside the section;
// only its data layer is faked.
const decide = vi.fn().mockResolvedValue(undefined);
vi.mock('@/hooks/useBusinessSpine', () => ({
  ORG_ROLE_LABELS: {},
  useOrgLinkSuggestions: () => ({
    data: [
      {
        id: 'sug-1',
        entity_type: 'venue',
        entity_id: 'v-1',
        organization_id: null,
        confidence: 0.82,
        reason: 'despaced name + city',
        payload: { entity: { name: 'Roses Bar' }, org: { name: 'Roses GmbH' } },
        created_at: '2026-07-20T10:00:00Z',
      },
    ],
    isLoading: false,
  }),
  useDecideOrgAdoption: () => ({ mutateAsync: decide, isPending: false }),
}));

import QualityHub from '../QualityHub';

function renderHub() {
  return render(
    <MemoryRouter initialEntries={['/admin/quality']}>
      <QualityHub />
    </MemoryRouter>,
  );
}

/**
 * The card and the accordion trigger both say "Business links"; the count
 * disambiguates the card, whose accessible name concatenates its contents.
 */
const cardButton = () => screen.getByRole('button', { name: /^Business links 50/ });

beforeEach(() => {
  // jsdom implements neither; the card handler calls both.
  Element.prototype.scrollIntoView = vi.fn();
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  }) as typeof globalThis.requestAnimationFrame;
});

describe('QualityHub — business link review', () => {
  it('shows a Business links card carrying the review_org_links count', () => {
    renderHub();
    const card = cardButton();
    expect(card).toHaveTextContent('50');
    expect(card).toHaveTextContent(/Review 50 items/i);
  });

  it('counts business links in the header total', () => {
    renderHub();
    // 50 org links + 2 city items, every other gate 0.
    expect(screen.getByText(/52 items awaiting review/i)).toBeTruthy();
  });

  it('renders the queue only after the card expands its section', async () => {
    renderHub();
    expect(screen.queryByText('Roses Bar')).toBeNull();

    fireEvent.click(cardButton());

    await waitFor(() => expect(screen.getByText('Roses Bar')).toBeTruthy());
    expect(screen.getByText('Roses GmbH')).toBeTruthy();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it('decides a suggestion inline', async () => {
    renderHub();
    fireEvent.click(cardButton());
    const link = await screen.findByRole('button', { name: /^Link$/i });
    fireEvent.click(link);
    await waitFor(() => expect(decide).toHaveBeenCalledWith({ id: 'sug-1', approve: true }));
  });

  it('keeps inbox-decided gates as plain links', () => {
    renderHub();
    const cities = screen.getByRole('link', { name: /Cities/i });
    expect(cities.getAttribute('href')).toBe('/admin/inbox?queue=quality-city');
  });
});
