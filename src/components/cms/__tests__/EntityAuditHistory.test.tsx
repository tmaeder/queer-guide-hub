/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const loadForContent = vi.fn();
let entries: Array<Record<string, unknown>> = [];
vi.mock('@/hooks/useCMSAudit', () => ({
  useCMSAudit: () => ({ entries, loading: false, loadForContent }),
}));

import { EntityAuditHistory } from '../EntityAuditHistory';

describe('EntityAuditHistory', () => {
  beforeEach(() => {
    loadForContent.mockClear();
    entries = [];
  });

  it('loads entries only when expanded', () => {
    render(<EntityAuditHistory sourceTable="venues" sourceId="v1" />);
    expect(loadForContent).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('History'));
    expect(loadForContent).toHaveBeenCalledWith('venues', 'v1');
  });

  it('shows the empty state when there is no history', () => {
    render(<EntityAuditHistory sourceTable="venues" sourceId="v1" />);
    fireEvent.click(screen.getByText('History'));
    expect(screen.getByText('No history yet.')).toBeInTheDocument();
  });

  it('renders actor, humanized action and relative time', async () => {
    entries = [
      {
        id: '1',
        action: 'bulk_update',
        timestamp: new Date().toISOString(),
        actor: { email: 'admin@queer.guide' },
      },
    ];
    render(<EntityAuditHistory sourceTable="venues" sourceId="v1" />);
    fireEvent.click(screen.getByText('History'));
    await waitFor(() => {
      expect(screen.getByText('admin@queer.guide')).toBeInTheDocument();
      expect(screen.getByText('Bulk Update')).toBeInTheDocument();
      expect(screen.getByText('just now')).toBeInTheDocument();
    });
  });
});
