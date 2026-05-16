/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const { useImportHubMock, fetchSourcesFn } = vi.hoisted(() => ({
  useImportHubMock: vi.fn(),
  fetchSourcesFn: vi.fn(),
}));

vi.mock('@/hooks/useImportHub', () => ({ useImportHub: useImportHubMock }));

import { IngestionSourcesManager } from '../IngestionSourcesManager';

beforeEach(() => {
  useImportHubMock.mockReset();
  fetchSourcesFn.mockReset();
});

describe('IngestionSourcesManager', () => {
  it('renders summary block', async () => {
    fetchSourcesFn.mockResolvedValue([
      { id: 's1', name: 'BBC', source_type: 'rss', is_enabled: true, last_run_at: null, last_error: null },
      { id: 's2', name: 'X', source_type: 'api', is_enabled: false, last_run_at: null, last_error: 'fail' },
    ]);
    useImportHubMock.mockReturnValue({
      fetchSources: fetchSourcesFn, toggleSource: vi.fn(), triggerSource: vi.fn(),
    });
    render(<IngestionSourcesManager />);
    await waitFor(() => expect(screen.getByText('2')).toBeInTheDocument());
  });
});
