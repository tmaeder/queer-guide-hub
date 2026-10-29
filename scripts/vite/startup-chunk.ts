import type { Plugin } from 'vite';

interface StaticModuleInfo {
  importedIds: readonly string[];
}

type ModuleLookup = (id: string) => StaticModuleInfo | null | undefined;
const normalize = (id: string) => id.replaceAll('\\', '/');

function staticClosure(root: string, lookup: ModuleLookup): Set<string> {
  if (!lookup(root)) throw new Error(`Startup module graph is missing ${root}`);
  const visited = new Set<string>();
  const pending = [root];
  while (pending.length) {
    const id = pending.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    pending.push(...(lookup(id)?.importedIds ?? []));
  }
  return visited;
}

/** Group existing startup code without importing lazy routes or the paint entry. */
export function startupSourceModules(
  bootstrap: string,
  firstPaint: string,
  sourceDirectory: string,
  lookup: ModuleLookup,
): Set<string> {
  const early = staticClosure(firstPaint, lookup);
  const prefix = normalize(sourceDirectory).replace(/\/$/, '') + '/';
  return new Set(
    [...staticClosure(bootstrap, lookup)].filter((id) => {
      const normalized = normalize(id);
      return (
        id !== bootstrap &&
        !early.has(id) &&
        normalized.startsWith(prefix) &&
        /\.(?:[cm]?[jt]sx?|json)$/.test(normalized)
      );
    }),
  );
}

/** Uses the public build graph before Rolldown assigns output chunk groups. */
export function startupChunk(sourceDirectory: string) {
  let modules = new Set<string>();
  const prefix = normalize(sourceDirectory).replace(/\/$/, '') + '/';
  const plugin: Plugin = {
    name: 'consolidate-startup-source',
    apply: 'build',
    buildStart() {
      modules.clear();
    },
    buildEnd(error) {
      if (error) return;
      const ids = [...this.getModuleIds()];
      const bootstrap = ids.find((id) => normalize(id) === `${prefix}app-bootstrap.tsx`);
      const firstPaint = ids.find((id) => normalize(id) === `${prefix}main.tsx`);
      if (!bootstrap || !firstPaint) this.error('Startup module roots were not found');
      modules = startupSourceModules(bootstrap, firstPaint, sourceDirectory, (id) =>
        this.getModuleInfo(id),
      );
      if (modules.size === 0) this.error('Startup source group is empty');
    },
  };
  return {
    plugin,
    group: {
      name: 'app-startup',
      priority: 1,
      // The selected set already contains the required source closure. Recursive
      // capture would also absorb assetHeal and pull the app into the paint entry.
      includeDependenciesRecursively: false,
      test: (id: string) => modules.has(id),
    },
  };
}
