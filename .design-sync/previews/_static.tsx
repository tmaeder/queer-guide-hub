// Shared static-capture helper. The capture harness freezes the page clock,
// so motion/react intro animations (inline opacity/transform) and the
// .img-lazy-fade load transition never reach their settled state. Rendering
// <StaticState /> in a preview forces final values — visually identical to
// the settled app state.
export const StaticState = () => (
  <style>{`
    [style*="transform"]{opacity:1!important;transform:none!important}
    .img-lazy-fade{opacity:1!important}
  `}</style>
);

// Stronger variant for components whose root animates opacity WITHOUT a
// transform (e.g. AnimatePresence fade-ins). Forces every inline-styled
// element to full opacity — don't use where a static opacity is intentional
// (EmptyState's dimmed icon).
export const StaticStateAll = () => (
  <style>{`
    [style]{opacity:1!important;transform:none!important}
    .img-lazy-fade{opacity:1!important}
  `}</style>
);

// Radix CSS keyframe animations also freeze under the fixed clock: Accordion
// open panels stick at height 0, tab panels stick half-faded. Render this in
// previews of Accordion/Tabs/Collapsible-style components.
export const StaticRadix = () => (
  <style>{`
    [data-state="open"][data-slot], [data-state="open"]{animation:none!important}
    [data-state="active"]{animation:none!important;opacity:1!important}
    .animate-accordion-down,.animate-accordion-up{animation:none!important;height:auto!important}
  `}</style>
);
