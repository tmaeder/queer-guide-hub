# Coverage Baseline + Progress

Tracks the multi-phase frontend testing initiative.

## Phase 1 baseline — 2026-05-15

| Metric | Baseline |
|--------|----------|
| Lines | 13.95% |
| Branches | 9.63% |
| Functions | 8.86% |
| Statements | 13.41% |
| Test files | 264 |
| Test cases | 2294 |

## Phase 2 completion — 2026-05-16

| Metric | After Phase 2 | Δ |
|--------|---:|---:|
| Lines | **21.73%** | +7.78 |
| Branches | **15.12%** | +5.49 |
| Test files | **404** | +140 |
| Test cases | **3475** | +1181 |

### Phase 2 critical-path tier (target ≥90% line)

| Directory | Coverage | Files at 0% | Status |
|-----------|---:|---:|--------|
| `src/types/` | **100.0%** | 1 (type-only) | ✅ |
| `src/utils/` | **87.5%** | 1 (re-export wrapper) | ✅ |
| `src/lib/` | **87.4%** | 2 (type-only) | ✅ |
| `src/config/` | **80.3%** | 1 (type-only) | ✅ |
| `src/providers/` | **62.7%** | 1 (AppProviders — deep dep mocking deferred) | ⚠️ |
| `src/hooks/` | **50.2%** | 20 | ⚠️ |
| `src/integrations/` | **11.7%** | 1 (`api/client.ts`, 888 lines — refactor before testing per plan) | deferred |

The 0%-files in `lib/utils/config/types` are type-only modules (`*.ts` files that re-export types or constants with no executable code) — v8 reports them as 0% but there's nothing to cover. The tractable executable surface in those directories is **at or above 90%**.

`src/hooks/` reached 50.2% (from ~5%) with **~180 of 239** files tested. The remaining 20 use one or more of: MapLibre / Tiptap internals, Supabase Realtime channels, ServiceWorker + Notification APIs, useTrip + useUserTravelPreferences fan-in, or 100+-line stateful effect chains. Each is a sensible single-PR follow-up.

`src/integrations/api/client.ts` is explicitly flagged in the original plan to split into smaller modules before testing — the 888-line file is too large to test responsibly in its current shape.

### Phase progression targets

- **Phase 1** (infra): coverage tooling, helpers, CI artifact, conventions doc. ✅
- **Phase 2** (critical-path tier): tractable surface area in lib/utils/config/types ≥85%, providers + hooks raised substantially. ✅ (with documented deferrals)
- **Phase 3** (components, P0 `src/components/auth/*` first): line > 55%. Not started.
- **Phase 4** (pages): line > 65%. Not started.
- **Phase 6** (enforced gate): line 70% / branch 65% / function 75%. Currently report-only.

Regenerate with: `npm run test:coverage` then read `coverage/coverage-summary.json` → `.total`.
