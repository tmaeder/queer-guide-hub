/**
 * Service worker — message bus between popup and content script, plus the
 * OAuth/magic-link redirect handler. Most logic lives in shared/, this file
 * just wires Chrome APIs together.
 */
import { exchangeCodeForSession } from "../shared/auth";
import type { DetectedItem } from "../shared/types";

interface ExtractResult {
  items: DetectedItem[];
  error?: string;
}

const lastResults = new Map<number, ExtractResult>();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "qg:extracted" && sender.tab?.id != null) {
    lastResults.set(sender.tab.id, { items: msg.items ?? [], error: msg.error });
    return; // no response
  }
  if (msg?.type === "qg:get-results") {
    chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      const tabId = tabs[0]?.id;
      if (tabId == null) return sendResponse({ items: [] });
      sendResponse(lastResults.get(tabId) ?? { items: [] });
    });
    return true; // async response
  }
  if (msg?.type === "qg:extract") {
    runExtraction(msg.mode === "manual" ? "selection" : "auto").then(sendResponse);
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

// Magic-link redirect handling: Supabase redirects to a queer.guide URL with
// `?code=…` after the user clicks the email link. The web app's auth-callback
// page posts the code into this extension via chrome.runtime.sendMessage from
// an externally_connectable origin (configured per deployment) OR — simpler
// path used here — the user copy-pastes the code from the redirect page back
// into the popup.
chrome.runtime.onMessageExternal.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "qg:auth-code" && typeof msg.code === "string") {
    exchangeCodeForSession(msg.code)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  return undefined;
});
