import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CityCodeBadges } from '@/components/admin/CityCodeBadges';

describe('CityCodeBadges', () => {
  it('renders both ISO codes', () => {
    render(<CityCodeBadges countryCode="us" regionCode="US-ME" />);
    expect(screen.getByText('US')).toBeInTheDocument();
    expect(screen.getByText('US-ME')).toBeInTheDocument();
  });
  it('shows a missing region explicitly', () => {
    render(<CityCodeBadges countryCode="ZA" regionCode={null} />);
    expect(screen.getByText('ZA')).toBeInTheDocument();
    expect(screen.getByText('no region')).toBeInTheDocument();
  });
});
