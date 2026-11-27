/**
 * One shape for the desktop header's three popups (search, Hub, You): same
 * offset, width, height cap and surface, and all aligned to the right edge of
 * the header row, so switching from one to another does not move the panel.
 */
export const HEADER_MENU_PROPS = { align: 'end', sideOffset: 8, collisionPadding: 8 } as const;

export const HEADER_MENU_CLASS =
  'max-h-[var(--radix-popover-content-available-height)] w-[min(32rem,calc(100vw-2rem))] overflow-y-auto bg-card backdrop-blur-none';

/** The icon whose popup is open stays tinted, like its hover state. */
export const HEADER_TRIGGER_CLASS = 'hover:bg-muted data-[state=open]:bg-muted';

/**
 * Anchor for `<PopoverAnchor virtualRef>`: the content box of the header row
 * (`data-header-menus`), so every header popup shares its right edge.
 */
export const HEADER_MENU_ANCHOR = {
  current: {
    getBoundingClientRect: () => {
      const row = document.querySelector<HTMLElement>('[data-header-menus]');
      if (!row) return new DOMRect(window.innerWidth - 16, 0, 0, 64);
      const r = row.getBoundingClientRect();
      const pad = parseFloat(getComputedStyle(row).paddingRight) || 0;
      return new DOMRect(r.x, r.y, r.width - pad, r.height);
    },
  },
};
