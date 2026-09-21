import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { VenueQualityTierPanel } from '../VenueQualityTierPanel';

const mockUseVenueQualityDashboard = vi.fn();
vi.mock('@/hooks/useVenueQualityDashboard', () => ({
  useVenueQualityDashboard: () => mockUseVenueQualityDashboard(),
}));

describe('VenueQualityTierPanel', () => {
  it('renders nothing while the scorecard is loading', () => {
    mockUseVenueQualityDashboard.mockReturnValue({ data: undefined });
    const { container } = render(<VenueQualityTierPanel />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows shadow state, tier counts, stale work and blockers', () => {
    mockUseVenueQualityDashboard.mockReturnValue({
      data: {
        enforcement_enabled: false,
        score_version: 2,
        live_venues: 100,
        snapshots: 80,
        stale_snapshots: 4,
        pending_recompute: 20,
        tiers: { verified: 2, guide_ready: 8, listed: 60, suppressed: 10 },
        average_dimensions: { identity: 90, media: 20 },
        blockers: [{ code: 'missing_country', count: 7 }],
        source_cohorts: [],
        city_gaps: [],
        weekly_transitions: {},
      },
    });

    render(<VenueQualityTierPanel />);
    expect(screen.getByText('Shadow mode · v2')).toBeInTheDocument();
    expect(screen.getByText('Guide ready + verified')).toBeInTheDocument();
    expect(screen.getByText('missing country 7')).toBeInTheDocument();
    expect(screen.getByText('90/100')).toBeInTheDocument();
  });
});
