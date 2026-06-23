/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/hooks/useQuests', () => ({
  useQuests: () => ({ data: [], isLoading: false }),
  useQuestMutations: () => ({ create: vi.fn(), update: vi.fn(), remove: vi.fn(), createRecap: vi.fn() }),
}));

import AdminQuests from '../AdminQuests';

describe('AdminQuests', () => {
  it('renders without crashing', () => {
    const { container } = render(<MemoryRouter><AdminQuests /></MemoryRouter>);
    const { container } = render(
      <MemoryRouter>
        <AdminQuests />
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });
});
