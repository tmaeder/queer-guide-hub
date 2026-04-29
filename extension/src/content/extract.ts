/**
 * Content script — injected on demand by the popup via chrome.scripting.
 * Runs the extractor pipeline against the live document and returns the
 * detected items via chrome.runtime.sendMessage. Kept tiny: no UI, no
 * network, no storage — just DOM read + return.
 */
import { extractAll } from "../shared/extractors";

(async function run() {
  try {
    const { items, diagnostics } = extractAll(document, location.href);
    chrome.runtime.sendMessage({ type: "qg:extracted", items, diagnostics });
  } catch (err) {
    chrome.runtime.sendMessage({
      type: "qg:extracted",
      items: [],
      error: err instanceof Error ? err.message : String(err),
    });
  }
})();
