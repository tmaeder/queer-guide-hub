# Admin Console — Automation-First Redesign

Date: 2026-05-23
Status: Draft for review
Author: brainstorm session

## Goal

Improve Admin Console UX and dramatically reduce moderator workload by automating decisions
the system can make itself, while making the work that requires humans faster, keyboard-driven,
and bulk-friendly.

## Context (current state)

- 35+ admin pages under `src/pages/Admin*.tsx` + `src/pages/admin/`
- Sidebar in 4 sections (Cockpit, Content, Import & Review, System) — `src/config/adminNavigation.ts`
- TriageView with 9 queue types (staging, moderation, submissions, content, tags, duplicates,
  automation, news-quality, entity-links)
- Pipeline builder with 16 tabs at `/admin/pipelines`
- Bento dashboard cockpit, mostly read-only status
- Counts batched via `get_admin_counts` RPC ✓
- Per-item review actions; bulk ops exist but are not first-class
- No global command palette; no schema-driven generation; no moderator-facing rules engine

## Pain points

1. Navigation breadth >> depth — 35 destinations, easy to get lost
2. Triage queues overlap conceptually; moderators must pick the right one
3. Pipeline builder is a power-user surface with no progressive disclosure
4. Manual decisions that the system already knows the answer to (LLM gates, similarity, age)
5. No SLA/aging signal in nav — overdue items hide inside totals
6. No "save this as a rule" bridge from one-off bulk action to lasting automation
7. Audit + undo are inconsistent across destinations
8. Some settings pages (Cloudflare, Email Templates, Affiliates, Maps, Security) are
   top-level destinations that should be tabs

## Approaches considered

- **A — Triage-First Console**: Collapse to one unified work surface. Big refactor; risks
  one-size-fits-all.
- **B — Automation-First Console**: Keep nav roughly as-is; make queues close to empty by
  default via rules + AI suggestions + bulk + SLA promotion. Incremental, compounding. ⭐
- **C — Schema-Driven Admin**: Generate every CRUD page from a registry. High upfront
  investment, deferred value. Defer to later.

Recommendation: **Approach B**. It produces visible relief in days and compounds. B's
groundwork is the natural foundation for C later.

## Design

### D1. Global Command Palette (Cmd-K)
- Single shortcut from anywhere in `/admin/**`
- Indexes nav items, recent entities, queues, saved filters, and **actions**
- Backed by Meilisearch admin index + local action registry
- New file: `src/components/admin/command-palette/CommandPalette.tsx`
- New hook: `src/hooks/useAdminCommandPalette.ts`

### D2. Unified Inbox (`/admin/inbox`)
- Default landing page for moderators
- Single stream merging review_queue, moderation, submissions, news-quality, duplicates,
  entity-links, feedback
- One row = one decision; AI suggestion pre-selected
- Group by SLA bucket: Overdue / Today / This week / Auto-cleared
- Keyboard: `J/K` nav, `A` approve, `R` reject, `M` merge, `T` tag, `Shift+A`
  approve-similar, `U` undo (5s toast)
- TriageView becomes one "lens" inside

### D3. Rules Engine (`/admin/automation/rules`)
- Visual builder open to moderators (not admin-only): WHEN ... AND ... THEN ...
- Triggers: ingestion arrival, quality score, source, geo, fingerprint cluster, LLM tag,
  queue age
- Actions: auto-approve, auto-reject (reason code), route to queue, assign user, tag,
  email-template-reply, schedule re-evaluation
- Every rule has a 7-day dry-run preview (would-have-done green/red counts) before activation
- All actions audited with `actor='rule:<id>'`
- "Suggest a rule" button: LLM proposes a rule from last 100 manual decisions on current filter
- New tables: `automation_rules`, `automation_rule_runs` (audit)
- New edge function: `automation-rule-engine`

### D4. SLA & Aging Surface
- Sidebar counters show overdue badges (red dot if > SLA), not just totals
- Cockpit "What needs me now" cell pulls top 5 oldest unblocked items across queues
- SLA config per entity type in `automation_settings`
- Modify `get_admin_counts` RPC to return `{ total, overdue }`

### D5. Bulk Everything
- Every list view (content tables + inbox) gets first-class bulk select + action bar
- Verbs: approve, reject, retag, reassign, export CSV, "save as rule…"
- "Save as rule" is the bridge from one-off bulk action to lasting automation
- Shared `BulkActionBar` component in `src/components/admin/data-table/`

### D6. AI Co-pilot Sidecar
- Right drawer on every detail view (`AdminEntityDetail` shell)
- Shows LLM risk score, suggested tags, duplicate candidates with similarity,
  suggested decision + rationale, recent similar items
- "Accept all" promotes pre-filled fields to the form with diff preview
- Reuses models already in `marketplace-relevance` + `pipeline-enrich-news`
- New edge function: `admin-copilot-suggestions`

### D7. Self-Service Source Operators
- Promote auto-pause/auto-resume rules per source (circuit breaker already in pipeline)
- "Problem sources" smart-list as permanent cockpit cell

### D8. Unified Settings
- Merge `/admin/settings`, `/admin/email-templates`, `/admin/cloudflare`,
  `/admin/affiliates`, `/admin/security`, `/admin/maps` config under `/admin/settings/*`
  with left sub-nav
- Each is a tab, not a top-level destination
- System sidebar group shrinks from 13 → ~5 items

### D9. Process Automations (concrete first batch)

| # | Process | Today | Automated |
|---|---|---|---|
| 1 | Marketplace duplicate clusters | manual review | auto-merge similarity > 0.92 + same merchant; queue only borderline |
| 2 | Broken affiliate links | weekly review | `marketplace-link-checker` auto-demotes; queue only on re-promotion |
| 3 | News relevance | manual reject | LLM gate already; expose threshold slider; auto-archive < 0.3 |
| 4 | Duplicate venues from extension submissions | manual | auto-merge if matched on name_trgm + lat/lng within 50m; else triage |
| 5 | Tag normalization | manual retag | nightly job collapses synonyms via `unified_tags` aliases |
| 6 | Event expiry / past events | manual archive | cron auto-archives where end_at < now() - 7d |
| 7 | Image rejections | manual | NSFW + dimension + license rules; auto-reject with reason code |
| 8 | User-submitted city/country misspellings | manual | fuzzy-match to existing cities.name ≥ 0.85; admin confirms once → rule |
| 9 | Quality-score below floor | manual | auto-reject with template reply; moderator sees only appeals |
| 10 | Stale `is_featured` flags | manual | nightly job demotes after 30d unless renewed |

### D10. Audit & Undo as First-Class
- Universal 5-second undo toast for every destructive admin action
- Every rule + manual action lands in `audit_log` with diff payload
- `/admin/audit?since=24h` view for the "what changed today" question

### D11. Sidebar Cleanup
- 4 sections retained, regrouped:
  - **Cockpit** — Overview + new Inbox
  - **Content** — counts show overdue badge, not totals only
  - **Automation** *(new, promoted)* — Rules, Pipelines, Ingestion Rules, Source Health
  - **System** — Settings tree, Users, Analytics, Audit, Search Intelligence
- 35 sidebar items → ~22

### D12. Mobile-first ops
- Cockpit + Inbox fully touch-usable
- Key actions in bottom action sheet
- Everything else stays desktop-only

## Phased delivery

| Phase | Length | Scope |
|---|---|---|
| α | 1 wk | D1 Cmd-K, D5 Bulk everywhere, D10 Undo toast |
| β | 1–2 wk | D2 Unified Inbox (skin over TriageView), D4 SLA badges |
| γ | 2–3 wk | D3 Rules engine MVP (4 triggers, 5 actions, dry-run) + D9 batch 1–4 |
| δ | 2 wk | D6 AI sidecar on top-3 entity types + D9 batch 5–10 |
| ε | 1 wk | D11 Sidebar regroup, D8 Settings tree |

Total: ~7–9 weeks. Each phase ships independently and produces measurable queue-depth
reduction.

## Success metrics

- Median time per moderator decision: target -50%
- Items requiring human review per 1k ingested: target -70%
- p95 queue age for actionable items: target ≤ defined SLA
- Sidebar destinations clicked per session: target -40% (more work done from Inbox + Cmd-K)
- Audit completeness: 100% of admin mutations attributed (manual or rule)

## Open questions / decisions deferred

- Specific SLA values per entity type (suggest moderator interview pass)
- Rule action permissions: should "auto-reject with template reply" require admin role
  the first time it's deployed?
- LLM provider for "Suggest a rule" — reuse Claude Haiku gate or upgrade to Sonnet for
  reasoning quality?
- Cmd-K index scope: include scrape sources, audit entries, or only entities + actions in v1?

## Non-goals

- Schema-driven CRUD generation (Approach C) — deferred to a follow-up plan
- Rewriting pipeline-builder UX — out of scope; surfaced through Cmd-K + Automation section
- Replacing TriageView wholesale — wraps it as a lens in Inbox
