/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/components/routing/LocalizedLink', () => ({
  LocalizedLink: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}));
vi.mock('@/components/ui/loading', () => ({
  InlineLoading: (p: { text: string }) => <div>{p.text}</div>,
}));
vi.mock('@/components/country/EqualityScoreBadge', () => ({
  default: (p: { score: number }) => <span data-testid="score">{p.score}</span>,
}));
vi.mock('@/components/country/LGBTJurisdictionInfo', () => ({
  default: () => <div data-testid="rights" />,
}));
vi.mock('@/components/animation/ScrollReveal', () => ({
  ScrollReveal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { CityRightsTab } from '../CityRightsTab';

const city = {
  name: 'Berlin',
  countries: { name: 'Germany', equality_score: 80, slug: 'germany', id: 'co-de' },
} as never;

const inRouter = (ui: React.ReactNode) => <MemoryRouter>{ui}</MemoryRouter>;

describe('CityRightsTab', () => {
  it('shows loading state', () => {
    render(inRouter(<CityRightsTab city={city} fullCountry={null} countryLoading />));
    expect(screen.getByText(/Loading rights data/i)).toBeInTheDocument();
  });

  it('shows not-available message when fullCountry null', () => {
    render(inRouter(<CityRightsTab city={city} fullCountry={null} countryLoading={false} />));
    expect(screen.getByText(/Rights data is not available/i)).toBeInTheDocument();
  });

  it('renders heading + score badge + jurisdiction info', () => {
    render(inRouter(<CityRightsTab city={city} fullCountry={{ id: 'co-de' } as never} countryLoading={false} />));
    expect(screen.getByRole('heading', { name: /LGBTI Rights/i })).toBeInTheDocument();
    expect(screen.getByTestId('score')).toHaveTextContent('80');
    expect(screen.getByTestId('rights')).toBeInTheDocument();
  });
});
