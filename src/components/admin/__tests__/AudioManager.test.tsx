/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const { listMock } = vi.hoisted(() => ({ listMock: vi.fn() }));

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/hooks/usePageFetchers', () => ({
  listWithJoinDesc: listMock,
  deleteRow: vi.fn().mockResolvedValue({ error: null }),
}));
vi.mock('@/components/ui/modern-audio-player', () => ({ ModernAudioPlayer: () => null }));

import { AudioManager } from '../AudioManager';

beforeEach(() => listMock.mockReset());

describe('AudioManager', () => {
  it('renders search input + audio card', async () => {
    listMock.mockResolvedValue([
      { id: 'a1', title: 'Podcast 1', status: 'ready', created_at: '2026-05-15', original_filename: 'p.mp3', renditions: [] },
    ]);
    render(<AudioManager />);
    await waitFor(() => expect(screen.getByText('Podcast 1')).toBeInTheDocument());
  });
});
