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
  const base = {
    countries: [],
    crossBorderWarnings: [],
    overallRisk: 'low' as const,
    hasCriminalizedDestination: false,
    hasDeathPenaltyDestination: false,
    ...over,
  };
  return {
    ...base,
    // Confirmed implies at-risk. Defaulting rather than requiring it keeps the
    // mock from expressing a state the hook cannot produce (a confirmed death
    // penalty that is somehow not a death-penalty risk).
    hasDeathPenaltyRiskDestination:
      over.hasDeathPenaltyRiskDestination ?? base.hasDeathPenaltyDestination,
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

  // Afghanistan, Pakistan, Qatar, Somalia, UAE: ILGA records
  // death_penalty='No legal certainty' with penalty='Death Penalty (possible)'.
  // These rendered as plain "Use caution" until 2026-08-07 because the
  // confirmed-only test treated recorded uncertainty as a measured "No".
  it('renders "Dangerous" + an uncertainty flag when the death penalty is possible', () => {
    state.report = makeReport({
      overallRisk: 'critical',
      hasCriminalizedDestination: true,
      hasDeathPenaltyDestination: false,
      hasDeathPenaltyRiskDestination: true,
    });
    const { getByText, queryByText } = render(<SafetyVerdict countryId="c1" equalityScore={5} />);
    expect(getByText('Dangerous')).toBeTruthy();
    expect(
      getByText('Death penalty possible for same-sex relations — no legal certainty'),
    ).toBeTruthy();
    // Must not be stated as established fact.
    expect(queryByText('Death penalty in effect for same-sex relations')).toBeNull();
  });

  it('INVARIANT: a possible death penalty cannot read as safe if upstream regresses', () => {
    state.report = makeReport({ overallRisk: 'low', hasDeathPenaltyRiskDestination: true });
    const { getByText, queryByText } = render(<SafetyVerdict countryId="c1" equalityScore={90} />);
    expect(queryByText('Welcoming')).toBeNull();
    expect(getByText('Dangerous')).toBeTruthy();
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
