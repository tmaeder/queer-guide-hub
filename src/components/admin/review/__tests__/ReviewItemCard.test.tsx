/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';

vi.mock('@/components/ui/ContentWarningBanner', () => ({
  SensitivityBadges: () => <div data-testid="sb" />,
}));

import { ReviewItemCard } from '../ReviewItemCard';

const item = {
  id: 'i1', title: 'Pride Bar', subtitle: 'Berlin',
  content_type: 'venues', status: 'pending',
  created_at: '2026-05-15T00:00:00Z',
  relevance_score: 0.85,
  sensitivity_flags: null,
  reasoning: 'auto-flagged',
} as never;

function wrap(ui: React.ReactNode) { return <TooltipProvider>{ui}</TooltipProvider>; }

describe('ReviewItemCard', () => {
  it('renders title + content-type + status badges', () => {
    render(wrap(<ReviewItemCard item={item} />));
    expect(screen.getByText('Pride Bar')).toBeInTheDocument();
    expect(screen.getByText('Venue')).toBeInTheDocument();
    expect(screen.getByText('pending')).toBeInTheDocument();
  });

  it('renders subtitle', () => {
    render(wrap(<ReviewItemCard item={item} />));
    expect(screen.getByText('Berlin')).toBeInTheDocument();
  });

  it('checkbox shown when onSelect provided + fires', () => {
    const onSelect = vi.fn();
    render(wrap(<ReviewItemCard item={item} onSelect={onSelect} />));
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onSelect).toHaveBeenCalledWith('i1');
  });

  it('Approve + Reject + View buttons fire callbacks', () => {
    const onApprove = vi.fn();
    const onReject = vi.fn();
    const onView = vi.fn();
    render(wrap(<ReviewItemCard item={item} onApprove={onApprove} onReject={onReject} onView={onView} />));
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]); // view
    fireEvent.click(buttons[1]); // approve
    fireEvent.click(buttons[2]); // reject
    expect(onView).toHaveBeenCalled();
    expect(onApprove).toHaveBeenCalled();
    expect(onReject).toHaveBeenCalled();
  });
});
