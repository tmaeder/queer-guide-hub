/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

import { TooltipProvider } from '@/components/ui/tooltip';

import { ContentListTable } from '../ContentListTable';

describe('ContentListTable', () => {
  it('renders empty', () => {
    const { container } = render(
      <ContentListTable
        contentTypeId="venues" config={null as never} items={[]}
        loading={false} totalCount={0} page={1} rowsPerPage={25}
        setPage={vi.fn()} setRowsPerPage={vi.fn()} sortField={null} sortDir="desc"
        handleSort={vi.fn()} extraColumns={[]} selected={new Set()}
        allSelected={false} someSelected={false}
        toggleSelect={vi.fn()} toggleSelectAll={vi.fn()}
        debouncedSearch="" onClearSearch={vi.fn()}
        onEdit={vi.fn()} onCreate={vi.fn()}
      />,
    );
    expect(container).toBeTruthy();
  });

  /**
   * The badge exists because `archive.label` was declared in twelve registry
   * files and rendered nowhere — the only signal a row was archived was the row
   * action flipping Archive→Restore. A negative control is included: an
   * identical row that is NOT archived must not get the badge, or the test
   * would pass on a component that badges everything.
   */
  const baseProps = {
    contentTypeId: 'venues',
    loading: false,
    totalCount: 2,
    page: 1,
    rowsPerPage: 25,
    setPage: vi.fn(),
    setRowsPerPage: vi.fn(),
    // SortField is `string`, not nullable — passing null here is what the
    // pre-existing case at the top of this file does, and it is a baseline
    // typecheck error. Not repeating it.
    sortField: 'updated_at',
    sortDir: 'desc' as const,
    handleSort: vi.fn(),
    extraColumns: [],
    selected: new Set<string>(),
    allSelected: false,
    someSelected: false,
    toggleSelect: vi.fn(),
    toggleSelectAll: vi.fn(),
    debouncedSearch: '',
    onClearSearch: vi.fn(),
    onEdit: vi.fn(),
    onCreate: vi.fn(),
  };

  const config = {
    id: 'venues',
    tableName: 'venues',
    titleField: 'name',
    label: { singular: 'Venue', plural: 'Venues' },
    color: '#000',
    icon: (() => null) as never,
    fields: [],
    lifecycle: {
      type: 'venue',
      archive: { column: 'review_status', value: 'archived', label: 'Archived' },
    },
  } as never;

  const item = (id: string, title: string, review_status: string) => ({
    id,
    title,
    contentType: 'venues',
    contentTypeLabel: 'Venues',
    contentTypeColor: '#000',
    raw: { id, name: title, review_status },
  });

  it('badges an archived row with the registry label, and leaves a live row alone', () => {
    const { getByText, queryAllByText } = render(
      <TooltipProvider>
        <ContentListTable
          {...baseProps}
          config={config}
          items={[item('1', 'Archived Bar', 'archived'), item('2', 'Live Bar', 'approved')]}
        />
      </TooltipProvider>,
    );
    expect(getByText('Archived Bar')).toBeTruthy();
    expect(getByText('Live Bar')).toBeTruthy();
    // Exactly one badge: the archived row's. Two would mean the predicate is
    // matching everything; zero would mean it is rendering nothing.
    expect(queryAllByText('Archived')).toHaveLength(1);
  });

  it('uses the type-specific word rather than flattening to "Archived"', () => {
    // A ghost city is not an archived place — it is not a place. Collapsing the
    // per-type vocabulary would misdescribe the row.
    const ghostConfig = {
      ...(config as unknown as Record<string, unknown>),
      lifecycle: {
        type: 'city',
        archive: { column: 'shell_status', value: 'ghost', label: 'Not a place' },
      },
    } as never;
    const { queryAllByText } = render(
      <TooltipProvider>
        <ContentListTable
          {...baseProps}
          config={ghostConfig}
          items={[
            {
              id: '1',
              title: 'Nowhere',
              contentType: 'cities',
              contentTypeLabel: 'Cities',
              contentTypeColor: '#000',
              raw: { id: '1', name: 'Nowhere', shell_status: 'ghost' },
            },
          ]}
        />
      </TooltipProvider>,
    );
    expect(queryAllByText('Not a place')).toHaveLength(1);
    expect(queryAllByText('Archived')).toHaveLength(0);
  });

});
