import { Collapsible, CollapsibleTrigger, CollapsibleContent, Button } from 'queer-guide';
import { ChevronsUpDown } from 'lucide-react';

// Inline border — 1px hsl(var(--border)) class borders wash out in the
// downscaled capture sheet; the muted fill keeps the rows legible.
const row: React.CSSProperties = {
  border: '1px solid hsl(var(--border))',
  borderRadius: 8,
  padding: '8px 16px',
  backgroundColor: 'hsl(var(--muted) / 0.4)',
};

export const SafetyNotesCollapsible = () => (
  <div className="w-[480px]">
    <Collapsible open className="space-y-2">
      <div className="flex items-center justify-between gap-4">
        <h4 className="text-sm font-semibold">Safety notes — Marrakech</h4>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" aria-label="Toggle safety notes">
            <ChevronsUpDown className="h-4 w-4" />
          </Button>
        </CollapsibleTrigger>
      </div>
      <div className="text-sm" style={row}>
        Same-sex relations are criminalized under Article 489.
      </div>
      <CollapsibleContent className="space-y-2">
        <div className="text-sm text-muted-foreground" style={row}>
          Avoid dating apps on local networks; entrapment cases have been reported.
        </div>
        <div className="text-sm text-muted-foreground" style={row}>
          Book accommodation listed as couple-friendly by verified hosts.
        </div>
      </CollapsibleContent>
    </Collapsible>
  </div>
);
