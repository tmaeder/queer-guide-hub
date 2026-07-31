/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ExternalLink, Copy } from 'lucide-react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ContentListTable } from '../ContentListTable';
import type { ContentTypeConfig } from '@/types/cms';

/**
 * `rowActions` exists so pages still on AdminDataTable can eventually move to
 * the registry without losing per-row tooling (redirects has a live "test this
 * redirect"; tags has several). These pin the behaviour that made it worth
 * adding.
 */

const item = {
  id: 'r1',
  contentType: 'redirects',
  contentTypeLabel: 'Redirect',
  contentTypeColor: 'hsl(0 0% 20%)',
  title: '/old-path',
  description: null,
  status: null,
  updatedAt: null,
  raw: { id: 'r1', slug: 'promo', type: 'SHORT' },
};

function renderTable(config: Partial<ContentTypeConfig>, onEdit = vi.fn()) {
  render(
    // Rows render Tooltips; the app provides this higher up the tree.
    <TooltipProvider>
      <ContentListTable
        contentTypeId="redirects"
        config={config as ContentTypeConfig}
        items={[item as never]}
        loading={false}
        totalCount={1}
        page={0}
        rowsPerPage={25}
        setPage={vi.fn()}
        setRowsPerPage={vi.fn()}
        sortField="title"
        sortDir="desc"
        handleSort={vi.fn()}
        extraColumns={[]}
        selected={new Set()}
        allSelected={false}
        someSelected={false}
        toggleSelect={vi.fn()}
        toggleSelectAll={vi.fn()}
        debouncedSearch=""
        onClearSearch={vi.fn()}
        onEdit={onEdit}
        onCreate={vi.fn()}
      />
    </TooltipProvider>,
  );
  return onEdit;
}

describe('ContentListTable rowActions', () => {
  it('renders nothing extra when a type declares no actions', () => {
    renderTable({});
    // Edit is always present; nothing else should be.
    expect(screen.getByLabelText('Edit')).toBeInTheDocument();
    expect(screen.queryByLabelText('Test Redirect')).not.toBeInTheDocument();
  });

  it('renders a declared action with an accessible name', () => {
    renderTable({
      rowActions: [{ id: 'test', label: 'Test Redirect', icon: ExternalLink, onSelect: vi.fn() }],
    });
    expect(screen.getByLabelText('Test Redirect')).toBeInTheDocument();
  });

  it('passes the raw row to onSelect', () => {
    const onSelect = vi.fn();
    renderTable({
      rowActions: [{ id: 'copy', label: 'Copy Short URL', icon: Copy, onSelect }],
    });

    fireEvent.click(screen.getByLabelText('Copy Short URL'));

    expect(onSelect).toHaveBeenCalledTimes(1);
    // The raw DB row, not the display projection — actions need real columns
    // like `slug` that the list view never shows.
    expect(onSelect).toHaveBeenCalledWith({ id: 'r1', slug: 'promo', type: 'SHORT' });
  });

  it('does not open the editor when an action is clicked', () => {
    // The row itself is clickable; without stopPropagation every action would
    // fire and then immediately navigate away from the result.
    const onEdit = renderTable({
      rowActions: [{ id: 'copy', label: 'Copy Short URL', icon: Copy, onSelect: vi.fn() }],
    });

    fireEvent.click(screen.getByLabelText('Copy Short URL'));

    expect(onEdit).not.toHaveBeenCalled();
  });

  it('honours visible() so actions hide on rows they do not apply to', () => {
    renderTable({
      rowActions: [
        {
          id: 'copy',
          label: 'Copy Short URL',
          icon: Copy,
          visible: (row) => row.type === 'PERMANENT',
          onSelect: vi.fn(),
        },
        {
          id: 'test',
          label: 'Test Redirect',
          icon: ExternalLink,
          visible: (row) => row.type === 'SHORT',
          onSelect: vi.fn(),
        },
      ],
    });

    expect(screen.queryByLabelText('Copy Short URL')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Test Redirect')).toBeInTheDocument();
  });

  it('still opens the editor from the Edit button', () => {
    const onEdit = renderTable({
      rowActions: [{ id: 'test', label: 'Test Redirect', icon: ExternalLink, onSelect: vi.fn() }],
    });

    fireEvent.click(screen.getByLabelText('Edit'));

    expect(onEdit).toHaveBeenCalledWith('redirects', 'r1');
  });
});
