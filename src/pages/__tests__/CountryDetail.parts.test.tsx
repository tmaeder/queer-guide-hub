/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/components/routing/LocalizedLink', () => ({ LocalizedLink: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));
vi.mock('@/components/country/SafetyAlertBanner', () => ({ default: () => null }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

import {
  getWeatherIcon,
  SectionLoader,
  CountryHero,
  CountryRightsTab,
  CountryCitiesTab,
} from '../CountryDetail.parts';

describe('CountryDetail.parts', () => {
  it('getWeatherIcon returns icon', () => {
    expect(getWeatherIcon('clear')).toBeDefined();
  });
  it('SectionLoader renders', () => {
    const { container } = render(<SectionLoader label="loading" />);
    expect(container).toBeTruthy();
  });
  it('CountryHero renders', () => {
    const { container } = render(<MemoryRouter><CountryHero country={{ id: 'c1', name: 'Germany' } as never} cities={[] as never} weatherData={null} /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
  it('CountryRightsTab renders', () => {
    const { container } = render(<CountryRightsTab country={{} as never} />);
    expect(container).toBeTruthy();
  });
  it('CountryCitiesTab renders', () => {
    const { container } = render(<MemoryRouter><CountryCitiesTab country={{ id: 'c1' } as never} cities={[] as never} citiesLoading={false} /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
