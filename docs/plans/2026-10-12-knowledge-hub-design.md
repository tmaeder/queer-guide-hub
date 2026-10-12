# Knowledge hub

Approved on 2026-10-12: combine the glossary and personality directory under one Knowledge header and two URL-backed sections, Terms and Personalities.

The existing URLs remain the tab destinations: `/tags` and `/personalities`. Category routes inherit the Terms section. Individual definitions and profiles, filters, query strings, pagination, timeline/map/graph views, and visibility controls keep their existing behavior. Normal browser history and locale prefixes work through localized links.

Use one shared masthead, compact route navigation with visible active state, and the existing paper/ink typography and PageContainer gutters. Keep section-specific summaries and contribution actions below the shared navigation. Loading and error states retain the Knowledge header. The existing glossary navigation intent becomes Knowledge and owns both directories and their detail routes. Its search bias includes terms and personalities.

No data-model or backend changes. Verify navigation ownership, localized section navigation, both existing page contracts, type checking, and desktop/mobile rendering.

## Implementation verification

Implemented the shared `KnowledgeHeader` at the existing `/tags` and `/personalities` routes, including category pages and loading/error states. Main navigation owns both route families under Knowledge; all supported locales have the shared labels.

The release is based on current `main` and preserves its glossary term counts, visibility controls and directory tools. All 65 focused tests pass on this isolated change. ESLint, locale synchronization and duplicate-key checks pass. The production build and bundle-shape check pass; built-app smoke checks cover keyboard navigation, filtered browser history, and German/Arabic mobile links and header widths. The desktop/mobile design review found no material issue in the shared header/navigation extension.

The installed TypeScript compiler checked all changed source/test files using the app compiler settings, ambient declarations and test setup, with zero diagnostics. Full repository gates and deployment status are recorded by the pull request's automated checks and the existing Deploy to Cloudflare Pages workflow.
