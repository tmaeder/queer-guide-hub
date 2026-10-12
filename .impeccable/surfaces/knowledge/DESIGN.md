---
name: queer.guide Knowledge
description: Local extension of the existing paper and ink subway system.
---

# Design System: Knowledge

## Overview

**Creative North Star: "SUBWAY MAP"**

Knowledge joins the terms index and personalities directory through one shared header. It inherits the incumbent editorial paper/ink identity; comprehension and explicit wayfinding guide this Read surface.

**Key Characteristics:**

- One Knowledge heading with two visible, URL-backed sections.
- Localized labels, ordinary navigation history, and stable chrome during loading and failure.
- Existing discovery and contribution tools remain within their owning section.

This is a scoped extension, not a replacement for the root `DESIGN.md`, `PRODUCT.md`, or `docs/design-system/README.md`. It documents `src/components/knowledge/KnowledgeHeader.tsx`, its use in `src/pages/TagsIndex.tsx` and `src/pages/Personalities.tsx`, and Knowledge ownership in `src/config/navigation.ts`. It makes no global token or product changes.

## Colors

Use existing `background`, `foreground`, `muted`, `muted-foreground`, and `border-hairline` semantic tokens. Active section links invert ink and paper; inactive links gain a muted wash and foreground text on hover. The global Knowledge intent retains the established pink glossary track. Section selection needs no additional accent.

## Typography

The shared h1 uses `text-display`, `md:text-hero`, `font-bold`, and `leading-tight`. Its lede uses `text-body-lg`, `leading-relaxed`, and `max-w-reading`. Section headings use `text-title font-bold`; section links use `text-13 font-bold`. Inherit the existing font utilities and token definitions in `src/index.css` rather than introducing a surface font scale.

## Layout

The header uses `PageContainer as="header"` with its shared page cap, responsive gutters, and top rhythm; bottom padding is removed. The lede starts at `mt-4`, section navigation at `mt-6`, and section-specific header content at `mt-6`. The navigation wraps with `gap-2` and ends with a hairline rule. Each link has `min-h-11` (44px), `px-4`, and `py-2`.

Terms retain their category rail and glossary tools below the header. Personalities retain their directory controls and responsive results below it. Each page owns its content layout; the shared header owns only the common introduction and section navigation.

## Elevation & Depth

The shared header adds no shadow or overlay. Hierarchy comes from typography, whitespace, the hairline divider, and ink/paper selection contrast.

## Shapes

Section links remain rectangular, with no added pill or surface-specific radius.

## Components

### KnowledgeHeader

`section="terms"` links to `/tags`; `section="personalities"` links to `/personalities`. `LocalizedLink` supplies the locale-aware URLs. The active link exposes `aria-current="page"`; the nav has a localized accessible label. Keyboard focus uses a 2px foreground outline offset by 2px.

The shared header provides the sole page h1. Its optional children hold the section h2 and summary. Terms use the glossary or selected category title, lede, and existing counts; Personalities use their directory title, loading/count summary, and existing signed-in contribution action.

Terms keep the common header in loading and error branches. Personalities keep it mounted while results load, fail, or empty. Do not require successful data fetching to reach the other section.

### Route ownership

The stable global intent id remains `glossary`, with a Knowledge label and `/tags` landing destination. It owns `/tags`, `/personalities`, and `/personality` prefixes; its search bias includes both tags and personalities. Existing individual URLs, term tools, substance safety, STI guide, and personality detail routes remain intact. The shared sections are route links rather than an in-memory tab state or a new combined data page.

## Do's and Don'ts

### Do

- Do preserve localized, URL-backed section navigation and visible labels.
- Do retain PageContainer alignment and the existing semantic tokens.
- Do keep the shared heading and section links available during loading and failure.
- Do retain each section's tools, filters, contribution controls, and individual URLs.

### Don't

- Don't add a second page h1 below Knowledge.
- Don't merge term and personality results into one undifferentiated directory.
- Don't introduce a new route, visual identity, palette, radius, or shadow for this extension.
