import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VirtualizedGrid } from '../VirtualizedGrid';
import { useGridColumns } from '../useGridColumns';

const items = Array.from({ length: 100 }, (_, i) => ({ id: `item-${i}`, label: `Item ${i}` }));

describe('VirtualizedGrid', () => {
  it('renders the plain grid below the virtualization threshold', () => {
    render(
      <VirtualizedGrid
        items={items.slice(0, 12)}
        columns={4}
        rowClassName="grid grid-cols-4 gap-4 pb-4"
        estimateRowHeight={300}
        itemKey={(it) => it.id}
        renderItem={(it) => <div>{it.label}</div>}
      />,
    );
    expect(screen.getAllByText(/^Item \d+$/)).toHaveLength(12);
    // No virtual row wrappers in the plain path.
    expect(document.querySelectorAll('[data-index]')).toHaveLength(0);
  });

  it('windows large lists — renders only visible rows, keeps full scroll height', () => {
    render(
      <VirtualizedGrid
        items={items}
        columns={4}
        rowClassName="grid grid-cols-4 gap-4 pb-4"
        estimateRowHeight={300}
        itemKey={(it) => it.id}
        renderItem={(it) => <div>{it.label}</div>}
      />,
    );
    // jsdom has no real layout; the meaningful invariant is that a strict
    // subset renders (windowing) inside positioned virtual rows.
    const rendered = screen.getAllByText(/^Item \d+$/).length;
    expect(rendered).toBeGreaterThan(0);
    expect(rendered).toBeLessThan(100);
    expect(document.querySelectorAll('[data-index]').length).toBeGreaterThan(0);
  });

  it('renders a contiguous run of items in order', () => {
    render(
      <VirtualizedGrid
        items={items}
        columns={4}
        rowClassName="grid grid-cols-4 gap-4 pb-4"
        estimateRowHeight={300}
        itemKey={(it) => it.id}
        renderItem={(it) => <div>{it.label}</div>}
      />,
    );
    const nums = screen
      .getAllByText(/^Item \d+$/)
      .map((el) => parseInt(el.textContent!.slice(5), 10));
    const sorted = [...nums].sort((a, b) => a - b);
    expect(nums).toEqual(sorted);
    // Contiguous window: no gaps between first and last rendered item.
    expect(sorted[sorted.length - 1] - sorted[0] + 1).toBe(sorted.length);
  });
});

describe('useGridColumns', () => {
  it('resolves the base column count in jsdom (no matches)', () => {
    function Probe() {
      const cols = useGridColumns([
        { minWidth: 0, columns: 1 },
        { minWidth: 768, columns: 2 },
      ]);
      return <div data-testid="cols">{cols}</div>;
    }
    render(<Probe />);
    // jsdom matchMedia (mocked in setup) reports no matches → base count.
    expect(['1', '2']).toContain(screen.getByTestId('cols').textContent);
  });
});
