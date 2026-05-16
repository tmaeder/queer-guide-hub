/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

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
});
