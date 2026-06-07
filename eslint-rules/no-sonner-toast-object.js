/**
 * Custom ESLint rule: disallow calling sonner's `toast(...)` with an object
 * argument (`toast({ title, description, variant })`).
 *
 * sonner's `toast()` takes a string/JSX message plus an options object as the
 * SECOND arg — `toast.success(msg, { description })` / `toast.error(...)`. The
 * shadcn `useToast()` shim takes the object form, so files that paste that
 * shape while importing `toast` from 'sonner' render blank/garbled toasts —
 * silently, often on error paths. This rule catches that class.
 *
 * Only fires when `toast` is imported from 'sonner' in the file. The shadcn
 * shim (`@/hooks/use-toast`) is unaffected.
 */
const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        "Disallow object-argument toast() calls when toast is imported from 'sonner'",
    },
    schema: [],
    messages: {
      useStringForm:
        "sonner's toast() takes a string message, not an object. Use toast.success(msg, { description }) or toast.error(msg, { description }).",
    },
  },
  create(ctx) {
    // Local name `toast` is bound to sonner only when imported from 'sonner'.
    let sonnerToastName = null;
    return {
      ImportDeclaration(node) {
        if (node.source.value !== 'sonner') return;
        for (const spec of node.specifiers) {
          if (
            spec.type === 'ImportSpecifier' &&
            spec.imported.type === 'Identifier' &&
            spec.imported.name === 'toast'
          ) {
            sonnerToastName = spec.local.name;
          }
        }
      },
      CallExpression(node) {
        if (!sonnerToastName) return;
        const callee = node.callee;
        if (
          callee.type === 'Identifier' &&
          callee.name === sonnerToastName &&
          node.arguments.length > 0 &&
          node.arguments[0].type === 'ObjectExpression'
        ) {
          ctx.report({ node, messageId: 'useStringForm' });
        }
      },
    };
  },
};

export default rule;
