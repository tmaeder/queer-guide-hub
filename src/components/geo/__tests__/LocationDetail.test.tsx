/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LocationActionMenu, LocationExploreMore, LocationOverview } from '../LocationDetail';

const realIntersectionObserver = globalThis.IntersectionObserver;

afterEach(() => {
  vi.restoreAllMocks();
  if (realIntersectionObserver) globalThis.IntersectionObserver = realIntersectionObserver;
  else delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
});

function installIntersectionObserver() {
  let callback: IntersectionObserverCallback | null = null;
  const disconnect = vi.fn();
  const observe = vi.fn();

  class MockIntersectionObserver {
    constructor(next: IntersectionObserverCallback) {
      callback = next;
    }

    observe = observe;
    disconnect = disconnect;
    unobserve = vi.fn();
    takeRecords = () => [];
  }

  globalThis.IntersectionObserver =
    MockIntersectionObserver as unknown as typeof IntersectionObserver;

  return {
    enterViewport() {
      act(() => {
        callback?.(
          [{ isIntersecting: true } as IntersectionObserverEntry],
          {} as IntersectionObserver,
        );
      });
    },
    observe,
    disconnect,
  };
}

describe('LocationOverview', () => {
  it('exposes the opening region as a named section', () => {
    render(
      <LocationOverview>
        <p>Safety and facts</p>
        <p>Map</p>
      </LocationOverview>,
    );

    expect(screen.getByRole('region', { name: 'Overview' })).toBeInTheDocument();
  });
});

describe('LocationActionMenu', () => {
  it('opens from the keyboard without overriding the native roles of its actions', async () => {
    const user = userEvent.setup();
    render(
      <LocationActionMenu label="More actions">
        <a href="https://example.com">Official website</a>
        <button type="button">Report an issue</button>
      </LocationActionMenu>,
    );

    const trigger = screen.getByRole('button', { name: 'More actions' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    trigger.focus();
    await user.keyboard('{Enter}');

    const dialog = await screen.findByRole('dialog', { name: 'More actions' });
    expect(dialog).toBeVisible();
    expect(screen.getByRole('link', { name: 'Official website' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Report an issue' })).toBeVisible();
    expect(dialog).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'More actions' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});

describe('LocationExploreMore', () => {
  it('does not mount data-heavy content before its group approaches the viewport', () => {
    const observer = installIntersectionObserver();
    const mounted = vi.fn();

    function DiscoveryResults() {
      mounted();
      return <p>Discovery results</p>;
    }

    render(
      <LocationExploreMore
        groups={[
          {
            id: 'nearby',
            title: 'Nearby places',
            summary: 'Continue nearby.',
            content: <DiscoveryResults />,
          },
        ]}
      />,
    );

    expect(observer.observe).toHaveBeenCalledTimes(1);
    expect(mounted).not.toHaveBeenCalled();
    expect(screen.queryByText('Discovery results')).not.toBeInTheDocument();

    observer.enterViewport();

    expect(screen.getByText('Discovery results')).toBeInTheDocument();
    expect(mounted).toHaveBeenCalledTimes(1);
    expect(observer.disconnect).toHaveBeenCalled();
  });

  it('mounts a deferred group as soon as the reader opens it', async () => {
    installIntersectionObserver();
    render(
      <LocationExploreMore
        groups={[
          {
            id: 'community',
            title: 'Community',
            content: <p>Community results</p>,
          },
        ]}
      />,
    );

    expect(screen.queryByText('Community results')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Community'));

    await waitFor(() => expect(screen.getByText('Community results')).toBeInTheDocument());
  });

  it('renders nothing when there are no exploration groups', () => {
    const { container } = render(<LocationExploreMore groups={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
