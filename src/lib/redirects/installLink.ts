/** Construct a public entry point from an existing managed HTTPS short URL.
 * This does not authorize the host/app or create a private receipt. */
export function installEntryUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (
      /\s/.test(raw) ||
      Array.from(raw).some((char) => char.charCodeAt(0) < 32) ||
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      url.hash ||
      raw.length > 2048
    )
      return null;
    const reserved =
      /^(?:pw|password|qg_click_id|qg_handoff|qg_app_choice|qg_handoff_(?:token|app|action)|x-qg-handoff-(?:token|app|action))$/i;
    if ([...url.searchParams.keys()].some((key) => reserved.test(key))) return null;
    const campaign = new URLSearchParams(url.search);
    url.search = 'qg_handoff=install';
    for (const [key, value] of campaign) url.searchParams.append(key, value);
    return url.href.length <= 2048 ? url.href : null;
  } catch {
    return null;
  }
}
