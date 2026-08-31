import { describe, it, expect } from 'vitest';
import { render, screen } from '@/test/test-utils';
import { SourceLine } from '@/components/rights/SourceLine';

/**
 * ILGA covers 239 of 250 countries. Citing it for the other 11 is a provenance
 * falsehood on the platform's highest-stakes data.
 *
 * Measured on prod 2026-08-30, before this fix: `/country/western-sahara` rendered
 * "ILGA World Database · Updated Apr 21, 2026" above the claim "Same-sex activity is
 * criminalized in Western Sahara". ILGA makes no such entry — it is our own reading of a
 * de-facto regime in a territory of disputed sovereignty, deliberately stamped
 * `disputed: true` precisely so it could be shown as contested. The UI ignored the
 * qualifier and published the claim under ILGA's name.
 */
describe('SourceLine attributes only what ILGA actually said', () => {
  it('cites ILGA for an ordinary ILGA-covered country', () => {
    render(<SourceLine updatedAt="2026-08-30T02:00:00Z" />);
    expect(screen.getByText(/ILGA World Database/i)).toBeInTheDocument();
  });

  it('names the parent state for an inherited territory', () => {
    // Åland has no separate ILGA entry; what is shown is Finland's national law.
    // Asserted on textContent because the line is deliberately several nodes (a
    // link, a date, then the qualifier) and getByText matches per element.
    const { container } = render(
      <SourceLine
        updatedAt="2026-08-30T02:00:00Z"
        provenance={{ state: 'inherited', parent_name: 'Finland' }}
      />,
    );
    expect(container.textContent).toMatch(/Finland/);
    expect(container.textContent).toMatch(/No separate ILGA entry/i);
  });

  it('does NOT cite ILGA for a disputed territory', () => {
    render(
      <SourceLine
        updatedAt="2026-04-21T00:00:00Z"
        provenance={{
          state: 'data_unavailable',
          disputed: true,
          basis: 'Moroccan Penal Code Art. 489',
        }}
      />,
    );
    // No ILGA citation link — the claim is ours, and must read as ours.
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    const { textContent } = document.body;
    expect(textContent).toMatch(/disputed territory/i);
    expect(textContent).toMatch(/Moroccan Penal Code Art\. 489/);
  });

  it('does not publish a stale ILGA date for a country ILGA never covered', () => {
    // The Apr 21 stamp is seed data, not a refresh. Showing it beside an ILGA byline
    // asserts ILGA looked at this territory on that date. It did not.
    render(
      <SourceLine
        updatedAt="2026-04-21T00:00:00Z"
        provenance={{ state: 'data_unavailable', disputed: true }}
      />,
    );
    expect(screen.queryByText(/Apr 21, 2026/)).not.toBeInTheDocument();
  });

  it('does not cite ILGA for an uninhabited territory either', () => {
    render(<SourceLine provenance={{ state: 'not_applicable' }} />);
    // The disclaimer names ILGA in order to DENY coverage, so a substring check would
    // match its own negation. The thing that must be absent is the CITATION — the link.
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText(/Not covered by the ILGA World Database/i)).toBeInTheDocument();
  });
});
