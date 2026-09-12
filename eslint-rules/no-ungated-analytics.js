/**
 * Custom ESLint rule: page-view tracking has exactly one pipeline, and it is
 * consent-gated.
 *
 * The history this exists to prevent (all measured on prod 2026-09-12):
 *
 *  - `src/components/analytics/AnalyticsTracker.tsx` called
 *    `supabase.functions.invoke('umami-analytics')` on every route change with
 *    no consent check and no Do Not Track check, while the published Cookie
 *    policy said analytics loads "only with your consent". It carried 98.9% of
 *    all sessions (398,018 of 402,364 had no `country`, which is only ever set
 *    on the consent-gated `/api/track` path).
 *
 *  - Because it ran *beside* `public/umami.js`, every page view was recorded
 *    twice. Reproduced in a browser: one visit to /travel with six scroll
 *    steps emitted 22 beacons, 11 per pipeline.
 *
 *  - `public/umami.js` patched `history.replaceState`, which in this app is a
 *    component writing UI state back to the URL rather than a navigation. The
 *    editorial scroll-spy issues one every 300ms while a reader scrolls, so
 *    /travel alone recorded 268,313 views across 981 sessions in 30 days.
 *
 * So two things are banned in `src/`:
 *
 *  - reaching the analytics ingest directly. The only sanctioned emitters are
 *    `public/umami.js` (injected by `src/utils/analyticsLoader.ts` only after
 *    consent) and `window.umami.track`, a global that exists *only* when that
 *    script was injected — which makes the gate structural rather than a check
 *    somebody has to remember to write.
 *
 *  - patching `history.pushState` / `history.replaceState`. One patcher is
 *    enough, it lives in `public/umami.js`, and a second would restore the
 *    double count.
 *
 * Deliberately a standalone rule rather than more `no-restricted-syntax`
 * selectors: flat config replaces that rule WHOLESALE per file, so a new block
 * would silently disable the existing colour / radius / spacing selectors.
 * See CLAUDE.md § Design → Enforcement.
 */

// Write path only. `umami-dashboard` is deliberately NOT here: it is the
// admin READ surface, gated by requireAdmin inside the function, and the
// analytics dashboards are supposed to call it.
const INGEST_FUNCTIONS = new Set(['umami-analytics']);
const HISTORY_METHODS = new Set(['pushState', 'replaceState']);
const TEST_FILE = /(__tests__[\\/]|\.(?:test|spec)\.[jt]sx?$)/;

/** `supabase.functions.invoke(...)` / `client.functions.invoke(...)`. */
function isFunctionsInvoke(callee) {
  return (
    callee?.type === 'MemberExpression' &&
    callee.property?.name === 'invoke' &&
    callee.object?.type === 'MemberExpression' &&
    callee.object.property?.name === 'functions'
  );
}

/** `history.pushState = …` / `window.history.replaceState = …`. */
function isHistoryMethod(node) {
  if (node?.type !== 'MemberExpression') return false;
  if (!HISTORY_METHODS.has(node.property?.name)) return false;
  const obj = node.object;
  if (obj?.type === 'Identifier') return obj.name === 'history';
  return (
    obj?.type === 'MemberExpression' &&
    obj.property?.name === 'history' &&
    obj.object?.name === 'window'
  );
}

const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Keep analytics on the single consent-gated pipeline' },
    schema: [],
    messages: {
      directIngest:
        'Do not call the "{{fn}}" edge function from the app. Page views belong to public/umami.js, which src/utils/analyticsLoader.ts injects only after analytics consent; custom events go through window.umami.track. A direct invoke bypasses the consent gate — that is exactly what AnalyticsTracker did, and it carried 98.9% of tracking past a policy promising the opposite.',
      historyPatch:
        'Do not patch history.{{method}}. public/umami.js owns the single history patch; a second one records every navigation twice. replaceState in particular is UI state here (the editorial scroll-spy writes ?section= every 300ms), not a page view.',
    },
  },
  create(ctx) {
    return {
      CallExpression(node) {
        if (!isFunctionsInvoke(node.callee)) return;
        const arg = node.arguments[0];
        if (arg?.type !== 'Literal' || !INGEST_FUNCTIONS.has(arg.value)) return;
        ctx.report({ node, messageId: 'directIngest', data: { fn: arg.value } });
      },
      AssignmentExpression(node) {
        if (!isHistoryMethod(node.left)) return;
        // A test that drives public/umami.js has to restore the history
        // methods it patched. Saving and putting back a global is the opposite
        // of installing a second tracker, and src/lib/__tests__/umamiScript
        // .test.ts asserts precisely that replaceState is left alone.
        if (TEST_FILE.test(ctx.filename ?? '')) return;
        ctx.report({
          node,
          messageId: 'historyPatch',
          data: { method: node.left.property.name },
        });
      },
    };
  },
};

export default rule;
