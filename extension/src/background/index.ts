/**
 * Service worker — message bus between popup and content script, plus the
 * web→extension auth bridge.
 */
import { submitItem } from "../shared/api";
import { getValidAccessToken, persistSharedSession } from "../shared/auth";
import type { ExtractDiagnostics } from "../shared/extractors";
import type { DetectedItem } from "../shared/types";

interface ExtractResult {
  items: DetectedItem[];
  diagnostics?: ExtractDiagnostics;
  error?: string;
}

const lastResults = new Map<number, ExtractResult>();

const BADGE_COLOR = "#d4007f";

const KNOWN_URLS_API = `${import.meta.env.VITE_SUBMIT_API}/known-urls`;
const KNOWN_URLS_TTL_MS = 60 * 60 * 1000;
let knownUrlsCache: { fetched: number; payload: unknown } | null = null;

async function getKnownUrls(): Promise<unknown> {
  if (knownUrlsCache && Date.now() - knownUrlsCache.fetched < KNOWN_URLS_TTL_MS) {
    return knownUrlsCache.payload;
  }
  const res = await fetch(KNOWN_URLS_API);
  if (!res.ok) throw new Error(`known-urls ${res.status}`);
  const payload = await res.json();
  knownUrlsCache = { fetched: Date.now(), payload };
  return payload;
}

function updateBadge(tabId: number, items: DetectedItem[]): void {
  const text = items.length > 0 ? String(items.length) : "";
  void chrome.action.setBadgeBackgroundColor({ tabId, color: BADGE_COLOR }).catch(() => {});
  void chrome.action.setBadgeText({ tabId, text }).catch(() => {});
}

chrome.tabs.onRemoved.addListener((tabId) => {
  lastResults.delete(tabId);
});

const OVERLAY_FLAG_KEY = "qg_overlay_enabled";

async function overlayEnabled(): Promise<boolean> {
  const out = await chrome.storage.local.get(OVERLAY_FLAG_KEY);
  return out[OVERLAY_FLAG_KEY] === true;
}

async function hasAllUrlsPermission(): Promise<boolean> {
  return await chrome.permissions.contains({ origins: ["<all_urls>"] });
}

chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.status !== "complete") return;
  if (!tab.url || !tab.url.startsWith("http")) return;
  if (tab.url.includes("queer.guide/")) return;
  if (!(await overlayEnabled())) return;
  if (!(await hasAllUrlsPermission())) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["src/content/overlay.ts"],
    });
  } catch {
    // Permission revoked or restricted page — silent.
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "qg:extracted" && sender.tab?.id != null) {
    const items = (msg.items ?? []) as DetectedItem[];
    const diagnostics = msg.diagnostics as ExtractDiagnostics | undefined;
    lastResults.set(sender.tab.id, { items, diagnostics, error: msg.error });
    updateBadge(sender.tab.id, items);
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
  if (msg?.type === "qg:known-urls") {
    void getKnownUrls().then((payload) => sendResponse({ payload })).catch(() => sendResponse({ payload: null }));
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

/**
 * Keyboard-shortcut path: cmd/ctrl+shift+Q runs the manual selection
 * extractor and submits the first detected item without opening the popup.
 * The user gets a Chrome notification when it lands. Requires an active
 * Supabase session — silent failure if not signed in.
 */
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "qg-submit-selection") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  if (tab.url?.startsWith("chrome://") || tab.url?.startsWith("chrome-extension://")) return;

  const token = await getValidAccessToken();
  if (!token) {
    void chrome.action.setBadgeText({ tabId: tab.id, text: "?" });
    void chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: "#b91c1c" });
    return;
  }

  lastResults.delete(tab.id);
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["src/content/selection.ts"],
  });

  const start = Date.now();
  while (Date.now() - start < 8000) {
    await new Promise((r) => setTimeout(r, 150));
    const cached = lastResults.get(tab.id);
    if (!cached?.items?.length) continue;
    const item = cached.items[0]!;
    try {
      await submitItem(item, token);
      void chrome.action.setBadgeText({ tabId: tab.id, text: "✓" });
      void chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: BADGE_COLOR });
      setTimeout(() => updateBadge(tab.id!, lastResults.get(tab.id!)?.items ?? []), 2500);
    } catch {
      void chrome.action.setBadgeText({ tabId: tab.id, text: "!" });
      void chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: "#b91c1c" });
    }
    return;
  }
});

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
