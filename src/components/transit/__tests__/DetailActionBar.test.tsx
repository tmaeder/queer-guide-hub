import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DetailActionBar } from '@/components/transit/DetailActionBar';

describe('DetailActionBar', () => {
  it('puts rare actions behind one overflow menu and drops falsy items', () => {
    render(
      <DetailActionBar
        primary={<a href="/x">Get tickets</a>}
        save={<button type="button">Save</button>}
        more={[
          false,
          <button key="r" type="button">
            Report issue
          </button>,
          null,
        ]}
      />,
    );
    expect(screen.getByText('More options')).toBeInTheDocument();
    const menu = screen.getByTestId('detail-action-menu');
    expect(menu.children).toHaveLength(1);
    expect(menu).toHaveTextContent('Report issue');
  });

  it('renders no overflow menu when there is nothing rare to show', () => {
    render(<DetailActionBar primary={<a href="/x">Read at source</a>} more={[false]} />);
    expect(screen.queryByText('More options')).toBeNull();
  });
  it('returns keyboard focus to the summary on Escape', () => {
    render(<DetailActionBar more={[<button key="report">Report issue</button>]} />);
    const summary = screen.getByText('More options').closest('summary')!;
    const details = summary.closest('details')!;
    details.open = true;
    screen.getByRole('button', { name: 'Report issue' }).focus();
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(details.open).toBe(false);
    expect(summary).toHaveFocus();
  });

  it('leaves the overflow mounted and open while a nested dialog owns Escape', () => {
    render(<DetailActionBar more={[<button key="report">Report issue</button>]} />);
    const details = screen.getByText('More options').closest('details')!;
    details.open = true;
    const dialogControl = document.createElement('button');
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.append(dialogControl);
    document.body.append(dialog);
    try {
      dialogControl.focus();
      fireEvent.keyDown(dialogControl, { key: 'Escape' });
      expect(details.open).toBe(true);
      fireEvent.pointerDown(dialogControl);
      expect(details.open).toBe(true);
    } finally {
      dialog.remove();
    }
  });
});
