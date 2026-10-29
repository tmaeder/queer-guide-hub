import { describe, expect, it } from 'vitest';
import { startupSourceModules } from '../../../scripts/vite/startup-chunk';

describe('startup source chunk boundaries', () => {
  it('consolidates shared startup source while retaining the paint and lazy boundaries', () => {
    const graph = new Map([
      ['/app/src/main.tsx', { importedIds: ['/app/src/utils/assetHeal.ts', '/app/src/index.css'] }],
      [
        '/app/src/app-bootstrap.tsx',
        { importedIds: ['/app/src/App.tsx', '/app/src/utils/assetHeal.ts'] },
      ],
      [
        '/app/src/App.tsx',
        {
          importedIds: ['/app/src/hooks/shared.ts', '/app/node_modules/library/src/index.js'],
          dynamicallyImportedIds: ['/app/src/pages/Admin.tsx'],
        },
      ],
      ['/app/src/hooks/shared.ts', { importedIds: ['/app/src/index.css'] }],
      ['/app/src/utils/assetHeal.ts', { importedIds: [] }],
      ['/app/src/pages/Admin.tsx', { importedIds: [] }],
      ['/app/src/index.css', { importedIds: [] }],
      ['/app/node_modules/library/src/index.js', { importedIds: [] }],
    ]);
    expect(
      startupSourceModules('/app/src/app-bootstrap.tsx', '/app/src/main.tsx', '/app/src', (id) =>
        graph.get(id),
      ),
    ).toEqual(new Set(['/app/src/App.tsx', '/app/src/hooks/shared.ts']));
  });

  it('handles static cycles and excludes a dependency shared with the early entry', () => {
    const graph = new Map([
      ['main', { importedIds: ['/src/shared.ts'] }],
      ['bootstrap', { importedIds: ['/src/a.ts'] }],
      ['/src/a.ts', { importedIds: ['/src/b.ts', '/src/shared.ts'] }],
      ['/src/b.ts', { importedIds: ['/src/a.ts'] }],
      ['/src/shared.ts', { importedIds: [] }],
    ]);
    expect(startupSourceModules('bootstrap', 'main', '/src', (id) => graph.get(id))).toEqual(
      new Set(['/src/a.ts', '/src/b.ts']),
    );
  });

  it('normalizes Windows paths without changing the module IDs used by the bundler', () => {
    const graph = new Map([
      ['main', { importedIds: [] }],
      ['bootstrap', { importedIds: ['C:\\app\\src\\shared.ts'] }],
      ['C:\\app\\src\\shared.ts', { importedIds: [] }],
    ]);
    expect(
      startupSourceModules('bootstrap', 'main', 'C:\\app\\src', (id) => graph.get(id)),
    ).toEqual(new Set(['C:\\app\\src\\shared.ts']));
  });

  it('fails closed when a startup root cannot be found', () => {
    expect(() => startupSourceModules('missing', 'main', '/src', () => null)).toThrow(
      'Startup module graph is missing',
    );
  });
});
