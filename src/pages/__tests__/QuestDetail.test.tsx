/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';

vi.mock('@/hooks/useMeta', () => ({ useMeta: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/useQuests', () => ({
  useQuest: () => ({ data: null, isLoading: false }),
  useQuestProgress: () => ({ data: null }),
  useQuestContributors: () => ({ data: [] }),
  useMyQuestParticipation: () => ({ data: null }),
  useJoinQuest: () => ({ mutate: vi.fn() }),
  useSubmitQuestContribution: () => ({ mutate: vi.fn() }),
}));

import QuestDetail from '../QuestDetail';

describe('QuestDetail', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/quests/q1']}>
        <Routes><Route path="/quests/:slug" element={<QuestDetail />} /></Routes>
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });
});
