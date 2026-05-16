/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Calendar } from 'lucide-react';
import { RecentActivity } from '../RecentActivity';

const activities = [
  {
    id: 'a1', type: 'event', title: 'Pride 2026',
    description: 'New event', timestamp: new Date(Date.now() - 60_000).toISOString(),
    icon: Calendar, badge: 'event',
  },
] as never;

describe('RecentActivity', () => {
  it('renders skeletons when loading', () => {
    const { container } = render(<RecentActivity activities={[]} loading />);
    expect(container.querySelectorAll('[class*="animate-pulse"]').length).toBeGreaterThan(0);
  });

  it('renders empty state', () => {
    render(<RecentActivity activities={[]} />);
    expect(screen.getByText(/No recent activity/i)).toBeInTheDocument();
  });

  it('renders activity entries with title + badge', () => {
    render(<RecentActivity activities={activities} />);
    expect(screen.getByText('Pride 2026')).toBeInTheDocument();
    expect(screen.getByText('event')).toBeInTheDocument();
  });

  it('shows refresh button + fires onRefresh', () => {
    const onRefresh = vi.fn();
    render(<RecentActivity activities={activities} onRefresh={onRefresh} />);
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]);
    expect(onRefresh).toHaveBeenCalled();
  });
});
