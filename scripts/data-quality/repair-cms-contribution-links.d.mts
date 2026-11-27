/** Labels in CMS contribution copy and the page each one should link to. */
export const LINKS: ReadonlyArray<readonly [label: string, href: string]>;

/**
 * Wrap each bold label from LINKS in a link to its page, once. Returns the new
 * HTML and the labels it linked; already-linked labels are left alone.
 */
export function linkInvitations(html: string | null | undefined): { html: string; linked: string[] };
