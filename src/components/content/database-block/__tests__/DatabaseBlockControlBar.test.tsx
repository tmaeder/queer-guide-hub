/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DEFAULT_VIEW_STATE, type BlockViewState } from '@/lib/databaseBlock/schema';
import { DatabaseBlockControlBar } from '../DatabaseBlockControlBar';

/**
 * The control bar is the surface that writes view preferences back into the
 * document. Every interaction must produce a COMPLETE next view state — the
 * editor hands this straight to updateAttributes, so a partial object would
 * persist a half-written block.
 */

const view = (over: Partial<BlockViewState> = {}): BlockViewState => ({
  ...DEFAULT_VIEW_STATE,
  ...over,
});

function setup(over: Partial<BlockViewState> = {}, options = {}) {
  const onChange = vi.fn();
  render(
    <DatabaseBlockControlBar
      viewState={view(over)}
      onChange={onChange}
      filterOptions={{ city: ['Berlin', 'Paris'], country: [], category: [], liveness_status: [] }}
      resultCount={3}
      {...options}
    />,
  );
  return onChange;
}

describe('DatabaseBlockControlBar', () => {
  it('offers every layout and reports the active one', () => {
    setup({ activeLayout: 'gallery' });
    const group = screen.getByRole('radiogroup', { name: 'Layout' });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Gallery' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'List' })).toHaveAttribute('aria-checked', 'false');
    for (const label of ['List', 'Gallery', 'Board', 'Timeline', 'Calendar']) {
      expect(screen.getByRole('radio', { name: label })).toBeInTheDocument();
    }
  });

  it('emits a complete view state when the layout changes', () => {
    const onChange = setup({ activeLayout: 'list' });
    fireEvent.click(screen.getByRole('radio', { name: 'Calendar' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0];
    expect(next.activeLayout).toBe('calendar');
    // Untouched keys must survive — this object is persisted wholesale.
    expect(next).toMatchObject({
      search: DEFAULT_VIEW_STATE.search,
      groupByField: DEFAULT_VIEW_STATE.groupByField,
      sortConfig: DEFAULT_VIEW_STATE.sortConfig,
    });
    expect(Object.keys(next).sort()).toEqual(Object.keys(DEFAULT_VIEW_STATE).sort());
  });

  it('emits the search term without dropping other state', () => {
    const onChange = setup({ activeLayout: 'gallery' });
    fireEvent.change(screen.getByLabelText('Search these entries'), {
      target: { value: 'berghain' },
    });
    const next = onChange.mock.calls[0][0];
    expect(next.search).toBe('berghain');
    expect(next.activeLayout).toBe('gallery');
  });

  it('shows the group-by control only for the board layout', () => {
    const { unmount } = render(
      <DatabaseBlockControlBar
        viewState={view({ activeLayout: 'list' })}
        onChange={vi.fn()}
        filterOptions={{}}
        resultCount={0}
      />,
    );
    expect(screen.queryByRole('button', { name: /Category/ })).not.toBeInTheDocument();
    unmount();

    setup({ activeLayout: 'kanban' });
    expect(screen.getByRole('button', { name: /Category/ })).toBeInTheDocument();
  });

  it('renders a removable chip per active filter', () => {
    const onChange = setup({ filters: { city: ['Berlin'] } });
    const chip = screen.getByRole('button', { name: 'Remove filter City Berlin' });
    fireEvent.click(chip);
    // Removing the last value drops the key entirely rather than leaving [].
    expect(onChange.mock.calls[0][0].filters).toEqual({});
  });

  it('counts active filters on the trigger', () => {
    setup({ filters: { city: ['Berlin'], country: ['Germany'] } });
    expect(screen.getByRole('button', { name: /Filter/ })).toHaveTextContent('2');
  });

  it('hides the result count when the reader cannot change the view', () => {
    setup({}, { readOnly: true });
    expect(screen.queryByText('3')).not.toBeInTheDocument();
  });
});
