/**
 * Non-color token editors for the Tokens tab: typography ramp, radii, motion.
 * Each renders a live preview at the draft value plus a compact input with
 * default/overridden state and per-token reset.
 */
import { RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GLOBAL_TOKENS, resolveGlobal, type GlobalTokenDef } from './tokenCatalog';
import type { DesignSettingsController } from './useDesignSettings';

function GlobalTokenInput({
  token,
  controller,
}: {
  token: GlobalTokenDef;
  controller: DesignSettingsController;
}) {
  const value = resolveGlobal(controller.draft, token.key);
  const overridden = controller.draft.tokens?.global?.[token.key] !== undefined;
  const error = controller.validationErrors[`tokens.global.${token.key}`];
  return (
    <div>
      <div className="flex items-center gap-2">
        <Input
          value={value}
          aria-invalid={!!error}
          onChange={(e) => controller.setTokenOverride('global', token.key, e.target.value)}
          className={`h-8 font-mono text-13 ${token.kind === 'transition' ? 'w-72' : 'w-28'} ${error ? 'border-destructive' : ''}`}
          aria-label={`--${token.key}`}
        />
        {overridden ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={`Reset --${token.key}`}
            onClick={() => controller.setTokenOverride('global', token.key, null)}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Badge variant="outline" className="text-2xs text-muted-foreground">
            default
          </Badge>
        )}
      </div>
      {error && <p className="mt-1 text-2xs text-destructive">{error}</p>}
    </div>
  );
}

const byKey = new Map(GLOBAL_TOKENS.map((t) => [t.key, t]));

export function TypographySection({ controller }: { controller: DesignSettingsController }) {
  const sizes = GLOBAL_TOKENS.filter((t) => t.kind === 'size');
  const { draft } = controller;
  return (
    <div className="space-y-4">
      {sizes.map((token) => {
        const lhKey = `${token.key}--line-height`;
        const lhToken = byKey.get(lhKey);
        const size = resolveGlobal(draft, token.key);
        const lineHeight = lhToken ? resolveGlobal(draft, lhKey) : undefined;
        const display = ['text-hero-xl', 'text-hero', 'text-display', 'text-headline-lg', 'text-headline'].includes(
          token.key,
        );
        return (
          <div key={token.key} className="border-b border-border-hairline pb-4 last:border-b-0">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-2xs uppercase tracking-wide text-muted-foreground">
                {token.label} · --{token.key}
              </span>
              <div className="flex items-center gap-4">
                <GlobalTokenInput token={token} controller={controller} />
                {lhToken && <GlobalTokenInput token={lhToken} controller={controller} />}
              </div>
            </div>
            <p
              className={`truncate ${display ? 'font-display' : ''}`}
              style={{ fontSize: size, lineHeight }}
            >
              Queer spaces, everywhere
            </p>
          </div>
        );
      })}
      {(['tracking-label'] as const).map((key) => {
        const token = byKey.get(key)!;
        return (
          <div key={key} className="flex items-center justify-between gap-4">
            <span
              className="text-2xs uppercase text-muted-foreground"
              style={{ letterSpacing: resolveGlobal(draft, key) }}
            >
              {token.label} preview
            </span>
            <GlobalTokenInput token={token} controller={controller} />
          </div>
        );
      })}
    </div>
  );
}

export function RadiusSection({ controller }: { controller: DesignSettingsController }) {
  const radii = GLOBAL_TOKENS.filter((t) => t.kind === 'radius');
  return (
    <div className="grid gap-6 sm:grid-cols-3">
      {radii.map((token) => (
        <div key={token.key} className="space-y-2">
          <div
            className="h-20 w-full border bg-muted"
            style={{ borderRadius: resolveGlobal(controller.draft, token.key) }}
            aria-hidden
          />
          <p className="text-2xs uppercase tracking-wide text-muted-foreground">{token.label}</p>
          <GlobalTokenInput token={token} controller={controller} />
        </div>
      ))}
    </div>
  );
}

export function MotionSection({ controller }: { controller: DesignSettingsController }) {
  const token = byKey.get('transition-smooth')!;
  const value = resolveGlobal(controller.draft, 'transition-smooth');
  return (
    <div className="space-y-2">
      <p className="text-2xs uppercase tracking-wide text-muted-foreground">{token.label}</p>
      <div className="flex flex-wrap items-center gap-4">
        <GlobalTokenInput token={token} controller={controller} />
        <button
          type="button"
          className="rounded-element border bg-background px-4 py-2 text-13 hover:bg-muted"
          style={{ transition: value }}
        >
          Hover to preview
        </button>
      </div>
      <p className="text-2xs text-muted-foreground">
        Applied everywhere the app uses --transition-smooth. Format: property duration easing.
      </p>
    </div>
  );
}
