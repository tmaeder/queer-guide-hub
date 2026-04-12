import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SafetyAlertBanner from '../SafetyAlertBanner';

describe('SafetyAlertBanner', () => {
  it('should return null when not criminalized', () => {
    const { container } = render(<SafetyAlertBanner criminalization={{ legal: true }} countryName="Netherlands" />);
    expect(container.innerHTML).toBe('');
  });

  it('should return null for null criminalization', () => {
    const { container } = render(<SafetyAlertBanner criminalization={null} countryName="Test" />);
    expect(container.innerHTML).toBe('');
  });

  it('should show warning when criminalized', () => {
    render(<SafetyAlertBanner criminalization={{ legal: false, penalty: 'imprisonment' }} countryName="TestCountry" />);
    expect(screen.getByText(/criminalized in TestCountry/)).toBeInTheDocument();
  });

  it('should show death penalty warning', () => {
    render(<SafetyAlertBanner criminalization={{ legal: false, death_penalty: 'Death' }} countryName="DangerCountry" />);
    expect(screen.getByText(/carries the death penalty in DangerCountry/)).toBeInTheDocument();
  });

  it('should include penalty details', () => {
    render(<SafetyAlertBanner criminalization={{ legal: false, penalty: 'Imprisonment', max_prison: '14 years' }} countryName="Test" />);
    expect(screen.getByText(/imprisonment/i)).toBeInTheDocument();
    expect(screen.getByText(/14 years/i)).toBeInTheDocument();
  });
});
