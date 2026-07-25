import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  COLOR_TOKENS,
  GLOBAL_TOKENS,
  CONTRAST_PAIRS,
  COLOR_GROUP_LABELS,
  type ColorGroup,
} from '@/components/admin/design/tokenCatalog';
import { contrastVerdict, hslChannelsToCss } from '@/lib/wcagContrast';

const GROUP_ORDER: ColorGroup[] = ['core', 'surface', 'text', 'sidebar', 'feedback'];

/**
 * Public, read-only brand & design-system guideline page. Renders the compiled-in token
 * system (single source: tokenCatalog.ts) with live WCAG verdicts, the type & radius scales,
 * and links to the Brand Token API for the fully-resolved (branding-overridden) set.
 */
export default function BrandGuidelines() {
  const colorByKey = useMemo(() => new Map(COLOR_TOKENS.map((t) => [t.key, t])), []);
  const sizeTokens = GLOBAL_TOKENS.filter((g) => g.kind === 'size');
  const radiusTokens = GLOBAL_TOKENS.filter((g) => g.kind === 'radius');

  return (
    <div className="max-w-screen-lg mx-auto px-6 py-16 flex flex-col gap-16">
      {/* Hero */}
      <header className="flex flex-col gap-4">
        <p className="text-2xs uppercase tracking-wider text-muted-foreground">Brand system</p>
        <h1 className="font-display text-display">Queer Guide design system</h1>
        <p className="text-body-lg text-muted-foreground max-w-2xl">
          A strict monochrome, high-contrast system. Colors are HSL channel triples; type and shape
          use a fixed scale. The live, branding-resolved values are available via the Token API below.
        </p>
      </header>

      {/* Colors */}
      <section className="flex flex-col gap-8">
        <h2 className="font-display text-headline">Color</h2>
        {GROUP_ORDER.map((group) => {
          const tokens = COLOR_TOKENS.filter((t) => t.group === group);
          if (tokens.length === 0) return null;
          return (
            <div key={group} className="flex flex-col gap-4">
              <h3 className="text-title">{COLOR_GROUP_LABELS[group]}</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {tokens.map((t) => (
                  <div key={t.key} className="border border-border rounded-element overflow-hidden">
                    <div className="grid grid-cols-2 h-16">
                      <div style={{ backgroundColor: hslChannelsToCss(t.light) }} aria-hidden />
                      <div style={{ backgroundColor: hslChannelsToCss(t.dark) }} aria-hidden />
                    </div>
                    <div className="p-2 flex flex-col gap-0.5">
                      <code className="text-xs2 truncate">--{t.key}</code>
                      <span className="text-3xs text-muted-foreground">L {t.light}</span>
                      <span className="text-3xs text-muted-foreground">D {t.dark}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </section>

      {/* Contrast */}
      <section className="flex flex-col gap-4">
        <h2 className="font-display text-headline">Contrast (WCAG 2.2, light mode)</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {CONTRAST_PAIRS.map((pair) => {
            const fg = colorByKey.get(pair.fg);
            const bg = colorByKey.get(pair.bg);
            if (!fg || !bg) return null;
            const v = contrastVerdict(fg.light, bg.light);
            return (
              <div
                key={pair.label}
                className="flex items-center justify-between border border-border rounded-element p-4"
                style={{ backgroundColor: hslChannelsToCss(bg.light), color: hslChannelsToCss(fg.light) }}
              >
                <span className="text-15">{pair.label}</span>
                <span className="flex items-center gap-2">
                  <span className="text-13 tabular-nums">{v ? `${v.ratio}:1` : '—'}</span>
                  <Badge variant={v?.aa ? 'default' : 'destructive'} className="text-2xs">
                    {v?.aaa ? 'AAA' : v?.aa ? 'AA' : v?.aaLarge ? 'AA Large' : 'Fail'}
                  </Badge>
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Typography */}
      <section className="flex flex-col gap-4">
        <h2 className="font-display text-headline">Type scale</h2>
        <div className="flex flex-col divide-y divide-border border border-border rounded-container">
          {sizeTokens.map((g) => (
            <div key={g.key} className="flex items-baseline justify-between gap-4 p-4">
              <span className="truncate" style={{ fontSize: g.default, lineHeight: 1.1 }}>
                {g.label}
              </span>
              <code className="text-xs2 text-muted-foreground shrink-0">
                --{g.key} · {g.default}
              </code>
            </div>
          ))}
        </div>
      </section>

      {/* Radius */}
      <section className="flex flex-col gap-4">
        <h2 className="font-display text-headline">Shape</h2>
        <div className="grid grid-cols-3 gap-4">
          {radiusTokens.map((g) => (
            <div key={g.key} className="flex flex-col items-center gap-2">
              <div
                className="w-full h-20 bg-muted border border-border"
                style={{ borderRadius: g.default }}
              />
              <code className="text-xs2 text-muted-foreground text-center">
                --{g.key} · {g.default}
              </code>
            </div>
          ))}
        </div>
      </section>

      {/* Token API */}
      <section className="flex flex-col gap-4">
        <h2 className="font-display text-headline">Token API</h2>
        <p className="text-body-lg text-muted-foreground max-w-2xl">
          The fully-resolved token set (defaults with any published branding overrides applied) is
          served as data for design tools and third-party consumers.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle className="text-base">JSON</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-2">
              <a href="/brand/tokens.json" className="text-15 underline">/brand/tokens.json</a>
              <p className="text-13 text-muted-foreground">Structured color (light/dark) + global tokens.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">CSS</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-2">
              <a href="/brand/tokens.css" className="text-15 underline">/brand/tokens.css</a>
              <p className="text-13 text-muted-foreground">Ready-to-link :root + .dark custom properties.</p>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
