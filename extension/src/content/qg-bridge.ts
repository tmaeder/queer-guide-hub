/**
 * Content script that runs on queer.guide and bridges the page's Supabase
 * session into the extension. Two-step handshake:
 *
 *   1. Bridge announces the extension's runtime id by posting a message to
 *      the page (window.postMessage). The /extension page listens for this
 *      to know whether the extension is installed.
 *
 *   2. /extension page posts back a `qg-share-session` message with the
 *      current Supabase session tokens. Bridge forwards them to the
 *      background service worker which stores them in chrome.storage.local
 *      so the popup is signed in without a separate magic-link round-trip.
 *
 * The bridge ignores any messages that didn't come from the same window
 * (defence against framed pages) and only relays the predefined message
 * shape.
 */

interface SharedSession {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  user?: { id?: string; email?: string };
}

(function () {
  if ((window as unknown as { __qgBridgeMounted?: boolean }).__qgBridgeMounted) return;
  (window as unknown as { __qgBridgeMounted?: boolean }).__qgBridgeMounted = true;

  // Announce the extension id so the page can target sendMessage at us.
  window.postMessage(
    { type: "qg-extension-ready", id: chrome.runtime.id, version: chrome.runtime.getManifest().version },
    window.location.origin,
  );

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.origin !== window.location.origin) return;
    const data = event.data as { type?: string; session?: SharedSession } | undefined;
    if (data?.type !== "qg-share-session" || !data.session) return;

    chrome.runtime.sendMessage(
      { type: "qg:store-session", session: data.session },
      (res) => {
        const r = res as { ok?: boolean } | undefined;
        window.postMessage(
          { type: "qg-session-ack", ok: !!r?.ok },
          window.location.origin,
        );
      },
    );
  });
})();
