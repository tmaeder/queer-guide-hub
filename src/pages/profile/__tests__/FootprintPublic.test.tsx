/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';

vi.mock('@/hooks/useMeta', () => ({ useMeta: vi.fn() }));
vi.mock('@/integrations/supabase/untyped', () => ({
  untypedSupabase: { rpc: vi.fn().mockResolvedValue({ data: null, error: null }) },
}));

import FootprintPublic from '../FootprintPublic';

describe('FootprintPublic', () => {
  it('renders', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/u/x']}>
        <Routes>
          <Route path="/u/:userId" element={<FootprintPublic />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });
});
