// Display formatter for news_articles.tags[].
//
// Tags are stored slug-form (lowercase, dash-separated) and normalized by the
// DB write-gate public.normalize_news_tags() — see migration
// 20260619120000_news_tag_vocabulary.sql. This turns a stored slug like
// "same-sex-marriage" / "lgbtqia+" / "hiv-aids" into a clean chip label
// ("Same-Sex Marriage" / "LGBTQIA+" / "HIV/AIDS") for NewsCard + NewsDetail.

// Whole-slug overrides (win over token-by-token formatting).
const WHOLE_OVERRIDES: Record<string, string> = {
  'hiv-aids': 'HIV/AIDS',
  'rupauls-drag-race': "RuPaul's Drag Race",
  'us-politics': 'US Politics',
  'uk-politics': 'UK Politics',
  'uk-news': 'UK News',
  // canonical multi-word tags with a meaningful internal hyphen
  'same-sex-marriage': 'Same-Sex Marriage',
  'same-sex-relationships': 'Same-Sex Relationships',
  'same-sex-couples': 'Same-Sex Couples',
  'anti-trans-legislation': 'Anti-Trans Legislation',
  'anti-lgbtqia-laws': 'Anti-LGBTQIA Laws',
  'gender-affirming-care': 'Gender-Affirming Care',
  'non-binary': 'Non-Binary',
};

// Tokens (between dashes) that have a fixed casing.
const ACRONYMS: Record<string, string> = {
  'lgbtqia+': 'LGBTQIA+',
  lgbtqia: 'LGBTQIA',
  'lgbtq+': 'LGBTQ+',
  lgbtq: 'LGBTQ',
  lgbti: 'LGBTI',
  lgbt: 'LGBT',
  hiv: 'HIV',
  aids: 'AIDS',
  prep: 'PrEP',
  hrt: 'HRT',
  sti: 'STI',
  std: 'STD',
  bdsm: 'BDSM',
  dei: 'DEI',
  us: 'US',
  usa: 'USA',
  uk: 'UK',
  eu: 'EU',
  un: 'UN',
  tv: 'TV',
  ai: 'AI',
  nba: 'NBA',
  wnba: 'WNBA',
  nfl: 'NFL',
  nhl: 'NHL',
  mlb: 'MLB',
  ncaa: 'NCAA',
  wwe: 'WWE',
  fifa: 'FIFA',
  bbc: 'BBC',
  nhs: 'NHS',
  glaad: 'GLAAD',
  idahobit: 'IDAHOBIT',
  nyc: 'NYC',
  dc: 'DC',
};

/** Format a stored news tag slug into a human-readable chip label. */
export function formatNewsTag(tag: string): string {
  const slug = (tag ?? '').trim().toLowerCase();
  if (!slug) return '';
  if (WHOLE_OVERRIDES[slug]) return WHOLE_OVERRIDES[slug];

  return slug
    .split('-')
    .filter(Boolean)
    .map((token) => {
      if (ACRONYMS[token]) return ACRONYMS[token];
      // keep a trailing "+" attached (e.g. a future "lgbtqi+" token)
      return token.charAt(0).toUpperCase() + token.slice(1);
    })
    .join(' ');
}
