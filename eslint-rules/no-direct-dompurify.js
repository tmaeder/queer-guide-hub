/**
 * Custom ESLint rule: `dompurify` may only be imported by src/lib/sanitize.ts.
 *
 * Every caller used to configure DOMPurify ad hoc, and one installed a global
 * hook on the shared instance that silently changed every other caller's
 * output. Sanitizing through a named profile keeps each sink's policy in one
 * reviewed file.
 */
const ALLOWED = /[\\/]src[\\/]lib[\\/]sanitize\.ts$/;

const rule = {
  meta: {
    type: 'problem',
    docs: { description: "Disallow importing 'dompurify' outside src/lib/sanitize.ts" },
    schema: [],
    messages: {
      useProfile:
        "Import a named profile from '@/lib/sanitize' instead of 'dompurify'. Add a profile there if none fits.",
    },
  },
  create(ctx) {
    if (ALLOWED.test(ctx.filename)) return {};
    const check = (node, source) => {
      if (source && source.type === 'Literal' && source.value === 'dompurify') {
        ctx.report({ node, messageId: 'useProfile' });
      }
    };
    return {
      ImportDeclaration: (node) => check(node, node.source),
      ImportExpression: (node) => check(node, node.source),
    };
  },
};

export default rule;
