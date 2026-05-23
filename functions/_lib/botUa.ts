/**
 * Search-engine and social-card crawler user-agent detection.
 *
 * Substring match (case-insensitive). Keep this list narrow: real browsers
 * occasionally include some of these substrings, so we match against tokens
 * specific enough that false positives are rare.
 */
const BOT_UA_TOKENS = [
  // Search engines
  'googlebot',
  'google-inspectiontool',
  'storebot-google',
  'google-extended',
  'bingbot',
  'bingpreview',
  'adidxbot',
  'msnbot',
  'slurp',
  'duckduckbot',
  'duckassistbot',
  'baiduspider',
  'sogou',
  'yandexbot',
  'yandeximages',
  'applebot',
  'applebot-extended',
  'seznambot',
  'qwantify',
  'mojeekbot',
  'petalbot',
  'naverbot',
  'kakaobot',
  // Social cards / link previews
  'facebookexternalhit',
  'facebookcatalog',
  'meta-externalagent',
  'twitterbot',
  'linkedinbot',
  'whatsapp',
  'telegrambot',
  'discordbot',
  'pinterest',
  'redditbot',
  'embedly',
  'quora link preview',
  'slackbot-linkexpanding',
  'showyoubot',
  'outbrain',
  'vkshare',
  'tumblr',
  'snapchat',
  'iframely',
  // Validators / archives / SEO crawlers
  'w3c_validator',
  'ia_archiver',
  'archive.org_bot',
  'mj12bot',
  'ahrefsbot',
  'semrushbot',
  'screamingfrog',
  'sitebulb',
  'oncrawl',
  'lighthouse',
  'chrome-lighthouse',
  // AI crawlers (declare presence so we can serve them the same
  // crawler body as Google; robots.txt holds the actual policy).
  'gptbot',
  'oai-searchbot',
  'chatgpt-user',
  'perplexitybot',
  'claudebot',
  'anthropic-ai',
  'ccbot',
];

export function isBotUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return BOT_UA_TOKENS.some((tok) => ua.includes(tok));
}
