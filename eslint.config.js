import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import jsxA11y from "eslint-plugin-jsx-a11y";
import unusedImports from "eslint-plugin-unused-imports";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import noSupabaseFromInPages from "./eslint-rules/no-supabase-from-in-pages.js";

import muiAllowlist from "./eslint-mui-allowlist.json" with { type: "json" };

export default tseslint.config(
  { ignores: ["dist", "src/integrations/supabase/types.ts"] },
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
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": "off",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      }],
      "no-case-declarations": "warn",
      // Tech-debt DUP-4: page-level supabase.from() migrated to hooks
      // (PR #320). Components still warn — next milestone.
      "queerguide/no-supabase-from-in-pages": "warn",
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
  // DUP-4: pages are now clean of inline supabase.from() — promote to error
  // for src/pages/** so regressions fail CI. Components still warn until the
  // next migration milestone.
  {
    files: ["src/pages/**/*.{ts,tsx}"],
    // Co-located controller hooks (useXxxController.ts) inside a page folder
    // are real hooks, just kept next to the page that uses them.
    ignores: ["src/pages/**/use*Controller.{ts,tsx}"],
    rules: {
      "queerguide/no-supabase-from-in-pages": "error",
    },
  },
  // P2-1 — block hardcoded color literals outside theme/config files.
  // See docs/design-system/FIX_PLAN.md and CLAUDE.md design section.
  {
    files: ["src/**/*.{ts,tsx}"],
    // Allowlist — see docs/design-system/admin-palette.md.
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
      "src/pages/SecurityDashboard.tsx",
      // Functional color scales (equality score 0–100, SDG indicators).
      "src/utils/equalityScore.ts",
      "src/components/country/LGBTJurisdictionInfo.tsx",
      "src/components/country/SDGDataPanel.tsx",
      "src/components/country/SafetyAlertBanner.tsx",
      // Risk traffic-light (low/moderate/high/critical) for travel safety.
      "src/components/trips/TripSafetyBriefing.tsx",
      // Categorical news/topic taxonomy palette (politics, health, sports…).
      "src/pages/NewsDetail.tsx",
      "src/components/news/NewsCard.tsx",
      // Deterministic avatar gradient palette (12 distinct hues by user id).
      "src/lib/avatar.ts",
      "src/components/profile/UserModeBadge.tsx",
      "src/components/user-directory/UserDirectoryGrid.tsx",
      // Map style + security dashboards = data-viz, hardcoded by design.
      "src/components/map/**",
      "src/components/security/**",
      // Submission scan results — confidence traffic-light + flyer overlays.
      "src/components/submission/**",
      // Trip cover gradient palette + status badges.
      "src/components/trips/TripCoverBand.tsx",
      "src/pages/trips/**",
      // Roadmap status badges (new / under_review / planned / in_progress…).
      "src/pages/FeedbackBoard.tsx",
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
      // Validation success/state colors that don't map to existing tokens.
      "src/components/ui/location-autocomplete.tsx",
      // Role-icon palette (admin/owner/member).
      "src/pages/MyGroups.tsx",
      // Categorical budget category palette (food/transport/lodging/...).
      "src/components/trips/BudgetTab.tsx",
      // Filter chip dot colors — categorical.
      "src/components/venues/VenueFilters.tsx",
      // Star-fill yellow (semantic gold star).
      "src/pages/Favorites.tsx",
      // Video player chrome — pure black/white overlay regardless of theme.
      "src/components/ui/modern-video-player.tsx",
      // Theme provider — owns the color tokens themselves.
      "src/components/theme/ThemeProvider.tsx",
      // Categorical / functional palettes per file (see commit message
      // for rationale on each).
      "src/components/country/EqualityScoreBadge.tsx",
      "src/components/country/CountryHeroImages.tsx",
      "src/components/feedback/FeedbackButton.tsx",
      "src/components/posts/PostCard.tsx",
      "src/components/trips/TripsSignedOutHero.tsx",
      "src/components/trips/SocialSignalBadges.tsx",
      "src/components/trips/TripContextBar.tsx",
      "src/components/trips/TripNewsSection.tsx",
      "src/components/trips/BundledCheckoutDialog.tsx",
      "src/components/trips/ReservationsTab.tsx",
      "src/components/trips/TripLocalContext.tsx",
      "src/components/trips/TripTemplates.tsx",
      "src/components/trips/create/CityCountryAutocomplete.tsx",
      "src/components/profile/PhotoGallery.tsx",
      "src/components/profile/UrlValidator.tsx",
      "src/components/profile/social/UrlValidator.tsx",
      "src/components/hotels/HotelCard.tsx",
      "src/components/analytics/UmamiAnalyticsDashboard.tsx",
      "src/components/resources/TagListRenderer.tsx",
      "src/components/messaging/MessagingInterface.tsx",
      "src/config/contentTypes/**",
      // Detail-page semantic accents (gold star fills, verified-shield green,
      // quote-box parchment, life-status pulses) — semantic by design.
      "src/pages/SearchResults.tsx",
      "src/pages/SubmitHub.tsx",
      "src/pages/HotelDetail.parts.tsx",
      "src/pages/PersonalityDetail.parts.tsx",
      "src/pages/CountryDetail.parts.tsx",
      "src/pages/EventDetail.parts.tsx",
      "src/pages/MarketplaceItemDetail.parts.tsx",
      "src/pages/VenueDetail.parts.tsx",
      "src/pages/QueerVillageDetail.parts.tsx",
      "src/pages/Index.tsx",
      // Hero / cover overlays — pre-multiplied black gradients on imagery.
      "src/pages/Ressources.tsx",
      "src/components/location/LocationInfo.tsx",
      // Pages with one-off semantic colors (verified shield, etc).
      "src/pages/Friends.tsx",
      "src/pages/HelpHotlines.tsx",
      "src/pages/UserDirectory.tsx",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          // Match hex literals AND rgb/hsl calls with NUMERIC content only —
          // hsl(var(--brand)), rgb(var(--…)) and similar token references
          // are deliberately allowed.
          selector:
            "Literal[value=/^#[0-9a-fA-F]{3,8}$|^rgba?\\(\\s*\\d|^hsla?\\(\\s*\\d/]",
          message:
            "Hardcoded color literal — use theme tokens (theme.palette.*, hsl(var(--brand)), etc.). See docs/design-system/FIX_PLAN.md P1-1.",
        },
      ],
    },
  },
  // ADR 0001 forcing function — ban net-new MUI imports.
  // The eslint-mui-allowlist.json file is a ratchet snapshot of all files
  // that import MUI today (526 as of 2026-05-02). New code can't add to
  // the list; existing entries should be removed as their files migrate
  // to shadcn. When the list is empty, delete this block + the JSON file
  // + uninstall MUI.
  // Ref: docs/adrs/0001-ui-library-consolidation.md
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: muiAllowlist,
    rules: {
      "no-restricted-imports": [
        "warn",
        {
          patterns: [
            {
              group: ["@mui/material", "@mui/material/*", "@mui/icons-material", "@mui/icons-material/*", "@mui/lab", "@mui/lab/*"],
              message: "MUI is being retired (ADR 0001). Use @/components/ui (shadcn) instead. If you genuinely need MUI for an existing component, add the file to eslint-mui-allowlist.json and explain in the PR.",
            },
          ],
        },
      ],
    },
  }
);
