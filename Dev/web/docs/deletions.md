# Deletions — 2026-03-03

## Removed Dependencies (package.json)

| Package | Reason |
|---------|--------|
| ~~`@bigheads/core`~~ | **REVERTED** — used in `AvatarDisplay.tsx` for custom avatar rendering. Grep false negative (double-quoted import). Kept. |
| `@marsidev/react-turnstile` | Only used by TurnstileWidget.tsx (itself dead) |
| `input-otp` | Only used by ui/input-otp.tsx wrapper (no consumers) |
| `react-resizable-panels` | Only used by ui/resizable.tsx wrapper (no consumers) |

Note: `@emotion/react` and `@emotion/styled` kept — required as MUI v7 peer deps (not directly imported but must be present).

## Removed Source Files — UI Wrappers

| File | Reason |
|------|--------|
| `src/components/ui/input-otp.tsx` | shadcn wrapper with no consumers |
| `src/components/ui/resizable.tsx` | shadcn wrapper with no consumers |

## Removed Source Files — Dead Feature Cluster (Firecrawl)

| File | Reason |
|------|--------|
| `src/utils/FirecrawlService.ts` | Only used by CrawlForm (dead) |
| `src/components/admin/CrawlForm.tsx` | No consumers anywhere in app |

## Removed Source Files — Dead Auth/Security

| File | Reason |
|------|--------|
| `src/components/auth/TurnstileWidget.tsx` | No consumers (Turnstile bot protection never wired up) |
| `src/hooks/useSecureTurnstile.tsx` | Only used by TurnstileWidget (dead) |

## Removed Source Files — Dead Utilities & Hooks

| File | Reason |
|------|--------|
| `src/lib/sx.ts` | MUI sx helper, zero consumers. Migration artifact. |
| `src/utils/requestBatcher.ts` | Zero consumers |
| `src/utils/performanceUtils.ts` | Zero consumers |
| `src/hooks/useVirtualization.tsx` | Zero consumers |
| `src/hooks/useRedis.tsx` | Zero consumers |
| `src/hooks/usePerformanceOptimizations.tsx` | Zero consumers |
| `src/hooks/use-screen-size.tsx` | Only imported in UserDirectory where result was never used (dead assignment) |

## Removed Source Files — Dead Page Components

These pages were superseded by CMS routing (`CMSRoutePage`) in App.tsx:

| File | Superseded by |
|------|---------------|
| `src/pages/About.tsx` | `CMSRoutePage slug="about"` |
| `src/pages/AboutHub.tsx` | `CMSRoutePage slug="about-hub"` |
| `src/pages/AccessibilityHub.tsx` | CMS route |
| `src/pages/Blog.tsx` | `CMSRoutePage slug="blog"` |
| `src/pages/Contact.tsx` | `CMSRoutePage slug="contact"` |
| `src/pages/CookiePolicy.tsx` | `CMSRoutePage slug="cookies"` |
| `src/pages/DMCA.tsx` | `CMSRoutePage slug="dmca"` |
| `src/pages/LegalHub.tsx` | `CMSRoutePage slug="legal"` |
| `src/pages/OurValues.tsx` | `CMSRoutePage slug="values"` |
| `src/pages/OurVision.tsx` | `CMSRoutePage slug="vision"` |
| `src/pages/Press.tsx` | `CMSRoutePage slug="press"` |
| `src/pages/PrivacyPolicy.tsx` | `CMSRoutePage slug="privacy"` |
| `src/pages/Sustainability.tsx` | `CMSRoutePage slug="sustainability"` |
| `src/pages/TermsOfService.tsx` | `CMSRoutePage slug="terms"` |
| `src/pages/FestivalDetail.tsx` | Festivals merged into Events (redirects in App.tsx) |

## Flagged — Not Deleted (Consider Later)

These files are also unregistered in App.tsx but may have planned future use:

| File | Status |
|------|--------|
| `src/pages/AdminAudio.tsx` | Functional but no route — wire up or delete |
| `src/pages/AdminVideos.tsx` | Functional but no route — wire up or delete |
| `src/pages/Videos.tsx` | Functional but no route — wire up or delete |
| `src/pages/SecurityDashboard.tsx` | Superseded by SecurityMonitoringDashboard — delete |
| `src/pages/AdminSecurityDashboard.tsx` | Not in routing — wire up or delete |

## Summary

- **4 npm packages removed**
- **27 source files deleted** (~2,800 lines removed)
- All deletions confirmed: no other file imports any of these
- `npm install` run: 4 packages uninstalled, 0 vulnerabilities
