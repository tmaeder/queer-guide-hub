import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { needLabel, slugsForNeed } from '@/lib/accessibilityNeeds';

/**
 * Traveling preference chips (profile-settings redesign §7, Model 2).
 *
 * The user's saved preferences (profiles.travel_preferences jsonb +
 * profiles.interests[]) render as live chips inside search/filter surfaces.
 * Tap toggles a chip off for the session (sessionStorage, shared across
 * surfaces); "forget" removes it from the profile permanently. Deliberately
 * react-query-free so it can mount in provider-less hosts (VenueFilters).
 */

export type PreferenceChipKind = 'interest' | 'budget' | 'accessibility';

export interface PreferenceChip {
  /** `${kind}:${value}` — stable across surfaces and sessions. */
  id: string;
  kind: PreferenceChipKind;
  value: string;
  label: string;
  active: boolean;
}

interface TravelPrefs {
  budget_level?: string | null;
  accessibility_needs?: string[];
  [key: string]: unknown;
}

const SESSION_KEY = 'qg-pref-chips-session';
const PROMPT_KEY = 'qg-pref-default-prompt';
const PREFS_EVENT = 'qg-prefs-updated';

const BUDGET_LABELS: Record<string, string> = {
  budget: 'Budget',
  mid_range: 'Mid-range',
  luxury: 'Luxury',
};

/** budget_level → universal-search priceRange. */
export const BUDGET_PRICE_RANGE: Record<string, [number, number]> = {
  budget: [0, 100],
  mid_range: [0, 300],
  luxury: [300, 1000],
};

/** priceRange → budget_level, for the "save as my default" affordance. */
export function budgetLevelForRange(range: [number, number]): string {
  const max = range[1];
  if (max <= 120) return 'budget';
  if (max <= 400) return 'mid_range';
  return 'luxury';
}

function readSessionOverrides(): Record<string, boolean> {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function writeSessionOverrides(overrides: Record<string, boolean>) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(overrides));
  } catch {
    /* private mode — session toggles just won't persist */
  }
}

interface PrefsData {
  userId: string;
  interests: string[];
  travel: TravelPrefs;
}

async function fetchPrefs(): Promise<PrefsData | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('interests, travel_preferences')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw error;
  const row = (data ?? {}) as { interests?: unknown; travel_preferences?: unknown };
  return {
    userId: user.id,
    interests: Array.isArray(row.interests) ? (row.interests as string[]) : [],
    travel: (row.travel_preferences ?? {}) as TravelPrefs,
  };
}

/**
 * Merge a patch into profiles.travel_preferences (read-modify-write) and
 * notify every mounted chip instance. Used by the save-as-default prompts.
 */
export async function saveTravelPreference(patch: Partial<TravelPrefs>): Promise<void> {
  const current = await fetchPrefs();
  if (!current) return;
  const next: TravelPrefs = { ...current.travel, ...patch };
  for (const key of Object.keys(next)) {
    if (next[key] === null || next[key] === undefined) delete next[key];
  }
  const { error } = await supabase
    .from('profiles')
    .update({ travel_preferences: next, updated_at: new Date().toISOString() })
    .eq('user_id', current.userId);
  if (error) throw error;
  window.dispatchEvent(new Event(PREFS_EVENT));
}

/** One "save as my default" prompt per session, across all surfaces. */
export function useDefaultPromptGate(shouldOffer: boolean): {
  show: boolean;
  dismiss: () => void;
} {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!shouldOffer || show) return;
    try {
      if (sessionStorage.getItem(PROMPT_KEY)) return;
      sessionStorage.setItem(PROMPT_KEY, '1');
    } catch {
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- claims the per-session prompt slot in sessionStorage (external system) and reflects the claim into state; React Compiler can't infer the sync direction.
    setShow(true);
  }, [shouldOffer, show]);
  return { show, dismiss: useCallback(() => setShow(false), []) };
}

export function usePreferenceChips(kinds: PreferenceChipKind[]) {
  const [prefs, setPrefs] = useState<PrefsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [overrides, setOverrides] = useState<Record<string, boolean>>(readSessionOverrides);

  useEffect(() => {
    let mounted = true;
    const load = () => {
      fetchPrefs()
        .then((d) => {
          if (mounted) {
            setPrefs(d);
            setLoading(false);
          }
        })
        .catch(() => {
          if (mounted) setLoading(false);
        });
    };
    load();
    window.addEventListener(PREFS_EVENT, load);
    return () => {
      mounted = false;
      window.removeEventListener(PREFS_EVENT, load);
    };
  }, []);

  const kindsKey = kinds.join(',');
  const chips: PreferenceChip[] = useMemo(() => {
    if (!prefs) return [];
    const wanted = new Set(kindsKey.split(','));
    const out: PreferenceChip[] = [];
    const build = (kind: PreferenceChipKind, value: string, label: string) => {
      const id = `${kind}:${value}`;
      // Interests are opt-in per session (a vibe filter can empty a result
      // grid); budget + accessibility apply by default.
      const defaultActive = kind !== 'interest';
      out.push({ id, kind, value, label, active: overrides[id] ?? defaultActive });
    };
    if (wanted.has('accessibility')) {
      for (const need of prefs.travel.accessibility_needs ?? []) {
        build('accessibility', need, needLabel(need));
      }
    }
    if (wanted.has('budget') && prefs.travel.budget_level) {
      build(
        'budget',
        prefs.travel.budget_level,
        BUDGET_LABELS[prefs.travel.budget_level] ?? prefs.travel.budget_level.replace('_', ' '),
      );
    }
    if (wanted.has('interest')) {
      for (const vibe of prefs.interests) build('interest', vibe, vibe);
    }
    return out;
  }, [prefs, overrides, kindsKey]);

  const toggle = useCallback((id: string) => {
    setOverrides((prev) => {
      const defaultActive = !id.startsWith('interest:');
      const current = prev[id] ?? defaultActive;
      const next = { ...prev, [id]: !current };
      writeSessionOverrides(next);
      return next;
    });
  }, []);

  const forget = useCallback(
    async (chip: PreferenceChip) => {
      if (!prefs) return;
      if (chip.kind === 'interest') {
        const interests = prefs.interests.filter((i) => i !== chip.value);
        const { error } = await supabase
          .from('profiles')
          .update({ interests, updated_at: new Date().toISOString() })
          .eq('user_id', prefs.userId);
        if (error) throw error;
      } else if (chip.kind === 'budget') {
        await saveTravelPreference({ budget_level: null });
        return; // saveTravelPreference already dispatched the refresh event
      } else {
        await saveTravelPreference({
          accessibility_needs: (prefs.travel.accessibility_needs ?? []).filter(
            (n) => n !== chip.value,
          ),
        });
        return;
      }
      window.dispatchEvent(new Event(PREFS_EVENT));
    },
    [prefs],
  );

  return { chips, loading, signedIn: !!prefs, toggle, forget };
}

/** Active accessibility chips → venue accessibility_attributes slugs (union). */
export function accessibilitySlugsFromChips(chips: PreferenceChip[]): string[] {
  const slugs = new Set<string>();
  for (const c of chips) {
    if (c.kind !== 'accessibility' || !c.active) continue;
    for (const s of slugsForNeed(c.value)) slugs.add(s);
  }
  return [...slugs];
}

/** Active interest chips → tag filter values. */
export function tagsFromChips(chips: PreferenceChip[]): string[] {
  return chips.filter((c) => c.kind === 'interest' && c.active).map((c) => c.value);
}

/** Active budget chip → search priceRange (first wins; there is only one). */
export function priceRangeFromChips(chips: PreferenceChip[]): [number, number] | null {
  const budget = chips.find((c) => c.kind === 'budget' && c.active);
  return budget ? (BUDGET_PRICE_RANGE[budget.value] ?? null) : null;
}
