/**
 * Custom ESLint rule: page files must frame their content with <PageContainer>,
 * not a hand-rolled `container mx-auto px-4 py-8` wrapper.
 *
 * Before PageContainer existed, nothing owned page-level layout — the shell
 * contributes zero horizontal spacing by design — so ~118 page files each
 * declared their own frame and produced 12 distinct max-widths, with 62 pages
 * pinned at a flat `px-4` while the header and footer grew to `md:px-8`.
 * See docs/design-system/README.md §Page layout.
 *
 * Deliberately a NAMED rule rather than another `no-restricted-syntax`
 * selector: flat config replaces `no-restricted-syntax` WHOLESALE per file, so
 * adding a selector means re-stating every existing one in all four blocks that
 * match `src/pages/**`, and a miss silently disables rules that are already
 * load-bearing (precedent: #2049, where the public block lost its hex selector
 * exactly this way). A rule with its own name cannot clobber anything.
 *
 * It flags a class string only when it is unambiguously a page frame: it
 * centres (`mx-auto`, or the bare `container` utility) AND declares a gutter or
 * vertical padding. A centred inner block with no padding of its own (a lede,
 * a narrow grid) is a legitimate child and is not reported.
 */
const CENTERS = /(^|\s)(mx-auto|container)(\s|$)/;
const PADDING = /(^|\s)(sm:|md:|lg:|xl:|2xl:)?(p|px|py|pt|pb)-[0-9]/;
// A card, a band, or an inner grid — carries paint or position, so it is not
// the page's frame even when it happens to be centred and padded.
const NOT_A_FRAME =
  /(^|\s)(bg-|border|rounded-|shadow-|grid(\s|$)|absolute(\s|$)|fixed(\s|$)|sticky(\s|$)|min-h-|h-[0-9]|overflow-)/;

const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Use <PageContainer> instead of a hand-rolled page wrapper',
    },
    schema: [],
    messages: {
      usePageContainer:
        'Hand-rolled page wrapper "{{cls}}". Use <PageContainer> (@/components/layout/PageContainer) — it owns the gutter, the cap and the vertical rhythm. Pass size="reading"/"form" for prose and forms, `flush` for pages that own their own bands.',
    },
  },
  create(ctx) {
    const check = (node, value) => {
      if (typeof value !== 'string') return;
      if (!CENTERS.test(value)) return;
      if (!PADDING.test(value)) return;
      if (NOT_A_FRAME.test(value)) return;
      ctx.report({ node, messageId: 'usePageContainer', data: { cls: value } });
    };
    return {
      // className="…"
      JSXAttribute(node) {
        if (node.name?.name !== 'className') return;
        if (node.value?.type === 'Literal') check(node.value, node.value.value);
      },
      // cn('…', …) / template literals inside className expressions
      Literal(node) {
        if (node.parent?.type === 'JSXAttribute') return; // handled above
        check(node, node.value);
      },
    };
  },
};

export default rule;
