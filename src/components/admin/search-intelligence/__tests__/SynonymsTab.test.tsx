/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }));

vi.mock('@/hooks/useSearchIntelligence', () => ({ callSearchIntelligence: callMock }));

import { SynonymsTab } from '../SynonymsTab';

beforeEach(() => callMock.mockReset());

describe('SynonymsTab', () => {
  it('renders without crashing', async () => {
    callMock.mockResolvedValue({ success: true, data: [] });
    const { container } = render(<SynonymsTab />);
    await waitFor(() => expect(container).toBeTruthy());
  });

  it('renders synonym row when data returns', async () => {
    callMock.mockResolvedValue({
      success: true,
      data: [{ id: 's1', terms: ['gay'], replacements: ['queer'], locale: '*', indexes: [], status: 'active', is_one_way: false, created_at: 'now' }],
    });
    render(<SynonymsTab />);
    await waitFor(() => expect(screen.getByText(/gay/)).toBeInTheDocument());
  });
});
