/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router';
import { AdminStat } from '../AdminStat';
import { AdminEmpty } from '../AdminEmpty';
import { AdminInlineSpinner, AdminTableSkeleton, AdminCardSkeleton } from '../AdminLoading';
import { useTabParam } from '../useTabParam';

describe('AdminStat', () => {
  it('renders the label and value', () => {
    render(<AdminStat label="Needs review" value={12} />);
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText('Needs review')).toBeTruthy();
  });

  it('marks a non-zero hardFail count as destructive', () => {
    const { container } = render(<AdminStat label="Dead links" value={3} hardFail />);
    expect(container.querySelector('.text-destructive')).toBeTruthy();
  });

  it('leaves a hardFail count of zero unstyled — zero is the good case', () => {
    const { container } = render(<AdminStat label="Dead links" value={0} hardFail />);
    expect(container.querySelector('.text-destructive')).toBeNull();
  });

  it('never marks a string value as failing (hardFail is a count concept)', () => {
    const { container } = render(<AdminStat label="Status" value="n/a" hardFail />);
    expect(container.querySelector('.text-destructive')).toBeNull();
  });

  it('uses the destructive token class, not an inline hsl() style', () => {
    // The six copies this replaced each reached for
    // style={{ color: 'hsl(var(--destructive)) }} to dodge the hsl-literal lint.
    const { container } = render(<AdminStat label="Dead links" value={3} hardFail />);
    expect(container.innerHTML).not.toContain('hsl(');
  });
});

describe('AdminEmpty', () => {
  it('says "No X yet." when nothing exists', () => {
    render(<AdminEmpty noun="venues" />);
    expect(screen.getByText('No venues yet.')).toBeTruthy();
  });

  it('says something different when filters are the reason', () => {
    render(<AdminEmpty noun="venues" filtered />);
    expect(screen.getByText('No venues match these filters.')).toBeTruthy();
    expect(screen.queryByText('No venues yet.')).toBeNull();
  });

  it('offers a reset only when filtered', () => {
    const onReset = vi.fn();
    const { rerender } = render(<AdminEmpty noun="venues" onReset={onReset} />);
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();

    rerender(<AdminEmpty noun="venues" filtered onReset={onReset} />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(onReset).toHaveBeenCalledOnce();
  });

  it('hides the create action while filtered — creating is not the fix', () => {
    const action = <button type="button">New venue</button>;
    const { rerender } = render(<AdminEmpty noun="venues" action={action} />);
    expect(screen.getByRole('button', { name: 'New venue' })).toBeTruthy();

    rerender(<AdminEmpty noun="venues" filtered action={action} />);
    expect(screen.queryByRole('button', { name: 'New venue' })).toBeNull();
  });

  describe('inline variant', () => {
    it('keeps the same copy rule as the block variant', () => {
      const { rerender } = render(<AdminEmpty noun="picks" variant="inline" />);
      expect(screen.getByText('No picks yet.')).toBeTruthy();

      rerender(<AdminEmpty noun="picks" variant="inline" filtered />);
      expect(screen.getByText('No picks match these filters.')).toBeTruthy();
    });

    it('renders a <span>, so it stays valid inside <p>/<li>/<td>', () => {
      // A <p> nested in phrasing content is invalid HTML the browser silently
      // re-parents, which is exactly how this variant gets used.
      const { container } = render(<AdminEmpty noun="synonyms" variant="inline" />);
      const el = screen.getByText('No synonyms yet.');
      expect(el.tagName).toBe('SPAN');
      expect(container.querySelector('p')).toBeNull();
    });

    it('drops the icon and the padding the block variant owns', () => {
      const { container } = render(<AdminEmpty noun="runs" variant="inline" />);
      expect(container.querySelector('svg')).toBeNull();
    });

    it('lets a caller flow it into a sentence with className="inline"', () => {
      render(<AdminEmpty noun="audit artifact" variant="inline" className="inline" />);
      const el = screen.getByText('No audit artifact yet.');
      expect(el.className).toContain('inline');
      expect(el.className).not.toContain('block');
    });
  });
});

describe('AdminLoading', () => {
  it('exposes each variant as a status region for screen readers', () => {
    const skeleton = render(<AdminTableSkeleton />);
    expect(skeleton.getByRole('status')).toBeTruthy();
    skeleton.unmount();

    const card = render(<AdminCardSkeleton />);
    expect(card.getByRole('status')).toBeTruthy();
    card.unmount();

    render(<AdminInlineSpinner />);
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('renders the requested skeleton shape', () => {
    const { container } = render(<AdminTableSkeleton rows={3} columns={4} />);
    const rows = container.querySelectorAll('.border-b');
    expect(rows.length).toBe(3);
    expect(rows[0].children.length).toBe(4);
  });
});

describe('useTabParam', () => {
  const TABS = ['performance', 'revenue', 'merchants'] as const;

  function Harness() {
    const [tab, setTab] = useTabParam(TABS);
    const location = useLocation();
    return (
      <div>
        <span data-testid="tab">{tab}</span>
        <span data-testid="search">{location.search}</span>
        {TABS.map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)}>
            go-{t}
          </button>
        ))}
      </div>
    );
  }

  function renderAt(entry: string) {
    return render(
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/x" element={<Harness />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('falls back to the first tab when the param is absent', () => {
    renderAt('/x');
    expect(screen.getByTestId('tab').textContent).toBe('performance');
  });

  it('falls back to the first tab when the param is not a known tab', () => {
    renderAt('/x?tab=bogus');
    expect(screen.getByTestId('tab').textContent).toBe('performance');
  });

  it('reads a valid tab from the URL', () => {
    renderAt('/x?tab=revenue');
    expect(screen.getByTestId('tab').textContent).toBe('revenue');
  });

  it('keeps the default tab OUT of the query string so nav links stay canonical', () => {
    renderAt('/x?tab=revenue');
    fireEvent.click(screen.getByText('go-performance'));
    expect(screen.getByTestId('tab').textContent).toBe('performance');
    expect(screen.getByTestId('search').textContent).toBe('');
  });

  it('preserves unrelated search params — the hand-rolled copies dropped them', () => {
    renderAt('/x?tab=revenue&from=/admin&q=berlin');
    fireEvent.click(screen.getByText('go-merchants'));
    const search = screen.getByTestId('search').textContent ?? '';
    expect(search).toContain('tab=merchants');
    expect(search).toContain('from=%2Fadmin');
    expect(search).toContain('q=berlin');
  });
});
