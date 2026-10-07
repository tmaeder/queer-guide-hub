import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalGetContext = HTMLCanvasElement.prototype.getContext;

describe('isWebglSupported', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: originalGetContext,
    });
    vi.restoreAllMocks();
  });

  it('accepts WebGL2 and releases the probe context', async () => {
    const loseContext = vi.fn();
    const getContext = vi.fn((type: string) =>
      type === 'webgl2' ? { getExtension: () => ({ loseContext }) } : null,
    );
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: getContext,
    });

    const { isWebglSupported } = await import('../webglSupport');

    expect(isWebglSupported()).toBe(true);
    expect(getContext).toHaveBeenCalledWith('webgl2');
    expect(loseContext).toHaveBeenCalledOnce();
  });

  it('does not claim support for a WebGL1-only browser', async () => {
    const getContext = vi.fn((type: string) => (type === 'webgl' ? {} : null));
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: getContext,
    });

    const { isWebglSupported } = await import('../webglSupport');

    expect(isWebglSupported()).toBe(false);
    expect(getContext).toHaveBeenCalledTimes(1);
    expect(getContext).toHaveBeenCalledWith('webgl2');
  });
});
