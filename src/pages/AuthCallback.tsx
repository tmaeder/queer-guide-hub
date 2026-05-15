import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Magic-link / OAuth redirect target. Supports both Supabase auth flows:
 *
 *   - Implicit (default for /auth/v1/otp without PKCE): tokens land in the
 *     URL hash fragment as `#access_token=…&refresh_token=…`.
 *   - PKCE: code lands as `?code=…` and we exchange it via
 *     `supabase.auth.exchangeCodeForSession`.
 *
 * For Chrome extension sign-in (`?ext=<extension-id>`) we forward the
 * tokens (implicit) or code (PKCE) to the extension via
 * `chrome.runtime.sendMessage`. The extension declares this origin as
 * `externally_connectable` so the message crosses process boundaries.
 *
 * Falls back to showing the payload so the user can complete sign-in
 * manually if the extension is not installed in the same browser.
 */
export default function AuthCallback() {
  const [status, setStatus] = useState<
    "working" | "ok" | "ext-ok" | "manual" | "error"
  >("working");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [manualPayload, setManualPayload] = useState<string | null>(null);

  useEffect(() => {
    void run();
  }, []);

  async function run() {
    try {
      const search = new URLSearchParams(window.location.search);
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const extId = search.get("ext");

      const code = search.get("code");
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      const expiresIn = parseInt(hash.get("expires_in") ?? "3600", 10);
      const tokenError = search.get("error_description") ?? hash.get("error_description");

      if (tokenError) throw new Error(tokenError);

      if (!code && !accessToken) {
        throw new Error("missing auth code or token");
      }

      // Extension flow: forward whatever Supabase gave us so the extension
      // can persist its own session in chrome.storage.
      if (extId) {
        const ok = await sendToExtension(extId, {
          type: "qg:auth",
          code,
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_in: expiresIn,
        });
        if (ok) {
          setStatus("ext-ok");
          return;
        }
        // Extension not installed in this browser → fall through to manual.
        setManualPayload(JSON.stringify(
          accessToken
            ? { access_token: accessToken, refresh_token: refreshToken, expires_in: expiresIn }
            : { code },
          null, 2,
        ));
        setStatus("manual");
        return;
      }

      // Web flow.
      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) throw error;
      } else if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) throw error;
      }
      setStatus("ok");
      setTimeout(() => { window.location.href = "/"; }, 600);
    } catch (e) {
      setStatus("error");
      setErrorMsg(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-card border rounded-element p-6 space-y-3">
        {status === "working" && <p>Signing you in…</p>}
        {status === "ok" && <p>Signed in. Redirecting…</p>}
        {status === "ext-ok" && (
          <>
            <h1 className="text-lg font-semibold">Extension signed in</h1>
            <p className="text-sm text-muted-foreground">
              You can close this tab and return to the queer.guide extension.
            </p>
          </>
        )}
        {status === "manual" && (
          <>
            <h1 className="text-lg font-semibold">Almost there</h1>
            <p className="text-sm text-muted-foreground">
              The extension was not detected on this device. Copy the payload below and paste it into the extension popup.
            </p>
            <pre className="bg-muted p-3 rounded text-xs break-all select-all">{manualPayload}</pre>
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

async function sendToExtension(extId: string, payload: Record<string, unknown>): Promise<boolean> {
  const w = window as unknown as {
    chrome?: {
      runtime?: {
        sendMessage?: (id: string, msg: unknown, cb: (r: unknown) => void) => void;
      };
    };
  };
  if (!w.chrome?.runtime?.sendMessage) return false;
  return await new Promise<boolean>((resolve) => {
    try {
      w.chrome!.runtime!.sendMessage!(extId, payload, (res) => {
        const r = res as { ok?: boolean } | undefined;
        resolve(!!r?.ok);
      });
    } catch {
      resolve(false);
    }
  });
}
