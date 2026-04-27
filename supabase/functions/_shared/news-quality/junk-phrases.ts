// Versioned junk phrase list for the news sanitizer.
// Bump JUNK_PHRASES_VERSION when adding/removing entries so audit logs stay coherent.

export const JUNK_PHRASES_VERSION = '2026.04.27.0'

// Exact-match snippets stripped wholesale (case-insensitive). Order matters: longer first.
export const EXACT_PHRASES: ReadonlyArray<string> = [
  'ONLY AVAILABLE IN PAID PLANS',
  'this article is for subscribers only',
  'this content is for subscribers only',
  'subscribe to read the full article',
  'subscribe to continue reading',
  'sign up to read more',
  'sign in to read the full article',
  'become a member to read more',
  'support our work — subscribe',
  'support our journalism',
  '[semi-satire]',
  '[satire]',
  '[parody]',
  '[sponsored]',
  '[advertorial]',
  'continue reading →',
  'continue reading',
  'read more →',
  'read the full article',
  'read the full story',
  'click here to read more',
  'load more articles',
  'see all articles',
  'share this article',
  'share on facebook',
  'share on twitter',
  'share on x',
  'share on linkedin',
  'share on whatsapp',
  'tweet this',
  'pin this',
  'email this',
  'print this article',
  'cookie preferences',
  'manage cookie settings',
  'we use cookies to improve your experience',
  'accept all cookies',
  'reject all cookies',
  'advertisement',
  'sponsored content',
  'ad — sponsored',
  'related articles',
  'you may also like',
  'recommended for you',
  'most popular',
  'trending now',
  'sign up for our newsletter',
  'subscribe to our newsletter',
  'join our newsletter',
  'newsletter sign-up',
] as const

// Regex patterns (case-insensitive, multiline). One per line so they're easy to maintain.
export const PATTERN_PHRASES: ReadonlyArray<RegExp> = [
  /^[\s>]*read more[\s.:>-]*$/gim,
  /^[\s>]*continue reading[\s.:>-]*$/gim,
  /^\s*share this[\s.:>-]*$/gim,
  /^\s*advertisement\s*$/gim,
  /^\s*sponsored\s*$/gim,
  /^\s*\[?(photo|image|picture)\s*[:|–-]\s*[^\]\n]{0,80}\]?\s*$/gim,
  // Repeated source-name suffixes ("— The Source — The Source" / "| The Source | The Source")
  /(?:\s*[—|\-]\s*[A-Z][^\n|—\-]{1,40}){2,}\s*$/gim,
  // Trailing tracking-pixel image markup left as text
  /<img[^>]*1x1[^>]*>/gi,
] as const

// Truncation markers — presence of any of these at the END of body strongly suggests truncation.
export const TRUNCATION_MARKERS: ReadonlyArray<RegExp> = [
  /\.\.\.\s*$/,
  /…\s*$/,
  /\[\s*continued\s*\]\s*$/i,
  /\bto be continued\b\s*$/i,
  /\bcontinued on\b/i,
  /\bsubscribe to read\b/i,
] as const

// Critical paywall artefact markers (used for auto-publish gating, not just stripping).
export const CRITICAL_PAYWALL_MARKERS: ReadonlyArray<string> = [
  'ONLY AVAILABLE IN PAID PLANS',
  'this article is for subscribers only',
  'subscribe to read the full article',
] as const
