import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

type LifecycleHandler = (event: { waitUntil: (promise: Promise<void>) => void }) => void;

const worker = readFileSync('public/sw.js', 'utf8');

function installWorker(missing: string[]) {
  const add = vi.fn(async (path: string) => {
    if (missing.includes(path)) throw new Error(`404 ${path}`);
  });
  const skipWaiting = vi.fn();
  const handlers = new Map<string, LifecycleHandler>();
  runInNewContext(worker, {
    self: {
      location: { hostname: 'queer.guide' },
      addEventListener: (name: string, handler: LifecycleHandler) => handlers.set(name, handler),
      skipWaiting,
    },
    caches: { open: async () => ({ add }) },
  });
  const install = handlers.get('install');
  if (!install) throw new Error('Service worker did not register an install handler');
  const installation = new Promise<void>((resolve, reject) => {
    install({ waitUntil: (promise) => promise.then(resolve, reject) });
  });
  return { installation, add, skipWaiting };
}

describe('production service worker installation', () => {
  it('activates with the canonical shell when optional files return 404', async () => {
    const { installation, add, skipWaiting } = installWorker(['/index.html', '/offline.html']);
    await installation;
    expect(add).toHaveBeenCalledWith('/');
    expect(add).not.toHaveBeenCalledWith('/index.html');
    expect(skipWaiting).toHaveBeenCalledOnce();
  });

  it('fails installation if the canonical shell is unavailable', async () => {
    const { installation, skipWaiting } = installWorker(['/']);
    await expect(installation).rejects.toThrow('404 /');
    expect(skipWaiting).not.toHaveBeenCalled();
  });
});
