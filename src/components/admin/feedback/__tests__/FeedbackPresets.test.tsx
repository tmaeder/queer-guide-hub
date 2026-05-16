/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FeedbackPresets } from '../FeedbackPresets';

const baseState = {
  assignee: null,
  status: null,
  withClaude: false,
  showDuplicates: false,
  showSpam: false,
} as never;

describe('FeedbackPresets', () => {
  it('renders all five preset chips', () => {
    render(<FeedbackPresets state={baseState} update={vi.fn()} clearFilters={vi.fn()} currentUserId="u1" />);
    ['All', 'Mine', 'Overdue', 'With Claude', 'Unresolved'].forEach(l => {
      expect(screen.getByRole('button', { name: new RegExp(l) })).toBeInTheDocument();
    });
  });

  it('clears + sets assignee when Mine clicked', () => {
    const update = vi.fn();
    const clear = vi.fn();
    render(<FeedbackPresets state={baseState} update={update} clearFilters={clear} currentUserId="u1" />);
    fireEvent.click(screen.getByRole('button', { name: /Mine/i }));
    expect(clear).toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({ assignee: 'u1' });
  });

  it('clears + sets withClaude when With Claude clicked', () => {
    const update = vi.fn();
    render(<FeedbackPresets state={baseState} update={update} clearFilters={vi.fn()} currentUserId="u1" />);
    fireEvent.click(screen.getByRole('button', { name: /With Claude/i }));
    expect(update).toHaveBeenCalledWith({ withClaude: true });
  });

  it('All preset clears without further updates', () => {
    const update = vi.fn();
    const clear = vi.fn();
    render(<FeedbackPresets state={baseState} update={update} clearFilters={clear} currentUserId="u1" />);
    fireEvent.click(screen.getByRole('button', { name: /All/i }));
    expect(clear).toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});
