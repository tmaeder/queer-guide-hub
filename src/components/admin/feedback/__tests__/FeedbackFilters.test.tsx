/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/config/feedbackCategories', () => ({
  feedbackCategories: [{ value: 'bug', label: 'Bug' }],
}));
vi.mock('../constants', () => ({
  kanbanColumns: [{ id: 'new', label: 'New' }],
  priorities: [{ value: 1, short: 'P1', label: 'High' }],
}));

import { FeedbackFilters } from '../FeedbackFilters';

const baseState = {
  q: '', category: null, status: null, priority: null,
  assignee: null, label: null, hasScreenshot: false, hasErrors: false,
  withClaude: false,
} as never;

describe('FeedbackFilters', () => {
  it('renders search input + filters button', () => {
    render(<FeedbackFilters state={baseState} update={vi.fn()} clearFilters={vi.fn()} activeFilterCount={0} admins={[]} labels={[]} />);
    expect(screen.getByPlaceholderText(/Search title/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Filters/ })).toBeInTheDocument();
  });

  it('clearing search via X clears input', () => {
    render(<FeedbackFilters state={{ ...baseState, q: 'hi' } as never} update={vi.fn()} clearFilters={vi.fn()} activeFilterCount={1} admins={[]} labels={[]} />);
    fireEvent.click(screen.getByLabelText(/Clear search/));
  });

  it('shows Reset button when activeFilterCount > 0', () => {
    render(<FeedbackFilters state={baseState} update={vi.fn()} clearFilters={vi.fn()} activeFilterCount={2} admins={[]} labels={[]} />);
    expect(screen.getByRole('button', { name: /^Reset$/ })).toBeInTheDocument();
  });
});
