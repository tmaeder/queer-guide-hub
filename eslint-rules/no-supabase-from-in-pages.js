/**
 * Custom ESLint rule: disallow `supabase.from(...)` calls in pages and
 * components. Database queries belong in `src/hooks/` (or
 * `src/integrations/supabase/`) so pages stay declarative and the
 * codebase moves toward useQuery / useMutation.
 *
 * Currently set to "warn" globally. Promote to "error" once page-level
 * useEffect supabase fetches have been migrated (tech-debt DUP-4).
 *
 * Allowed locations:
 *   - src/hooks/**           (the canonical place for queries)
 *   - src/integrations/**    (low-level supabase client wiring)
 *   - src/utils/**           (one-off helpers — accept for now)
 *   - any __tests__ directory (mocks)
 *   - supabase/functions/**  (edge functions, not browser code)
 *   - scripts/**             (operator scripts)
 */
const rule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow supabase.from() in src/pages and src/components — move to a hook',
    },
    schema: [],
    messages: {
      moveToHook:
        'supabase.from() should live in a hook (src/hooks/), not a page or component. Wrap with useQuery / useMutation.',
    },
  },
  create(ctx) {
    const file = ctx.getFilename().replace(/\\/g, '/');
    const isPage = file.includes('/src/pages/');
    const isComponent = file.includes('/src/components/');
    if (!isPage && !isComponent) return {};
    if (file.includes('/__tests__/') || file.endsWith('.test.tsx') || file.endsWith('.test.ts')) {
      return {};
    }
    // Co-located controller hooks (use*Controller.{ts,tsx}) are real hooks
    // kept next to the page or component they drive — same precedent applied
    // for pages in eslint.config.js.
    if (/\/use[A-Z][A-Za-z0-9]*Controller\.(ts|tsx)$/.test(file)) {
      return {};
    }
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (
          callee.type === 'MemberExpression' &&
          !callee.computed &&
          callee.property.type === 'Identifier' &&
          callee.property.name === 'from' &&
          callee.object.type === 'Identifier' &&
          callee.object.name === 'supabase'
        ) {
          ctx.report({ node, messageId: 'moveToHook' });
        }
      },
    };
  },
};

export default rule;
