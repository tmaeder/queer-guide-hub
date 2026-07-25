/**
 * Brand Token API composer. Produces the EFFECTIVE design-token set = compiled-in
 * defaults (from src/components/admin/design/tokenCatalog.ts — the single source that is
 * drift-tested against src/index.css) overlaid with the published site_branding overrides.
 *
 * tokenCatalog.ts is pure data with no imports, so it is safe to reuse in the edge bundle
 * — this keeps the API zero-drift instead of maintaining a third copy of the defaults.
 */
import { COLOR_TOKENS, GLOBAL_TOKENS } from '../../src/components/admin/design/tokenCatalog';
import type { BrandingDoc } from './branding';

export interface ResolvedTokens {
  color: { light: Record<string, string>; dark: Record<string, string> };
  global: Record<string, string>;
}

export function resolveTokens(doc: BrandingDoc | null): ResolvedTokens {
  const light: Record<string, string> = {};
  const dark: Record<string, string> = {};
  for (const t of COLOR_TOKENS) {
    light[t.key] = doc?.tokens?.light?.[t.key] ?? t.light;
    dark[t.key] = doc?.tokens?.dark?.[t.key] ?? t.dark;
  }
  const global: Record<string, string> = {};
  for (const g of GLOBAL_TOKENS) {
    global[g.key] = doc?.tokens?.global?.[g.key] ?? g.default;
  }
  return { color: { light, dark }, global };
}

/** Structured JSON payload for design-tool / third-party consumers. */
export function tokensToJson(resolved: ResolvedTokens) {
  return {
    $description:
      'Queer Guide design tokens. Colors are HSL channel triples ("H S% L%"); wrap as hsl(var(--token)).',
    color: resolved.color,
    global: resolved.global,
  };
}

/** Ready-to-link stylesheet: :root (light + global) + .dark overrides. Mirrors src/index.css. */
export function tokensToCss(resolved: ResolvedTokens): string {
  const decl = (rec: Record<string, string>) =>
    Object.entries(rec)
      .map(([k, v]) => `  --${k}: ${v};`)
      .join('\n');
  return (
    `:root {\n${decl(resolved.global)}\n${decl(resolved.color.light)}\n}\n\n` +
    `.dark {\n${decl(resolved.color.dark)}\n}\n`
  );
}
