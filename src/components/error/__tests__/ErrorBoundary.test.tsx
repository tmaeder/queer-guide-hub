import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactElement } from 'react';

vi.mock('@sentry/react', () => ({ captureException: vi.fn() }));
const healFailedAssets = vi.fn(() => Promise.resolve());
vi.mock('@/utils/assetHeal', () => ({ healFailedAssets: () => healFailedAssets() }));

import * as Sentry from '@sentry/react';
import { ErrorBoundary, SectionErrorFallback } from '../ErrorBoundary';

function ThrowingComponent(): ReactElement {
  throw new Error('Test error');
}

function GoodComponent() {
  return <div>All good</div>;
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('should render children when no error', () => {
    render(
      <ErrorBoundary>
        <GoodComponent />
      </ErrorBoundary>,
    );
    expect(screen.getByText('All good')).toBeInTheDocument();
  });

  it('should show error UI when child throws', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Try Again')).toBeInTheDocument();
    expect(screen.getByText('Go Home')).toBeInTheDocument();
  });

  it('should render custom fallback when provided', () => {
    render(
      <ErrorBoundary fallback={<div>Custom Error</div>}>
        <ThrowingComponent />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Custom Error')).toBeInTheDocument();
  });

  it('provides retry controls to a render fallback', () => {
    const fallback = vi.fn(({ onRetry }: { onRetry: () => void }) => (
      <button type="button" onClick={onRetry}>
        Retry section
      </button>
    ));
    render(
      <ErrorBoundary fallback={fallback}>
        <ThrowingComponent />
      </ErrorBoundary>,
    );
    expect(fallback).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry section' }));
    expect(screen.getByRole('button', { name: 'Retry section' })).toBeInTheDocument();
  });

  it('should recover when Try Again is clicked', () => {
    const { rerender: _rerender } = render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Try Again'));
    // After retry, the throwing component throws again
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('reports the crash to Sentry with its section tag', () => {
    render(
      <ErrorBoundary section="unit-test" fallback={null}>
        <ThrowingComponent />
      </ErrorBoundary>,
    );
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Test error' }),
      expect.objectContaining({ tags: expect.objectContaining({ section: 'unit-test' }) }),
    );
  });

  it('renders the inline section fallback with its retry', () => {
    const onRetry = vi.fn();
    render(
      <ErrorBoundary
        fallback={({ error }) => (
          <SectionErrorFallback label="sources" message={error?.message} onRetry={onRetry} />
        )}
      >
        <ThrowingComponent />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Failed to load sources')).toBeInTheDocument();
    expect(screen.getByText('Test error')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Retry/ }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('heals assets and reloads a fresh document when a chunk failed to load', async () => {
    const replace = vi.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...original, href: 'https://queer.guide/venues', replace, pathname: '/venues' },
    });
    function ChunkFail(): ReactElement {
      throw new TypeError('Failed to fetch dynamically imported module: /assets/js/x.js');
    }
    try {
      render(
        <ErrorBoundary>
          <ChunkFail />
        </ErrorBoundary>,
      );
      fireEvent.click(screen.getByText('Try Again'));
      await vi.waitFor(() => expect(replace).toHaveBeenCalled());
      expect(healFailedAssets).toHaveBeenCalled();
      expect(String(replace.mock.calls[0][0])).toContain('__fresh=');
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original });
    }
  });
});
