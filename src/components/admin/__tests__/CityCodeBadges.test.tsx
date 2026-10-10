import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CityCodeBadges } from '@/components/admin/CityCodeBadges';

describe('CityCodeBadges', () => {
  it('renders only the region code when it already names the country', () => {
    render(<CityCodeBadges countryCode="de" regionCode="DE-HE" />);
    expect(screen.getByText('DE-HE')).toBeInTheDocument();
    expect(screen.queryByText('DE')).not.toBeInTheDocument();
  });
  it('keeps both chips when the region contradicts the country', () => {
    render(<CityCodeBadges countryCode="US" regionCode="CA-ON" />);
    expect(screen.getByText('US')).toBeInTheDocument();
    expect(screen.getByText('CA-ON')).toBeInTheDocument();
  });
  it('shows a missing region explicitly', () => {
    render(<CityCodeBadges countryCode="ZA" regionCode={null} />);
    expect(screen.getByText('ZA')).toBeInTheDocument();
    expect(screen.getByText('no region')).toBeInTheDocument();
  });
});
