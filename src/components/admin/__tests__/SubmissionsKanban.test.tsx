/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const { listFromMock } = vi.hoisted(() => ({ listFromMock: vi.fn() }));

vi.mock('@/hooks/usePageFetchers', () => ({ listFrom: listFromMock }));
vi.mock('@/config/submissionRegistry', () => ({
  submissionRegistry: { venue: { titleField: 'name', icon: () => null, color: '#000' } },
}));

import { SubmissionsKanban } from '../SubmissionsKanban';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  listFromMock.mockReset();
  listFromMock.mockResolvedValue([]);
});

describe('SubmissionsKanban', () => {
  it('shows loading state', async () => {
    listFromMock.mockReturnValue(new Promise(() => {}));
    render(<SubmissionsKanban onCardClick={vi.fn()} />, { wrapper });
    expect(screen.getByText(/Loading/)).toBeInTheDocument();
  });

  it('renders all four lanes with empty markers', async () => {
    render(<SubmissionsKanban onCardClick={vi.fn()} />, { wrapper });
    // Wait for lanes
    await new Promise(r => setTimeout(r, 0));
    expect(await screen.findByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.getByText('Rejected')).toBeInTheDocument();
    expect(screen.getByText('Merged')).toBeInTheDocument();
  });

  it('clicking card fires onCardClick', async () => {
    listFromMock.mockResolvedValue([
      {
        id: 'r1', content_type: 'venue', status: 'pending', feedback_status: 'open',
        data: { name: 'Pride Bar' }, submitted_by: 'u1', submitted_at: 'now',
        reviewed_by: null, reviewed_at: null, reviewer_notes: null,
        promoted_to_id: null, promoted_to_table: null,
        platform: 'instagram', media_processing_status: null,
        media_urls: null, queer_relevance_score: 0.85, confidence_score: null,
        safety_flags: null, raw_text: null, ocr_text: null,
        vision_summary: null, transcript_text: null,
      },
    ]);
    const onCard = vi.fn();
    render(<SubmissionsKanban onCardClick={onCard} />, { wrapper });
    await screen.findByText('Pride Bar');
    fireEvent.click(screen.getByText('Pride Bar'));
    expect(onCard).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }));
  });
});
