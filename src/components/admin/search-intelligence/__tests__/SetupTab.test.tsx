/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }));

vi.mock('@/hooks/useSearchIntelligence', () => ({ callSearchIntelligence: callMock }));

import { SetupTab } from '../SetupTab';

beforeEach(() => callMock.mockReset());

describe('SetupTab', () => {
  it('shows error message on failure', async () => {
    callMock.mockResolvedValue({ success: false, error: 'admin only' });
    render(<SetupTab />);
    await waitFor(() => expect(screen.getByText('admin only')).toBeInTheDocument());
  });

  it('renders summary + check rows on success', async () => {
    callMock.mockResolvedValue({
      success: true,
      data: {
        summary: { ok: 5, warn: 1, fail: 0, na: 0 },
        checks: [
          { category: 'extension', name: 'pg_trgm', status: 'ok', detail: 'installed' },
          { category: 'cron', name: 'meilisearch-sync', status: 'warn', detail: 'not scheduled' },
        ],
        runtime: { meili_configured: true, function_env: {} },
      },
    });
    render(<SetupTab />);
    await waitFor(() => expect(screen.getByText(/5 ok/)).toBeInTheDocument());
    expect(screen.getByText('extension')).toBeInTheDocument();
    expect(screen.getByText('pg_trgm')).toBeInTheDocument();
    expect(screen.getByText('cron')).toBeInTheDocument();
    expect(screen.getByText('meilisearch-sync')).toBeInTheDocument();
  });

  it('shows failure alert when fail > 0', async () => {
    callMock.mockResolvedValue({
      success: true,
      data: {
        summary: { ok: 0, warn: 0, fail: 2, na: 0 },
        checks: [],
        runtime: { meili_configured: false, function_env: {} },
      },
    });
    render(<SetupTab />);
    await waitFor(() => expect(screen.getByText(/2 check\(s\) failing/)).toBeInTheDocument());
  });
});
