import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Download, Puzzle, Wand2, ShieldCheck, Bug } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useLocalizedNavigate } from "@/hooks/useLocalizedNavigate";

const RELEASE_ZIP_URL = "/extension/queer-guide-extension.zip";
const DEV_BUILD_DOC =
  "https://github.com/tmaeder/queer-guide-search/tree/main/extension#build--install-developer-mode";

/**
 * Public install page for registered users. The extension is loaded as
 * an unpacked dev build for now (no Web Store listing yet) so we cannot
 * reliably detect installation from the page.
 */
export default function ExtensionInstall() {
  const { user } = useAuth();
  const navigate = useLocalizedNavigate();

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
      </div>

      <InstallSteps />

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

function InstallSteps() {
  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-xl">Install in 3 steps</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <Step n={1} title="Download the latest build">
          <p className="text-sm text-muted-foreground mb-3">
            We don&apos;t have the extension on the Chrome Web Store yet. For now, grab the latest signed build from GitHub Releases.
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
            <li>
              Open <code>chrome://extensions</code> in a new tab.
            </li>
            <li>Toggle <strong>Developer mode</strong> on (top right).</li>
            <li>
              Click <strong>Load unpacked</strong> and pick the unzipped folder.
            </li>
            <li>The magenta puzzle icon shows up — pin it for one-click access.</li>
          </ol>
          <p className="text-xs text-muted-foreground mt-2">
            Other Chromium browsers (Edge, Brave, Arc) work the same way. Firefox / Safari are not supported yet.
          </p>
        </Step>

        <Step n={3} title="Sign in &amp; capture">
          <ol className="list-decimal pl-5 text-sm space-y-1">
            <li>Click the puzzle icon and enter your queer.guide email.</li>
            <li>Click the magic link we email you.</li>
            <li>The popup will sign in automatically and start scanning the page you&apos;re on.</li>
          </ol>
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

