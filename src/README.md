# Web app

[`main.tsx`](main.tsx) mounts [`App.tsx`](App.tsx). [`routes.tsx`](routes.tsx) defines the routes.

- `pages/` contains route-level screens. `components/` contains reusable UI, including shared primitives in `components/ui/`.
- `hooks/`, `lib/`, and `utils/` contain shared logic. `integrations/` contains the Supabase client and `i18n/` contains translations.
- Co-locate tests in `__tests__/` and use the `@/*` alias for imports from `src/`.
- Follow the [design system](../docs/design-system/README.md). Keep heavy dependencies such as maps, editors, and PDF or spreadsheet tooling lazy-loaded.

See the [repository map](../docs/architecture/repo-map.md) for the edge, database, and mobile entry points.
