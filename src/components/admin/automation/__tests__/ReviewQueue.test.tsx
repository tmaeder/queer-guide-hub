/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';

import { ReviewQueue } from '../ReviewQueue';

function wrap(ui: React.ReactNode) { return <TooltipProvider>{ui}</TooltipProvider>; }

describe('ReviewQueue', () => {
  it('renders empty state when no changes', () => {
    render(wrap(<ReviewQueue
      changes={[]} onApprove={vi.fn()} onReject={vi.fn()}
      onBulkApprove={vi.fn()} onBulkReject={vi.fn()} onViewDetail={vi.fn()}
      isApproving={false} isRejecting={false}
    />));
    expect(screen.getByText('No pending changes')).toBeInTheDocument();
  });

  it('renders rows when changes provided', () => {
    render(wrap(<ReviewQueue
      changes={[
        { id: 'c1', content_type: 'venues', content_name: 'Pride Bar', field_name: 'description', confidence: 0.9, change_type: 'enrich', status: 'pending', old_value: 'a', new_value: 'b', reasoning: 'x', created_at: new Date().toISOString() } as never,
      ]}
      onApprove={vi.fn()} onReject={vi.fn()} onBulkApprove={vi.fn()} onBulkReject={vi.fn()} onViewDetail={vi.fn()}
      isApproving={false} isRejecting={false}
    />));
    expect(screen.getByText('Pride Bar')).toBeInTheDocument();
  });
});
