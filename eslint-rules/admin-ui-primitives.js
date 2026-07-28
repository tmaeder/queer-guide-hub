/**
 * Custom ESLint rule: keep the admin console on its shared UI primitives.
 *
 * Four classes of drift. Counts below are what this rule actually reports at
 * introduction (2026-07-28), which is HIGHER than the hand-grep audit that
 * motivated it — that grep matched only the exact string "Loading..." and
 * missed the far more common "Loading…" with a real ellipsis.
 *
 *  - `bareLoadingText`   — 43 sites render a literal loading string, including
 *                          two SHARED primitives (AdminEntityTable,
 *                          DataTableToolbar), so a count flicker reached every
 *                          admin table. Skeleton on first load, spinner on
 *                          refetch over rendered content, never text.
 *  - `adHocEmptyState`   — 39 sites hand-write "No X found" muted text, so none
 *                          of them distinguish "nothing exists yet" from
 *                          "your filters matched nothing".
 *  - `handRolledHeading` — 18 admin pages hand-roll <h1>, bypassing
 *                          AdminPageHeader's route eyebrow and type tokens.
 *  - `localPrimitive`    — private copies of a shared component. Six identical
 *                          `Stat` definitions were removed in A1; this catches
 *                          the three remaining `StatCard` copies and any new one.
 *
 * Deliberately a standalone rule rather than more `no-restricted-syntax`
 * selectors: flat config replaces that rule WHOLESALE per file, so a second
 * block at a different severity would silently disable the existing colour /
 * radius / spacing selectors. See CLAUDE.md § Design → Enforcement.
 */

const LOCAL_PRIMITIVES = new Set(['Stat', 'StatCard', 'EmptyState', 'BulkBar', 'EmptyList']);
const LOADING_TEXT = /^\s*loading\s*[.…]*\s*$/i;
const EMPTY_TEXT = /^\s*no\s+[\w\s-]+\s+(found|yet|available)\b/i;

const rule = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Use the shared admin UI primitives' },
    schema: [],
    messages: {
      bareLoadingText:
        'Bare "Loading..." text collapses the layout and reads as a stuck page. Use <AdminTableSkeleton>/<AdminCardSkeleton> for first load, <AdminInlineSpinner> for a refetch over rendered content.',
      adHocEmptyState:
        'Ad-hoc empty text. Use <AdminEmpty noun="…" /> so filtered and genuinely-empty states read differently.',
      handRolledHeading:
        'Hand-rolled <h1> skips the route eyebrow and type tokens. Use <AdminPageHeader title=… />.',
      localPrimitive:
        'Local "{{name}}" duplicates a shared primitive in @/components/admin/primitives. Import it instead.',
    },
  },
  create(ctx) {
    const filename = ctx.filename ?? ctx.getFilename();
    // The primitives themselves necessarily define these shapes.
    const isPrimitiveModule = filename.includes('/components/admin/primitives/');
    // A file named Stat.tsx that exports `Stat` is a definition site, not an
    // inline copy — the smell this rule chases is a private component declared
    // partway down an unrelated file. (admin/affiliate/Stat.tsx is a bordered
    // stat CARD, a different shape from the AdminStat chip, scoped to its
    // folder; it is deliberately not folded in.)
    const basename = filename.split('/').pop()?.replace(/\.[jt]sx?$/, '') ?? '';

    function checkText(node, raw) {
      if (LOADING_TEXT.test(raw)) ctx.report({ node, messageId: 'bareLoadingText' });
      else if (EMPTY_TEXT.test(raw)) ctx.report({ node, messageId: 'adHocEmptyState' });
    }

    return {
      JSXText(node) {
        if (isPrimitiveModule) return;
        checkText(node, node.value);
      },

      Literal(node) {
        if (isPrimitiveModule) return;
        if (typeof node.value !== 'string') return;
        // Only string literals RENDERED as body text. Deliberately excludes
        // JSXAttribute values: `aria-label="Loading"` on a spinner is the
        // correct accessible name (AdminInlineSpinner sets exactly that), and a
        // status value of "loading" in plain data is fine too.
        const p = node.parent;
        const inJsxBody =
          p &&
          (p.type === 'JSXExpressionContainer' ||
            (p.type === 'ConditionalExpression' &&
              p.parent?.type === 'JSXExpressionContainer') ||
            (p.type === 'LogicalExpression' &&
              p.parent?.type === 'JSXExpressionContainer'));
        if (!inJsxBody) return;
        checkText(node, node.value);
      },

      JSXOpeningElement(node) {
        if (isPrimitiveModule) return;
        if (node.name?.type === 'JSXIdentifier' && node.name.name === 'h1') {
          // Only pages own the page title; components legitimately render one
          // inside a shell they define.
          if (/\/pages\/admin\//.test(filename)) {
            ctx.report({ node, messageId: 'handRolledHeading' });
          }
        }
      },

      FunctionDeclaration(node) {
        if (isPrimitiveModule) return;
        if (node.id && node.id.name !== basename && LOCAL_PRIMITIVES.has(node.id.name)) {
          ctx.report({ node: node.id, messageId: 'localPrimitive', data: { name: node.id.name } });
        }
      },

      VariableDeclarator(node) {
        if (isPrimitiveModule) return;
        if (
          node.id?.type === 'Identifier' &&
          node.id.name !== basename &&
          LOCAL_PRIMITIVES.has(node.id.name) &&
          (node.init?.type === 'ArrowFunctionExpression' ||
            node.init?.type === 'FunctionExpression')
        ) {
          ctx.report({ node: node.id, messageId: 'localPrimitive', data: { name: node.id.name } });
        }
      },
    };
  },
};

export default rule;
