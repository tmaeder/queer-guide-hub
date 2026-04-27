import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  Download,
  Puzzle,
  Wand2,
  ShieldCheck,
  Bug,
  Link2,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useLocalizedNavigate } from "@/hooks/useLocalizedNavigate";
import { supabase } from "@/integrations/supabase/client";

const RELEASE_ZIP_URL = "/extension/queer-guide-extension.zip";
const DEV_BUILD_DOC =
  "https://github.com/tmaeder/queer-guide-search/tree/main/extension#build--install-developer-mode";

interface ExtMeta {
  id: string;
  version?: string;
}

type ConnectStatus = "idle" | "connecting" | "connected" | "error";

/**
 * Public install page for registered users. Listens for a `qg-extension-ready`
 * window message that the extension's content-script bridge posts on every
 * queer.guide page load — if heard, we know the extension is installed and
 * offer a one-click "Connect" button that forwards the user's current
 * Supabase session into the extension. No magic-link round-trip.
 */
export default function ExtensionInstall() {
  const { user } = useAuth();
  const navigate = useLocalizedNavigate();
  const [ext, setExt] = useState<ExtMeta | null>(null);
  const [status, setStatus] = useState<ConnectStatus>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.source !== window) return;
      if (e.origin !== window.location.origin) return;
      const data = e.data as { type?: string; id?: string; version?: string; ok?: boolean } | undefined;
      if (data?.type === "qg-extension-ready" && typeof data.id === "string") {
        setExt({ id: data.id, version: data.version });
      }
      if (data?.type === "qg-session-ack") {
        setStatus(data.ok ? "connected" : "error");
        if (!data.ok) setErrorMsg("Extension did not accept the session.");
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  async function connect() {
    setStatus("connecting");
    setErrorMsg(null);
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) throw new Error("no active session — please sign in first");
      window.postMessage(
        {
          type: "qg-share-session",
          session: {
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            expires_in: data.session.expires_in,
            user: { id: data.session.user.id, email: data.session.user.email },
          },
        },
        window.location.origin,
      );
      // ack arrives via the message listener above
    } catch (e) {
      setStatus("error");
      setErrorMsg(e instanceof Error ? e.message : String(e));
    }
  }

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-12 max-w-2xl text-center">
        <h1 className="text-2xl font-semibold mb-3">Sign in to install the extension</h1>
        <p className="text-muted-foreground mb-6">
          The queer.guide capture extension lets signed-in members suggest venues, events, hotels and more from any webpage.
        </p>
        <Button onClick={() => navigate("/auth")}>Sign in</Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-10 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <Puzzle className="h-8 w-8" />
        <div>
          <h1 className="text-3xl font-bold">queer.guide capture</h1>
          <p className="text-muted-foreground">
            Browser extension that turns any webpage into a structured suggestion for our moderators.
          </p>
        </div>
        <div className="ml-auto">
          {ext && <Badge variant="default" className="gap-1"><CheckCircle2 className="h-4 w-4" /> Installed</Badge>}
        </div>
      </div>

      {ext ? (
        <ConnectCard
          status={status}
          ext={ext}
          onConnect={connect}
          errorMsg={errorMsg}
          userEmail={user.email ?? null}
        />
      ) : (
        <InstallSteps />
      )}

      <Highlights />

      <div className="mt-10 text-sm text-muted-foreground">
        Found a bug?{" "}
        <a
          className="underline inline-flex items-center gap-1"
          href="https://github.com/tmaeder/queer-guide-search/issues/new"
          target="_blank"
          rel="noreferrer"
        >
          <Bug className="h-3 w-3" /> open an issue
        </a>
        .
      </div>
    </div>
  );
}

function ConnectCard({
  status,
  ext,
  onConnect,
  errorMsg,
  userEmail,
}: {
  status: ConnectStatus;
  ext: ExtMeta;
  onConnect: () => void;
  errorMsg: string | null;
  userEmail: string | null;
}) {
  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-xl flex items-center gap-2">
          <Link2 className="h-5 w-5" />
          Connect this browser
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p>
          Extension <code>{ext.id.slice(0, 6)}…</code>{ext.version ? ` v${ext.version}` : ""} is installed in this browser.
        </p>
        {status === "connected" ? (
          <div className="rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 p-3">
            <p className="font-medium">Connected.</p>
            <p className="text-muted-foreground">
              Open the extension popup on any page to capture content for queer.guide.
            </p>
          </div>
        ) : (
          <>
            <p className="text-muted-foreground">
              Sign your queer.guide session into the extension so you can submit content from any webpage. {userEmail ? <>Signed in as <strong>{userEmail}</strong>.</> : null}
            </p>
            <Button onClick={onConnect} disabled={status === "connecting"}>
              {status === "connecting" ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Connecting…</> : "Connect"}
            </Button>
            {status === "error" && errorMsg && (
              <p className="text-xs text-destructive">{errorMsg}</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function InstallSteps() {
  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-xl">Install in 3 steps</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <Step n={1} title="Download the latest build">
          <p className="text-sm text-muted-foreground mb-3">
            We don&apos;t have the extension on the Chrome Web Store yet. For now, grab the latest signed build.
          </p>
          <Button asChild>
            <a href={RELEASE_ZIP_URL} target="_blank" rel="noreferrer">
              <Download className="h-4 w-4 mr-2" />
              Download .zip
            </a>
          </Button>
          <p className="text-xs text-muted-foreground mt-2">
            Unzip it somewhere you won&apos;t accidentally delete (e.g. <code>~/Applications/queer-guide-extension</code>).
          </p>
        </Step>

        <Step n={2} title="Load it in Chrome">
          <ol className="list-decimal pl-5 text-sm space-y-1">
            <li>Open <code>chrome://extensions</code> in a new tab.</li>
            <li>Toggle <strong>Developer mode</strong> on (top right).</li>
            <li>Click <strong>Load unpacked</strong> and pick the unzipped folder.</li>
            <li>The magenta puzzle icon shows up — pin it for one-click access.</li>
          </ol>
          <p className="text-xs text-muted-foreground mt-2">
            Other Chromium browsers (Edge, Brave, Arc) work the same way. Firefox / Safari are not supported yet.
          </p>
        </Step>

        <Step n={3} title="Reload this page and Connect">
          <p className="text-sm">
            Once Chrome confirms the extension loaded, refresh this page. A &ldquo;Connect&rdquo; button will appear and one click signs the extension into your queer.guide account.
          </p>
        </Step>

        <p className="text-xs text-muted-foreground">
          Want to build it yourself or contribute?{" "}
          <a className="underline" href={DEV_BUILD_DOC} target="_blank" rel="noreferrer">
            Build instructions
          </a>
          .
        </p>
      </CardContent>
    </Card>
  );
}

function Highlights() {
  return (
    <div className="grid sm:grid-cols-3 gap-3">
      <Highlight icon={<Wand2 className="h-5 w-5" />} title="Smart capture">
        Reads JSON-LD, OpenGraph, microdata and DOM heuristics — most pages just work.
      </Highlight>
      <Highlight icon={<ShieldCheck className="h-5 w-5" />} title="Privacy-first">
        Only runs when you click. No host permissions, no background tracking.
      </Highlight>
      <Highlight icon={<CheckCircle2 className="h-5 w-5" />} title="Always reviewed">
        Submissions land in a moderation queue, never live until approved.
      </Highlight>
    </div>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold">
        {n}
      </div>
      <div className="flex-1">
        <h3 className="font-semibold mb-1">{title}</h3>
        {children}
      </div>
    </div>
  );
}

function Highlight({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center gap-2 mb-1 font-semibold">{icon}{title}</div>
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  );
}
