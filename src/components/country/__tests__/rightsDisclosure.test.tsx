/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
// `fireEvent`, not `user-event`: the latter is in package.json but absent from
// the installed tree, and Radix's Collapsible toggles on a plain click.
import { fireEvent, screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import LGBTJurisdictionInfo from '../LGBTJurisdictionInfo';

/**
 * The reduction, asserted at the card rather than the section component: what
 * matters is which rows a reader actually gets without interacting, and that
 * criminal exposure is never one of the things behind a click.
 */

const germany = {
  lgbti_criminalization: { legal: true, decrim_year_1: '1994' },
  lgbti_same_sex_unions: JSON.stringify({ summary: 'Marriage', marriage_since: '2017' }),
  lgbti_employment_protection: { so: 'Yes', gi: 'Yes', ge: 'No', sc: 'No' },
  lgbti_adoption_rights: 'Joint & Second Parent Adoption',
} as Record<string, unknown>;

const afghanistan = {
  lgbti_criminalization: {
    legal: false,
    penalty: 'Up to death',
    death_penalty: true,
  },
} as Record<string, unknown>;

describe('LGBTJurisdictionInfo — reduced by default', () => {
  it('shows criminal status without asking, and defers the long tail', () => {
    renderWithProviders(<LGBTJurisdictionInfo country={germany} />);

    // Criminalisation is not behind a disclosure.
    expect(screen.getByText(/Same-sex activity/i)).toBeInTheDocument();

    // Family is, so its rows are absent until opened.
    expect(screen.queryByText(/Adoption rights/i)).not.toBeInTheDocument();
  });

  it('never puts criminal exposure behind a click', () => {
    renderWithProviders(<LGBTJurisdictionInfo country={afghanistan} />);
    // The penalty line is the reason a traveller opened the page.
    expect(screen.getByText(/Up to death/i)).toBeInTheDocument();
  });

  /**
   * The count string itself cannot be asserted here: `t(key, default, vars)`
   * returns the default VERBATIM in this harness (i18next is not initialised
   * with interpolation for unit tests — measured, not assumed), so the row
   * renders the literal "{{covered}} of {{total}}". What the component decides
   * is *which* of the two strings to use, and that is what these pin; the
   * arithmetic behind it is pinned in sectionSummary.test.ts and the rendered
   * result in e2e/rights-safety.spec.ts.
   */
  it('carries a count on the collapsed row so a closed drawer is not opaque', () => {
    renderWithProviders(<LGBTJurisdictionInfo country={germany} />);
    const family = screen.getByRole('button', { name: /Family & relationships/i });
    // marriage (covered) + adoption (covered) of 2 counted topics — the count
    // branch, not the absence branch.
    expect(within(family).getByText(/covered.*total|\d+ of \d+/)).toBeInTheDocument();
    expect(within(family).queryByText(/No data/i)).not.toBeInTheDocument();
  });

  it('says "No data" rather than "0 of 7" when nothing is recorded', () => {
    // Honest absence: "0 of 7" would claim we looked and found nothing
    // protected. We did not look — the columns are empty.
    renderWithProviders(<LGBTJurisdictionInfo country={afghanistan} />);
    const anti = screen.getByRole('button', { name: /Anti-discrimination/i });
    expect(within(anti).getByText(/No data/i)).toBeInTheDocument();
  });

  it('reveals the deferred rows on click, so nothing was removed', async () => {
    renderWithProviders(<LGBTJurisdictionInfo country={germany} />);

    fireEvent.click(screen.getByRole('button', { name: /Family & relationships/i }));
    expect(await screen.findByText(/Adoption rights/i)).toBeInTheDocument();
  });

  it('exposes expanded state to assistive tech', () => {
    renderWithProviders(<LGBTJurisdictionInfo country={germany} />);
    const trigger = screen.getByRole('button', { name: /Identity & health/i });

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });
});
