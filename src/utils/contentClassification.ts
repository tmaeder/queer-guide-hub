/**
 * Content classification logic — portable (no Deno/Supabase deps).
 *
 * Re-exports the pure rule-based classification and priority computation
 * from the edge function's content-classifier for use in frontend code
 * and testing. The AI-powered classification lives server-side only.
 */

export type SensitivityCategory = 'legal' | 'medical' | 'nsfw';

export interface SensitivityFlag {
  category: SensitivityCategory;
  confidence: number;
  indicators: string[];
  severity: 'low' | 'medium' | 'high';
}

export interface ClassificationInput {
  content_type: 'venues' | 'events' | 'news_articles' | 'personalities';
  title: string;
  description?: string;
  tags?: string[];
  category?: string;
  source?: string;
  location?: string;
  country?: string;
}

// ---------------------------------------------------------------------------
// Pattern sets
// ---------------------------------------------------------------------------

const LGBTI_STRONG_SIGNALS = [
  /\b(lgbtq?\+?i?a?\+?|queer|gay|lesbian|bisexual|transgender|trans\b|nonbinary|non-binary|intersex|asexual|pansexual)\b/i,
  /\b(pride\s*(parade|march|festival|month|week|event)|drag\s*(show|queen|king|brunch|race))\b/i,
  /\b(same[- ]sex|civil\s*union|marriage\s*equality|gay\s*rights|trans\s*rights)\b/i,
  /\b(coming\s*out|closet(ed)?|conversion\s*therapy|don't\s*ask.?don't\s*tell)\b/i,
  /\b(stonewall|harvey\s*milk|marsha\s*p?\s*johnson|section\s*28|sodomy\s*law)\b/i,
  /\b(gay\s*bar|leather\s*bar|cruise\s*bar|bear\s*bar|dyke\s*bar)\b/i,
  /\b(gender\s*identity|sexual\s*orientation|gender\s*expression|gender\s*affirming)\b/i,
  /\b(hiv|prep\b|antiretroviral|chemsex)\b/i,
];

const LGBTI_WEAK_SIGNALS = [
  /\b(rainbow|ally|inclusive|diversity|affirming|safe\s*space)\b/i,
  /\b(kink|fetish|bdsm|polyamor)/i,
  /\b(hormone|transition|top\s*surgery|bottom\s*surgery)\b/i,
];

const LEGAL_INDICATORS = [
  /\b(criminali[sz](ed?|ation)|decriminali[sz]|death\s*penalty|prison|jail|arrest(ed)?|detention|asylum|refugee)\b/i,
  /\b(anti[- ]?(lgbtq?|gay|trans|homosexuality)\s*(law|bill|legislation|act|ban))\b/i,
  /\b(hate\s*crime|discrimination\s*(law|suit|case)|human\s*rights\s*(violation|abuse|court))\b/i,
  /\b(section\s*377|don't\s*say\s*gay|propaganda\s*law|bathroom\s*bill|religious\s*freedom\s*(act|bill))\b/i,
  /\b(court\s*ruling|supreme\s*court|legal\s*challenge|lawsuit|litigation|prosecution)\b/i,
  /\b(ban\s*on\s*(same[- ]sex|gay|trans)|conversion\s*therapy\s*ban)\b/i,
];

const MEDICAL_INDICATORS = [
  /\b(hiv|aids|prep\b|pep\b|antiretroviral|viral\s*load|cd4|sti|std)\b/i,
  /\b(gender[- ]affirming\s*(care|surgery|hormone)|hrt|hormone\s*therapy|puberty\s*blocker)\b/i,
  /\b(mental\s*health|suicide|self[- ]harm|depression|anxiety|eating\s*disorder)\b/i,
  /\b(monkeypox|mpox|hepatitis|syphilis|gonorrh[eo]a|chlamydia)\b/i,
  /\b(conversion\s*therapy|reparative\s*therapy|ex[- ]gay\s*therapy)\b/i,
  /\b(therapy|therapist|counseling|psychiatr|psycholog|clinic|healthcare|treatment)\b/i,
];

const NSFW_INDICATORS = [
  /\b(nsfw|adult[- ]only|18\+|xxx|explicit|nude|naked|sex\s*party|orgy|cruising\s*area)\b/i,
  /\b(porn|eroti[ck]|strip\s*club|sex\s*shop|sex\s*club|bathhouse|sauna\s*club)\b/i,
  /\b(bdsm|kink\s*club|fetish\s*party|leather\s*event|puppy\s*play|fisting)\b/i,
  /\b(onlyfans|cam\s*model|escort|sex\s*work|prostitut)\b/i,
  /\b(chemsex|poppers|party\s*and\s*play|pnp)\b/i,
];

const KNOWN_LGBTI_SOURCES = [
  'advocate', 'them.us', 'pinknews', 'lgbtqnation', 'gaycities', 'spartacus',
  'outmagazine', 'into', 'queerty', 'autostraddle', 'dazeddigital', 'gaytimes',
  'losangelesblade', 'washingtonblade', 'phillygaynews', 'bayareaporter',
  'metrweekly', 'windy-city-times', 'towleroad', 'instinctmagazine',
  'gaystarnews', 'mambaonline', 'starobserver', 'dallasvoice', 'pridesource',
];

// ---------------------------------------------------------------------------
// Pre-classification (pure, no AI)
// ---------------------------------------------------------------------------

export function preClassify(input: ClassificationInput) {
  const text = [
    input.title,
    input.description?.slice(0, 2000),
    input.tags?.join(' '),
    input.category,
    input.location,
    input.country,
  ].filter(Boolean).join(' ');

  const strongSignals = LGBTI_STRONG_SIGNALS.filter(re => re.test(text)).length;
  const weakSignals = LGBTI_WEAK_SIGNALS.filter(re => re.test(text)).length;

  const sourceLower = (input.source || '').toLowerCase();
  const knownSource = KNOWN_LGBTI_SOURCES.some(s => sourceLower.includes(s));

  const matchIndicators = (patterns: RegExp[]): string[] => {
    const matches: string[] = [];
    for (const re of patterns) {
      const match = text.match(re);
      if (match) matches.push(match[0].trim());
    }
    return [...new Set(matches)];
  };

  return {
    strongSignals,
    weakSignals,
    knownSource,
    sensitivity: {
      legal: matchIndicators(LEGAL_INDICATORS),
      medical: matchIndicators(MEDICAL_INDICATORS),
      nsfw: matchIndicators(NSFW_INDICATORS),
    },
  };
}

// ---------------------------------------------------------------------------
// Review priority computation
// ---------------------------------------------------------------------------

export function computeReviewPriority(
  relevanceScore: number,
  flags: SensitivityFlag[],
): 'low' | 'normal' | 'high' | 'urgent' {
  const highSeverityFlags = flags.filter(f => f.severity === 'high');
  const categoriesWithFlags = new Set(flags.map(f => f.category));

  if (relevanceScore < 0.5 && highSeverityFlags.length > 0) return 'urgent';
  if (categoriesWithFlags.has('legal') && categoriesWithFlags.has('nsfw')) return 'urgent';
  if (highSeverityFlags.length > 0) return 'high';
  if (categoriesWithFlags.size >= 2) return 'high';
  if (relevanceScore < 0.7 || flags.length > 0) return 'normal';
  return 'low';
}
