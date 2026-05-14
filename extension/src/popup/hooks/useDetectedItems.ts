import { useEffect, useState } from "react";
import { renderUrl } from "../../shared/api";
import { getValidAccessToken } from "../../shared/auth";
import type { ExtractDiagnostics } from "../../shared/extractors";
import type { DetectedItem } from "../../shared/types";

interface State {
  items: DetectedItem[];
  diagnostics: ExtractDiagnostics | null;
  loading: boolean;
  error: string | null;
}

/**
 * Drives the popup's "what did we find on this tab?" pipeline:
 *   1. ask the background cache
 *   2. else trigger a fresh extraction + poll for ~2s
 *   3. else fall back to the worker /render endpoint for SPAs
 *
 * Lives in a hook so App.tsx stays declarative and so the polling /
 * render-fallback logic can be tested in isolation.
 */
export function useDetectedItems(): State {
  const [items, setItems] = useState<DetectedItem[]>([]);
  const [diagnostics, setDiagnostics] = useState<ExtractDiagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const cached = await chrome.runtime.sendMessage({ type: "qg:get-results" });
      if (cancelled) return;
      if (cached?.diagnostics) setDiagnostics(cached.diagnostics);
      if (cached?.items?.length) {
        setItems(cached.items as DetectedItem[]);
        setLoading(false);
        return;
      }
      void chrome.runtime.sendMessage({ type: "qg:extract", mode: "auto" });
      const start = Date.now();
      while (!cancelled && Date.now() - start < 2000) {
        await new Promise((r) => setTimeout(r, 80));
        const r2 = await chrome.runtime.sendMessage({ type: "qg:get-results" });
        if (cancelled) return;
        if (r2?.diagnostics) setDiagnostics(r2.diagnostics);
        if (r2?.items?.length) {
          setItems(r2.items as DetectedItem[]);
          setLoading(false);
          return;
        }
        if (r2?.error) {
          setError(r2.error);
          break;
        }
      }
      if (!cancelled) {
        const fallback = await renderFallback();
        if (cancelled) return;
        if (fallback.length > 0) {
          setItems(fallback);
        }
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { items, diagnostics, loading, error };
}

async function renderFallback(): Promise<DetectedItem[]> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabUrl = tab?.url ?? "";
  if (!tabUrl.startsWith("http") || tabUrl.includes("queer.guide/")) return [];
  const token = await getValidAccessToken();
  if (!token) return [];
  try { return await renderUrl(tabUrl, token); } catch { return []; }
}
