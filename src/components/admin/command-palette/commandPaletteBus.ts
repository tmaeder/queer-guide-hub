/**
 * Tiny event bus to open the admin command palette from anywhere (e.g. a
 * clickable ⌘K chip) without threading state through context. The palette host
 * listens for OPEN_COMMAND_PALETTE_EVENT.
 */
export const OPEN_COMMAND_PALETTE_EVENT = 'admin:open-command-palette';

export function openAdminCommandPalette() {
  window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE_EVENT));
}
