/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { Home } from 'lucide-react';
import { NavTab } from '../NavTab';

function renderTab(props: Partial<React.ComponentProps<typeof NavTab>> = {}) {
  return render(
    <MemoryRouter>
      <ul>
        <NavTab
          to="/messages"
          icon={Home}
          label="Messages"
          active={false}
          reduced
          onTap={vi.fn()}
          {...props}
        />
      </ul>
    </MemoryRouter>,
  );
}

describe('NavTab', () => {
  it('renders a link to its destination', () => {
    renderTab();
    const link = screen.getByText('Messages').closest('a');
    expect(link).toHaveAttribute('href', '/messages');
    expect(link).not.toHaveAttribute('aria-current');
  });

  it('marks the active tab with aria-current=page', () => {
    renderTab({ active: true });
    expect(screen.getByText('Messages').closest('a')).toHaveAttribute('aria-current', 'page');
  });

  it('fires the tap handler on click', () => {
    const onTap = vi.fn();
    renderTab({ onTap });
    fireEvent.click(screen.getByText('Messages'));
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it('intercepts the tap when auth-gated (prevents navigation, runs the gate)', () => {
    const onGate = vi.fn();
    const onTap = vi.fn();
    renderTab({ onGate, onTap });
    const notCancelled = fireEvent.click(screen.getByText('Messages'));
    expect(onTap).toHaveBeenCalledTimes(1);
    expect(onGate).toHaveBeenCalledTimes(1);
    // preventDefault() was called → the click event is reported cancelled.
    expect(notCancelled).toBe(false);
  });

  it('renders a count badge with its localized label', () => {
    renderTab({ badgeCount: 5, badgeLabel: '5 unread' });
    expect(screen.getByLabelText('5 unread')).toHaveTextContent('5');
  });

  it('omits the badge when the count is zero', () => {
    renderTab({ badgeCount: 0, badgeLabel: '0 unread' });
    expect(screen.queryByLabelText('0 unread')).toBeNull();
  });

  it('renders the avatar in place of the icon when provided', () => {
    renderTab({ label: 'You', avatar: { src: undefined, initial: 'A' } });
    expect(screen.getByText('A')).toBeInTheDocument();
  });
});
