/**
 * Manual selection mode — content script attaches a transient mouseup
 * listener; the next selected text + its closest semantic block is sent
 * to the popup as a low-confidence "manual" item which the user then
 * classifies and edits.
 */
import type { DetectedItem } from "../shared/types";

const HINT_ID = "qg-selection-hint";

function showHint() {
  if (document.getElementById(HINT_ID)) return;
  const el = document.createElement("div");
  el.id = HINT_ID;
  el.textContent = "queer.guide: select text, then release";
  Object.assign(el.style, {
    position: "fixed",
    bottom: "16px",
    right: "16px",
    background: "#111",
    color: "#fff",
    padding: "8px 12px",
    borderRadius: "8px",
    font: "13px system-ui",
    zIndex: "2147483647",
  });
  document.body.appendChild(el);
}

function removeHint() {
  document.getElementById(HINT_ID)?.remove();
}

function captureOnce() {
  const sel = window.getSelection();
  const text = sel?.toString().trim();
  if (!text) return;
  const anchor = sel?.anchorNode?.parentElement?.closest("article, section, main, div") ?? null;
  const item: DetectedItem = {
    entity_type: "place",
    raw_data: {
      name: text.slice(0, 120),
      description: anchor?.textContent?.trim().slice(0, 1000) ?? text,
      url: location.href,
    },
    confidence: 0.25,
    extraction_method: "manual",
    source_url: location.href,
  };
  chrome.runtime.sendMessage({ type: "qg:extracted", items: [item], manual: true });
  removeHint();
  document.removeEventListener("mouseup", captureOnce, true);
}

showHint();
document.addEventListener("mouseup", captureOnce, true);
