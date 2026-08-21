import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LoadMore } from '../LoadMore';

/**
 * jsdom has no IntersectionObserver, so we install one we can drive.
 * `enter()` delivers intersecting entries — a burst of them is exactly what
 * the real API produces while a fetch is in flight, and the burst is what the
 * two unlatched pages mishandled. `leave()` is the only thing that re-arms.
 */
type Cb = (entries: { isIntersecting: boolean }[]) => void;
let live: { cb: Cb; dead: boolean }[] = [];

const deliver = (isIntersecting: boolean, times = 1) => {
  for (const o of live) {
    if (o.dead) continue;
    for (let i = 0; i < times; i++) o.cb([{ isIntersecting }]);
  }
};
const enter = (times = 1) => act(() => deliver(true, times));
const leave = () => act(() => deliver(false));

beforeEach(() => {
  live = [];
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      private e: { cb: Cb; dead: boolean };
      constructor(cb: Cb) {
        this.e = { cb, dead: false };
        live.push(this.e);
      }
      observe() {}
      unobserve() {}
      disconnect() {
        this.e.dead = true;
      }
    },
  );
});

afterEach(() => vi.unstubAllGlobals());

describe('LoadMore', () => {
  it('fires once per burst, however many intersecting entries arrive', () => {
    const onLoadMore = vi.fn();
    render(<LoadMore hasMore loading={false} onLoadMore={onLoadMore} />);

    // The window in which /venues and /personalities called setPage three
    // times off the same stale page, skipping two pages.
    enter(3);

    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('does not fire while a load is already in flight', () => {
    const onLoadMore = vi.fn();
    render(<LoadMore hasMore loading onLoadMore={onLoadMore} />);
    enter(2);
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it('re-arms when the load settles, and stops at the limit', () => {
    const onLoadMore = vi.fn();
    const { rerender } = render(
      <LoadMore hasMore loading={false} onLoadMore={onLoadMore} autoLoadLimit={2} />,
    );

    // Five rounds of fire → load → settle, never leaving view. The BUDGET is
    // what stops it, not the geometry: on a virtualized grid the sentinel can
    // still be inside the margin at every re-arm, which is how /personalities
    // reached page 3 before the reader had touched anything.
    for (let i = 0; i < 5; i++) {
      enter();
      rerender(<LoadMore hasMore loading onLoadMore={onLoadMore} autoLoadLimit={2} />);
      rerender(<LoadMore hasMore loading={false} onLoadMore={onLoadMore} autoLoadLimit={2} />);
    }
    expect(onLoadMore).toHaveBeenCalledTimes(2);

    // The cap bounds the automatic behaviour; it does not end the list.
    screen.getByRole('button', { name: /load more/i }).click();
    expect(onLoadMore).toHaveBeenCalledTimes(3);
  });

  it('re-arms the budget when resetKey changes', () => {
    const onLoadMore = vi.fn();
    const { rerender } = render(
      <LoadMore hasMore loading={false} onLoadMore={onLoadMore} autoLoadLimit={1} resetKey="a" />,
    );

    enter();
    leave();
    enter();
    expect(onLoadMore).toHaveBeenCalledTimes(1); // budget spent

    rerender(
      <LoadMore hasMore loading={false} onLoadMore={onLoadMore} autoLoadLimit={1} resetKey="b" />,
    );
    enter();
    expect(onLoadMore).toHaveBeenCalledTimes(2); // new list, new budget
  });

  it('never auto-fires at limit 0, but the button still does', () => {
    const onLoadMore = vi.fn();
    render(<LoadMore hasMore loading={false} onLoadMore={onLoadMore} autoLoadLimit={0} />);

    enter(3);
    expect(onLoadMore).not.toHaveBeenCalled();

    screen.getByRole('button', { name: /load more/i }).click();
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when there is no more to load', () => {
    const { container } = render(<LoadMore hasMore={false} loading={false} onLoadMore={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('does not rebuild the observer when onLoadMore changes identity', () => {
    const { rerender } = render(<LoadMore hasMore loading={false} onLoadMore={() => {}} />);
    const built = live.length;
    rerender(<LoadMore hasMore loading={false} onLoadMore={() => {}} />);
    expect(live.length).toBe(built);
  });
});
