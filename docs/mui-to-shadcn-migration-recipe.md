# MUI → shadcn migration recipe

Reference for incrementally clearing the `eslint-mui-allowlist.json`.
Establishing PR: #314 (5 files migrated as a demonstration).

## Decision

**Per ADR 0001, the team is migrating off MUI to shadcn/ui + Tailwind.**

The forcing function (`eslint.config.js` → `no-restricted-imports`) is currently set to `warn` (PR #308 hotfix) because the original `error` level surfaced too many existing files. Each migration PR removes its files from `eslint-mui-allowlist.json`. When the allowlist is empty, restore the rule to `error`, uninstall MUI deps, delete `src/theme/muiTheme.ts`.

## Prerequisites for a migration PR

1. Pick files that ONLY use simple MUI primitives (`Box`, `Typography`, `Stack`, `Tooltip`). Files using DataGrid, Autocomplete, complex Tabs, or shared theme need design review.
2. Read each file end-to-end. Don't blind-replace.
3. Verify the visual result locally before pushing — Tailwind's spacing scale doesn't 1:1 match MUI's. Most translations are correct but check.
4. Remove the migrated files from `eslint-mui-allowlist.json`.

## Translation cheatsheet

### Component imports

| MUI | shadcn / Tailwind |
|---|---|
| `import Box from '@mui/material/Box'` | (drop import; use `<div>`) |
| `import Typography from '@mui/material/Typography'` | (drop import; use semantic HTML) |
| `import Stack from '@mui/material/Stack'` | (drop import; use `<div className="flex">`) |
| `import Tooltip from '@mui/material/Tooltip'` | `import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'` |
| `import Chip from '@mui/material/Chip'` | `import { Badge } from '@/components/ui/badge'` |
| `import Alert from '@mui/material/Alert'` | `import { Alert, AlertDescription } from '@/components/ui/alert'` |
| `import CircularProgress from '@mui/material/CircularProgress'` | `import { Loader2 } from 'lucide-react'` + `className="animate-spin"` |
| `import Dialog/DialogTitle/DialogContent/DialogActions` | `import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'` |

### Typography variants

| MUI | shadcn / Tailwind |
|---|---|
| `<Typography variant="h1">` | `<h1 className="text-4xl font-bold">` |
| `<Typography variant="h2">` | `<h2 className="text-3xl font-bold">` |
| `<Typography variant="h6">` | `<h6 className="text-base font-semibold">` |
| `<Typography variant="body1">` | `<p>` (default) |
| `<Typography variant="body2">` | `<p className="text-sm">` |
| `<Typography variant="caption">` | `<span className="text-xs">` |
| `<Typography color="text.secondary">` | append `text-muted-foreground` |
| `<Typography color="error">` | append `text-destructive` |

### `sx` → Tailwind spacing

MUI's spacing unit is **8px**. Tailwind's is **4px** (0.25rem). So `sx={{ mb: 2 }}` (16px) → `className="mb-4"`.

| MUI sx | Tailwind |
|---|---|
| `p: 0.5` (4px) | `p-1` |
| `p: 1` (8px) | `p-2` |
| `p: 1.5` (12px) | `p-3` |
| `p: 2` (16px) | `p-4` |
| `p: 3` (24px) | `p-6` |
| `p: 4` (32px) | `p-8` |
| `p: 6` (48px) | `p-12` |
| `gap: 1` (8px) | `gap-2` |
| `gap: 1.5` (12px) | `gap-3` |
| `gap: 2` (16px) | `gap-4` |
| Same for `m`, `mt`, `mb`, `ml`, `mr`, `mx`, `my`, `px`, `py` | (same prefix swap) |

### `sx` → other Tailwind

| MUI sx | Tailwind |
|---|---|
| `display: 'flex'` | `flex` |
| `flexDirection: 'column'` | `flex-col` |
| `alignItems: 'center'` | `items-center` |
| `justifyContent: 'space-between'` | `justify-between` |
| `justifyContent: 'center'` | `justify-center` |
| `textAlign: 'center'` | `text-center` |
| `width: 64, height: 64` | `w-16 h-16` |
| `borderRadius: 1` (8px) | `rounded-lg` |
| `borderRadius: 2` (16px) | `rounded-2xl` |
| `borderRadius: '50%'` | `rounded-full` |
| `border: '2px dashed'` | `border-2 border-dashed` |
| `bgcolor: 'action.hover'` | `bg-muted/40` (approximation) |
| `bgcolor: 'background.paper'` | `bg-card` |
| `borderColor: 'divider'` | `border-border` |
| `color: 'text.secondary'` | `text-muted-foreground` |
| `fontFamily: 'monospace'` | `font-mono` |
| `wordBreak: 'break-all'` | `break-all` |

### Tooltip

MUI's `<Tooltip title="Edit">` wraps the trigger. shadcn requires explicit composition:

```tsx
// Before
<Tooltip title="Edit">
  <Button>...</Button>
</Tooltip>

// After
<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild>
      <Button>...</Button>
    </TooltipTrigger>
    <TooltipContent>Edit</TooltipContent>
  </Tooltip>
</TooltipProvider>
```

### Icons

MUI's `<Icon style={{ width: 16, height: 16 }} />` is essentially equivalent to lucide-react's `<Icon className="w-4 h-4" />`. Most icons map 1:1 to lucide. Check imports.

## What's NOT covered here

- **DataGrid**: needs a shadcn/Tanstack-Table replacement. The repo already has `@/components/admin/data-table` patterns — reuse them.
- **Autocomplete**: shadcn has `Combobox` patterns; check `@/components/ui/country-autocomplete`.
- **Theme tokens** (`theme.palette.primary.main` etc.): use CSS variables defined in `src/index.css` (`hsl(var(--primary))`).
- **Stepper, Tabs (complex), Accordion**: shadcn equivalents exist in `@/components/ui` but require restructuring.

## Per-PR checklist

- [ ] Each migrated file passes `npm run typecheck`
- [ ] Each migrated file passes `npm run lint` with no MUI warnings
- [ ] Visual diff acceptable (compare against current production / `main`)
- [ ] Allowlist updated: `eslint-mui-allowlist.json` no longer contains migrated paths
- [ ] PR description lists every migrated file and the visual diff sanity check

## When the allowlist hits zero

```bash
# 1. Delete the allowlist + the eslint block in eslint.config.js
# 2. Restore no-restricted-imports level to "error" (was demoted to "warn" in #308)
# 3. Uninstall packages
npm uninstall @mui/material @mui/icons-material @mui/lab @emotion/react @emotion/styled
# 4. Delete leftover MUI files
rm src/theme/muiTheme.ts
# 5. Confirm grep -rln "@mui" src/ returns zero
```

## Open questions

- **Bundle size impact** — should be measured per batch. The `bundle-shape` CI assertion (PR #252) tracks this.
- **a11y regressions** — the daily a11y workflow (PR #297-era CI) catches missing aria attributes. Monitor for new violations after each batch.
- **ContentLayout patterns** — some pages use MUI Container + Grid for layout. Migrating those is bigger than swapping primitives; coordinate with design.
