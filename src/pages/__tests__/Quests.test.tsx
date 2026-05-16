/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

const { useQuestsMock } = vi.hoisted(() => ({ useQuestsMock: vi.fn() }));

vi.mock('@/hooks/useMeta', () => ({ useMeta: vi.fn() }));
vi.mock('@/hooks/useQuests', () => ({ useQuests: useQuestsMock }));
vi.mock('@/components/ui/EmptyState', () => ({
  EmptyState: (p: { title: string }) => <div>{p.title}</div>,
}));
vi.mock('@/components/discovery', () => ({
  PageHero: () => <div data-testid="hero" />,
  BentoSection: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  spansForPreset: () => 'sm',
}));

import Quests from '../Quests';

const inRouter = (ui: React.ReactNode) => <MemoryRouter>{ui}</MemoryRouter>;

beforeEach(() => useQuestsMock.mockReset());

describe('Quests page', () => {
  it('shows loading state', () => {
    useQuestsMock.mockReturnValue({ data: undefined, isLoading: true });
    render(inRouter(<Quests />));
    expect(screen.getByText(/Loading quests/)).toBeInTheDocument();
  });

  it('shows empty state', () => {
    useQuestsMock.mockReturnValue({ data: [], isLoading: false });
    render(inRouter(<Quests />));
    expect(screen.getByText(/No quests yet/)).toBeInTheDocument();
  });

  it('groups by active/upcoming/past', () => {
    const now = Date.now();
    const inDay = (n: number) => new Date(now + n * 86_400_000).toISOString();
    useQuestsMock.mockReturnValue({
      data: [
        { id: '1', slug: 'a', title: 'Active Quest', status: 'active', starts_at: inDay(-1), ends_at: inDay(7) },
        { id: '2', slug: 'b', title: 'Upcoming Quest', status: 'draft', starts_at: inDay(10), ends_at: inDay(20) },
        { id: '3', slug: 'c', title: 'Past Quest', status: 'completed', starts_at: inDay(-30), ends_at: inDay(-1) },
      ],
      isLoading: false,
    });
    render(inRouter(<Quests />));
    expect(screen.getByText('Active Quest')).toBeInTheDocument();
    expect(screen.getByText('Upcoming Quest')).toBeInTheDocument();
    expect(screen.getByText('Past Quest')).toBeInTheDocument();
  });
});
