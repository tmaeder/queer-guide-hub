/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { DeferredSection } from '../DeferredSection';

const realIO = globalThis.IntersectionObserver;

afterEach(() => {
  if (realIO) globalThis.IntersectionObserver = realIO;
  else delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
});

describe('DeferredSection', () => {
  it('mounts children immediately when IntersectionObserver is unavailable', () => {
    delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
    render(
      <DeferredSection fallback={<div data-testid="skeleton" />}>
        <div data-testid="content" />
      </DeferredSection>,
    );
    expect(screen.getByTestId('content')).toBeTruthy();
    expect(screen.queryByTestId('skeleton')).toBeNull();
  });

  it('defers children until intersection, then mounts and disconnects', () => {
    let callback: IntersectionObserverCallback | null = null;
    const disconnectSpy = vi.fn();
    class MockIO {
      constructor(cb: IntersectionObserverCallback) {
        callback = cb;
      }
      observe = vi.fn();
      disconnect = disconnectSpy;
      unobserve = vi.fn();
      takeRecords = () => [];
    }
    globalThis.IntersectionObserver = MockIO as unknown as typeof IntersectionObserver;

    render(
      <DeferredSection fallback={<div data-testid="skeleton" />}>
        <div data-testid="content" />
      </DeferredSection>,
    );
    expect(screen.queryByTestId('content')).toBeNull();
    expect(screen.getByTestId('skeleton')).toBeTruthy();

    act(() => {
      callback?.(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });
    expect(screen.getByTestId('content')).toBeTruthy();
    expect(disconnectSpy).toHaveBeenCalled();
  });
});
