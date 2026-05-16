/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const { listMock } = vi.hoisted(() => ({ listMock: vi.fn() }));

vi.mock('@/hooks/usePageFetchers', () => ({ listFromWhere: listMock }));

import { EmailIngestionsPanel } from '../EmailIngestionsPanel';

beforeEach(() => listMock.mockReset());

describe('EmailIngestionsPanel', () => {
  it('shows skeletons while loading', async () => {
    let resolve: (v: unknown[]) => void = () => {};
    listMock.mockReturnValue(new Promise<unknown[]>((r) => { resolve = r; }));
    const { container } = render(<EmailIngestionsPanel />);
    expect(container.querySelectorAll('[class*="animate-pulse"]').length).toBeGreaterThan(0);
    resolve([]);
    await new Promise(r => setTimeout(r, 0));
  });

  it('renders row data on load', async () => {
    listMock.mockResolvedValue([
      {
        id: 'e1', from_address: 'a@b', to_address: 'c@d',
        subject: 'Test event', status: 'completed',
        extracted_events: 2, extracted_venues: 1,
        inserted_event_ids: [], inserted_venue_ids: [],
        ai_extraction: null, processing_ms: 1234, error_message: null,
        received_at: '2026-05-15T00:00:00Z', created_at: '2026-05-15T00:00:00Z',
      },
    ]);
    render(<EmailIngestionsPanel />);
    await waitFor(() => expect(screen.getByText('Test event')).toBeInTheDocument());
  });
});
