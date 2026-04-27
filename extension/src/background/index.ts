/**
 * Service worker — message bus between popup and content script, plus the
 * web→extension auth bridge.
 */
import { persistSharedSession } from "../shared/auth";
import type { DetectedItem } from "../shared/types";

interface ExtractResult {
  items: DetectedItem[];
  error?: string;
}

const lastResults = new Map<number, ExtractResult>();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "qg:extracted" && sender.tab?.id != null) {
    lastResults.set(sender.tab.id, { items: msg.items ?? [], error: msg.error });
    return;
  }
  if (msg?.type === "qg:get-results") {
    chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      const tabId = tabs[0]?.id;
      if (tabId == null) return sendResponse({ items: [] });
      sendResponse(lastResults.get(tabId) ?? { items: [] });
    });
    return true;
  }
  if (msg?.type === "qg:extract") {
    runExtraction(msg.mode === "manual" ? "selection" : "auto").then(sendResponse);
    return true;
  }
  if (msg?.type === "qg:store-session" && msg.session) {
    persistSharedSession(msg.session)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  return undefined;
});

async function runExtraction(mode: "auto" | "selection"): Promise<{ ok: boolean; error?: string }> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return { ok: false, error: "no_active_tab" };
  if (tab.url?.startsWith("chrome://") || tab.url?.startsWith("chrome-extension://")) {
    return { ok: false, error: "unsupported_url" };
  }
  lastResults.delete(tab.id);
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: [mode === "auto" ? "src/content/extract.ts" : "src/content/selection.ts"],
  });
  return { ok: true };
}

// External messages from queer.guide (AuthCallback magic-link bridge) — kept
// for backwards compat with the magic-link flow, though the page-bridge
// content-script flow above is now the primary path.
chrome.runtime.onMessageExternal.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "qg:auth" && (msg.access_token || msg.code)) {
    persistSharedSession({
      access_token: msg.access_token,
      refresh_token: msg.refresh_token,
      expires_in: msg.expires_in,
    })
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  return undefined;
});
