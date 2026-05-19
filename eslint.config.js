import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import jsxA11y from "eslint-plugin-jsx-a11y";
import unusedImports from "eslint-plugin-unused-imports";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import noSupabaseFromInPages from "./eslint-rules/no-supabase-from-in-pages.js";

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
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      "jsx-a11y": jsxA11y,
      "unused-imports": unusedImports,
      "queerguide": { rules: { "no-supabase-from-in-pages": noSupabaseFromInPages } },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
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
      // DUP-4 complete: pages and components both clean of inline
      // supabase.from(). Co-located use*Controller.{ts,tsx} files are
      // exempted in the rule itself.
      "queerguide/no-supabase-from-in-pages": "error",
      // Accessibility rules (WCAG 2.2 AA)
      "jsx-a11y/alt-text": "error",
      "jsx-a11y/anchor-has-content": "error",
      "jsx-a11y/anchor-is-valid": "error",
      "jsx-a11y/aria-props": "error",
      "jsx-a11y/aria-proptypes": "error",
      "jsx-a11y/aria-role": "error",
      "jsx-a11y/aria-unsupported-elements": "error",
      // Temporarily demoted to warn — the in-flight MUI migration (Box → div)
      // legitimately surfaces these on every batch PR because clickable Boxes
      // become clickable divs. Re-tighten once the migration settles.
      "jsx-a11y/click-events-have-key-events": "warn",
      "jsx-a11y/heading-has-content": "error",
      "jsx-a11y/img-redundant-alt": "warn",
      "jsx-a11y/label-has-associated-control": "error",
      "jsx-a11y/no-noninteractive-element-interactions": "warn",
      "jsx-a11y/no-static-element-interactions": "warn",
      "jsx-a11y/role-has-required-aria-props": "error",
      "jsx-a11y/role-supports-aria-props": "error",
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
      "src/components/country/LGBTJurisdictionInfo.tsx",
      "src/components/country/SDGDataPanel.tsx",
      "src/components/country/SafetyAlertBanner.tsx",
      // Risk traffic-light (low/moderate/high/critical) for travel safety.
      "src/components/trips/TripSafetyBriefing.tsx",
      // Categorical news/topic taxonomy palette (politics, health, sports…).
      "src/components/news/NewsCard.tsx",
      // Deterministic avatar gradient palette (12 distinct hues by user id).
      "src/lib/avatar.ts",
      "src/components/profile/UserModeBadge.tsx",
      // OG/recap PNG generated via canvas — hex literals are required by the canvas API.
      "src/pages/profile/Footprint.tsx",
      "src/components/user-directory/UserDirectoryGrid.tsx",
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
      "src/components/ui/ContentWarningBanner.tsx",
      // Categorical tag link palettes + relationship graph.
      "src/components/tags/TagLinkedContent.tsx",
      "src/components/tags/TagRelationshipGraph.tsx",
      // Functional gradients / scales / state colors that are intentional.
      "src/components/auth/PasswordStrengthMeter.tsx",
      "src/components/country/WorldBankDataPanel.tsx",
      "src/components/user-directory/UserDirectoryFilters.tsx",
      "src/components/personalities/AddPersonalityDialog.tsx",
      "src/hooks/useExploreMapData.ts",
      "src/hooks/useReviewBulkActions.ts",
      "src/hooks/useMapBoundaryLayers.ts",
      "src/config/workflowConfig.ts",
      // Map style — vector tile color overrides, intentional.
      "src/components/trips/TripMap.tsx",
      // External brand SVGs (Google OAuth icon — locked color).
      "src/components/auth/OAuthButtons.tsx",
      // Severity rgba banners — pre-multiplied alpha for translucency.
      "src/components/trips/TripDocExpiryBanner.tsx",
      "src/components/trips/TripNudgesBanner.tsx",
      // Categorical budget category palette (food/transport/lodging/...).
      "src/components/trips/BudgetTab.tsx",
      // Filter chip dot colors — categorical.
      "src/components/venues/VenueFilters.tsx",
      // Video player chrome — pure black/white overlay regardless of theme.
      "src/components/ui/modern-video-player.tsx",
      // Theme provider — owns the color tokens themselves.
      "src/components/theme/ThemeProvider.tsx",
      // Categorical / functional palettes per file (see commit message
      // for rationale on each).
      "src/components/country/EqualityScoreBadge.tsx",
      "src/components/country/CountryHeroImages.tsx",
      "src/components/trips/create/CityCountryAutocomplete.tsx",
      "src/components/profile/PhotoGallery.tsx",
      "src/components/analytics/UmamiAnalyticsDashboard.tsx",
      "src/components/resources/TagListRenderer.tsx",
      // Hero / cover overlays — pre-multiplied black gradients on imagery.
      "src/pages/Ressources.tsx",
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
      ],
    },
  },

  // Phase 0 (2026-05-19) — admin chromatic exemption REMOVED. Admin/cms violations
  // surface as warnings here; Phase 3g flips to error after the chromatic sweep.
  {
    files: [
      "src/components/admin/**/*.{ts,tsx}",
      "src/components/cms/**/*.{ts,tsx}",
      "src/components/security/**/*.{ts,tsx}",
      "src/pages/Admin*.tsx",
      "src/pages/admin/**/*.{ts,tsx}",
      "src/pages/admin-*/**/*.{ts,tsx}",
      "src/pages/SecurityDashboard.tsx",
      "src/config/feedbackCategories.ts",
      "src/config/contentTypes/**",
    ],
    ignores: ["src/**/__tests__/**", "src/test/**"],
    rules: {
      "no-restricted-syntax": [
        "warn",
        {
          selector:
            "Literal[value=/^#[0-9a-fA-F]{3,8}$|^rgba?\\(\\s*\\d|^hsla?\\(\\s*\\d/]",
          message:
            "Admin chromatic exemption was removed 2026-05-19 (refactor/monochrome-2026). Use design tokens or <StatusBadge>.",
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
          ],
          patterns: [
            { group: ["@/components/effects/*"], message: "Aceternity effect components are not allowed in the admin tree (Cluster 3)." },
            { group: ["@/components/animation/*"], message: "Decorative animation wrappers are not allowed in the admin tree (Cluster 3)." },
            { group: ["@/components/motion/*"], message: "Decorative motion wrappers are not allowed in the admin tree (Cluster 3)." },
          ],
        },
      ],
    },
  },
);
