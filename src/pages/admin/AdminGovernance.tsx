/**
 * Governance — one route over the three surfaces that run the ingest machine.
 *
 * `?mode=triage` decide items · `?mode=engines` watch engines · `?mode=merge`
 * merge by hand.
 *
 * WHY A ROUTER AND NOT A MERGE. These are three different interaction
 * archetypes, not three copies of one thing: triage is list → detail → act
 * (archetype F), engines is a registry of dashboards (H), and merge is a list
 * of PAIRS, which `src/config/adminArchetypes.ts` documents as unable to adopt
 * `AdminCompareFrame` precisely because that frame models ONE side-by-side
 * comparison. Flattening them into a single layout would mean rebuilding all
 * three. So the three page components stay exactly as they are and this picks
 * between them.
 *
 * EACH PAGE KEEPS ITS OWN HEADER, DELIBERATELY. The obvious tidy-up is to strip
 * the three `<h1>`s and give this wrapper one. That breaks
 * `e2e/admin-inbox-renders.spec.ts`, which gates on an EXACT `Inbox` heading and
 * is the only regression guard for the unfiltered triage union — the union that
 * was down for six weeks behind an error banner while every per-queue deep link
 * kept working. A redundant heading is a smaller cost than losing that.
 *
 * `?mode=` AND `?queue=` ARE ORTHOGONAL. `?queue=` already partitions triage
 * into 16 sub-views, so `/admin/governance?mode=triage&queue=quality-city` is a
 * valid and meaningful URL. The mode switcher below preserves every other
 * parameter for that reason.
 */

import { lazy, Suspense, useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { Inbox, ShieldCheck, CopyCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AdminTableSkeleton } from '@/components/admin/primitives/AdminLoading';

const AdminInbox = lazy(() => import('./AdminInbox'));
const QualityHub = lazy(() => import('./QualityHub'));
const AdminDuplicates = lazy(() => import('./AdminDuplicates'));

export type GovernanceMode = 'triage' | 'engines' | 'merge';

const MODES: Array<{ key: GovernanceMode; label: string; hint: string; icon: LucideIcon }> = [
  { key: 'triage', label: 'Triage', hint: 'Decide the items waiting on a person', icon: Inbox },
  { key: 'engines', label: 'Engines', hint: 'Watch the automated quality engines', icon: ShieldCheck },
  { key: 'merge', label: 'Merge', hint: 'Find and merge duplicates by hand', icon: CopyCheck },
];

/** Unrecognised values fall back to triage rather than rendering nothing. */
function parseMode(raw: string | null): GovernanceMode {
  return raw === 'engines' || raw === 'merge' ? raw : 'triage';
}

export default function AdminGovernance() {
  const [searchParams, setSearchParams] = useSearchParams();
  const mode = parseMode(searchParams.get('mode'));

  useEffect(() => {
    document.title = 'Governance · Admin · Queer Guide';
  }, []);

  const switchTo = (next: GovernanceMode) => {
    const params = new URLSearchParams(searchParams);
    params.set('mode', next);
    // `?queue=` belongs to triage only; carrying it into engines or merge would
    // put a stale filter in the URL that neither surface reads.
    if (next !== 'triage') params.delete('queue');
    setSearchParams(params, { replace: true });
  };

  return (
    /**
     * TRIAGE NEEDS A DEFINITE HEIGHT AND IS THE ONLY MODE THAT DOES.
     *
     * `AdminShell`'s `<main>` is the scroll container and the last box in the chain
     * with a definite height; the two wrappers below it (`max-w-page`, `content-enter`)
     * are auto-height, so a percentage height here resolves to auto and `h-full` was
     * ALREADY a no-op. That is why `TriageView` carried its own
     * `h-[calc(100vh-8rem)]` — the only definite height in the page, measured from
     * the viewport rather than from where the box actually starts, which put its
     * bottom edge (and the action bar pinned there) below the fold.
     *
     * Derivation of 15rem = 240px, so the next reader can re-check it rather than
     * trust it: breadcrumb band `min-h-11` (44) + `AdminAreaHint` (~34) + `<main>`'s
     * own `py-12` top AND bottom (96) + this mode nav (~61) = 235px. `/admin/governance`
     * is deliberately NOT `adopted` in `adminArchetypes.ts`, which is why the first two
     * terms are there at all.
     *
     * COMPUTED FROM THE CSS, NOT MEASURED IN A BROWSER — `/admin/*` sits behind
     * `AdminRouteGuard`, so verifying it live needs an admin session. Check it at
     * 1440x900 before trusting the exact figure; the `min-h` floor is what keeps a
     * wrong number survivable rather than blank.
     *
     * A constant is a standing bet that nobody adds a band above it, which is exactly
     * how the last one broke. The bet is smaller now: the variable chrome that made
     * any constant unstable — `AutomationStatusCard` (110-150px depending on data) and
     * a rewrapping four-line keyboard paragraph — is gone from this surface, leaving
     * the nav and one `<h1>`, both fixed.
     *
     * Per-mode because `AdminDuplicates` and `QualityHub` are normally-scrolling pages
     * and clipping them would be a new bug.
     */
    <div
      className={
        mode === 'triage'
          ? 'flex flex-col h-[calc(100dvh-15rem)] min-h-[32rem]'
          : 'flex flex-col h-full'
      }
    >
      <nav
        aria-label="Governance mode"
        className="flex flex-wrap gap-2 border-b border-border px-4 py-2 bg-background"
      >
        {MODES.map(({ key, label, hint, icon: Icon }) => {
          const active = key === mode;
          return (
            <Button
              key={key}
              type="button"
              size="sm"
              // The Button primitive owns the selected/unselected polarity, so
              // it stays correct in both themes. Hand-rolling it as
              // `bg-foreground text-background` reads as ink and IS ink in light
              // mode — which is why that shape passes review and every
              // class-name test, and inverts in dark mode.
              variant={active ? 'default' : 'outline'}
              onClick={() => switchTo(key)}
              aria-current={active ? 'page' : undefined}
              title={hint}
            >
              <Icon size={14} aria-hidden="true" className="mr-1.5" />
              {label}
            </Button>
          );
        })}
      </nav>

      <div className="flex-1 min-h-0">
        {/* Skeleton, not a spinner with a word: this is a first load of a whole
            mode, and a bare "Loading…" collapses the layout so the page reads as
            stuck rather than as arriving. */}
        <Suspense fallback={<AdminTableSkeleton />}>
          {mode === 'triage' && <AdminInbox />}
          {mode === 'engines' && <QualityHub />}
          {mode === 'merge' && <AdminDuplicates />}
        </Suspense>
      </div>
    </div>
  );
}
