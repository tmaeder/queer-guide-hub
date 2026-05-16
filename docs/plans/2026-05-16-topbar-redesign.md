# Topbar Redesign

**Date:** 2026-05-16
**Status:** Approved, ready for implementation

## Problem

Current `Header.tsx` issues:
1. Cluttered right side (Submit + Admin + Avatar + Hamburger all visible)
2. Two-row height wastes vertical space on desktop
3. Redundant menus — `HeaderNavWithFlyouts` row + hamburger dropdown list overlap
4. Visually generic, not aligned with monochrome design system

## Design

**Single row, 56px height, sticky, monochrome.**

### Desktop (≥768px)

```
[logo]  Venues  Events  Places  Marketplace  News  More▾   [search...]   [+ Contribute]  [◉]
```

Left → right:
- **Logo** — 32px monochrome, flex-shrink-0
- **Primary nav** — 5 text-only links + `More ▾` dropdown. No icons in bar. Active = 2px underline offset. Hover = `bg-muted`.
- **Search** — flex-1, full inline `UniversalSearchBar` (unchanged)
- **Contribute CTA** — context-aware label (`+ Submit Venue` etc.), primary button
- **Avatar** — 36px, dropdown contains: user mode select, notifications, My Trips, Favorites, Footprint, Settings, Inbox, Friends, Groups, Extension, **Admin Console** (if admin/mod), Sign out

Removed: `HeaderNavWithFlyouts` second row, hamburger nav dropdown, standalone admin shield button.

### Mobile (<768px)

```
[logo]              [🔍]    [☰]
```

- Tap 🔍 → search expands inline replacing logo + hamburger; ESC/blur collapses
- Tap ☰ → existing `Sheet` drawer, slimmed to match new structure:
  - Account block (avatar, mode select) if logged in
  - Auth buttons if logged out
  - Contribute CTA
  - Primary: Venues, Events, Places, Marketplace, News
  - More: Map, Feed, Groups, Members, Resources, Travel, Personalities, Hotels, Help
  - User items, Admin, Legal, Sign out

### Visual language

- No icons in desktop top-row nav links — text only, tighter
- Active state: underline (matches design system link treatment), no pill
- `More ▾` dropdown: simple single column, ~200px wide
- Border-bottom only, no shadow
- `backdrop-blur-xl`, `bg-background/70` retained
- Radius: 0 (enforced)

### Primary nav (top row)

| Order | Label | Route |
|---|---|---|
| 1 | Venues | `/venues` |
| 2 | Events | `/events` |
| 3 | Places | `/places` |
| 4 | Marketplace | `/marketplace` |
| 5 | News | `/news` |
| 6 | More ▾ | dropdown |

### "More" dropdown

Map, Feed, Groups, Members, Resources, Travel, Personalities, Hotels, Help.

## Files affected

- `src/components/layout/Header.tsx` — rewrite layout, remove hamburger nav dropdown, integrate flat links + More dropdown, fold Admin into avatar menu
- `src/components/layout/HeaderNavWithFlyouts.tsx` — **delete**
- `src/components/layout/__tests__/` — update tests
- Any references to `HeaderNavWithFlyouts` — remove imports

## Out of scope

- Search behavior changes (stays as `UniversalSearchBar`)
- Footer
- User mode logic (stays in avatar dropdown)
- Notification rendering (stays in avatar dropdown via lazy `NotificationList`)
