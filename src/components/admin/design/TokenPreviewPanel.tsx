import type { CSSProperties } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { BrandingDoc } from './tokenCatalog';

/**
 * Scoped live preview of the draft tokens. Sets only the OVERRIDDEN custom
 * properties inline on a container — everything else cascades from the real
 * stylesheet, so this is an honest render of what production would ship.
 * The nested `.dark` block works because the dark variant is defined as
 * `&:where(.dark, .dark *)` and the stylesheet's own `.dark { … }` rule beats
 * inherited light values on the child.
 */
function varsOf(entries: Record<string, string> | undefined): CSSProperties {
  const style: Record<string, string> = {};
  for (const [k, v] of Object.entries(entries ?? {})) style[`--${k}`] = v;
  return style as CSSProperties;
}

function Specimen() {
  return (
    <div className="space-y-4 bg-background p-4 text-foreground">
      <p className="font-display text-headline">Aa — Display heading</p>
      <p className="text-15 text-muted-foreground">
        Body copy at 15px with muted foreground. Inline <a href="#preview">link style</a> included.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm">Primary</Button>
        <Button size="sm" variant="outline">
          Outline
        </Button>
        <Button size="sm" variant="destructive">
          Destructive
        </Button>
        <Badge>Badge</Badge>
        <Badge variant="outline">Outline</Badge>
      </div>
      <Input placeholder="Input field" className="max-w-56" />
      <div className="rounded-container border bg-card p-4 text-card-foreground">
        <p className="text-title font-medium">Card title</p>
        <p className="mt-1 text-13 text-muted-foreground">
          Card body on --card with --border at container radius.
        </p>
        <div className="mt-2 flex gap-2">
          <span className="rounded-badge bg-muted px-2 py-0.5 text-2xs uppercase tracking-wide text-muted-foreground">
            Chip
          </span>
          <span className="rounded-badge border px-2 py-0.5 text-2xs uppercase tracking-wide">
            Tag
          </span>
        </div>
      </div>
    </div>
  );
}

export function TokenPreviewPanel({ draft }: { draft: BrandingDoc }) {
  const globalAndLight: CSSProperties = {
    ...varsOf(draft.tokens?.global),
    ...varsOf(draft.tokens?.light),
  };
  const darkVars = varsOf(draft.tokens?.dark);
  return (
    <div className="space-y-4">
      <p className="text-2xs uppercase tracking-wide text-muted-foreground">Live preview (draft)</p>
      <div className="overflow-hidden rounded-container border" style={globalAndLight}>
        <Specimen />
        <div className="dark" style={darkVars}>
          <Specimen />
        </div>
      </div>
    </div>
  );
}
