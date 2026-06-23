/**
 * useCockpitLayout — per-admin cockpit layout, persisted in profiles.preferences.cockpit.
 * Resolves the active layout for the current role by merging the saved slice over
 * deriveDefaultLayout (so newly-shipped widgets appear automatically). Writes are
 * optimistic: we patch the shared profile cache, then persist to Supabase.
 */

import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useProfile, profileQueryKey, type Profile } from '@/hooks/useProfile';
import { useGranularRoles } from '@/hooks/useGranularRoles';
import {
  COCKPIT_WIDGETS,
  deriveDefaultLayout,
  eligibleWidgets,
  getWidget,
} from '@/config/cockpitWidgets';
import type { CockpitWidgetDef } from '@/components/admin/cockpit/types';

interface LayoutSlice {
  order: string[];
  hidden: string[];
  pinned: string[];
}

interface CockpitPrefs {
  version: number;
  byRole: Record<string, LayoutSlice>;
}

const EMPTY_SLICE: LayoutSlice = { order: [], hidden: [], pinned: [] };

function readPrefs(profile: Profile | null | undefined): CockpitPrefs | null {
  const prefs = (profile?.preferences as Record<string, unknown> | null) ?? null;
  const cockpit = prefs?.cockpit as CockpitPrefs | undefined;
  return cockpit ?? null;
}

export function useCockpitLayout() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { effectiveRole } = useGranularRoles();
  const qc = useQueryClient();

  const role = effectiveRole;
  const cockpitPrefs = readPrefs(profile);
  const slice = cockpitPrefs?.byRole?.[role] ?? EMPTY_SLICE;

  const resolved = useMemo(() => {
    const eligible = eligibleWidgets(role);
    const eligibleIds = new Set(eligible.map((w) => w.id));
    const defaults = deriveDefaultLayout(role);

    const savedOrder = (slice.order ?? []).filter((id) => eligibleIds.has(id));
    const order = [...savedOrder, ...defaults.filter((id) => !savedOrder.includes(id))];
    const hidden = new Set((slice.hidden ?? []).filter((id) => eligibleIds.has(id)));
    const pinned = (slice.pinned ?? []).filter((id) => eligibleIds.has(id));

    const visibleIds = order.filter((id) => !hidden.has(id));
    const widgets = visibleIds
      .map((id) => getWidget(id))
      .filter((w): w is CockpitWidgetDef => Boolean(w));

    return {
      order,
      widgets,
      eligible,
      visibleIds: new Set(visibleIds),
      hidden,
      pinned,
    };
  }, [role, slice.order, slice.hidden, slice.pinned]);

  const persist = useCallback(
    (next: LayoutSlice) => {
      if (!user) return;
      const cached = qc.getQueryData<Profile | null>(profileQueryKey(user.id));
      const prefs = (cached?.preferences as Record<string, unknown> | null) ?? {};
      const prevCockpit = (prefs.cockpit as CockpitPrefs | undefined) ?? { version: 1, byRole: {} };
      const nextCockpit: CockpitPrefs = {
        version: 1,
        byRole: { ...prevCockpit.byRole, [role]: next },
      };
      const nextPrefs = { ...prefs, cockpit: nextCockpit };

      // Optimistic cache patch so the grid reflects the change immediately.
      if (cached) {
        qc.setQueryData<Profile | null>(profileQueryKey(user.id), {
          ...cached,
          preferences: nextPrefs as Profile['preferences'],
        });
      }
      void supabase.from('profiles').update({ preferences: nextPrefs }).eq('user_id', user.id);
    },
    [user, qc, role],
  );

  const currentSlice = useCallback(
    (): LayoutSlice => ({
      order: resolved.order,
      hidden: [...resolved.hidden],
      pinned: [...resolved.pinned],
    }),
    [resolved],
  );

  const toggleVisible = useCallback(
    (id: string) => {
      const s = currentSlice();
      const hidden = s.hidden.includes(id)
        ? s.hidden.filter((x) => x !== id)
        : [...s.hidden, id];
      persist({ ...s, hidden });
    },
    [currentSlice, persist],
  );

  const reorder = useCallback(
    (newVisibleOrder: string[]) => {
      const s = currentSlice();
      const hiddenTail = s.order.filter((id) => s.hidden.includes(id));
      persist({ ...s, order: [...newVisibleOrder, ...hiddenTail] });
    },
    [currentSlice, persist],
  );

  const togglePin = useCallback(
    (id: string) => {
      const s = currentSlice();
      if (s.pinned.includes(id)) {
        persist({ ...s, pinned: s.pinned.filter((x) => x !== id) });
      } else {
        persist({
          ...s,
          pinned: [...s.pinned, id],
          order: [id, ...s.order.filter((x) => x !== id)],
        });
      }
    },
    [currentSlice, persist],
  );

  const resetToDefault = useCallback(() => {
    persist({ order: [], hidden: [], pinned: [] });
  }, [persist]);

  return {
    widgets: resolved.widgets,
    eligible: resolved.eligible,
    visibleIds: resolved.visibleIds,
    pinned: resolved.pinned,
    totalWidgets: COCKPIT_WIDGETS.length,
    toggleVisible,
    reorder,
    togglePin,
    resetToDefault,
  };
}
