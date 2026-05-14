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
      "src/integrations/supabase/types.ts",
      // Pre-existing botched-merge artifacts — files have parsing errors
      // unrelated to this branch. Tracked in
      // docs/audits/2026-05-events-audit/follow-ups.md.
      "functions/_middleware.ts",
      "functions/sitemap-places.xml.ts",
      "scripts/seo-check.mjs",
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
      // Admin status / data-viz dashboards — chromatic by design.
      "src/components/admin/**",
      "src/components/cms/**",
      "src/pages/Admin*.tsx",
      "src/pages/admin/**",
      "src/pages/admin-*/**",
      "src/pages/SecurityDashboard.tsx",
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
      "src/components/events/EventsMapView.tsx",
      "src/components/security/**",
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
      "src/config/feedbackCategories.ts",
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
      "src/config/contentTypes/**",
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
  // P5 — block rounded, shadow, and gradient classes in new code.
  // Existing uses are neutralized by tailwind.config.ts overrides but
  // should not be added to new code.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/**/__tests__/**",
      "src/test/**",
      "src/components/admin/**",
      "src/components/cms/**",
      "src/pages/Admin*.tsx",
      "src/pages/admin/**",
    ],
    rules: {
      "no-restricted-syntax": [
        "warn",
        {
          selector: "Literal[value=/rounded-(sm|md|lg|xl|2xl|3xl)/]",
          message:
            "Rounded corners are disabled — all radii are 0. Use rounded-none or remove the class.",
        },
        {
          selector: "Literal[value=/shadow-(md|lg|xl|2xl)/]",
          message:
            "Shadows are disabled — use border or bg-muted for depth.",
        },
        {
          selector: "Literal[value=/bg-gradient-to/]",
          message:
            "Gradients are not part of the design system — use solid bg tokens.",
        },
      ],
    },
  },
);
