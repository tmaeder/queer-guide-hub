import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
let modulePromise;
export function loadSubpathSetup() {
  return modulePromise ??= build({ entryPoints: ['src/lib/redirects/subpath.ts'], bundle: true, write: false, format: 'esm', platform: 'neutral', target: 'es2022' })
    .then(bundle => import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64')));
}
export async function subpathFixture(website, prefix, hostname, outboundService) {
  const { subpathSetup } = await loadSubpathSetup();
  const setup = subpathSetup(website, prefix, hostname, 'cloudflare');
  const runtime = new Miniflare(convertV4MiniflareOptions({ workers: [{ name: 'subpath-fixture', modules: true, script: setup.configuration, compatibilityDate: '2026-10-08', outboundService }] }));
  return { setup, runtime };
}
