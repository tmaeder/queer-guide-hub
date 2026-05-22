import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Suspense } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { lazyOptional, lazyRetry } from '../lazyRetry';
import { ErrorBoundary } from '@/components/ErrorBoundary';

vi.mock('@sentry/react', () => ({ captureException: vi.fn() }));

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  sessionStorage.clear();
});

describe('lazyOptional', () => {
  it('renders the component when the import succeeds', async () => {
    const Optional = lazyOptional(() =>
      Promise.resolve({ default: () => <div>banner-loaded</div> }),
    );

    render(
      <ErrorBoundary>
        <Suspense fallback={<div>loading</div>}>
          <Optional />
        </Suspense>
      </ErrorBoundary>,
    );

    expect(await screen.findByText('banner-loaded')).toBeInTheDocument();
  });

  it('renders NOTHING (not the error boundary) when the import permanently fails', async () => {
    // Mark the reload guard so retry+reload paths are skipped — we want
    // the final permanent-failure branch.
    sessionStorage.setItem('chunk-reload-' + window.location.pathname, '1');

    const Optional = lazyOptional(() => Promise.reject(new Error('chunk poisoned')));

    const { container } = render(
      <ErrorBoundary fallback={<div>boundary-tripped</div>}>
        <Suspense fallback={<div>loading</div>}>
          <Optional />
        </Suspense>
      </ErrorBoundary>,
    );

    // Wait for the rejected promise + final fallback to settle.
    await waitFor(() => {
      expect(screen.queryByText('loading')).not.toBeInTheDocument();
    });

    // Critical property: the error never propagates to the outer
    // ErrorBoundary — that boundary would have blanked the layout in
    // the original incident.
    expect(screen.queryByText('boundary-tripped')).not.toBeInTheDocument();
    expect(container.textContent).toBe('');
  });
});

describe('lazyRetry', () => {
  it('retries once before giving up', async () => {
    const factory = vi
      .fn<() => Promise<{ default: () => JSX.Element }>>()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce({ default: () => <div>recovered</div> });

    const Page = lazyRetry(factory);

    render(
      <ErrorBoundary fallback={<div>boundary-tripped</div>}>
        <Suspense fallback={<div>loading</div>}>
          <Page />
        </Suspense>
      </ErrorBoundary>,
    );

    expect(await screen.findByText('recovered')).toBeInTheDocument();
    expect(factory).toHaveBeenCalledTimes(2);
  });
});
