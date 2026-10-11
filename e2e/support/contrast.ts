/**
 * In-page contrast measurement for the chrome specs.
 *
 * ## Why this is not three lines of regex
 *
 * The obvious implementation — `cssColor.match(/[\d.]+/g)` and treat the first
 * three numbers as R/G/B — is WRONG against this codebase, and wrong in the
 * direction that manufactures failures. Tailwind v4 emits an opacity-modified
 * colour as **`oklab()`**, not `rgba()`: the footer's `text-background/70`
 * computes to
 *
 *     oklab(0.983331 -0.0018467 0.00639653 / 0.7)
 *
 * and that regex reads `0.98, -0.0018, 0.0064` as 8-bit channels, i.e. very
 * nearly black. Measured consequence: a first draft of `a11y-footer.spec.ts`
 * reported **28** footer links at a contrast ratio of 1.11 against prod. All 28
 * are paper on ink at roughly 18:1 and perfectly legible. The spec was broken,
 * not the footer.
 *
 * (The compact-header findings from the same session were real, because there
 * both sides genuinely computed to `rgb(17, 17, 17)` — a plain rgb parse. A
 * broken parser that happens to agree with you on one surface is the worst
 * kind.)
 *
 * So the colour is never parsed. It is PAINTED: fill the background into a 1×1
 * canvas, fill the foreground over it, and read the pixel back. The browser
 * does the colour-space conversion and the alpha compositing, which is also
 * strictly more correct than doing the alpha maths by hand — a semi-transparent
 * foreground really is composited against what is behind it.
 */

/** Source of this snippet, stringified for `page.evaluate`. */
export const CONTRAST_HELPERS = `
  // Paint a CSS colour (any syntax the browser accepts: rgb, rgba, oklab,
  // color-mix, a keyword) over an opaque backdrop and read the real pixel.
  function __composite(fgCss, bgCss) {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    // Opaque base first, so a translucent foreground composites against the
    // thing it visually sits on rather than against transparency.
    ctx.fillStyle = bgCss;
    ctx.fillRect(0, 0, 1, 1);
    ctx.fillStyle = fgCss;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return [r, g, b];
  }

  function __relLum(rgb) {
    const ch = rgb.map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  }

  // Is this computed background fully opaque? Anything with an explicit alpha
  // below 1 is a LAYER, not a base — it has to be composited over whatever is
  // behind it.
  function __isOpaque(bg) {
    if (!bg || /rgba\\(0, 0, 0, 0\\)|transparent/.test(bg)) return false;
    // rgba(r,g,b,a) and oklab(l a b / a) both put the alpha last after a comma
    // or a slash. No alpha component at all means opaque.
    const m = bg.match(/[/,]\\s*(0?\\.\\d+|0|1(?:\\.0+)?)\\s*\\)\\s*$/);
    if (!m) return true;
    return Number(m[1]) >= 1;
  }

  /**
   * The real background a control is painted on, as a LIST OF LAYERS from the
   * opaque base outward.
   *
   * A single "nearest painted ancestor" answer is not enough, and the footer
   * proves it: the crisis card is \`bg-background/10\` and the Report CTA
   * \`bg-background/15\`, both sitting on the ink plate. Treating a 15%-paper
   * layer as the base measures paper text on paper and reports a ratio of 1.01
   * for a control that renders at roughly 11:1. Measured: a first draft did
   * exactly that for both of them.
   *
   * So every translucent layer is collected on the way up and composited in
   * order, which is what the browser itself does.
   */
  function __bgLayers(el) {
    const layers = [];
    let node = el;
    while (node) {
      const bg = getComputedStyle(node).backgroundColor;
      if (bg && !/rgba\\(0, 0, 0, 0\\)|transparent/.test(bg)) {
        layers.push(bg);
        if (__isOpaque(bg)) return layers.reverse();
      }
      node = node.parentElement;
    }
    // Nothing opaque anywhere up the tree — the page canvas is the base.
    layers.push('rgb(255, 255, 255)');
    return layers.reverse();
  }

  // Paint a stack of layers and read the resulting pixel.
  function __compositeStack(layers) {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    for (const l of layers) {
      ctx.fillStyle = l;
      ctx.fillRect(0, 0, 1, 1);
    }
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return [r, g, b];
  }

  /**
   * Every visible control inside \`root\` whose composited text colour measures
   * below \`floor\` against its own painted background.
   *
   * The floor is 3.0 rather than AA's 4.5 on purpose: this hunts for an
   * INVISIBLE control (a ratio near 1), which is the defect class. Judging
   * every link at AA text contrast is axe's job, and a deliberate
   * de-emphasis like the footer's \`text-background/50\` copyright would fail
   * 4.5 by design.
   */
  function __lowContrastControls(root, floor) {
    if (!root) return null;
    const out = [];
    for (const el of root.querySelectorAll('a, button')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const cs = getComputedStyle(el);
      // The element itself is part of the stack: its own background may be a
      // translucent layer over an opaque ancestor.
      const layers = __bgLayers(el);
      const bg = __compositeStack(layers);
      const fg = __compositeStack(layers.concat([cs.color]));
      if (!fg || !bg) continue;
      const lf = __relLum(fg), lb = __relLum(bg);
      const ratio = (Math.max(lf, lb) + 0.05) / (Math.min(lf, lb) + 0.05);
      if (ratio < floor) {
        out.push({
          label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40),
          color: cs.color,
          layers: layers,
          painted: 'rgb(' + fg.join(', ') + ') on rgb(' + bg.join(', ') + ')',
          ratio: Number(ratio.toFixed(2)),
        });
      }
    }
    return out;
  }
`;

/** Floor used by the chrome specs. See the doc on `__lowContrastControls`. */
export const INVISIBLE_FLOOR = 3;
