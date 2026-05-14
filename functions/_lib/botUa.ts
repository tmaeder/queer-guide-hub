/**
 * Search-engine and social-card crawler user-agent detection.
 *
 * Substring match (case-insensitive). Keep this list narrow: real browsers
 * occasionally include some of these substrings, so we match against tokens
 * specific enough that false positives are rare.
 */
const BOT_UA_TOKENS = [
  'googlebot',
  'bingbot',
  'slurp',
  'duckduckbot',
  'baiduspider',
  'yandexbot',
  'applebot',
  'facebookexternalhit',
  'twitterbot',
  'linkedinbot',
  'whatsapp',
  'telegrambot',
  'discordbot',
  'pinterest',
  'redditbot',
  'embedly',
  'quora link preview',
  'showyoubot',
  'outbrain',
  'vkshare',
  'w3c_validator',
  'ia_archiver',
  'mj12bot',
  'ahrefsbot',
  'semrushbot',
  'archive.org_bot',
];

export function isBotUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return BOT_UA_TOKENS.some((tok) => ua.includes(tok));
}
