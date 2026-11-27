/**
 * One shape for the desktop header's three popups (search, Hub, You): anchored
 * under the icon, right-aligned, same offset, width, height cap and surface.
 */
export const HEADER_MENU_PROPS = { align: 'end', sideOffset: 8, collisionPadding: 8 } as const;

export const HEADER_MENU_CLASS =
  'max-h-[var(--radix-popover-content-available-height)] w-[min(32rem,calc(100vw-2rem))] overflow-y-auto bg-card backdrop-blur-none';
