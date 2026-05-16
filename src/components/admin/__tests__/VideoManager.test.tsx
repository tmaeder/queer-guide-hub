/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const { listJoinMock } = vi.hoisted(() => ({ listJoinMock: vi.fn() }));

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/hooks/usePageFetchers', () => ({
  listWithJoinDesc: listJoinMock,
  deleteRow: vi.fn().mockResolvedValue({ error: null }),
}));
vi.mock('@/components/ui/modern-video-player', () => ({ ModernVideoPlayer: () => null }));

import { VideoManager } from '../VideoManager';

beforeEach(() => listJoinMock.mockReset());

describe('VideoManager', () => {
  it('renders search input + empty state', async () => {
    listJoinMock.mockResolvedValue([]);
    render(<VideoManager />);
    await waitFor(() => expect(screen.getByPlaceholderText(/Search/i)).toBeInTheDocument());
  });

  it('renders a video card', async () => {
    listJoinMock.mockResolvedValue([
      { id: 'v1', title: 'Pride Parade', duration_seconds: 125, status: 'ready', created_at: '2026-05-15', original_filename: 'pride.mp4', renditions: [] },
    ]);
    render(<VideoManager />);
    await waitFor(() => expect(screen.getByText('Pride Parade')).toBeInTheDocument());
  });
});
