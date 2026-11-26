import type { HubTabId } from './HubPanel';

/** Ask whichever Hub menu is on screen (header popover or dock sheet) to open on a tab. */
export const OPEN_HUB_EVENT = 'qg:open-hub';

export function openHubMenu(tab: HubTabId) {
  window.dispatchEvent(new CustomEvent<HubTabId>(OPEN_HUB_EVENT, { detail: tab }));
}
