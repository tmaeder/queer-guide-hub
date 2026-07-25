import { useEffect, useState, type CSSProperties } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FONT_SLOTS, type BrandingDoc } from './tokenCatalog';

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

function SpecimenBody() {
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

/** Custom-font vars for the preview container (family only — @font-face is
 * loaded imperatively below so the preview reflects an uploaded webfont). */
function fontVarsOf(doc: BrandingDoc): CSSProperties {
  const style: Record<string, string> = {};
  for (const slot of FONT_SLOTS) {
    const s = doc.fonts?.[slot.key];
    if (s?.family && s.files?.length) {
      const fallback =
        slot.key === 'display'
          ? "'Space Grotesk','Inter',system-ui,sans-serif"
          : "'Inter',system-ui,sans-serif";
      style[slot.cssVar] = `'${s.family}',${fallback}`;
    }
  }
  return style as CSSProperties;
}

/** Load the draft's custom fonts via the FontFace API so the preview updates. */
function useDraftFonts(doc: BrandingDoc) {
  const key = JSON.stringify(doc.fonts ?? {});
  useEffect(() => {
    if (typeof document === 'undefined' || !('fonts' in document)) return;
    const added: FontFace[] = [];
    for (const slot of FONT_SLOTS) {
      const s = doc.fonts?.[slot.key];
      if (!s?.family || !s.files?.length) continue;
      for (const f of s.files) {
        if (!f.url) continue;
        try {
          const face = new FontFace(s.family, `url(${f.url}) format('woff2')`, {
            weight: f.weight || '400',
            style: f.style || 'normal',
            display: 'swap',
          });
          face.load().then((loaded) => document.fonts.add(loaded)).catch(() => {});
          added.push(face);
        } catch {
          /* invalid descriptor — ignore, preview falls back to default */
        }
      }
    }
    return () => {
      for (const face of added) {
        try {
          document.fonts.delete(face);
        } catch {
          /* not added yet */
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

/**
 * A self-contained specimen sheet rendered from a branding doc — light + dark
 * side by side. Reused by the publish dialog for a published-vs-draft compare.
 */
export function TokenSpecimen({ doc, label }: { doc: BrandingDoc; label?: string }) {
  useDraftFonts(doc);
  const rootVars: CSSProperties = {
    ...varsOf(doc.tokens?.global),
    ...varsOf(doc.tokens?.light),
    ...fontVarsOf(doc),
  };
  const darkVars = varsOf(doc.tokens?.dark);
  return (
    <div>
      {label && <p className="mb-1 text-2xs uppercase tracking-wide text-muted-foreground">{label}</p>}
      <div className="overflow-hidden rounded-container border" style={rootVars}>
        <SpecimenBody />
        <div className="dark" style={darkVars}>
          <SpecimenBody />
        </div>
      </div>
    </div>
  );
}

type CbMode = 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia';

// Standard color-vision-deficiency simulation matrices.
const CB_MATRICES: Record<Exclude<CbMode, 'none'>, string> = {
  protanopia: '0.567 0.433 0 0 0  0.558 0.442 0 0 0  0 0.242 0.758 0 0  0 0 0 1 0',
  deuteranopia: '0.625 0.375 0 0 0  0.7 0.3 0 0 0  0 0.3 0.7 0 0  0 0 0 1 0',
  tritanopia: '0.95 0.05 0 0 0  0 0.433 0.567 0 0  0 0.475 0.525 0 0  0 0 0 1 0',
};

export function TokenPreviewPanel({ draft }: { draft: BrandingDoc }) {
  const [width, setWidth] = useState<'desktop' | 'mobile'>('desktop');
  const [cb, setCb] = useState<CbMode>('none');
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-2xs uppercase tracking-wide text-muted-foreground">Live preview (draft)</p>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-element border">
            {(['desktop', 'mobile'] as const).map((w) => (
              <Button
                key={w}
                variant={width === w ? 'secondary' : 'ghost'}
                size="sm"
                className="rounded-none capitalize"
                onClick={() => setWidth(w)}
              >
                {w}
              </Button>
            ))}
          </div>
          <Select value={cb} onValueChange={(v) => setCb(v as CbMode)}>
            <SelectTrigger className="h-8 w-40 text-13">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Typical vision</SelectItem>
              <SelectItem value="protanopia">Protanopia</SelectItem>
              <SelectItem value="deuteranopia">Deuteranopia</SelectItem>
              <SelectItem value="tritanopia">Tritanopia</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Hidden filters for color-vision-deficiency simulation. */}
      <svg aria-hidden="true" className="absolute h-0 w-0">
        <defs>
          {Object.entries(CB_MATRICES).map(([mode, values]) => (
            <filter key={mode} id={`cb-${mode}`}>
              <feColorMatrix type="matrix" values={values} />
            </filter>
          ))}
        </defs>
      </svg>

      <div
        className={width === 'mobile' ? 'mx-auto max-w-[375px]' : ''}
        style={cb === 'none' ? undefined : { filter: `url(#cb-${cb})` }}
      >
        <TokenSpecimen doc={draft} />
      </div>
      {cb !== 'none' && (
        <p className="text-2xs text-muted-foreground">
          Simulation mainly affects the chromatic feedback tokens (destructive / warning) — the rest
          of the system is monochrome.
        </p>
      )}
    </div>
  );
}
