import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BookCTA } from '../BookCTA';
import { AFFILIATE_REL } from '@/lib/affiliate/links';

const baseLink = {
  url: 'https://www.booking.com/searchresults.html?ss=Berlin',
  partner: 'booking',
  surface: 'venue' as const,
  vertical: 'hotel' as const,
};

describe('BookCTA', () => {
  it('renders a sponsored outbound link in safe destinations', () => {
    render(<BookCTA link={baseLink} label="Stay near here" />);
    const link = screen.getByRole('link', { name: /stay near here/i });
    expect(link.getAttribute('rel')).toBe(AFFILIATE_REL);
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('shows an affiliate disclosure by default', () => {
    render(<BookCTA link={baseLink} label="Book" />);
    expect(screen.getByText(/affiliate links/i)).toBeInTheDocument();
  });

  it('suppresses the button and shows a caution when criminalized', () => {
    render(<BookCTA link={baseLink} label="Book a hotel" safety={{ criminalized: true, countryName: 'Testland' }} />);
    expect(screen.getByText(/criminalized in Testland/i)).toBeInTheDocument();
    // A quiet text link is still allowed, but never the outline Button CTA.
    expect(screen.queryByText(/affiliate links/i)).not.toBeInTheDocument();
  });

  it('shows NO booking link at all under a death penalty', () => {
    render(<BookCTA link={baseLink} label="Book a hotel" safety={{ deathPenalty: true, countryName: 'Testland' }} />);
    expect(screen.getByText(/punishable by death in Testland/i)).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
