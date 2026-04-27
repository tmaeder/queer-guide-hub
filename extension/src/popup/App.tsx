import { useEffect, useState } from "react";
import { submitItem } from "../shared/api";
import {
  clearSession,
  exchangeCodeForSession,
  getValidAccessToken,
  loadSession,
  sendMagicLink,
} from "../shared/auth";
import type { AuthSession, DetectedItem } from "../shared/types";
import { ItemCard } from "./ItemCard";

type Toast = { kind: "ok" | "err"; msg: string } | null;

export function App() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [items, setItems] = useState<DetectedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast>(null);

  useEffect(() => {
    void (async () => {
      setSession(await loadSession());
      const result = await chrome.runtime.sendMessage({ type: "qg:get-results" });
      if (result?.items?.length) {
        setItems(result.items as DetectedItem[]);
        setLoading(false);
      } else {
        // No cached results — trigger a fresh extraction.
        const r = await chrome.runtime.sendMessage({ type: "qg:extract", mode: "auto" });
        if (!r?.ok) setToast({ kind: "err", msg: r?.error ?? "extraction failed" });
        // Background pushes results back; poll briefly.
        setTimeout(async () => {
          const r2 = await chrome.runtime.sendMessage({ type: "qg:get-results" });
          setItems((r2?.items as DetectedItem[]) ?? []);
          setLoading(false);
        }, 600);
      }
    })();
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
      {toast && <div className={`qg-toast ${toast.kind}`}>{toast.msg}</div>}
      {loading ? (
        <div className="qg-empty">scanning page…</div>
      ) : items.length === 0 ? (
        <div className="qg-empty">
          <p>nothing detected on this page</p>
          <button onClick={onPickSelection}>pick selection</button>
        </div>
      ) : (
        <div className="qg-list">
          {items.map((item, i) => (
            <ItemCard key={i} item={item} onSubmit={(e) => onSubmit(item, e)} />
          ))}
          <button onClick={onPickSelection}>pick selection instead</button>
        </div>
      )}
    </div>
  );
}

function Login({ onSignedIn }: { onSignedIn: (s: AuthSession) => void }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function doSendLink() {
    setBusy(true); setErr(null);
    try {
      const extId = chrome.runtime.id;
      const redirect = `https://queer.guide/auth/callback?ext=${encodeURIComponent(extId)}`;
      await sendMagicLink(email, redirect);
      setStage("code");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed");
    } finally { setBusy(false); }
  }

  async function doExchange() {
    setBusy(true); setErr(null);
    try {
      const session = await exchangeCodeForSession(code.trim());
      onSignedIn(session);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="qg-login">
      <h2 style={{ margin: 0 }}>Sign in to queer.guide</h2>
      {stage === "email" ? (
        <>
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button className="primary" disabled={busy || !email.includes("@")} onClick={doSendLink}>
            {busy ? "sending…" : "send magic link"}
          </button>
        </>
      ) : (
        <>
          <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>
            We mailed you a link. Open it on this device — the redirect page will show a one-time code. Paste it here.
          </p>
          <input placeholder="paste code" value={code} onChange={(e) => setCode(e.target.value)} />
          <button className="primary" disabled={busy || !code} onClick={doExchange}>
            {busy ? "verifying…" : "verify"}
          </button>
        </>
      )}
      {err && <div className="qg-toast err">{err}</div>}
    </div>
  );
}
