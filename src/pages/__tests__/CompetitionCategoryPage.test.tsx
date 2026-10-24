import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

const panelProps: Array<{ competitions: Array<{ slug: string }> }> = [];

vi.mock('@/hooks/useReferenceTaxonomy', () => ({ useReferenceTaxonomy: () => undefined }));
vi.mock('@/hooks/useMeta', () => ({ useMeta: () => undefined }));
vi.mock('@/hooks/useCompetitions', () => ({
  useCompetitionOverview: () => ({
    isLoading: false,
    isError: false,
    data: {
      competitions: [
        { slug: 'rpdr-us', name: 'US', category: 'drag_series', editions: [] },
        { slug: 'iml', name: 'IML', category: 'leather_title', editions: [] },
      ],
    },
  }),
  useCompetitionRoster: () => ({ isLoading: false, isError: false, data: [] }),
  useCompetitionGrid: () => ({ isLoading: false, data: null }),
}));
vi.mock('@/components/competitions/CompetitionAdminPanel', () => ({
  CompetitionAdminPanel: (p: { competitions: Array<{ slug: string }> }) => {
    panelProps.push(p);
    return <div data-testid="admin-panel" />;
  },
}));
vi.mock('@/components/competitions/CompetitionSeasonTable', () => ({
  CompetitionSeasonTable: () => null,
}));
vi.mock('@/components/competitions/CompetitionWinnersRail', () => ({
  CompetitionWinnersRail: () => null,
}));

import CompetitionCategoryPage from '../CompetitionCategoryPage';

describe('CompetitionCategoryPage', () => {
  it('mounts the staff admin panel with only this category’s competitions', () => {
    render(
      <MemoryRouter>
        <CompetitionCategoryPage category="drag_series" />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('admin-panel')).toBeInTheDocument();
    expect(panelProps.at(-1)?.competitions.map((c) => c.slug)).toEqual(['rpdr-us']);
  });
});
