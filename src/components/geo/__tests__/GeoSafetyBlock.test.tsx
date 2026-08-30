/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';

const safety = vi.hoisted(() => ({
  report: {
    status: 'ready' as string,
    hasCriminalizedDestination: false,
    hasDeathPenaltyDestination: false,
  },
}));
vi.mock('@/hooks/useTripSafety', () => ({ useTripSafety: () => safety.report }));

import { GeoSafetyVerdict } from '../GeoSafetyBlock';

describe('GeoSafetyVerdict', () => {
  it('withholds the verdict until the report has settled', () => {
    // Before the country row lands, every flag on the report is false and the
    // un-gated fallback would render a ShieldCheck with an equality tier — a
    // reassuring tile on exactly the pages that must never reassure.
    // /country/afghanistan once showed "Welcoming" beneath its own
    // death-penalty banner for ~30s.
    safety.report = {
      status: 'loading',
      hasCriminalizedDestination: false,
      hasDeathPenaltyDestination: false,
    };
    renderWithProviders(<GeoSafetyVerdict countryId="af" equalityScore={8} />);
    expect(screen.getByText('Checking…')).toBeInTheDocument();
    expect(screen.queryByText(/equality/i)).not.toBeInTheDocument();
  });

  it('states criminalisation once the report is ready', () => {
    safety.report = {
      status: 'ready',
      hasCriminalizedDestination: true,
      hasDeathPenaltyDestination: false,
    };
    renderWithProviders(<GeoSafetyVerdict countryId="ug" equalityScore={12} />);
    expect(screen.getByText('Criminalized')).toBeInTheDocument();
  });

  it('escalates to the death-penalty verdict over criminalisation', () => {
    safety.report = {
      status: 'ready',
      hasCriminalizedDestination: true,
      hasDeathPenaltyDestination: true,
    };
    renderWithProviders(<GeoSafetyVerdict countryId="af" equalityScore={8} />);
    expect(screen.getByText('Death penalty')).toBeInTheDocument();
    expect(screen.queryByText('Criminalized')).not.toBeInTheDocument();
  });

  it('reads the equality tier only where nothing is criminalised', () => {
    safety.report = {
      status: 'ready',
      hasCriminalizedDestination: false,
      hasDeathPenaltyDestination: false,
    };
    renderWithProviders(<GeoSafetyVerdict countryId="de" equalityScore={83} />);
    expect(screen.getByText(/equality/i)).toBeInTheDocument();
    // The tier is the verdict; the raw 0-100 composite is no longer rendered.
    expect(screen.queryByText('83/100')).not.toBeInTheDocument();
  });

  it('renders a plain block, not a dead link, when the page has no rights section', () => {
    safety.report = {
      status: 'ready',
      hasCriminalizedDestination: false,
      hasDeathPenaltyDestination: false,
    };
    const { container } = renderWithProviders(
      <GeoSafetyVerdict countryId="de" equalityScore={83} rightsHref={null} />,
    );
    expect(container.querySelector('a')).toBeNull();
  });

  it('carries no track colour — colour on a risk badge is forbidden by the design system', () => {
    safety.report = {
      status: 'ready',
      hasCriminalizedDestination: true,
      hasDeathPenaltyDestination: false,
    };
    const { container } = renderWithProviders(
      <GeoSafetyVerdict countryId="ug" equalityScore={12} />,
    );
    expect(container.innerHTML).not.toMatch(/track-(pink|blue|green|yellow)/);
  });
});
