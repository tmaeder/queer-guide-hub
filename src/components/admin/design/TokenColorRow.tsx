import { useMemo } from 'react';
import { RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { contrastVerdict, hslChannelsToCss, parseHslChannels } from '@/lib/wcagContrast';
import {
  CONTRAST_PAIRS,
  resolveColor,
  type BrandingDoc,
  type ColorTokenDef,
} from './tokenCatalog';
import type { DesignSettingsController } from './useDesignSettings';

function ChannelEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const parsed = parseHslChannels(value) ?? [0, 0, 0];
  const update = (idx: 0 | 1 | 2, raw: string) => {
    const n = Number(raw);
    if (Number.isNaN(n) || n < 0) return;
    const next: [number, number, number] = [...parsed] as [number, number, number];
    next[idx] = Math.min(idx === 0 ? 360 : 100, n);
    onChange(`${next[0]} ${next[1]}% ${next[2]}%`);
  };
  return (
    <div className="space-y-2">
      <div
        className="h-16 w-full rounded-element border"
        style={{ backgroundColor: hslChannelsToCss(value) }}
        aria-hidden
      />
      <div className="grid grid-cols-3 gap-2">
        {(['H', 'S %', 'L %'] as const).map((label, idx) => (
          <div key={label}>
            <Label className="text-2xs uppercase tracking-wide text-muted-foreground">{label}</Label>
            <Input
              type="number"
              step="0.1"
              min={0}
              max={idx === 0 ? 360 : 100}
              value={parsed[idx]}
              onChange={(e) => update(idx as 0 | 1 | 2, e.target.value)}
              className="h-8"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function ModeSwatch({
  token,
  mode,
  draft,
  controller,
}: {
  token: ColorTokenDef;
  mode: 'light' | 'dark';
  draft: BrandingDoc;
  controller: DesignSettingsController;
}) {
  const value = resolveColor(draft, token.key, mode);
  const overridden = draft.tokens?.[mode]?.[token.key] !== undefined;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`h-8 w-14 rounded-badge border ${overridden ? 'ring-2 ring-ring ring-offset-1' : ''}`}
          style={{ backgroundColor: hslChannelsToCss(value) }}
          aria-label={`Edit --${token.key} (${mode}): ${value}`}
          title={`${mode}: ${value}${overridden ? ' (overridden)' : ''}`}
        />
      </PopoverTrigger>
      <PopoverContent className="w-72" align="start">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-mono text-13">--{token.key} · {mode}</span>
          {overridden && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-2xs"
              onClick={() => controller.setTokenOverride(mode, token.key, null)}
            >
              <RotateCcw className="mr-1 h-3 w-3" /> Reset
            </Button>
          )}
        </div>
        <ChannelEditor
          value={value}
          onChange={(next) => controller.setTokenOverride(mode, token.key, next)}
        />
        <p className="mt-2 text-2xs text-muted-foreground">Default: {token[mode]}</p>
      </PopoverContent>
    </Popover>
  );
}

export function TokenColorRow({
  token,
  controller,
}: {
  token: ColorTokenDef;
  controller: DesignSettingsController;
}) {
  const { draft } = controller;
  const overridden =
    draft.tokens?.light?.[token.key] !== undefined || draft.tokens?.dark?.[token.key] !== undefined;

  // Contrast: evaluate the first pair this token participates in, per mode.
  const pair = useMemo(
    () => CONTRAST_PAIRS.find((p) => p.fg === token.key || p.bg === token.key),
    [token.key],
  );
  const verdicts = useMemo(() => {
    if (!pair) return null;
    return (['light', 'dark'] as const).map((mode) => ({
      mode,
      verdict: contrastVerdict(resolveColor(draft, pair.fg, mode), resolveColor(draft, pair.bg, mode)),
    }));
  }, [pair, draft]);

  return (
    <div className="flex items-center gap-4 border-b border-border-hairline py-2 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-mono text-13">--{token.key}</span>
          {overridden ? (
            <Badge className="text-2xs">overridden</Badge>
          ) : (
            <Badge variant="outline" className="text-2xs text-muted-foreground">
              default
            </Badge>
          )}
        </div>
        {verdicts && (
          <div className="mt-1 flex gap-2">
            {verdicts.map(({ mode, verdict }) =>
              verdict ? (
                <span
                  key={mode}
                  className={`text-2xs ${verdict.aa ? 'text-muted-foreground' : verdict.aaLarge ? 'text-muted-foreground' : 'text-destructive'}`}
                  title={`${pair!.label} · ${mode}`}
                >
                  {mode}: {verdict.ratio}:1{' '}
                  {verdict.aaa ? 'AAA' : verdict.aa ? 'AA' : verdict.aaLarge ? 'AA-large' : 'FAIL'}
                </span>
              ) : null,
            )}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <ModeSwatch token={token} mode="light" draft={draft} controller={controller} />
        <ModeSwatch token={token} mode="dark" draft={draft} controller={controller} />
      </div>
    </div>
  );
}
