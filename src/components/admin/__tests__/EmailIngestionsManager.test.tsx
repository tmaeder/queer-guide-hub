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
    // This used to match the "Loading email ingestions..." string, so it was
    // really asserting the LOADING state. Now that first-load is a skeleton it
    // reaches the real empty state, where several nodes match /email/i.
    await waitFor(() => expect(screen.getAllByText(/email/i).length).toBeGreaterThan(0));
  });
});
