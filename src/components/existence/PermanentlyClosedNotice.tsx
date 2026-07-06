import { AlertCircle } from 'lucide-react';

/**
 * Tombstone banner for an entity the Existence Truth Engine archived as no longer
 * existing. Shown above (dimmed) detail content — the page stays reachable for SEO
 * noindex + reversal, unlike the sign-in GatedDetailFallback. Reversible by an admin.
 */
export function PermanentlyClosedNotice({ lastVerifiedAt, kind = 'place' }: { lastVerifiedAt?: string | null; kind?: string }) {
  return (
    <div className="flex items-start gap-2 rounded-container border border-border bg-muted/40 p-4">
      <AlertCircle size={18} className="mt-0.5 shrink-0 text-muted-foreground" />
      <div className="flex flex-col gap-0.5">
        <span className="font-medium">This {kind} appears to be permanently closed.</span>
        <span className="text-13 text-muted-foreground">
          {lastVerifiedAt ? `Last verified ${new Date(lastVerifiedAt).toLocaleDateString()}. ` : ''}
          Know otherwise? Use “Report as closed” to let us know it’s still here.
        </span>
      </div>
    </div>
  );
}
