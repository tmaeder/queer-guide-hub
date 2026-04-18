# Repo Map — 2026-03-03

## Project
Queer Guide — LGBTQ+ travel & community platform (queer.guide)
Stack: Vite 6 + React 18 + TypeScript + Tailwind + MUI, Supabase backend, CF Pages hosting

## Entry Points
| File | Role |
|------|------|
| `src/main.tsx` | App bootstrap — React root, QueryClient, i18n init, Supabase client |
| `src/App.tsx` | Route tree — all 88 pages registered via react-router-dom |
| `src/integrations/supabase/client.ts` | Supabase client singleton |
| `index.html` | HTML shell |

## Directory Inventory

| Path | Purpose | Size |
|------|---------|------|
| `src/pages/` | 88 pages (user + 35 admin) | 86 files |
| `src/components/` | All UI components (69 subdirs) | 440+ files |
| `src/components/ui/` | shadcn-based primitives | ~70 files |
| `src/components/admin/` | Admin panels & tools | ~50 files |
| `src/components/cms/` | CMS editor, media, workflow | ~30 files |
| `src/hooks/` | 95 custom hooks | 95 files |
| `src/lib/` | Pure utilities (utils, affiliate, event-time, gravatar…) | 8 files |
| `src/utils/` | Service utils (excel, travel, crawl…) | 15 files |
| `src/integrations/supabase/` | Supabase client + 8134-line generated types | 2 files |
| `src/i18n/` | i18n config + locale files | ~10 files |
| `src/config/` | mapStyle, env vars | 2 files |
| `src/types/` | Global TS types | ~5 files |
| `src/pages/admin/` | Additional admin pages | 1 file |
| `src/scripts/` | Build-time scripts | 1 file |
| `src/fancy/` | Fancy UI effects (physics) | 3 files |
| `src/styled-system/` | MUI theme tokens | ~5 files |
| `src/theme/` | MUI theme config | ~3 files |
| `src/assets/` | Static images | ~5 files |

## Dependency Hotspots (most-imported)
| File | Imported by |
|------|-------------|
| `@mui/material` | ~392 files |
| `lucide-react` | ~363 files |
| `react-router-dom` | 97 files |
| `@supabase/supabase-js` (via client) | ~200+ files via hook |
| `@tanstack/react-query` | 32 files |
| `sonner` (toast) | 21 files |
| `src/lib/utils` (cn helper) | ~200+ files |

## Complexity Hotspots (largest files)
| File | Lines | Notes |
|------|-------|-------|
| `src/integrations/supabase/types.ts` | 8,134 | Auto-generated — do not edit |
| `src/components/cms/MediaLibrary.tsx` | 1,657 | Monolithic, candidate for split |
| `src/pages/Ressources.tsx` | 1,348 | Tags + graph page, complex |
| `src/components/cms/UniversalContentEditor.tsx` | 1,094 | Large switch block |
| `src/components/admin/ImportJobCreator.tsx` | 1,069 | Heavy admin form |
| `src/pages/AdminVenues.tsx` | 1,008 | God page |
| `src/pages/UserDirectory.tsx` | 899 | Large table page |
| `src/pages/AdminEvents.tsx` | 878 | Large table page |
| `src/pages/AdminRedirects.tsx` | 869 | Large table page |
| `src/pages/ProfileSettings.tsx` | 866 | Complex form |
| `src/components/ui/sidebar.tsx` | 845 | shadcn sidebar |

## Volatile Zones (frequently changing based on feature history)
- `src/components/admin/` — import tooling, admin CRUD
- `src/pages/Admin*.tsx` — admin management pages
- `src/components/cms/` — CMS editor system
- `src/hooks/` — feature hooks added alongside features
- `src/integrations/supabase/types.ts` — auto-regenerated on schema changes

## Key Architectural Observations
1. **95 hooks** — extremely hook-heavy; some are wrappers for single Supabase queries (could be inlined)
2. **88 pages** — 35 are admin-only; none are lazy-loaded in App.tsx currently
3. **MUI everywhere** — 392 files import MUI; deep coupling
4. **251 JS chunks** — aggressive splitting is good but may cause network waterfalls
5. **Tailwind + MUI coexistence** — dual styling systems; `src/lib/sx.ts` is migration artifact
6. **`src/integrations/supabase/types.ts`** — 8134 lines auto-generated; regenerate after schema changes
7. **terser `passes: 2`** — main cause of 9:48 build time; 1 pass saves ~5min
