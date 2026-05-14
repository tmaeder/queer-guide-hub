# Aceternity UI Effects — Phase 2 Design

## Context
Phase 1 delivered 7 effects (TextGenerateEffect, SpotlightEffect, BackgroundDots, BentoGrid, MovingBorder, CardHoverEffect, InfiniteMovingCards) integrated into homepage, about page, VenueCard, and EventCard. Phase 2 covers the remaining 4 areas: page transitions, detail pages, listing pages, navigation/header, plus ambient premium effects.

## 18 Effects

### Page Transitions
1. Direction-aware page transitions (forward=slide-left, back=slide-right via useNavigationType)
2. Skeleton-to-content crossfade (blur(4px) → blur(0) ContentReveal wrapper)
3. Shared element hero transition (View Transitions API on card→detail hero)

### Detail Pages
4. Tab content crossfade (AnimatePresence mode="wait" on tab panels)
5. Scroll-triggered section reveals (FadeIn/SlideIn on detail sections)
6. Enhanced parallax hero (scale 1.05→1.0 + overlay opacity on scroll)
7. Scroll progress bar (2px line, useScroll from motion/react)

### Listing Pages
8. View mode morphing (grid↔map layout animation or crossfade)
9. Filter panel spring slide (stagger items on mobile Sheet, scale pills on desktop)
10. Animated empty states (icon pulse + stagger text)

### Navigation & Header
11. Search bar expand (spring width + backdrop blur + stagger pills)
12. Menu item stagger (desktop dropdown cascade + mobile drawer slide)
13. Notification pulse (CSS ping keyframe on count change)

### Ambient Premium
14. Magnetic buttons globally (MagneticButton + Tappable on all primary CTAs)
15. Animated underline links (scaleX from center on hover)
16. Cursor spotlight on all cards (CardHoverEffect on City/Hotel/Marketplace/Personality/News cards)
17. Floating label inputs (placeholder→label spring animation)
18. Grain texture overlay (SVG noise at 2-3% opacity on hero sections)

## Implementation Order
5 → 4 → 12 → 11 → 16 → 14 → 7 → 6 → 15 → 13 → 18 → 10 → 9 → 17 → 2 → 1 → 8 → 3
