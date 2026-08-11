// Feature flags. Read from Vite env vars at build time.

const truthy = (v: string | undefined) => v === 'true' || v === '1' || v === 'yes';

// MAP_SHELL_ENABLED removed 2026-08-10. It gated the unified MapShell against
// the legacy per-surface ExploreMap chrome, and `VITE_MAP_SHELL: 'true'` was
// set in BOTH deploy-pages.yml and ci.yml — so the off-branch had not rendered
// for anyone, anywhere, in a long time while still costing four dead fallbacks
// and three skipped e2e specs. /map, the city + country map tabs and the search
// results map now go straight to MapShell.
// (Note: /venues still mounts ExploreMap directly with its own layer + filter
// panels. That is a separate, genuinely live surface — not this flag.)

// VENUES_V2_ENABLED — personalized + gamified /venues experience
// (editorial rails, personal stats strip, leaderboard widget, ranked RPC).
// ON by default everywhere. Set VITE_VENUES_V2=false to opt out of the new
// experience and fall back to the legacy flat-grid /venues.
export const VENUES_V2_ENABLED = (() => {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    if (params.get('ff') === 'venues_v2') return true;
    if (params.get('ff') === 'venues_v1') return false;
  }
  const v = import.meta.env.VITE_VENUES_V2;
  if (v === 'false' || v === '0' || v === 'no') return false;
  return true;
})();

// EDITORIAL_DETAIL_LAYOUT_ENABLED — hybrid editorial layout for city / country /
// queer-village detail pages: editorial header + sticky section nav + long-scroll
// anchored sections, replacing the dense tab pattern. Off by default. Enable per
// session with ?ff=editorial_detail or globally via VITE_EDITORIAL_DETAIL=true.
export const EDITORIAL_DETAIL_LAYOUT_ENABLED = (() => {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    if (params.get('ff') === 'editorial_detail') return true;
    if (params.get('ff') === 'editorial_detail_off') return false;
  }
  return truthy(import.meta.env.VITE_EDITORIAL_DETAIL);
})();

// TRAVEL_HUB_V2_ENABLED removed 2026-08-05. It gated a dual-branch /travel hub
// (TripCockpit + named editorial rails vs the legacy trip hero). /travel is now
// the Travelling intent — a single composite page — so there is no second branch
// left to switch between. A flag whose branches have collapsed is worse than no
// flag: it reads as a live kill switch that does nothing.
// VITE_TRAVEL_HUB_V2 / ?ff=travel_hub_v2 are now inert and can be dropped from
// any environment that still sets them.
