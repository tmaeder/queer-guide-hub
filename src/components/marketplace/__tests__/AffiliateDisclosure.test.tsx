/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AffiliateDisclosure } from '../AffiliateDisclosure';

describe('AffiliateDisclosure', () => {
  it('renders the compact single-paragraph variant', () => {
    render(<AffiliateDisclosure compact />);
    expect(screen.getByText(/affiliate links/i)).toBeInTheDocument();
    expect(screen.queryByText(/Affiliate disclosure/i)).toBeNull();
  });

  it('renders the full disclosure with heading + aside role', () => {
    render(<AffiliateDisclosure />);
    expect(screen.getByRole('note', { name: /Affiliate disclosure/i })).toBeInTheDocument();
    expect(screen.getByText(/LGBTQ\+ relevance review/i)).toBeInTheDocument();
  });
});
