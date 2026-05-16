/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }) as never;
});

import { WebScrapersPanel } from '../WebScrapersPanel';

describe('WebScrapersPanel', () => {
  it('renders scraper cards', async () => {
    render(<WebScrapersPanel />);
    await waitFor(() => expect(screen.getByText('Patroc')).toBeInTheDocument());
    expect(screen.getByText('Outsavvy')).toBeInTheDocument();
    expect(screen.getByText('Travel Gay')).toBeInTheDocument();
  });
});
