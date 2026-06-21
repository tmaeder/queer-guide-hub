// Versioned junk phrase list for the news sanitizer.
// Bump JUNK_PHRASES_VERSION when adding/removing entries so audit logs stay coherent.

export const JUNK_PHRASES_VERSION = '2026.06.21.1'

// Exact-match snippets stripped wholesale (case-insensitive). Order matters: longer first.
export const EXACT_PHRASES: ReadonlyArray<string> = [
  // English paywall
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
  // German paywall (de_DE / de_AT / de_CH variants)
  'nur für abonnenten',
  'nur mit abo lesen',
  'jetzt abonnieren und weiterlesen',
  'jetzt anmelden und weiterlesen',
  'artikel im abo',
  'weiterlesen mit abo',
  'demnächst im abo',
  // French paywall
  'réservé aux abonnés',
  'reservé aux abonnés',
  'cet article est réservé aux abonnés',
  'abonnez-vous pour continuer',
  'lire la suite avec un abonnement',
  's\u2019abonner pour lire la suite',
  // Spanish paywall
  'solo para suscriptores',
  'sólo para suscriptores',
  'suscríbete para seguir leyendo',
  'inicia sesión para continuar',
  // Italian paywall
  'solo per abbonati',
  'continua a leggere con l\u2019abbonamento',
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
  // UI widget text scraped as content
  'skip to next photo',
  'show caption',
  '(opens in new window)',
  'opens in new window',
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
  /(?:\s*[—|-]\s*[A-Z][^\n|—-]{1,40}){2,}\s*$/gim,
  // Trailing tracking-pixel image markup left as text
  /<img[^>]*1x1[^>]*>/gi,
  // Social share icon lists scraped as text ("Facebook Twitter X WhatsApp Email …")
  /^(Facebook|Twitter|X|WhatsApp|Email|LinkedIn|Pinterest|SMS)(\s+(Facebook|Twitter|X|WhatsApp|Email|LinkedIn|Pinterest|SMS)){2,}\s*$/gim,
  // Author byline + metadata injected at article start ("By Name name@domain Updated Jun 20 Share\n")
  /^By\s+\S+[^\n]*?(?:Share|Updated[^\n]*)\s*\n+/im,
  // Read-time indicators ("8 Min Read", "3 minute read")
  /\b\d{1,2}\s+[Mm]in(?:ute)?s?\s+[Rr]ead\b/g,
  // Timestamp metadata ("12 hours ago", "Updated 3 days ago")
  /\b\d+\s+(?:hour|day|minute)s?\s+ago(?:\s+Updated\s+\d+\s+(?:hour|day|minute)s?\s+ago)?\b/gi,
  // Photo/image credit lines ("Credit: Getty", "Credit: Rick Kopstein")
  /^Credit:\s+[^\n]{1,80}$/gim,
  // Newsletter signup confirmation noise ("Sign up for The Sun newsletter Thank you!")
  /Sign\s+up\s+for\s+[^\n]{0,50}newsletter[^\n]{0,30}Thank\s+you[!.]?\s*/gi,
  // "(Opens in new window)" / "(opens in a new tab)" link artifacts
  /\(opens?\s+in\s+(?:a\s+)?new\s+(?:window|tab)\)/gi,
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
  'nur für abonnenten',
  'réservé aux abonnés',
  'solo para suscriptores',
  'solo per abbonati',
] as const
