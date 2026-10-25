/**
 * Custom ESLint rule: no hand-rolled modal/dialog markup outside src/components/ui.
 *
 * A dialog needs focus trapping, Escape, scroll lock, inert background and a
 * name; the Radix primitives in src/components/ui (Dialog, Sheet, AlertDialog,
 * Popover, Drawer) do all of it. A raw <div role="dialog"> or aria-modal does
 * none of it and announces a modal that does not behave like one.
 *
 * Only DOM elements (lowercase JSX) are checked: overriding `role` on a
 * primitive such as <PopoverContent role="dialog"> is fine, the primitive
 * still owns the behaviour.
 */
// Tests mock primitives as plain <div role="dialog">; that is a stand-in, not UI.
const ALLOWED = /[\\/]src[\\/]components[\\/]ui[\\/]|[\\/]__tests__[\\/]|\.test\.tsx?$/;
const DIALOG_ROLES = new Set(['dialog', 'alertdialog']);

const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow hand-rolled dialog markup outside src/components/ui' },
    schema: [],
    messages: {
      usePrimitive:
        'Use a dialog primitive from @/components/ui (Dialog, Sheet, AlertDialog, Popover, Drawer) instead of {{attr}} on a raw element.',
    },
  },
  create(ctx) {
    if (ALLOWED.test(ctx.filename)) return {};
    return {
      JSXAttribute(node) {
        const el = node.parent;
        if (el.type !== 'JSXOpeningElement' || el.name.type !== 'JSXIdentifier') return;
        if (!/^[a-z]/.test(el.name.name)) return;
        const name = node.name.name;
        const v = node.value;
        const literal =
          v?.type === 'Literal'
            ? v.value
            : v?.type === 'JSXExpressionContainer' && v.expression.type === 'Literal'
              ? v.expression.value
              : undefined;
        if (name === 'aria-modal' || (name === 'role' && DIALOG_ROLES.has(literal))) {
          ctx.report({
            node,
            messageId: 'usePrimitive',
            data: { attr: name === 'role' ? `role="${literal}"` : 'aria-modal' },
          });
        }
      },
    };
  },
};

export default rule;
