import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AdminSimpleTable, type AdminSimpleColumn } from '../AdminSimpleTable';

interface Row {
  id: string;
  name: string;
  count: number;
}

const ROWS: Row[] = [
  { id: 'a', name: 'Alpha', count: 1 },
  { id: 'b', name: 'Beta', count: 2 },
];

const COLUMNS: AdminSimpleColumn<Row>[] = [
  { key: 'name', header: 'Name', render: (r) => r.name },
  { key: 'count', header: 'Count', align: 'right', width: 'xs', render: (r) => r.count },
];

function renderTable(props: Partial<Parameters<typeof AdminSimpleTable<Row>>[0]> = {}) {
  return render(
    <AdminSimpleTable<Row>
      caption="Pipeline definitions"
      columns={COLUMNS}
      rows={ROWS}
      rowKey={(r) => r.id}
      emptyNoun="definitions"
      {...props}
    />,
  );
}

describe('AdminSimpleTable', () => {
  it('exposes an accessible name — zero admin tables had one before', () => {
    renderTable();
    // getByRole('table', {name}) resolves the name from <caption>. This is the
    // whole reason the caption prop is required rather than optional.
    expect(screen.getByRole('table', { name: 'Pipeline definitions' })).toBeInTheDocument();
  });

  it('hides the caption visually by default but keeps it for assistive tech', () => {
    const { container } = renderTable();
    const caption = container.querySelector('caption');
    expect(caption).not.toBeNull();
    expect(caption).toHaveClass('sr-only');
  });

  it('can show the caption when asked', () => {
    const { container } = renderTable({ captionVisible: true });
    expect(container.querySelector('caption')).not.toHaveClass('sr-only');
  });

  it('renders one row per datum with column headers scoped', () => {
    const { container } = renderTable();
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    // A header cell without scope is what makes a dense table unreadable to a
    // screen reader even when it has a name.
    for (const th of container.querySelectorAll('th')) {
      expect(th.getAttribute('scope')).toBe('col');
    }
  });

  it('uses width TOKENS, never an arbitrary [NNpx] class', () => {
    const { container } = renderTable();
    const html = container.innerHTML;
    // The ~156 arbitrary sizing values in admin were mostly per-column widths.
    expect(html).not.toMatch(/w-\[\d+px\]/);
    expect(container.querySelectorAll('th')[1]).toHaveClass('w-20');
  });

  it('shows a skeleton on first load, not bare text', () => {
    const { container } = renderTable({ isLoading: true, rows: [] });
    // Skeleton rows live in the tbody so the table shape is preserved.
    expect(container.querySelectorAll('tbody tr').length).toBeGreaterThan(0);
    expect(screen.queryByText(/loading/i)).toBeNull();
    expect(screen.queryByText('No definitions yet.')).toBeNull();
  });

  it('distinguishes "nothing yet" from "nothing matches your filters"', () => {
    renderTable({ rows: [] });
    expect(screen.getByText('No definitions yet.')).toBeInTheDocument();
  });

  it('offers a working filter reset when filtered and empty', () => {
    // The old table bodies passed variant="inline", which renders no reset
    // button at all — so onReset was silently discarded.
    const onResetFilters = vi.fn();
    renderTable({ rows: [], filtered: true, onResetFilters });
    expect(screen.getByText('No definitions match these filters.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /clear filters/i }));
    expect(onResetFilters).toHaveBeenCalledTimes(1);
  });

  it('spans the empty and loading cells across every column', () => {
    const { container } = renderTable({ rows: [] });
    expect(container.querySelector('tbody td')?.getAttribute('colspan')).toBe(
      String(COLUMNS.length),
    );
  });

  describe('onRowClick', () => {
    it('does not make rows focusable when no handler is given', () => {
      const { container } = renderTable();
      for (const tr of container.querySelectorAll('tbody tr')) {
        expect(tr).not.toHaveAttribute('tabindex');
      }
    });

    it('activates on click', () => {
      const onRowClick = vi.fn();
      renderTable({ onRowClick });
      fireEvent.click(screen.getByText('Beta'));
      expect(onRowClick).toHaveBeenCalledWith(ROWS[1], 1);
    });

    /**
     * The reason this prop exists at all. AdminAutomation, MonitorTab and
     * ErrorsTab each had `<tr onClick>` with no tabIndex, no onKeyDown and no
     * role — mouse-only, so a keyboard user could not open those detail panes
     * (WCAG 2.1.1). Centralising it fixes all three.
     */
    it('is reachable and activatable by keyboard', () => {
      const onRowClick = vi.fn();
      const { container } = renderTable({ onRowClick });
      const rows = container.querySelectorAll('tbody tr');
      expect(rows[0]).toHaveAttribute('tabindex', '0');

      fireEvent.keyDown(rows[0], { key: 'Enter' });
      expect(onRowClick).toHaveBeenCalledWith(ROWS[0], 0);

      fireEvent.keyDown(rows[1], { key: ' ' });
      expect(onRowClick).toHaveBeenCalledWith(ROWS[1], 1);
      expect(onRowClick).toHaveBeenCalledTimes(2);
    });

    it('ignores other keys so normal navigation still works', () => {
      const onRowClick = vi.fn();
      const { container } = renderTable({ onRowClick });
      const row = container.querySelectorAll('tbody tr')[0];
      for (const key of ['Tab', 'ArrowDown', 'a', 'Escape']) {
        fireEvent.keyDown(row, { key });
      }
      expect(onRowClick).not.toHaveBeenCalled();
    });
  });

  describe('emptyContent', () => {
    it('replaces the default empty state entirely', () => {
      // AlertsTab's empty state is GOOD NEWS ("All clear"), not an absence.
      // AdminEmpty would say "No alerts yet." — a copy regression its own named
      // test caught.
      renderTable({ rows: [], emptyContent: <span>All clear</span> });
      expect(screen.getByText('All clear')).toBeInTheDocument();
      expect(screen.queryByText('No definitions yet.')).toBeNull();
    });

    it('still defers to the skeleton while loading', () => {
      renderTable({ rows: [], isLoading: true, emptyContent: <span>All clear</span> });
      expect(screen.queryByText('All clear')).toBeNull();
    });
  });
});
