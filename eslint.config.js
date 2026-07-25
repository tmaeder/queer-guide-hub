import { fileURLToPath } from "node:url";
import path from "node:path";
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import jsxA11y from "eslint-plugin-jsx-a11y";
import unusedImports from "eslint-plugin-unused-imports";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import noSupabaseFromInPages from "./eslint-rules/no-supabase-from-in-pages.js";
import noSonnerToastObject from "./eslint-rules/no-sonner-toast-object.js";

// typescript-eslint v8 throws when its project-service auto-detect sees
// multiple candidate root dirs (here: repo root + scraper/). Pin it via
// fileURLToPath — works on every Node 14+ regardless of loader specifics
// (import.meta.dirname is newer and can be undefined under jiti).
const TSCONFIG_ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));

export default tseslint.config(
  {
    ignores: [
      "dist",
      "coverage",
      "src/integrations/supabase/types.ts",
      // Pre-existing botched-merge artifacts — files have parsing errors
      // unrelated to this branch. Tracked in
      // docs/audits/2026-05-events-audit/follow-ups.md.
      "functions/_middleware.ts",
      "functions/sitemap-places.xml.ts",
      "scripts/seo-check.mjs",
      "supabase/functions/pipeline-review-gate/index.ts",
      "supabase/functions/pipeline-apply-rules/index.ts",
      "src/pages/AdminIngestionRules.tsx",
      // Absorbed repos — not linted here
      "Dev/**",
      "client-sdk/**",
      // Separate tooling with own tsconfig
      "scripts/listen-triage/**",
      "listen/**",
      "infra/**",
      // Scraper is a separate workspace with its own package.json + tsconfig
      // + eslint.config.js. Including its files from the root parses them
      // against the root tsconfig, which typescript-eslint v8's
      // project-service then can't disambiguate (root + scraper/ both look
      // like valid tsconfig roots). Lint scraper from `cd scraper && npm run lint`.
      "scraper/**",
      // Legacy worker duplicates (superseded by workers/*/)
      "worker/**",
      "worker-ingest/**",
      // Parallel agent worktrees — files there belong to other branches and
      // race with concurrent edits, causing ENOENT during pre-push lint.
      ".claude/**",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended, prettier],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2024,
      globals: globals.browser,
      parserOptions: { tsconfigRootDir: TSCONFIG_ROOT_DIR },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      "jsx-a11y": jsxA11y,
      "unused-imports": unusedImports,
      "queerguide": { rules: { "no-supabase-from-in-pages": noSupabaseFromInPages, "no-sonner-toast-object": noSonnerToastObject } },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // eslint-plugin-react-hooks v7 ships a richer recommended set than v5.
      // Adopting v7 surfaces ~340 new errors across the app — mostly
      // set-state-in-effect, refs, immutability, and static-components patterns
      // that require app-wide refactor. Demote to warn for now so the plugin
      // upgrade lands cleanly; ratchet rules back to error one at a time as
      // sites are fixed.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/incompatible-library": "warn",
      "react-hooks/error-boundaries": "warn",
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "off",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      }],
      "no-case-declarations": "warn",
      // ESLint 10 promoted these to recommended-default error. 15 pre-existing
      // sites across edge functions + a handful of components fail. Demote to
      // warn for now; address in a follow-up codemod pass.
      "no-useless-assignment": "warn",
      "preserve-caught-error": "warn",
      // DUP-4 complete: pages and components both clean of inline
      // supabase.from(). Co-located use*Controller.{ts,tsx} files are
      // exempted in the rule itself.
      "queerguide/no-supabase-from-in-pages": "error",
      // Catch the sonner toast({...}) object-arg bug class (renders blank
      // toasts). Use toast.success(msg, { description }) / toast.error(...).
      "queerguide/no-sonner-toast-object": "error",
      // Accessibility rules (WCAG 2.2 AA)
      "jsx-a11y/alt-text": "error",
      "jsx-a11y/anchor-has-content": "error",
      "jsx-a11y/anchor-is-valid": "error",
      "jsx-a11y/aria-props": "error",
      "jsx-a11y/aria-proptypes": "error",
      "jsx-a11y/aria-role": "error",
      "jsx-a11y/aria-unsupported-elements": "error",
      // MUI migration complete (ADR 0001, 2026-05-25). No remaining violations.
      "jsx-a11y/click-events-have-key-events": "error",
      "jsx-a11y/heading-has-content": "error",
      "jsx-a11y/img-redundant-alt": "warn",
      "jsx-a11y/label-has-associated-control": "error",
      "jsx-a11y/no-noninteractive-element-interactions": "warn",
      "jsx-a11y/no-static-element-interactions": "warn",
      "jsx-a11y/role-has-required-aria-props": "error",
      "jsx-a11y/role-supports-aria-props": "error",
      // MUI migration complete (ADR 0001). Block any re-introduction.
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "@mui/material", message: "MUI migration complete (ADR 0001). Use shadcn/ui components + Tailwind. See docs/mui-to-shadcn-migration-recipe.md." },
            { name: "@mui/icons-material", message: "MUI migration complete (ADR 0001). Use lucide-react icons instead." },
            { name: "@mui/lab", message: "MUI migration complete (ADR 0001). Use shadcn/ui components + Tailwind." },
          ],
          patterns: [
            { group: ["@mui/*", "@mui/**"], message: "MUI migration complete (ADR 0001). Use shadcn/ui components + Tailwind. See docs/mui-to-shadcn-migration-recipe.md." },
          ],
        },
      ],
    },
  },
  // P2-1 — block hardcoded color literals outside theme/config files.
  // See docs/design-system/README.md and CLAUDE.md design section.
  {
    files: ["src/**/*.{ts,tsx}"],
    // Allowlist — see docs/design-system/README.md § Admin exceptions.
    // Admin status/data-viz files use functional traffic-light colors
    // (success/info/warning/error) by design, plus equality-score / SDG
    // gradient scales that are also functional encodings. The token rule
    // does not apply to these files.
    ignores: [
      "src/theme/**",
      "src/lib/animation.ts",
      "src/config/mapStyle.ts",
      "src/config/contentTypeRegistry.ts",
      "src/config/submissionRegistry.ts",
      "src/config/adminNavigation.ts",
      "src/integrations/supabase/types.ts",
      "src/**/__tests__/**",
      "src/test/**",
      // Functional color scales (equality score 0–100, SDG indicators).
      "src/utils/equalityScore.ts",
      "src/components/country/SDGDataPanel.tsx",
      "src/components/country/SafetyAlertBanner.tsx",
      // Cities directory chip uses the equality-score functional scale dot.
      "src/pages/cities/EqualityChip.tsx",
      // Cities map paints pins with the equality-score functional scale.
      "src/pages/cities/CitiesMapPane.tsx",
      // Risk traffic-light (low/moderate/high/critical) for travel safety.
      "src/components/trips/TripSafetyBriefing.tsx",
      // Shared risk traffic-light palette — the single home of the locked
      // low/moderate/high/critical hex, consumed by TripSafetyBriefing +
      // the country SafetyVerdict so the two surfaces can't drift.
      "src/hooks/useRiskVisual.ts",
      // Deterministic avatar SVG fallback — monochrome dark-gray steps; concrete
      // hex is required by the SVG data-URI (CSS vars don't resolve there).
      "src/lib/avatar.ts",
      // OG/recap PNG generated via canvas — hex literals are required by the canvas API.
      // Map style + security dashboards = data-viz, hardcoded by design.
      "src/components/map/**",
      "src/components/hotels/HotelsMap.tsx",
      "src/components/events/EventsMapView.tsx",
      // Submission scan results — confidence traffic-light + flyer overlays.
      "src/components/submission/**",
      // Trip cover gradient palette + status badges.
      "src/components/trips/TripCoverBand.tsx",
      "src/pages/trips/**",
      // Severity-tagged content warnings.
      // Categorical tag link palettes.
      "src/components/tags/TagLinkedContent.tsx",
      // Functional gradients / scales / state colors that are intentional.
      "src/components/auth/PasswordStrengthMeter.tsx",
      "src/components/country/WorldBankDataPanel.tsx",
      "src/components/personalities/AddPersonalityDialog.tsx",
      "src/hooks/useExploreMapData.ts",
      "src/hooks/useMapBoundaryLayers.ts",
      "src/config/workflowConfig.ts",
      // Map style — vector tile color overrides, intentional.
      "src/components/trips/TripMap.tsx",
      // External brand SVGs (Google OAuth icon — locked color).
      "src/components/auth/OAuthButtons.tsx",
      // Severity rgba banners — pre-multiplied alpha for translucency.
      "src/components/trips/TripDocExpiryBanner.tsx",
      "src/components/trips/TripNudgesBanner.tsx",
      // Filter chip dot colors — categorical.
      "src/components/venues/VenueFilters.tsx",
      // Video player chrome — pure black/white overlay regardless of theme.
      // Theme provider — owns the color tokens themselves.
      "src/components/theme/ThemeProvider.tsx",
      // Categorical / functional palettes per file (see commit message
      // for rationale on each).
      "src/components/country/EqualityScoreBadge.tsx",
      "src/components/trips/create/CityCountryAutocomplete.tsx",
      "src/components/profile/PhotoGallery.tsx",
      "src/components/analytics/UmamiAnalyticsDashboard.tsx",
      "src/components/resources/TagListRenderer.tsx",
      // Hero / cover overlays — pre-multiplied black gradients on imagery.
      "src/components/location/LocationInfo.tsx",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "Literal[value=/^#[0-9a-fA-F]{3,8}$|^rgba?\\(\\s*\\d|^hsla?\\(\\s*\\d/]",
          message:
            "Hardcoded color literal — use design tokens (hsl(var(--foreground)), hsl(var(--muted)), etc.).",
        },
        {
          selector:
            "Literal[value=/shadow-\\[var\\(--shadow-(aceternity|glow)|shadow-aceternity/]",
          message:
            "Shadow tokens were removed 2026-05-21 (P1 normalize). Use `border` or `bg-muted` for depth.",
        },
      ],
    },
  },

  // P5 RETIRED — rounded / shadow / gradient classes are allowed again
  // in non-admin code as part of the Aceternity-inspired UI overhaul.
  // Color-literal ban above still enforces strict monochrome.
  //
  // P6 — semantic 3-tier radius. New code should pick from the semantic
  // trio (rounded-container / rounded-element / rounded-badge); the
  // t-shirt scale is retained only for migration. `rounded-full` and
  // `rounded-none` remain allowed (avatars, dots, explicit override).
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/integrations/supabase/types.ts",
      "src/**/__tests__/**",
      "src/test/**",
    ],
    rules: {
      "no-restricted-syntax": [
        "warn",
        {
          selector:
            "Literal[value=/\\brounded-(xs|sm|md|lg|xl|2xl|3xl|4xl)\\b/]",
          message:
            "Use semantic radius: rounded-container (cards/modals), rounded-element (buttons/inputs), or rounded-badge (chips/tags). See src/index.css @theme.",
        },
        {
          selector:
            "Literal[value=/(\\srounded(?![-\\w]))|(^rounded\\s)/]",
          message:
            "Bare `rounded` (4px, non-semantic) bypasses the radius trio — use rounded-badge (chips/tags), rounded-element (buttons/inputs/rows), or rounded-container (cards).",
        },
        {
          selector:
            "Literal[value=/\\b(p|m|mx|my|mt|mb|ml|mr|px|py|pl|pr|pt|pb|gap|gap-x|gap-y|space-x|space-y)-(3|5|7|9|11|13|15)\\b/]",
          message:
            "Strict 8 pt grid (UI audit P8). Use even-step Tailwind utility (-4, -6, -8, -10, -12, -14, -16) or the explicit .5 micro-spacing (-0.5, -1.5, -2.5, -3.5) for icon-level offsets.",
        },
      ],
    },
  },

  // Phase 3g (2026-05-19) — admin chromatic purge complete. Color-literal rule
  // is now ERROR for the admin tree (same as public). Combined with the radius
  // warn since ESLint flat config overrides no-restricted-syntax wholesale.
  //
  // P4 (2026-05-20, UI audit) — also block Tailwind chromatic utility classes
  // (`text-red-500`, `bg-emerald-100`, …) which the hex/rgb/hsl regex above
  // cannot see. Admin tree uses StatusBadge / semantic tokens only.
  {
    files: [
      "src/components/admin/**/*.{ts,tsx}",
      "src/components/cms/**/*.{ts,tsx}",
      "src/components/security/**/*.{ts,tsx}",
      "src/pages/Admin*.tsx",
      "src/pages/admin/**/*.{ts,tsx}",
      "src/pages/admin-*/**/*.{ts,tsx}",
      "src/config/feedbackCategories.ts",
      "src/config/contentTypes/**",
    ],
    ignores: ["src/**/__tests__/**", "src/test/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "Literal[value=/^#[0-9a-fA-F]{3,8}$|^rgba?\\(\\s*\\d|^hsla?\\(\\s*\\d/]",
          message:
            "Hardcoded color literal — use design tokens or <StatusBadge>. The admin chromatic exemption was removed 2026-05-19.",
        },
        {
          selector:
            "Literal[value=/\\brounded(-(t|b|l|r|tl|tr|bl|br))?-(xs|sm|md|lg|xl|2xl|3xl|4xl)\\b/]",
          message:
            "Use semantic radius: rounded-container / rounded-element / rounded-badge. See src/index.css @theme.",
        },
        {
          selector:
            "Literal[value=/(\\srounded(?![-\\w]))|(^rounded\\s)/]",
          message:
            "Bare `rounded` (4px, non-semantic) bypasses the radius trio — use rounded-badge (chips/tags), rounded-element (buttons/inputs/rows), or rounded-container (cards).",
        },
        {
          selector:
            "Literal[value=/\\b(text|bg|border|ring|from|via|to|decoration|divide)-(red|green|emerald|amber|yellow|orange|blue|purple|pink|cyan|indigo|violet|fuchsia|rose|sky|teal|lime|slate|gray|neutral|zinc|stone)-(50|100|200|300|400|500|600|700|800|900|950)\\b/]",
          message:
            "Chromatic Tailwind class — use design token (text-foreground / text-muted-foreground / text-destructive / bg-muted / bg-accent) or <StatusBadge>. See src/components/ui/status-badge.tsx.",
        },
        {
          selector:
            "Literal[value=/\\bfont-extrabold\\b/]",
          message:
            "Weight scale is 400/500/600/700. Use font-bold (700); Inter at 700 with the heading's -0.02em tracking already reads as strong as 800.",
        },
        {
          selector:
            "Literal[value=/\\bshadow-(md|lg|xl|2xl)\\b/]",
          message:
            "Shadows are disabled (CLAUDE.md § Design). Use border or bg-muted for depth.",
        },
        {
          selector:
            "Literal[value=/^(?!.*\\bfrom-(black|background)\\b).*\\bbg-gradient-to-/]",
          message:
            "Gradients are not allowed (CLAUDE.md § Design). Only black readability scrims over images (from-black/NN) are exempt.",
        },
        {
          selector:
            "Literal[value=/\\b(p|m|mx|my|mt|mb|ml|mr|px|py|pl|pr|pt|pb|gap|gap-x|gap-y|space-x|space-y)-(3|5|7|9|11|13|15)\\b/]",
          message:
            "Strict 8 pt grid (UI audit P8). Use even-step Tailwind utility (-4, -6, -8, -10, -12, -14, -16) or the explicit .5 micro-spacing (-0.5, -1.5, -2.5, -3.5) for icon-level offsets. Admin was previously exempt from this rule (no-restricted-syntax overrides wholesale per file) — closed 2026-07-07.",
        },
      ],
    },
  },

  // Design & Branding control center (2026-07-23) — /admin/design edits real
  // color values, so its editor components legitimately hold neutral hex
  // defaults (#0a0a0a placeholders, wrapper colors). This block re-states the
  // admin design rules WITHOUT the hardcoded-color selector (flat-config
  // no-restricted-syntax replaces wholesale per file — see CLAUDE.md).
  {
    files: ["src/components/admin/design/**/*.{ts,tsx}"],
    ignores: ["src/**/__tests__/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "Literal[value=/\\brounded(-(t|b|l|r|tl|tr|bl|br))?-(xs|sm|md|lg|xl|2xl|3xl|4xl)\\b/]",
          message:
            "Use semantic radius: rounded-container / rounded-element / rounded-badge. See src/index.css @theme.",
        },
        {
          selector:
            "Literal[value=/\\b(text|bg|border|ring|from|via|to|decoration|divide)-(red|green|emerald|amber|yellow|orange|blue|purple|pink|cyan|indigo|violet|fuchsia|rose|sky|teal|lime|slate|gray|neutral|zinc|stone)-(50|100|200|300|400|500|600|700|800|900|950)\\b/]",
          message:
            "Chromatic Tailwind class — use design tokens. Hex defaults for the branding editor are allowed here, chromatic utility classes are not.",
        },
        {
          selector:
            "Literal[value=/\\bshadow-(md|lg|xl|2xl)\\b/]",
          message:
            "Shadows are disabled (CLAUDE.md § Design). Use border or bg-muted for depth.",
        },
        {
          selector:
            "Literal[value=/\\b(p|m|mx|my|mt|mb|ml|mr|px|py|pl|pr|pt|pb|gap|gap-x|gap-y|space-x|space-y)-(3|5|7|9|11|13|15)\\b/]",
          message:
            "Strict 8 pt grid (UI audit P8). Use even-step Tailwind utility or .5 micro-spacing.",
        },
      ],
    },
  },

  // P4 (2026-05-20, UI audit) — warn (not error) on chromatic Tailwind
  // classes in the public tree. Migrate to tokens; promote to error once
  // any remaining instances are flushed.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/integrations/supabase/types.ts",
      "src/**/__tests__/**",
      "src/test/**",
      "src/components/admin/**",
      "src/components/cms/**",
      "src/components/security/**",
      "src/pages/Admin*.tsx",
      "src/pages/admin/**",
      // Same functional-color allowlist as the hex rule above — these
      // files legitimately encode data with categorical palettes.
      "src/theme/**",
      "src/lib/animation.ts",
      "src/lib/avatar.ts",
      "src/config/mapStyle.ts",
      "src/config/contentTypeRegistry.ts",
      "src/config/submissionRegistry.ts",
      "src/config/adminNavigation.ts",
      "src/config/workflowConfig.ts",
      "src/utils/equalityScore.ts",
      "src/components/country/**",
      "src/components/trips/TripSafetyBriefing.tsx",
      "src/components/trips/TripCoverBand.tsx",
      "src/components/trips/TripDocExpiryBanner.tsx",
      "src/components/trips/TripNudgesBanner.tsx",
      "src/components/trips/TripMap.tsx",
      "src/components/trips/create/CityCountryAutocomplete.tsx",
      "src/components/profile/PhotoGallery.tsx",
      "src/components/map/**",
      "src/components/hotels/HotelsMap.tsx",
      "src/components/events/EventsMapView.tsx",
      "src/components/submission/**",
      "src/pages/trips/**",
      "src/components/tags/TagLinkedContent.tsx",
      "src/components/auth/PasswordStrengthMeter.tsx",
      "src/components/auth/OAuthButtons.tsx",
      "src/components/personalities/AddPersonalityDialog.tsx",
      "src/hooks/useExploreMapData.ts",
      "src/hooks/useMapBoundaryLayers.ts",
      "src/components/theme/ThemeProvider.tsx",
      "src/components/analytics/UmamiAnalyticsDashboard.tsx",
      "src/components/resources/TagListRenderer.tsx",
      "src/components/location/LocationInfo.tsx",
      "src/components/country/EqualityScoreBadge.tsx",
      // Hex-rule allowlist entries the P2-1 block carries but this block was
      // missing — without them, re-adding the hex selector here would flag
      // sanctioned functional palettes.
      "src/hooks/useRiskVisual.ts",
      "src/pages/cities/EqualityChip.tsx",
      "src/pages/cities/CitiesMapPane.tsx",
      "src/components/venues/VenueFilters.tsx",
      // Trip cover gradient palette (sanctioned exception, same as
      // TripCoverBand/pages/trips) — the palette source itself.
      "src/hooks/useTripTemplates.ts",
      // MapLibre paint config — hex required by the map API (same rationale
      // as src/components/map/**).
      "src/components/pride/PrideMap.tsx",
      // Design-system showcase — renders literal color values on purpose.
      "src/pages/PatternLibrary/**",
    ],
    rules: {
      // NOTE (2026-06-10): flat config replaces no-restricted-syntax WHOLESALE
      // per matching block — this block is the last match for the public tree,
      // so it must carry EVERY public selector (the radius/spacing block above
      // only covers files this block ignores). Dropping a selector here
      // silently disables it for all public files.
      //
      // 2026-07-11: the hex/rgb/hsl selector HAD been dropped here, silently
      // disabling the public color ban (the P2-1 block above is shadowed by
      // this one). Re-added, plus the shadow/gradient selectors CLAUDE.md
      // documents. Promoted warn → error: every selector below is at zero
      // occurrences in the public tree, so error is free and matches the
      // "promote to error once flushed" intent.
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "Literal[value=/^#[0-9a-fA-F]{3,8}$|^rgba?\\(\\s*\\d|^hsla?\\(\\s*\\d/]",
          message:
            "Hardcoded color literal — use design tokens (hsl(var(--foreground)), hsl(var(--muted)), etc.).",
        },
        {
          selector:
            "Literal[value=/(gradient\\(|var\\([^)]*,\\s*)[^)]*#[0-9a-fA-F]{3,8}/]",
          message:
            "Hex color embedded in a gradient()/var() fallback — use design tokens; token-less fallbacks drift from the theme.",
        },
        {
          selector:
            "Literal[value=/\\bshadow-(md|lg|xl|2xl)\\b/]",
          message:
            "Shadows are disabled (CLAUDE.md § Design). Use border or bg-muted for depth.",
        },
        {
          selector:
            "Literal[value=/^(?!.*\\bfrom-(black|background)\\b).*\\bbg-gradient-to-/]",
          message:
            "Gradients are not allowed in public UI (CLAUDE.md § Design). Exempt: black readability scrims over images (from-black/NN) and background-colored scroll-edge fades (from-background).",
        },
        {
          selector:
            "Literal[value=/\\b(text|bg|border|ring|from|via|to|decoration|divide)-(red|green|emerald|amber|yellow|orange|blue|purple|pink|cyan|indigo|violet|fuchsia|rose|sky|teal|lime|slate|gray|neutral|zinc|stone)-(50|100|200|300|400|500|600|700|800|900|950)\\b/]",
          message:
            "Chromatic Tailwind class — use design token (text-foreground / text-muted-foreground / text-destructive / bg-muted / bg-accent) or <StatusBadge>.",
        },
        {
          selector:
            "Literal[value=/\\bfont-extrabold\\b/]",
          message:
            "Weight scale is 400/500/600/700. Use font-bold (700).",
        },
        {
          selector:
            "Literal[value=/\\brounded-(xs|sm|md|lg|xl|2xl|3xl|4xl)\\b/]",
          message:
            "Use semantic radius: rounded-container (cards/modals), rounded-element (buttons/inputs), or rounded-badge (chips/tags). See src/index.css @theme.",
        },
        {
          selector:
            "Literal[value=/(\\srounded(?![-\\w]))|(^rounded\\s)/]",
          message:
            "Bare `rounded` (4px, non-semantic) bypasses the radius trio — use rounded-badge (chips/tags), rounded-element (buttons/inputs/rows), or rounded-container (cards).",
        },
        {
          selector:
            "Literal[value=/\\b(p|m|mx|my|mt|mb|ml|mr|px|py|pl|pr|pt|pb|gap|gap-x|gap-y|space-x|space-y)-(3|5|7|9|11|13|15)\\b/]",
          message:
            "Strict 8 pt grid (UI audit P8). Use even-step Tailwind utility (-4, -6, -8, -10, -12, -14, -16) or the explicit .5 micro-spacing (-0.5, -1.5, -2.5, -3.5) for icon-level offsets.",
        },
        {
          selector:
            "Literal[value=/\\btext-\\[/]",
          message:
            "Arbitrary text class — use the semantic type scale (text-3xs/2xs/xs2/13/15/body-lg/title/headline/display/hero) and color tokens (text-foreground / text-muted-foreground / text-destructive).",
        },
        {
          selector:
            "JSXText[value=/\\b(Discover|Explore|Unlock|Curated|Journey|Amazing|Tailored|Personalized)\\b/]",
          message:
            "Marketing voice — copy is direct and factual (CLAUDE.md § Design). Use Browse/Find/See/View or plain nouns.",
        },
      ],
    },
  },

  // *.parts.tsx files explicitly compose multiple component fragments + small
  // helpers in one file. The "parts" suffix is a deliberate pattern; the
  // HMR-friendliness warning from react-refresh is the wrong tradeoff here.
  {
    files: ["src/**/*.parts.tsx"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },

  // Cluster 3 — admin tree must stay motion-free. Aceternity effect
  // components and direct framer-motion / motion imports inside admin
  // pages and components would re-introduce the very animations the
  // refactor removed.
  {
    files: [
      "src/pages/Admin*.tsx",
      "src/pages/admin/**/*.{ts,tsx}",
      "src/components/admin/**/*.{ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "framer-motion", message: "Admin tree is motion-free (Cluster 3). Remove decorative motion." },
            { name: "motion/react", message: "Admin tree is motion-free (Cluster 3). Remove decorative motion." },
            { name: "@mui/material", message: "MUI migration complete (ADR 0001). Use shadcn/ui components + Tailwind." },
            { name: "@mui/icons-material", message: "MUI migration complete (ADR 0001). Use lucide-react icons instead." },
            { name: "@mui/lab", message: "MUI migration complete (ADR 0001). Use shadcn/ui components + Tailwind." },
          ],
          patterns: [
            { group: ["@/components/effects/*"], message: "Aceternity effect components are not allowed in the admin tree (Cluster 3)." },
            { group: ["@/components/animation/*"], message: "Decorative animation wrappers are not allowed in the admin tree (Cluster 3)." },
            { group: ["@/components/motion/*"], message: "Decorative motion wrappers are not allowed in the admin tree (Cluster 3)." },
            { group: ["@mui/*", "@mui/**"], message: "MUI migration complete (ADR 0001). Use shadcn/ui components + Tailwind." },
          ],
        },
      ],
    },
  },

  // Cluster 4 — render-loop guard for the admin tree. The React #185
  // ("Maximum update depth exceeded") family comes from unstable effect deps
  // and setState-in-effect. These rules are global "warn" during the
  // react-hooks v7 adoption, but src/components/admin/** is already clean of
  // both, so ratchet them to "error" there to stop the bug class from
  // re-entering the admin UI. Intentional exceptions still use
  // // eslint-disable-next-line, which error-level rules continue to honor.
  {
    files: ["src/components/admin/**/*.{ts,tsx}"],
    rules: {
      "react-hooks/exhaustive-deps": "error",
      "react-hooks/set-state-in-effect": "error",
    },
  },
);
