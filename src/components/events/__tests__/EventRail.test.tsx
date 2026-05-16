/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EventRail, EventRailItem } from '../EventRail';

describe('EventRail', () => {
  it('renders title, subtitle, and action slot', () => {
    render(
      <EventRail title="My rail" subtitle="some sub" action={<button>act</button>}>
        <div>child</div>
      </EventRail>,
    );
    expect(screen.getByRole('heading', { name: 'My rail' })).toBeInTheDocument();
    expect(screen.getByText('some sub')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'act' })).toBeInTheDocument();
  });

  it('exposes Scroll left / right buttons that invoke scrollBy', () => {
    const spy = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollBy', { configurable: true, value: spy });
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 400 });
    render(<EventRail title="t">x</EventRail>);
    fireEvent.click(screen.getByRole('button', { name: /Scroll left/i }));
    fireEvent.click(screen.getByRole('button', { name: /Scroll right/i }));
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('renders children inside the scroller', () => {
    render(
      <EventRail title="t">
        <span>A</span>
        <span>B</span>
      </EventRail>,
    );
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
  });
});

describe('EventRailItem', () => {
  it('wraps children with default classes and accepts custom className', () => {
    const { container } = render(<EventRailItem className="extra">X</EventRailItem>);
    expect(container.firstChild).toHaveClass('extra');
    expect(screen.getByText('X')).toBeInTheDocument();
  });
});
