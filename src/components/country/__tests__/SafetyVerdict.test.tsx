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
    status: 'ready' as const,
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
    hasUnknownDestination: over.hasUnknownDestination ?? false,
  };
}

describe('SafetyVerdict', () => {
  beforeEach(() => {
    state.report = makeReport({});
  });

  // The raw 0-100 composite was retired from the reader-facing pages: it read
  // as a precise measurement when it is a roll-up of legal flags. The tier is
  // what ships, and the number must not come back.
  it('renders "Welcoming" for a low-risk country and states the tier, not the number', () => {
    state.report = makeReport({ overallRisk: 'low' });
    const { getByText, queryByText } = render(<SafetyVerdict countryId="c1" equalityScore={88} />);
    expect(getByText('Welcoming')).toBeTruthy();
    expect(getByText(/very high/i)).toBeTruthy();
    expect(queryByText('88')).toBeNull();
    expect(queryByText('/100')).toBeNull();
  });

  // The testid is load-bearing for e2e, not decoration. This banner has no
  // other locator — its eyebrow and tier are sibling <p>s with no reachable
  // ancestor — so `e2e/removed-ui-elements.spec.ts` used to match its text
  // page-wide and raced the country row landing (measured 1 failure in 6 on
  // prod). Deleting the attribute puts that flake straight back; this fails in
  // seconds instead of intermittently, half an hour into a nightly.
  it('exposes the testid the e2e waits on', () => {
    const { getByTestId } = render(<SafetyVerdict countryId="c1" equalityScore={88} />);
    const banner = getByTestId('country-safety-verdict');
    // Asserted INSIDE the banner, matching how the e2e scopes it: if the label
    // ever moves out of this element, this is what says so first.
    expect(banner.textContent).toContain('Equality');
    expect(banner.textContent).toMatch(/very high/i);
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

  // Observed live on /country/afghanistan 2026-08-07: the tile read "Welcoming"
  // for ~30s directly beneath that page's own death-penalty travel warning,
  // because the report's empty shape (overallRisk 'low', every flag false) is
  // identical to a country measured and found safe.
  it('INVARIANT: states no verdict while the fetch is in flight', () => {
    state.report = makeReport({ status: 'loading' });
    const { getByText, queryByText } = render(<SafetyVerdict countryId="c1" equalityScore={5} />);
    expect(queryByText('Welcoming')).toBeNull();
    expect(queryByText('Dangerous')).toBeNull();
    expect(getByText('Checking legal status…')).toBeTruthy();
  });

  it('INVARIANT: states no verdict when the fetch failed', () => {
    state.report = makeReport({ status: 'error' });
    const { queryByText } = render(<SafetyVerdict countryId="c1" equalityScore={5} />);
    expect(queryByText('Welcoming')).toBeNull();
  });

  it('still states the equality tier while pending — it comes from props, not the fetch', () => {
    state.report = makeReport({ status: 'loading' });
    const { getByText } = render(<SafetyVerdict countryId="c1" equalityScore={5} />);
    expect(getByText(/very low/i)).toBeTruthy();
  });

  it('says "No data" rather than guessing a tier for an unknown equality score', () => {
    state.report = makeReport({ overallRisk: 'low' });
    const { getByText } = render(<SafetyVerdict countryId="c1" equalityScore={null} />);
    expect(getByText(/no data/i)).toBeTruthy();
  });
});
