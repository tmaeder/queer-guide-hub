# src/

The React 19 + Vite + TypeScript + Tailwind frontend (the queer.guide SPA).

What lives here:
- `pages/` route-level screens; `components/` reusable UI (`components/ui/` = shadcn primitives, design-system-locked — see CLAUDE.md Design); `hooks/`, `lib/`, `utils/` shared logic; `integrations/` (Supabase client), `i18n/` (11 languages), `providers/`, `theme/`, `config/`, `routes.tsx`.

Conventions:
- Co-locate tests in `__tests__/` next to the code; import via the `@/*` → `src/*` alias.
- Honor the monochrome design system and 8pt spacing rhythm (ESLint enforces). No new color literals in public UI.
- Heavy deps (maps, editor, charts, pdf, xlsx) must stay lazy-loaded / in their Vite manual chunk.
