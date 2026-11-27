/**
 * The build this page was served from, read from the
 * `<meta name="qg-build-id">` tag vite.config.ts writes into index.html.
 *
 * It lives in the HTML rather than in a chunk on purpose: a value compiled
 * into a chunk changes that chunk's hash on every commit, and the change
 * ripples through every chunk that imports it (see injectBuildIdMeta in
 * vite.config.ts). Returns 'dev' when there is no tag (the dev server, tests).
 */
export function readBuildId(): string {
  if (typeof document === 'undefined') return 'dev';
  const id = document.querySelector('meta[name="qg-build-id"]')?.getAttribute('content')?.trim();
  return id || 'dev';
}

/**
 * The Sentry release, which is the commit SHA. Local builds get
 * `local-<timestamp>` and the dev server gets 'dev'; neither names a commit,
 * so both report no release, as before.
 */
export function readSentryRelease(): string | undefined {
  const id = readBuildId();
  return /^[0-9a-f]{7,40}$/.test(id) ? id : undefined;
}
