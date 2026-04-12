import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InboxItemList } from '../InboxItemList';

const mockItems = [
  { id: '1', type: 'email' as const, title: 'Welcome', snippet: 'Hello there', from: 'Team', date: new Date().toISOString(), isRead: false, isStarred: false, actionUrl: '/inbox/1', raw: {} },
  { id: '2', type: 'notification' as const, title: 'New follower', snippet: 'Alex followed you', from: 'System', date: new Date().toISOString(), isRead: true, isStarred: true, actionUrl: '/inbox/2', raw: {} },
];

describe('InboxItemList', () => {
  it('should render items', () => {
    render(<InboxItemList items={mockItems} onSelect={vi.fn()} onToggleStar={vi.fn()} />);
    expect(screen.getByText('Welcome')).toBeInTheDocument();
    expect(screen.getByText('New follower')).toBeInTheDocument();
  });

  it('should call onSelect when item clicked', () => {
    const onSelect = vi.fn();
    render(<InboxItemList items={mockItems} onSelect={onSelect} onToggleStar={vi.fn()} />);
    fireEvent.click(screen.getByText('Welcome'));
    expect(onSelect).toHaveBeenCalledWith('1');
  });

  it('should render empty when no items', () => {
    const { container } = render(<InboxItemList items={[]} onSelect={vi.fn()} onToggleStar={vi.fn()} />);
    expect(container.querySelector('.space-y-1')?.children.length).toBe(0);
  });
});
