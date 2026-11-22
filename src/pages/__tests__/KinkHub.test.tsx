import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';

const ageState = { affirmed: false };
vi.mock('@/hooks/useAgeAffirmation', () => ({
  useAgeAffirmation: () => ({ affirmed: ageState.affirmed, checking: false, affirm: vi.fn() }),
}));
vi.mock('@/hooks/useKinkFilterTerms', () => ({
  useKinkFilterTerms: () => ({
    isLoading: false,
    data: [
      {
        slug: 'sauna',
        name: 'Sauna',
        label: 'Sauna',
        short_description: 'Hot room',
        term_group: 'feature',
        sort: 1,
        applies_to: ['venues'],
        public_without_18: true,
        event_count: 3,
        venue_count: 968,
      },
      {
        slug: 'fisting',
        name: 'Fisting',
        label: 'Fisting',
        short_description: null,
        term_group: 'kink',
        sort: 1,
        applies_to: ['events'],
        public_without_18: false,
        event_count: 18,
        venue_count: 4,
      },
    ],
  }),
}));

import KinkHub from '../KinkHub';

describe('KinkHub', () => {
  beforeEach(() => {
    ageState.affirmed = false;
  });

  it('without 18+ lists only public terms and asks for confirmation', () => {
    renderWithProviders(<KinkHub />);
    expect(screen.getByText('Sauna')).toBeInTheDocument();
    expect(screen.queryByText('Fisting')).not.toBeInTheDocument();
    expect(screen.getByTestId('age-affirmation-modal')).toBeInTheDocument();
  });

  it('with 18+ lists kinks, each linking to its tag page', () => {
    ageState.affirmed = true;
    renderWithProviders(<KinkHub />);
    expect(screen.getByText('Fisting')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Fisting' })).toHaveAttribute('href', '/tags/fisting');
    expect(screen.queryByTestId('age-affirmation-modal')).not.toBeInTheDocument();
  });
});
