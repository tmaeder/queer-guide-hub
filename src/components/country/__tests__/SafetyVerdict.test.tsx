/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import type { TripSafetyReport } from '@/hooks/useTripSafety';

const state = vi.hoisted(() => ({
  report: null as TripSafetyReport | null,
}));

vi.mock('@/hooks/useTripSafety', () => ({
  useTripSafety: () => state.report,
}));

import { SafetyVerdict } from '../SafetyVerdict';

function makeReport(over: Partial<TripSafetyReport>): TripSafetyReport {
  return {
    countries: [],
    crossBorderWarnings: [],
    overallRisk: 'low',
    hasCriminalizedDestination: false,
    hasDeathPenaltyDestination: false,
    ...over,
  };
}

describe('SafetyVerdict', () => {
  beforeEach(() => {
    state.report = makeReport({});
  });

  it('renders "Welcoming" for a low-risk country and shows score /100', () => {
    state.report = makeReport({ overallRisk: 'low' });
    const { getByText } = render(<SafetyVerdict countryId="c1" equalityScore={88} />);
    expect(getByText('Welcoming')).toBeTruthy();
    expect(getByText('88')).toBeTruthy();
    expect(getByText('/100')).toBeTruthy();
  });

  it('renders "Use caution" + criminalized flag for a criminalizing country', () => {
    state.report = makeReport({ overallRisk: 'high', hasCriminalizedDestination: true });
    const { getByText } = render(<SafetyVerdict countryId="c1" equalityScore={20} />);
    expect(getByText('Use caution')).toBeTruthy();
    expect(getByText('Same-sex relations are criminalized')).toBeTruthy();
  });

  it('renders "Dangerous" + death-penalty flag for a death-penalty country', () => {
    state.report = makeReport({
      overallRisk: 'critical',
      hasCriminalizedDestination: true,
      hasDeathPenaltyDestination: true,
    });
    const { getByText } = render(<SafetyVerdict countryId="c1" equalityScore={4} />);
    expect(getByText('Dangerous')).toBeTruthy();
    expect(getByText('Death penalty in effect for same-sex relations')).toBeTruthy();
  });

  it('INVARIANT: never reads safe when criminalized, even if upstream risk regresses to low', () => {
    // Defensive: a criminalizing destination must not render "Welcoming".
    state.report = makeReport({ overallRisk: 'low', hasCriminalizedDestination: true });
    const { getByText, queryByText } = render(<SafetyVerdict countryId="c1" equalityScore={90} />);
    expect(queryByText('Welcoming')).toBeNull();
    expect(getByText('Use caution')).toBeTruthy();
  });

  it('shows an em dash for an unknown equality score', () => {
    state.report = makeReport({ overallRisk: 'low' });
    const { getByText } = render(<SafetyVerdict countryId="c1" equalityScore={null} />);
    expect(getByText('—')).toBeTruthy();
  });
});
