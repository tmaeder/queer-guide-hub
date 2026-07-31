/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/components/admin/feedback/StoriesKanban', () => ({
  StoriesKanban: () => <div data-testid="kanban" />,
}));
vi.mock('@/components/admin/feedback/StorySuggestionsPanel', () => ({
  StorySuggestionsPanel: () => <div data-testid="suggestions" />,
}));
vi.mock('@/components/admin/feedback/ArchivedStoriesPanel', () => ({
  ArchivedStoriesPanel: () => <div data-testid="archived" />,
}));

import { StoriesTab } from '../StoriesTab';

const grouped = {
  open: [{}], planned: [{}], in_progress: [], resolved: [{}], archived: [{}, {}],
} as never;

describe('StoriesTab', () => {
  it('shows active counts in toggle buttons', () => {
    render(
      <StoriesTab
        state={{ archived: false } as never} update={vi.fn()}
        storySuggestions={[]}
        groupedStories={grouped}
        adminMap={{}}
        onAcceptSuggestion={vi.fn()}
        onDismissSuggestion={vi.fn()}
      />,
    );
    expect(screen.getByText('Active (3)')).toBeInTheDocument();
    expect(screen.getByText('Archived (2)')).toBeInTheDocument();
  });

  it('renders kanban when archived=false', () => {
    render(
      <StoriesTab
        state={{ archived: false } as never} update={vi.fn()}
        storySuggestions={[]}
        groupedStories={grouped} adminMap={{}}
        onAcceptSuggestion={vi.fn()} onDismissSuggestion={vi.fn()}
      />,
    );
    expect(screen.getByTestId('kanban')).toBeInTheDocument();
  });

  it('renders archived panel when archived=true', () => {
    render(
      <StoriesTab
        state={{ archived: true } as never} update={vi.fn()}
        storySuggestions={[]}
        groupedStories={grouped} adminMap={{}}
        onAcceptSuggestion={vi.fn()} onDismissSuggestion={vi.fn()}
      />,
    );
    expect(screen.getByTestId('archived')).toBeInTheDocument();
  });

  it('toggle button calls update', () => {
    const update = vi.fn();
    render(
      <StoriesTab
        state={{ archived: false } as never} update={update}
        storySuggestions={[]}
        groupedStories={grouped} adminMap={{}}
        onAcceptSuggestion={vi.fn()} onDismissSuggestion={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('stories-archived-toggle'));
    expect(update).toHaveBeenCalledWith({ archived: true });
  });
});
