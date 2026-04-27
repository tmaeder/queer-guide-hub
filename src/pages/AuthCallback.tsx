import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Magic-link / OAuth redirect target. Handles two callers:
 *
 * 1. Web app sign-in — exchanges the `code` query param for a session and
 *    bounces to the home page.
 *
 * 2. Chrome extension sign-in — when launched with `?ext=<extension-id>`
 *    we forward the auth code (or freshly-minted session) to the
 *    extension via `chrome.runtime.sendMessage`. The extension declares us
 *    as an `externally_connectable` origin so this works across processes.
 *
 * Falls back to showing the code so the user can paste it manually if the
 * extension is not installed in the same browser.
 */
export default function AuthCallback() {
  const [status, setStatus] = useState<"working" | "ok" | "ext-ok" | "manual" | "error">("working");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => {
    void run();
  }, []);

  async function run() {
    try {
      const params = new URLSearchParams(window.location.search);
      const codeParam = params.get("code");
      const extId = params.get("ext");
      setCode(codeParam);

      // Extension flow: forward the code as-is. The extension exchanges it
      // itself with its own client so the session lives in chrome.storage,
      // not the web localStorage.
      if (extId && codeParam) {
        const w = window as unknown as {
          chrome?: { runtime?: { sendMessage?: (id: string, msg: unknown, cb: (r: unknown) => void) => void } };
        };
        if (w.chrome?.runtime?.sendMessage) {
          await new Promise<void>((resolve, reject) => {
            w.chrome!.runtime!.sendMessage!(
              extId,
              { type: "qg:auth-code", code: codeParam },
              (res) => {
                const r = res as { ok?: boolean; error?: string } | undefined;
                if (r?.ok) resolve();
                else reject(new Error(r?.error ?? "extension did not acknowledge"));
              },
            );
          });
          setStatus("ext-ok");
          return;
        }
        // Extension not installed in this browser → fall through to manual.
        setStatus("manual");
        return;
      }

      // Web flow.
      if (codeParam) {
        const { error } = await supabase.auth.exchangeCodeForSession(codeParam);
        if (error) throw error;
        setStatus("ok");
        setTimeout(() => { window.location.href = "/"; }, 600);
        return;
      }

      throw new Error("missing auth code");
    } catch (e) {
      setStatus("error");
      setErrorMsg(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-card border rounded-lg p-6 space-y-3">
        {status === "working" && <p>Signing you in…</p>}
        {status === "ok" && <p>Signed in. Redirecting…</p>}
        {status === "ext-ok" && (
          <>
            <h1 className="text-lg font-semibold">Extension signed in</h1>
            <p className="text-sm text-muted-foreground">You can close this tab and return to the queer.guide extension.</p>
          </>
        )}
        {status === "manual" && (
          <>
            <h1 className="text-lg font-semibold">Almost there</h1>
            <p className="text-sm text-muted-foreground">
              The extension was not detected on this device. Copy the code below and paste it into the extension popup.
            </p>
            <pre className="bg-muted p-3 rounded text-xs break-all select-all">{code}</pre>
          </>
        )}
        {status === "error" && (
          <>
            <h1 className="text-lg font-semibold text-destructive">Sign-in failed</h1>
            <p className="text-sm">{errorMsg}</p>
          </>
        )}
      </div>
    </div>
  );
}
