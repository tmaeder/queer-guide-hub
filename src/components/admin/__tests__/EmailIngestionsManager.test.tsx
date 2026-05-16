/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/hooks/usePageFetchers', () => ({ listFrom: vi.fn().mockResolvedValue([]) }));

import { EmailIngestionsManager } from '../EmailIngestionsManager';

describe('EmailIngestionsManager', () => {
  it('renders empty state', async () => {
    render(<EmailIngestionsManager />);
    await waitFor(() => expect(screen.getByText(/email/i)).toBeInTheDocument());
  });
});
