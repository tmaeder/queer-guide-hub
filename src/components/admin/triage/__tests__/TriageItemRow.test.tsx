/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TriageItemRow } from '../TriageItemRow';

const item = {
  id: 'i1', title: 'Pending venue', subtitle: 'low_quality_score',
  queue_type: 'staging', content_type: 'venues',
  confidence_score: 0.65, has_diff: true,
  created_at: new Date(Date.now() - 5 * 3_600_000).toISOString(),
} as never;

describe('TriageItemRow', () => {
  it('renders title + queue + content badges', () => {
    render(
      <TriageItemRow item={item} isActive={false} isSelected={false}
        onSelect={vi.fn()} onToggleCheck={vi.fn()} />,
    );
    expect(screen.getByText('Pending venue')).toBeInTheDocument();
    expect(screen.getByText('Staging')).toBeInTheDocument();
    expect(screen.getByText('Venue')).toBeInTheDocument();
    expect(screen.getByText('diff')).toBeInTheDocument();
  });

  it('shows confidence + age', () => {
    render(
      <TriageItemRow item={item} isActive={false} isSelected={false}
        onSelect={vi.fn()} onToggleCheck={vi.fn()} />,
    );
    expect(screen.getByText('5h')).toBeInTheDocument();
    expect(screen.getByText('65%')).toBeInTheDocument();
  });

  it('clicking row calls onSelect', () => {
    const onSelect = vi.fn();
    render(
      <TriageItemRow item={item} isActive={false} isSelected={false}
        onSelect={onSelect} onToggleCheck={vi.fn()} />,
    );
    fireEvent.click(screen.getByText('Pending venue'));
    expect(onSelect).toHaveBeenCalled();
  });

  it('clicking checkbox calls onToggleCheck and stops propagation', () => {
    const onSelect = vi.fn();
    const onToggle = vi.fn();
    render(
      <TriageItemRow item={item} isActive={false} isSelected={false}
        onSelect={onSelect} onToggleCheck={onToggle} />,
    );
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onToggle).toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
