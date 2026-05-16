/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';

const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }));

vi.mock('@/hooks/useSearchIntelligence', () => ({ callSearchIntelligence: callMock }));
vi.mock('../ClusterTagPicker', () => ({ ClusterTagPicker: () => null }));

import { TopicsTab } from '../TopicsTab';

beforeEach(() => callMock.mockReset());

describe('TopicsTab', () => {
  it('renders without crashing on empty list', async () => {
    callMock.mockResolvedValue({ success: true, data: [] });
    const { container } = render(<TopicsTab />);
    await waitFor(() => expect(container).toBeTruthy());
  });
});
