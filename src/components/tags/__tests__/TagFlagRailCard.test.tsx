import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { TagFlagRailCard } from '../TagFlagRailCard';

describe('TagFlagRailCard', () => {
  it('shows the Bear Brotherhood flag on /tags/bear and links to its own page', () => {
    // The identity→flag direction of the link relation: `bear` HAS a flag, it
    // is not the flag. Both sides come from the same record, so a mistake here
    // silently swaps the full band for the rail card or vice versa.
    renderWithProviders(<TagFlagRailCard tagSlug="bear" />);

    const link = screen.getByRole('link', { name: 'Bear Brotherhood Flag' });
    expect(link).toHaveAttribute('href', '/tags/bear-brotherhood-flag');
    expect(screen.getByText('1995')).toBeInTheDocument();

    // The swatch is decorative — the name carries the meaning, so the link is
    // not announced twice and is never colour-only.
    const swatch = link.querySelector('svg');
    expect(swatch).toHaveAttribute('aria-hidden', 'true');
    expect(swatch).not.toHaveAttribute('role', 'img');
  });

  it('renders nothing for a tag with no flag', () => {
    const { container } = renderWithProviders(<TagFlagRailCard tagSlug="bear-bar" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing on the flag’s OWN page — that page gets the full band', () => {
    const { container } = renderWithProviders(<TagFlagRailCard tagSlug="bear-brotherhood-flag" />);
    expect(container).toBeEmptyDOMElement();
  });
});
