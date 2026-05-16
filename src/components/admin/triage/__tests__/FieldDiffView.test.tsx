/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FieldDiffView, computeFieldDiffs } from '../FieldDiffView';

describe('FieldDiffView', () => {
  it('shows empty-state message when no diffs', () => {
    render(<FieldDiffView diffs={[]} />);
    expect(screen.getByText(/No changes detected/i)).toBeInTheDocument();
  });

  it('renders each diff row with old + new values', () => {
    render(
      <FieldDiffView
        diffs={[
          { field: 'name', oldValue: 'Alice', newValue: 'Bob' },
          { field: 'age', oldValue: 30, newValue: 31 },
        ]}
      />,
    );
    expect(screen.getByText('name')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
    expect(screen.getByText('31')).toBeInTheDocument();
  });

  it('formats null/undefined as em-dash', () => {
    render(<FieldDiffView diffs={[{ field: 'x', oldValue: 'a', newValue: null }]} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});

describe('computeFieldDiffs', () => {
  it('returns [] when newData null', () => {
    expect(computeFieldDiffs({ a: 1 }, null)).toEqual([]);
  });

  it('emits all newData entries when oldData null', () => {
    expect(computeFieldDiffs(null, { a: 1, b: 2 })).toEqual([
      { field: 'a', oldValue: undefined, newValue: 1 },
      { field: 'b', oldValue: undefined, newValue: 2 },
    ]);
  });

  it('only emits keys whose values changed', () => {
    const diffs = computeFieldDiffs({ a: 1, b: 2 }, { a: 1, b: 3, c: 4 });
    expect(diffs.map(d => d.field).sort()).toEqual(['b', 'c']);
  });

  it('uses deep equality via JSON.stringify', () => {
    const diffs = computeFieldDiffs({ a: { x: 1 } }, { a: { x: 1 } });
    expect(diffs).toEqual([]);
  });
});
