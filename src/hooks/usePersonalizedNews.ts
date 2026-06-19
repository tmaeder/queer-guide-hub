import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useSavedNewsArticles } from '@/hooks/useSavedNewsArticles';
import { useUserTravelPreferences } from '@/hooks/useUserTravelPreferences';

// Client-side "For You" ranking over the in-memory candidate pool already
// loaded by useNews (≤200 rows). No RPC, no migration — see the redesign plan.
//
// Anonymous users rank by followed topics + recency + popularity. Signed-in
// users additionally weight profile interests, saved-article categories, and
// home location, and de-prioritize already-read articles.

type Candidate = Record<string, unknown> & {
  id: string;
  published_at?: string | null;
  views_count?: number | null;
  tags?: string[] | null;
  category?: string | null;
  category_canonical?: string | null;
  country_ids?: string[] | null;
  city_ids?: string[] | null;
};

interface Signals {
  followed: Set<string>;
  interests: Set<string>;
  savedCategories: Set<string>;
  readIds: Set<string>;
  homeCountryId: string | null;
  homeCityId: string | null;
}

const HOUR_MS = 60 * 60 * 1000;

function topicSlugs(a: Candidate): string[] {
  const out: string[] = [];
  if (a.category_canonical) out.push(String(a.category_canonical).toLowerCase());
  if (a.category) out.push(String(a.category).toLowerCase());
  for (const t of a.tags ?? []) out.push(String(t).toLowerCase());
  return out;
}

function scoreArticle(a: Candidate, s: Signals, nowMs: number): number {
  const slugs = topicSlugs(a);
  const slugSet = new Set(slugs);

  let score = 0;

  // Followed topics — the strongest explicit signal.
  let topicMatches = 0;
  for (const f of s.followed) if (slugSet.has(f)) topicMatches += 1;
  if (topicMatches > 0) score += 3.0 + 0.5 * (topicMatches - 1);

  // Profile interests.
  let interestMatches = 0;
  for (const i of s.interests) if (slugSet.has(i)) interestMatches += 1;
  if (interestMatches > 0) score += 2.0;

  // Affinity with categories the user has saved.
  for (const slug of slugs) {
    if (s.savedCategories.has(slug)) {
      score += 1.5;
      break;
    }
  }

  // Home location.
  if (s.homeCountryId && (a.country_ids ?? []).includes(s.homeCountryId)) {
    score += 1.5;
    if (s.homeCityId && (a.city_ids ?? []).includes(s.homeCityId)) score += 0.5;
  }

  // Recency — exponential decay, ~2.0 fresh, ~1.0 at 24h, ~0.25 at 48h.
  if (a.published_at) {
    const ageHours = Math.max(0, (nowMs - new Date(a.published_at).getTime()) / HOUR_MS);
    score += 2.0 * Math.pow(0.5, ageHours / 24);
  }

  // Light popularity tiebreaker, capped so a viral piece can't dominate.
  score += Math.min(0.5, (a.views_count ?? 0) * 0.0005);

  // Already read → sink to the bottom but keep visible.
  if (s.readIds.has(a.id)) score -= 100;

  return score;
}

export function usePersonalizedNews(articles: Candidate[], followed: string[]) {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { items: saved } = useSavedNewsArticles({ limit: 50 });
  const { data: travelPrefs } = useUserTravelPreferences();
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  // Load the read-set for the current candidate pool (signed-in only).
  const candidateIdsKey = useMemo(() => articles.map((a) => a.id).join(','), [articles]);
  useEffect(() => {
    if (!user || articles.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing read-set with external data; resets when the user signs out or candidates change.
      setReadIds(new Set());
      return;
    }
    let cancelled = false;
    const ids = articles.map((a) => a.id);
    (async () => {
      const { data } = await supabase
        .from('user_news_reads' as never)
        .select('article_id' as never)
        .eq('user_id' as never, user.id as never)
        .in('article_id' as never, ids as never);
      if (cancelled) return;
      setReadIds(
        new Set(
          ((data ?? []) as unknown as Array<{ article_id: string }>).map((r) => r.article_id),
        ),
      );
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- candidateIdsKey captures the article set; user.id drives the refetch.
  }, [user?.id, candidateIdsKey]);

  const signals: Signals = useMemo(() => {
    const interestsRaw = (profile?.interests as unknown) ?? [];
    const interests = new Set<string>(
      (Array.isArray(interestsRaw) ? interestsRaw : [])
        .filter((x): x is string => typeof x === 'string')
        .map((x) => x.toLowerCase()),
    );
    const savedCategories = new Set<string>(
      saved.map((s) => (s.category ?? '').toLowerCase()).filter(Boolean),
    );
    return {
      followed: new Set(followed.map((f) => f.toLowerCase())),
      interests,
      savedCategories,
      readIds,
      homeCountryId: travelPrefs?.home_country_id ?? null,
      homeCityId: travelPrefs?.home_city_id ?? null,
    };
  }, [profile?.interests, saved, followed, readIds, travelPrefs]);

  // Whether the user has ANY personalization signal. Drives the cold-state prompt.
  const hasSignals =
    signals.followed.size > 0 ||
    signals.interests.size > 0 ||
    signals.savedCategories.size > 0 ||
    !!signals.homeCountryId;

  const ranked = useMemo(() => {
    // eslint-disable-next-line react-hooks/purity -- Date.now() snapshot recomputes when articles/signals change, the intended cadence.
    const nowMs = Date.now();
    return [...articles]
      .map((a) => ({ a, score: scoreArticle(a, signals, nowMs) }))
      .sort((x, y) => y.score - x.score)
      .map((x) => x.a);
  }, [articles, signals]);

  return { ranked, hasSignals };
}
