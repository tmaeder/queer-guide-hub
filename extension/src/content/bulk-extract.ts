/**
 * M8.2 — list-page extractor. Scans every JSON-LD <script> on the active
 * page (Eventbrite listings, Etsy search results, etc.) and forwards
 * every recognized item to the background. The default extract.ts already
 * handles single-detail pages; this one is opt-in for "import all".
 */
import { extractAll } from "../shared/extractors";

(function run() {
  try {
    const { items, diagnostics } = extractAll(document, location.href);
    chrome.runtime.sendMessage({ type: "qg:extracted", items, diagnostics, bulk: true });
  } catch (err) {
    chrome.runtime.sendMessage({
      type: "qg:extracted",
      items: [],
      bulk: true,
      error: err instanceof Error ? err.message : String(err),
    });
  }
})();
