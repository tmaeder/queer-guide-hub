/**
 * PageContainer — the ONE page-layout primitive.
 *
 * Owns the three things every page needs and nothing else: the horizontal
 * gutter, the content cap, and the vertical rhythm. It exists because nothing
 * did. `LayoutShell` and the `<main>` in routes.tsx contribute zero horizontal
 * spacing by design (routes need to be able to go full-bleed), so before this
 * component every page file redeclared its own wrapper — which produced 12
 * distinct max-widths and left 62 pages pinned at a flat `px-4` while the
 * header, footer and home sections all grew to `md:px-8`. On any viewport
 * wider than `md` the chrome breathed and the content did not.
 *
 * The gutter ladder deliberately matches the one Header/Footer already use, so
 * a page's left edge lines up with the nav above it at every breakpoint. The
 * caps are tokens (`--container-page|reading|form` in src/index.css) rather
 * than literals so the whole site's measure is one line of CSS.
 *
 * Never hand-roll `container mx-auto px-4 py-8` again — ESLint errors on it in
 * src/pages/**. See docs/design-system/README.md §Page layout.
 */

import React from 'react';
import { cn } from '@/lib/utils';

/** The shared gutter ladder. Exported for the handful of non-component call
 *  sites that must apply it to an element they don't own (AdminShell's <main>,
 *  the Header's full-bleed bar rows, BreadcrumbBar). */
export const PAGE_GUTTER = 'px-4 sm:px-6 md:px-8';

/** The single vertical value. One rhythm site-wide — pages do not opt into a
 *  roomier or tighter one; a page that needs its own bands passes `flush`. */
export const PAGE_VERTICAL = 'py-8 md:py-12';

const SIZE = {
  /** 1600 — grids, listings, detail pages. The default. */
  page: 'max-w-page',
  /** 768 — long-form prose, where line length beats using the space. */
  reading: 'max-w-reading',
  /** 512 — single-column forms, auth, steppers. */
  form: 'max-w-form',
} as const;

export type PageContainerSize = keyof typeof SIZE;

interface PageContainerProps extends React.HTMLAttributes<HTMLElement> {
  size?: PageContainerSize;
  /** Drop the vertical padding — for pages that render their own full-bleed
   *  bands and manage the rhythm between them (heroes, map/list splits). */
  flush?: boolean;
  /** Render as something other than a div (`article`, `section`, `main`). */
  as?: React.ElementType;
  children?: React.ReactNode;
}

export const PageContainer = ({
  size = 'page',
  flush = false,
  as: Component = 'div',
  className,
  children,
  ...rest
}: PageContainerProps) => (
  <Component
    className={cn('mx-auto w-full', SIZE[size], PAGE_GUTTER, !flush && PAGE_VERTICAL, className)}
    {...rest}
  >
    {children}
  </Component>
);
