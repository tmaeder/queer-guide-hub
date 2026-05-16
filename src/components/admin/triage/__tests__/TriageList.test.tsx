/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../TriageItemRow', () => ({
  TriageItemRow: (p: { item: { id: string; title?: string }; onSelect: () => void }) => (
    <button onClick={p.onSelect} data-testid="row">{p.item.title ?? p.item.id}</button>
  ),
}));

import { TriageList } from '../TriageList';

const items = [
  { id: 'i1', title: 'A' },
  { id: 'i2', title: 'B' },
] as never;

describe('TriageList', () => {
  it('shows empty message when no items', () => {
    render(
      <TriageList items={[]} activeId={null} selectedIds={new Set()} total={0} page={1} perPage={10}
        onSelect={vi.fn()} onToggleCheck={vi.fn()} onPageChange={vi.fn()} />,
    );
    expect(screen.getByText(/No items to review/i)).toBeInTheDocument();
  });

  it('renders one row per item', () => {
    render(
      <TriageList items={items} activeId="i1" selectedIds={new Set()} total={2} page={1} perPage={10}
        onSelect={vi.fn()} onToggleCheck={vi.fn()} onPageChange={vi.fn()} />,
    );
    expect(screen.getAllByTestId('row')).toHaveLength(2);
  });

  it('shows pagination controls when totalPages > 1', () => {
    render(
      <TriageList items={items} activeId={null} selectedIds={new Set()} total={50} page={2} perPage={10}
        onSelect={vi.fn()} onToggleCheck={vi.fn()} onPageChange={vi.fn()} />,
    );
    expect(screen.getByText(/2\/5/)).toBeInTheDocument();
  });

  it('Prev/Next buttons fire onPageChange', () => {
    const onPage = vi.fn();
    render(
      <TriageList items={items} activeId={null} selectedIds={new Set()} total={50} page={2} perPage={10}
        onSelect={vi.fn()} onToggleCheck={vi.fn()} onPageChange={onPage} />,
    );
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[buttons.length - 2]);
    fireEvent.click(buttons[buttons.length - 1]);
    expect(onPage).toHaveBeenCalledWith(1);
    expect(onPage).toHaveBeenCalledWith(3);
  });
});
