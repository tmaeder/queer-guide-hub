# Subway system polish and distillation

Date: 2026-10-02
Status: Approved

## Purpose

Refine the shipped subway-map design system into a finished product experience.
The subway identity must remain unmistakable, while the interface becomes calmer,
less repetitive, and easier to scan across desktop and mobile.

The supplied `Queer Guide subway map design` remains the visual authority. This
pass preserves product content, functionality, accessibility, safety behavior,
and production data.

## Chosen direction

Use an **integrated transit-editorial** system. Tracks and stations communicate
location, grouping, and movement; they are not ambient decoration. Paper, ink,
Anton, Space Grotesk, and the four track colors remain the identity foundation.

The rejected alternatives are:

- copying the front-page mock literally across every product surface, which does
  not scale to dense account, community, marketplace, or admin tasks;
- adding more tracks and animation, which would increase visual noise rather than
  resolve the current lack of coordination.

## Hierarchy contract

Every page follows the same reading order:

1. route context or track family;
2. one dominant Anton page title;
3. a short explanatory lead and one primary action;
4. filters and secondary actions;
5. main content sections;
6. supporting metadata and tertiary controls.

Hierarchy is established through scale, spacing, alignment, density, and contrast.
Track color indicates route context and state; it must not compete with titles,
photography, or primary actions. Desktop and mobile preserve the same semantic
order even when their geometry changes.

## Decluttering rules

- One primary action per major view. Secondary actions remain visible only when
  they support the immediate task; tertiary actions use progressive disclosure.
- Remove duplicate controls between the header, page chrome, and mobile bottom
  navigation.
- Never render two network illustrations for the same context.
- Remove track wallpaper from behind content and photography.
- Flatten nested cards and containers. Use spacing and tonal bands before adding
  another border, shadow, or background.
- Remove headings or paragraphs that repeat information already established by
  the page title, route context, or adjacent control.
- Preserve capabilities: decluttering changes presentation and access paths, not
  the available product functions.

## Shared-shell changes

### Header

- Reduce the expanded desktop shell to one quieter navigation plane.
- Keep the wordmark, search, primary route access, contribution action, and user
  controls, but remove redundant framing and excess vertical height.
- On mobile, do not repeat actions already owned by the bottom navigation.
- Compact-on-scroll remains, but its change in density must be subtle and stable.

### Homepage

- Merge the decorative hero network and functional intent network into one
  interactive composition.
- The first viewport contains one title, one lead, one search action, one quiet
  map link, and the beginning of the functional network.
- Stations are the navigation. They use concise labels and reveal supporting copy
  only where space and context justify it.
- Mobile uses its own cropped vertical/diagonal composition rather than shrinking
  desktop geometry.

### Interior pages

- Remove the fixed ambient network backdrop.
- Replace the 96px decorative rail with a compact family masthead that identifies
  route family, page context, and active line before local content begins.
- Breadcrumbs, route context, and the family masthead must read as one hierarchy,
  not three stacked bars.

### Surfaces

- Reduce generic card borders and shadows.
- Use paper/wash contrast and spacing for grouping.
- Keep station rings, track strokes, image ratios, title measures, and optical
  alignment consistent across route families.

## Page-template grammar

The supplied Entity, Place, Travel, Marketplace, Discovery, Community,
Messaging, Account, and Static template examples establish the reusable page
grammar. The implementation adapts these patterns through shared components:

- list and landing pages: route context, dominant Anton title, short lead,
  primary action, then filters and results;
- entity and place pages: route identity, title/lead, one action cluster, then
  facts or stations in divided rows;
- task surfaces: one large working plane with selected states in ink and track
  colour reserved for route/status cues;
- account and settings flows: contained panels are allowed when they establish a
  focused task boundary, but controls inside stay flat and row-based;
- editorial and legal pages: narrow readable measures, strong heading steps,
  quiet metadata, and no decorative UI competing with prose;
- mobile: the same semantic order in a vertical composition, with route lines
  cropped or reoriented instead of shrinking a desktop canvas.

The example documents' sample content and presentation-only controls are not
product requirements. Existing data, safety behavior, permissions, routing,
localization, and working interaction patterns remain authoritative.

## Motion

- Motion is reserved for route travel, line drawing, station arrival, loading,
  and direct interaction feedback.
- Remove continuous decorative network floating.
- Each navigation event produces one coordinated journey, never multiple
  simultaneous line animations.
- Reduced motion shows the complete route and state immediately.

## Verification

The pass is complete only when:

- desktop, intermediate, and mobile screenshots show a clear focal point and
  reading order on the homepage and representative route families;
- no page contains decorative track wallpaper behind primary content;
- duplicate actions and repeated chrome are removed without losing capabilities;
- keyboard, touch, focus, dark-theme choice, locale, RTL, reduced-motion, loading,
  empty, and error behavior remain correct;
- component tests, design-system E2E, page-layout E2E, accessibility sweeps,
  typecheck, lint, production build, and bundle-shape checks pass;
- the deployed production site passes the rendered subway-system E2E suite.
