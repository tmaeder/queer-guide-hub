import { useEffect, useState } from "react";
import { addWatched, bulkSubmit, findExisting, fetchMySubmissions, listWatched, removeWatched, submitItem, type ExistingMatch, type SubmissionRow, type WatchedRow } from "../shared/api";
import {
  clearSession,
  getValidAccessToken,
  loadSession,
} from "../shared/auth";
import type { AuthSession, DetectedItem } from "../shared/types";
import { ItemCard } from "./ItemCard";

type Toast = { kind: "ok" | "err"; msg: string } | null;
type Tab = "detect" | "history" | "watched";

export function App() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [items, setItems] = useState<DetectedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast>(null);
  const [tab, setTab] = useState<Tab>("detect");
  const [history, setHistory] = useState<SubmissionRow[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [existing, setExisting] = useState<ExistingMatch | null>(null);
  const [watched, setWatched] = useState<WatchedRow[] | null>(null);
  const [watchError, setWatchError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function lookupForUrl(url: string | undefined) {
      if (!url) return;
      try {
        const match = await findExisting(url);
        if (!cancelled) setExisting(match);
      } catch {
        // best-effort; silent
      }
    }

    void (async () => {
      setSession(await loadSession());

      // Cache hit?
      const cached = await chrome.runtime.sendMessage({ type: "qg:get-results" });
      if (cancelled) return;
      if (cached?.items?.length) {
        const cachedItems = cached.items as DetectedItem[];
        setItems(cachedItems);
        setLoading(false);
        void lookupForUrl(cachedItems[0]?.source_url);
        return;
      }

      // Kick off extraction in parallel, don't await.
      void chrome.runtime.sendMessage({ type: "qg:extract", mode: "auto" });

      // Poll every 80ms until items arrive or timeout (2s). The content
      // script normally finishes in 50-150ms; the old fixed 600ms wait was
      // pure overhead.
      const start = Date.now();
      while (!cancelled && Date.now() - start < 2000) {
        await new Promise((r) => setTimeout(r, 80));
        const r2 = await chrome.runtime.sendMessage({ type: "qg:get-results" });
        if (cancelled) return;
        if (r2?.items?.length) {
          const fresh = r2.items as DetectedItem[];
          setItems(fresh);
          setLoading(false);
          void lookupForUrl(fresh[0]?.source_url);
          return;
        }
        if (r2?.error) {
          setToast({ kind: "err", msg: r2.error });
          break;
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  async function onSubmit(item: DetectedItem, edited: Record<string, unknown>) {
    const token = await getValidAccessToken();
    if (!token) {
      setToast({ kind: "err", msg: "not signed in" });
      return;
    }
    try {
      const merged: DetectedItem = { ...item, raw_data: { ...item.raw_data, ...edited } };
      const res = await submitItem(merged, token);
      setToast({ kind: "ok", msg: `submitted (#${res.submission_id})` });
    } catch (err) {
      setToast({ kind: "err", msg: err instanceof Error ? err.message : "submit failed" });
    }
  }

  async function onPickSelection() {
    const r = await chrome.runtime.sendMessage({ type: "qg:extract", mode: "manual" });
    if (!r?.ok) setToast({ kind: "err", msg: r?.error ?? "selection mode failed" });
    window.close();
  }

  async function onBulkSubmit() {
    if (items.length === 0) return;
    const token = await getValidAccessToken();
    if (!token) { setToast({ kind: "err", msg: "not signed in" }); return; }
    try {
      const res = await bulkSubmit(items, token);
      setToast({ kind: "ok", msg: `submitted ${res.submissions.length} items` });
    } catch (e) {
      setToast({ kind: "err", msg: e instanceof Error ? e.message : "bulk submit failed" });
    }
  }

  async function loadHistory() {
    setHistory(null);
    setHistoryError(null);
    const token = await getValidAccessToken();
    if (!token) { setHistoryError("not signed in"); return; }
    try {
      setHistory(await fetchMySubmissions(token));
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : "failed");
    }
  }

  async function loadWatched() {
    setWatched(null);
    setWatchError(null);
    const token = await getValidAccessToken();
    if (!token) { setWatchError("not signed in"); return; }
    try {
      setWatched(await listWatched(token));
    } catch (e) {
      setWatchError(e instanceof Error ? e.message : "failed");
    }
  }

  useEffect(() => {
    if (session && tab === "history" && history === null && !historyError) {
      void loadHistory();
    }
    if (session && tab === "watched" && watched === null && !watchError) {
      void loadWatched();
    }
  }, [session, tab, history, historyError, watched, watchError]);

  if (!session) return <Login onSignedIn={setSession} />;

  return (
    <div>
      <header className="qg-header">
        <h1>queer.guide capture</h1>
        <div className="qg-user">
          {session.user.email}{" "}
          <button onClick={async () => { await clearSession(); setSession(null); }}>sign out</button>
        </div>
      </header>
      <div className="qg-tabs">
        <button
          className={tab === "detect" ? "active" : ""}
          onClick={() => setTab("detect")}
        >Detect</button>
        <button
          className={tab === "history" ? "active" : ""}
          onClick={() => setTab("history")}
        >Submissions</button>
        <button
          className={tab === "watched" ? "active" : ""}
          onClick={() => setTab("watched")}
        >Watched</button>
      </div>
      {toast && <div className={`qg-toast ${toast.kind}`}>{toast.msg}</div>}
      {tab === "detect" && (
        loading ? (
          <div className="qg-empty">scanning page…</div>
        ) : items.length === 0 ? (
          <div className="qg-empty">
            <p>nothing detected on this page</p>
            <button onClick={onPickSelection}>pick selection</button>
          </div>
        ) : (
          <div className="qg-list">
            {items.length > 1 && (
              <button className="primary" onClick={onBulkSubmit}>
                submit all {items.length} items
              </button>
            )}
            {items.map((item, i) => (
              <ItemCard key={i} item={item} existing={i === 0 ? existing : null} onSubmit={(e) => onSubmit(item, e)} />
            ))}
            <button onClick={async () => {
              const token = await getValidAccessToken();
              if (!token) return;
              const url = items[0]?.source_url;
              if (!url) return;
              try { await addWatched(url, token); setToast({ kind: "ok", msg: "watching this URL" }); }
              catch (e) { setToast({ kind: "err", msg: e instanceof Error ? e.message : "failed" }); }
            }}>watch this page</button>
            <button onClick={onPickSelection}>pick selection instead</button>
          </div>
        )
      )}
      {tab === "history" && (
        <HistoryView rows={history} error={historyError} onReload={loadHistory} />
      )}
      {tab === "watched" && (
        <WatchedView rows={watched} error={watchError} onReload={loadWatched} onRemove={async (id) => {
          const token = await getValidAccessToken();
          if (!token) return;
          try { await removeWatched(id, token); await loadWatched(); }
          catch (e) { setToast({ kind: "err", msg: e instanceof Error ? e.message : "failed" }); }
        }} />
      )}
    </div>
  );
}

function WatchedView({
  rows,
  error,
  onReload,
  onRemove,
}: {
  rows: WatchedRow[] | null;
  error: string | null;
  onReload: () => void;
  onRemove: (id: string) => void;
}) {
  if (error) return (
    <div className="qg-empty">
      <p>{error}</p>
      <button onClick={onReload}>retry</button>
    </div>
  );
  if (rows === null) return <div className="qg-empty">loading…</div>;
  if (rows.length === 0) return <div className="qg-empty">no watched URLs.</div>;
  return (
    <div className="qg-list">
      {rows.map((r) => (
        <div key={r.id} className="qg-item">
          <div className="qg-name" style={{ wordBreak: "break-all" }}>{shortUrl(r.url)}</div>
          <div className="qg-meta">
            checks every {r.frequency_minutes} min ·{" "}
            {r.last_checked_at ? `last ${new Date(r.last_checked_at).toLocaleString()}` : "never checked"}
          </div>
          <div className="qg-actions">
            <button onClick={() => onRemove(r.id)}>remove</button>
          </div>
        </div>
      ))}
    </div>
  );
}


function HistoryView({
  rows,
  error,
  onReload,
}: {
  rows: SubmissionRow[] | null;
  error: string | null;
  onReload: () => void;
}) {
  if (error) {
    return (
      <div className="qg-empty">
        <p>could not load history: {error}</p>
        <button onClick={onReload}>retry</button>
      </div>
    );
  }
  if (rows === null) return <div className="qg-empty">loading…</div>;
  if (rows.length === 0) return <div className="qg-empty">no submissions yet.</div>;
  return (
    <div className="qg-list">
      {rows.map((r) => (
        <div key={r.id} className="qg-item">
          <div className="qg-item-head">
            <span className="qg-type">{r.content_type}</span>
            <span className={`qg-confidence ${historyClass(r.status)}`}>{r.status}</span>
          </div>
          <div className="qg-name">
            {String((r.data as { name?: string }).name ?? (r.data as { title?: string }).title ?? "(unnamed)")}
          </div>
          {r.source_url && (
            <a className="qg-meta" href={r.source_url} target="_blank" rel="noreferrer">{shortUrl(r.source_url)}</a>
          )}
          <div className="qg-meta">{new Date(r.submitted_at).toLocaleString()}</div>
        </div>
      ))}
    </div>
  );
}

function historyClass(status: string): string {
  if (status === "promoted" || status === "approved") return "hi";
  if (status === "rejected" || status === "spam") return "lo";
  return "";
}

function shortUrl(u: string): string {
  try { return new URL(u).host + new URL(u).pathname.slice(0, 30); } catch { return u; }
}

function Login({ onSignedIn }: { onSignedIn: (s: AuthSession) => void }) {
  // Poll chrome.storage every 800ms — when the user signs in on queer.guide
  // the content-script bridge writes a session, and we want the popup to
  // pick it up without needing a manual reopen.
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    timer = setInterval(async () => {
      const s = await loadSession();
      if (s) {
        if (timer) clearInterval(timer);
        onSignedIn(s);
      }
    }, 800);
    return () => { if (timer) clearInterval(timer); };
  }, [onSignedIn]);

  return (
    <div className="qg-login">
      <h2 style={{ margin: 0 }}>Sign in to queer.guide</h2>
      <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>
        Sign in on the website — the extension picks up your session automatically.
      </p>
      <button
        className="primary"
        onClick={() => chrome.tabs.create({ url: "https://queer.guide/extension" })}
      >
        Open queer.guide
      </button>
      <p style={{ margin: 0, fontSize: 11, color: "var(--muted)" }}>
        Already signed in? Visit <code>queer.guide/extension</code> and click Connect.
      </p>
    </div>
  );
}
