/**
 * Test-only stand-in for `toucan-js`, used ONLY when the real package is not
 * installed (see the conditional alias in vitest.config.ts — with a normal
 * `npm ci` this file is never loaded).
 *
 * `src/index.ts` imports Toucan at module scope but only CONSTRUCTS it when
 * `env.SENTRY_DSN` is set, which no test sets. So the import has to resolve for
 * the handler to be importable at all; nothing here is ever exercised.
 */
export class Toucan {
	constructor(_opts?: unknown) {}
	captureException(_e: unknown): void {}
	captureMessage(_m: unknown): void {}
	setUser(_u: unknown): void {}
}
