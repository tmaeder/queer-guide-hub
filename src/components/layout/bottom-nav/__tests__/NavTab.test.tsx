/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { Home } from '@/components/icons';
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

  it('intercepts the tap when asked to (prevents navigation, runs the handler)', () => {
    const onIntercept = vi.fn();
    const onTap = vi.fn();
    renderTab({ onIntercept, onTap });
    const notCancelled = fireEvent.click(screen.getByText('Messages'));
    expect(onTap).toHaveBeenCalledTimes(1);
    expect(onIntercept).toHaveBeenCalledTimes(1);
    // preventDefault() was called → the click event is reported cancelled.
    expect(notCancelled).toBe(false);
  });

  // These query by TEXT, not by label, and the switch is the finding rather
  // than a convenience. NavBadge used to put the sentence in `aria-label` on a
  // ROLELESS `<span>`, which the accname spec drops — so the label was
  // computed, translated and reached no AT at all. It is an `sr-only` span
  // now, so `getByLabelText` no longer finds it.
  //
  // The negative assertion is the one that matters: `queryByLabelText` would
  // return null whether the badge rendered or not, so leaving it would make
  // "omits the badge" VACUOUS — passing against a badge that renders with its
  // label. A text query tests the mechanism that actually works.
  it('renders a count badge whose label is reachable as text', () => {
    renderTab({ badgeCount: 5, badgeLabel: '5 unread' });
    expect(screen.getByText('5 unread')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('omits the badge when the count is zero', () => {
    renderTab({ badgeCount: 0, badgeLabel: '0 unread' });
    expect(screen.queryByText('0 unread')).toBeNull();
    expect(screen.queryByText('0')).toBeNull();
  });

  it('renders the avatar in place of the icon when provided', () => {
    renderTab({ label: 'You', avatar: { src: undefined, initial: 'A' } });
    expect(screen.getByText('A')).toBeInTheDocument();
  });
});
