/**
 * useCockpitSections — which cockpit sections this admin has hidden, per role,
 * persisted in profiles.preferences.cockpit.
 *
 * Replaces useCockpitLayout. Same storage location and same optimistic
 * cache-patch-then-persist write path; what went away is the widget layout it
 * used to hold (order + pinned + per-widget hidden), which existed to serve a
 * drag-reorderable bento that no longer exists.
 *
 * Version 2. A stale v1 blob stores widget ids in `hidden` (e.g. 'systemHealth'),
 * which match no section id — so reads filter `hidden` against the known ids and
 * a v1 blob resolves to "everything visible" rather than hiding something at
 * random. The version bump is what makes that safe to reason about; do not reuse
 * the key without it.
 */

import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useProfile, profileQueryKey, type Profile } from '@/hooks/useProfile';
import { useGranularRoles } from '@/hooks/useGranularRoles';
import { roleAtLeast, type AdminRole } from '@/config/adminRoles';

export type CockpitSectionId = 'needs-you' | 'broken' | 'jump-to' | 'footprint';

export interface CockpitSectionDef {
  id: CockpitSectionId;
  label: string;
  description: string;
  minRole: AdminRole;
}

/** The status line is deliberately absent: it is the page's answer to "is
 *  anything wrong", so it is not hideable. */
export const COCKPIT_SECTIONS: readonly CockpitSectionDef[] = [
  {
    id: 'needs-you',
    label: 'Needs you',
    description: 'Review queues with pending work, most urgent first.',
    minRole: 'editor',
  },
  {
    id: 'broken',
    label: 'Broken',
    description: 'Failing automations, pipeline errors, release gates, failed imports.',
    minRole: 'moderator',
  },
  {
    id: 'jump-to',
    label: 'Jump to',
    description: 'Shortcuts to the content areas, with row counts.',
    minRole: 'editor',
  },
  {
    id: 'footprint',
    label: 'Footprint',
    description: 'How much of everything exists.',
    minRole: 'editor',
  },
];

const SECTION_IDS = new Set<string>(COCKPIT_SECTIONS.map((s) => s.id));

interface SectionSlice {
  hidden: CockpitSectionId[];
}

interface CockpitPrefs {
  version: number;
  byRole: Record<string, SectionSlice>;
}

function readPrefs(profile: Profile | null | undefined): CockpitPrefs | null {
  const prefs = (profile?.preferences as Record<string, unknown> | null) ?? null;
  return (prefs?.cockpit as CockpitPrefs | undefined) ?? null;
}

export function useCockpitSections() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { effectiveRole } = useGranularRoles();
  const qc = useQueryClient();

  const role = effectiveRole;
  const savedHidden = readPrefs(profile)?.byRole?.[role]?.hidden;

  const hidden = useMemo(() => {
    // Filtering against the known ids is what makes a v1 layout blob harmless.
    return new Set((savedHidden ?? []).filter((id) => SECTION_IDS.has(id)));
  }, [savedHidden]);

  /** Sections this role may see at all, in display order. */
  const eligible = useMemo(
    () => COCKPIT_SECTIONS.filter((s) => roleAtLeast(role, s.minRole)),
    [role],
  );

  const persist = useCallback(
    (nextHidden: CockpitSectionId[]) => {
      if (!user) return;
      const cached = qc.getQueryData<Profile | null>(profileQueryKey(user.id));
      const prefs = (cached?.preferences as Record<string, unknown> | null) ?? {};
      const prev = (prefs.cockpit as CockpitPrefs | undefined) ?? { version: 2, byRole: {} };
      const cockpit: CockpitPrefs = {
        version: 2,
        byRole: { ...prev.byRole, [role]: { hidden: nextHidden } },
      };
      // `preferences` is a generated `Json` column. An interface like
      // CockpitPrefs is not assignable to Json (Json's index signature cannot
      // absorb a declared interface), so TS refuses the direct assertion —
      // widen through `unknown` once here rather than at each use site.
      const nextPrefs = { ...prefs, cockpit } as unknown as Profile['preferences'];

      // Optimistic cache patch so the feed reflects the change immediately.
      if (cached) {
        qc.setQueryData<Profile | null>(profileQueryKey(user.id), {
          ...cached,
          preferences: nextPrefs,
        } as Profile);
      }
      void supabase.from('profiles').update({ preferences: nextPrefs }).eq('user_id', user.id);
    },
    [user, qc, role],
  );

  const isVisible = useCallback(
    (id: CockpitSectionId) => !hidden.has(id) && eligible.some((s) => s.id === id),
    [hidden, eligible],
  );

  const toggle = useCallback(
    (id: CockpitSectionId) => {
      const next = hidden.has(id) ? [...hidden].filter((x) => x !== id) : [...hidden, id];
      persist(next);
    },
    [hidden, persist],
  );

  const reset = useCallback(() => persist([]), [persist]);

  return { isVisible, toggle, reset, eligible, hidden };
}
