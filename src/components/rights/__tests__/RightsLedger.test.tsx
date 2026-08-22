// src/components/rights/__tests__/RightsLedger.test.tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@/test/test-utils';
import { RightsLedger } from '../RightsLedger';
import { RIGHT_TOPICS } from '@/lib/rights/rightsCatalog';
import type { RightWorldSummary } from '@/lib/rights/rightsWorldSummary';

const summary: RightWorldSummary[] = RIGHT_TOPICS.map((topic) => ({
  topic,
  yes: topic.slug === 'marriage' ? 67 : 10,
  no: 5,
  partial: 2,
  measured: 17,
  uncounted: topic.slug === 'gender-recognition',
}));

describe('RightsLedger', () => {
  it('renders every right with its anchor id', () => {
    render(<RightsLedger summary={summary} />);
    for (const t of RIGHT_TOPICS) {
      expect(document.getElementById(t.slug), t.slug).toBeTruthy();
    }
  });

  it('disambiguates the two union topics', () => {
    render(<RightsLedger summary={summary} />);
    expect(screen.getByText('Marriage equality')).toBeInTheDocument();
    expect(screen.getByText('Civil unions')).toBeInTheDocument();
  });

  it('states the stricter fully-protect bar for matrix rights', () => {
    render(<RightsLedger summary={summary} />);
    // 9 protection-matrix topics all read "fully protect".
    expect(screen.getAllByText(/fully protect/).length).toBe(9);
  });

  it('renders an uncounted right without a number, not hidden', () => {
    render(<RightsLedger summary={summary} />);
    const row = document.getElementById('gender-recognition')!;
    expect(row.textContent).toMatch(/Recorded per country/);
    expect(row.textContent).not.toMatch(/\d+ of \d+/);
  });

  it('criminalisation counts the negative direction', () => {
    render(<RightsLedger summary={summary} />);
    const row = document.getElementById('criminalisation')!;
    expect(row.textContent).toMatch(/5 of 17 countries criminalise/);
  });
});
