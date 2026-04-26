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

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type Risk = 'low' | 'moderate' | 'high' | 'critical';

interface CrimJson {
  legal?: boolean;
  death_penalty?: string;
  max_penalty?: string;
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
  return c.legal === false;
}

function hasDeathPenalty(c: CrimJson | null | undefined): boolean {
  if (!c) return false;
  const dp = String(c.death_penalty ?? '');
  return dp.includes('Death') || dp === 'Yes';
}

function overallRisk(countries: CountryRow[]): Risk {
  if (countries.some((c) => hasDeathPenalty(c.lgbti_criminalization))) return 'critical';
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
      const score = c.equality_score != null ? `equality ${c.equality_score}/100` : 'equality n/a';
      const crim = isCriminalized(c.lgbti_criminalization)
        ? `, same-sex acts criminalized${c.lgbti_criminalization?.max_penalty ? ` (max: ${c.lgbti_criminalization.max_penalty})` : ''}`
        : '';
      const death = hasDeathPenalty(c.lgbti_criminalization) ? ', death penalty applies' : '';
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

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${await res.text()}`);
  const body = await res.json();
  const text = body?.content?.[0]?.text?.trim();
  if (!text) throw new Error('empty claude response');
  return text;
}

serve(async (req) => {
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
    return new Response(
      JSON.stringify({ error: String((err as Error).message ?? err) }),
      { status: 500, headers: { ...cors, 'content-type': 'application/json' } },
    );
  }
});
