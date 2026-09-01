/**
 * trip-safety-narrative — generate an AI narrative safety briefing
 * for a trip, synthesizing country equality data + recent
 * LGBTQ+-relevant news.
 *
 * POST { trip_id: string, refresh?: boolean }
 * → { narrative, country_ids, article_count, risk_level, generated_at }
 *
 * Cached per trip for 7 days; `refresh: true` forces regeneration.
 * Returns the cached row when fresh. Written by service role, read
 * via RLS (trip_safety_briefings_select).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';
import { anthropicMessages } from '../_shared/anthropic-shim.ts';
import { getCorsHeaders } from '../_shared/supabase-client.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsFor = (req: Request) => ({
  ...getCorsHeaders(req),
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
});

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type Risk = 'low' | 'moderate' | 'high' | 'critical';

interface CrimJson {
  legal?: boolean;
  death_penalty?: string;
  /**
   * The real column names. This interface declared `max_penalty` until
   * 2026-08-07 — a field `countries.lgbti_criminalization` has never had — so
   * the "(max: …)" clause below always interpolated undefined and was dropped
   * from the prompt entirely. The model has never been told a sentence length.
   */
  penalty?: string;
  max_prison?: string;
}

interface CountryRow {
  id: string;
  name: string;
  equality_score: number | null;
  lgbti_criminalization: CrimJson | null;
}

interface ArticleRow {
  title: string;
  excerpt: string | null;
  published_at: string;
  lgbti_relevance_score: number | null;
  sensitivity_flags: string[] | null;
}

function isCriminalized(c: CrimJson | null | undefined): boolean {
  if (!c) return false;
  if (c.legal === false) return true;
  return /^yes$/i.test(String(c.death_penalty ?? '').trim());
}

/**
 * Mirrors `deathPenaltyRisk` in src/utils/equalityScore.ts. ILGA splits the
 * fact across two fields: Nigeria flags 'Yes' while its penalty prose names
 * only prison, and Afghanistan/Pakistan/Qatar/Somalia/UAE record
 * 'No legal certainty' while naming the death penalty in `penalty`. Reading
 * either field alone misclassifies one of those groups.
 */
function deathPenaltyRisk(c: CrimJson | null | undefined): 'confirmed' | 'possible' | 'none' {
  if (!c) return 'none';
  const dp = String(c.death_penalty ?? '').trim();
  if (/^yes$/i.test(dp) || /death/i.test(dp)) return 'confirmed';
  if (/no legal certainty/i.test(dp)) return 'possible';
  return /death/i.test(String(c.penalty ?? '')) ? 'possible' : 'none';
}

function overallRisk(countries: CountryRow[]): Risk {
  if (countries.some((c) => deathPenaltyRisk(c.lgbti_criminalization) !== 'none')) return 'critical';
  if (countries.some((c) => isCriminalized(c.lgbti_criminalization))) return 'high';
  const min = countries.reduce<number>((acc, c) => {
    if (c.equality_score == null) return acc;
    return Math.min(acc, c.equality_score);
  }, 100);
  if (min < 40) return 'high';
  if (min < 60) return 'moderate';
  return 'low';
}

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadContext(supabase: any, tripId: string) {
  const { data: places, error: placesErr } = await supabase
    .from('trip_places')
    .select('country_id')
    .eq('trip_id', tripId);
  if (placesErr) throw placesErr;

  const countryIds = [
    ...new Set(((places ?? []) as { country_id: string | null }[]).map((p) => p.country_id).filter(Boolean) as string[]),
  ];

  if (countryIds.length === 0) {
    return { countries: [] as CountryRow[], articles: [] as ArticleRow[], countryIds };
  }

  const { data: countries } = await supabase
    .from('countries')
    .select('id, name, equality_score, lgbti_criminalization')
    .in('id', countryIds);

  const sinceIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: articles } = await supabase
    .from('news_articles')
    .select('title, excerpt, published_at, lgbti_relevance_score, sensitivity_flags, country_ids')
    .overlaps('country_ids', countryIds)
    .gte('published_at', sinceIso)
    .order('published_at', { ascending: false })
    .limit(20);

  return {
    countries: (countries ?? []) as CountryRow[],
    articles: (articles ?? []) as ArticleRow[],
    countryIds,
  };
}

async function generateNarrative(
  countries: CountryRow[],
  articles: ArticleRow[],
  risk: Risk,
): Promise<string> {
  const countryLine = countries
    .map((c) => {
      // "equality n/a" rather than a number: a missing score must not reach the
      // model as a value it can reason about.
      const score = c.equality_score != null ? `equality ${c.equality_score}/100` : 'equality n/a';
      const maxPenalty =
        c.lgbti_criminalization?.max_prison || c.lgbti_criminalization?.penalty || null;
      const crim = isCriminalized(c.lgbti_criminalization)
        ? `, same-sex acts criminalized${maxPenalty ? ` (max: ${maxPenalty})` : ''}`
        : '';
      const risk = deathPenaltyRisk(c.lgbti_criminalization);
      const death =
        risk === 'confirmed'
          ? ', death penalty applies'
          : risk === 'possible'
            ? ', death penalty recorded as possible with no legal certainty (do not describe this as settled either way)'
            : '';
      return `${c.name} — ${score}${crim}${death}`;
    })
    .join('\n');

  const relevantArticles = articles
    .filter((a) => (a.lgbti_relevance_score ?? 0) >= 0.3 || (a.sensitivity_flags && a.sensitivity_flags.length > 0))
    .slice(0, 10);

  const articleLine = relevantArticles
    .map((a) => `- ${a.title}${a.excerpt ? ` — ${a.excerpt.slice(0, 160)}` : ''}`)
    .join('\n') || '(no relevant recent articles)';

  const prompt = `You are a travel safety briefer for LGBTQ+ travelers. Write a calm, factual 3–4 sentence briefing based on the data below. No hedging filler, no emoji, no headings. Speak to the traveler in second person.

Overall risk: ${risk}

Countries on this trip:
${countryLine}

Relevant news last 30 days:
${articleLine}

Focus on: what the current situation means for an LGBTQ+ traveler (practical, not alarmist), any recent shifts they should know about, and one concrete cautionary note if the data warrants it. If the data is benign, say so plainly — do not invent concerns.`;

  const body = await anthropicMessages({
    callerFn: 'trip-safety-narrative',
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = body?.content?.[0]?.text?.trim();
  if (!text) throw new Error('empty claude response');
  return text;
}

Deno.serve(async (req) => {
  const cors = corsFor(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405, headers: cors });
  }
  try {
    const auth = req.headers.get('authorization') ?? '';
    const jwt = auth.replace(/^Bearer\s+/i, '');
    if (!jwt) {
      return new Response(JSON.stringify({ error: 'missing auth' }), {
        status: 401,
        headers: { ...cors, 'content-type': 'application/json' },
      });
    }

    const userClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: userResp } = await userClient.auth.getUser();
    if (!userResp?.user?.id) {
      return new Response(JSON.stringify({ error: 'invalid auth' }), {
        status: 401,
        headers: { ...cors, 'content-type': 'application/json' },
      });
    }

    const { trip_id, refresh } = await req.json();
    if (!trip_id) {
      return new Response(JSON.stringify({ error: 'trip_id required' }), {
        status: 400,
        headers: { ...cors, 'content-type': 'application/json' },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    if (!refresh) {
      const { data: cached } = await admin
        .from('trip_safety_briefings')
        .select('*')
        .eq('trip_id', trip_id)
        .maybeSingle();
      if (cached && Date.now() - new Date(cached.generated_at).getTime() < CACHE_TTL_MS) {
        return new Response(JSON.stringify(cached), {
          headers: { ...cors, 'content-type': 'application/json' },
        });
      }
    }

    const { countries, articles, countryIds } = await loadContext(admin, trip_id);
    if (countries.length === 0) {
      return new Response(
        JSON.stringify({ error: 'no countries resolved for this trip' }),
        { status: 400, headers: { ...cors, 'content-type': 'application/json' } },
      );
    }

    const risk = overallRisk(countries);
    const narrative = await generateNarrative(countries, articles, risk);

    const row = {
      trip_id,
      narrative,
      country_ids: countryIds,
      article_count: articles.length,
      risk_level: risk,
      generated_at: new Date().toISOString(),
    };

    const { error: upErr } = await admin.from('trip_safety_briefings').upsert(row);
    if (upErr) throw upErr;

    return new Response(JSON.stringify(row), {
      headers: { ...cors, 'content-type': 'application/json' },
    });
  } catch (err) {
    console.error('trip-safety-narrative failed', err);
    return new Response(
      JSON.stringify({ error: 'internal server error' }),
      { status: 500, headers: { ...cors, 'content-type': 'application/json' } },
    );
  }
});
