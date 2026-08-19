#!/usr/bin/env node
/**
 * Brand-voice guard for user-facing copy.
 *
 * Two rule sets, both from the design project:
 *
 *  - Brand Guidelines §06, "Punctuation discipline": *"Em dashes are strictly
 *    banned. The map does not do straight lines. Rely on periods, commas, and
 *    structural line breaks to pace the cheeky tone and maintain a clean
 *    layout."* And "Keep it human": no "pivotal", "vital", "tapestry". And
 *    "Direct statements only": no "serves as" / "acts as".
 *  - CLAUDE.md's own copy rules: no discover / explore / unlock / curated /
 *    journey / amazing / tailored / "personalized for you".
 *
 * Scope is `src/i18n/locales/en.json` ONLY, deliberately. That is the file
 * humans author; the other ten locales are generated from it by translation,
 * and rewriting punctuation inside a translation is a language-by-language
 * judgement (German capitalises nouns, French spaces its punctuation) that a
 * regex has no business making. When those are re-translated they inherit the
 * fixed English.
 *
 * EXEMPTIONS ARE KEYS, NOT PATTERNS. Every entry below is a specific string
 * where the banned word is not the banned sense — a product name, a privacy
 * setting, a literal achievement. Widening a pattern instead would switch the
 * rule off everywhere; naming the key keeps it on for the next occurrence and
 * forces the next person to justify theirs the same way.
 *
 * Usage: node scripts/check-copy-vocabulary.mjs
 * Exit 1 on any violation.
 */
import { readFileSync } from 'node:fs';

const FILE = 'src/i18n/locales/en.json';

const RULES = [
  {
    id: 'em-dash',
    re: /—/,
    why: 'Em dashes are banned (Brand Guidelines §06). Use a period, a comma, or a line break.',
  },
  {
    id: 'marketing-verbs',
    re: /\b(discover|explore|unlock|curated|journey|amazing|tailored)/i,
    why: 'Marketing filler. Say what the thing does instead (CLAUDE.md § Design/Copy).',
  },
  {
    id: 'personalized-for-you',
    re: /personali[sz]ed for you/i,
    why: 'Banned phrase (CLAUDE.md § Design/Copy).',
  },
  {
    id: 'ai-cliches',
    re: /\b(pivotal|tapestry)\b/i,
    why: 'AI cliché. "Banish AI clichés… Write like a real person" (Brand Guidelines §06).',
  },
  {
    id: 'corporate-filler',
    re: /\b(serves as|acts as)\b/i,
    why: 'Corporate filler verb. Use "is" or "are" (Brand Guidelines §06, "Direct statements only").',
  },
];

/** key → the rule id it is exempt from, with the reason it is not the banned sense. */
const EXEMPT = {
  // "explorer" as a NOUN for a person on a leaderboard, not the marketing verb.
  'venues.leaderboard.subtitle': 'marketing-verbs',
  'venues.leaderboard.widget.label': 'marketing-verbs',
  'venues.leaderboard.widget.titleGlobal': 'marketing-verbs',
  'venues.leaderboard.widget.anon': 'marketing-verbs',
  // A literal achievement unlock, not "unlock your potential".
  'venues.achievementToast.unlocked': 'marketing-verbs',
  // "Discover" is the PRODUCT NAME of the /trips/discover route.
  'trips.empty.paths.discover.cta': 'marketing-verbs',
  'trips.empty.discoverCta': 'marketing-verbs',
  // "discoverable" / "discovery" name a PRIVACY SETTING (whether you appear to
  // other members). Renaming them would misdescribe the control.
  'people.members.discoveryOffTitle': 'marketing-verbs',
  'people.members.discoveryOffBody': 'marketing-verbs',
  'people.members.discoveryOffCta': 'marketing-verbs',
};

const en = JSON.parse(readFileSync(FILE, 'utf8'));
const strings = [];
(function walk(node, prefix) {
  for (const [k, v] of Object.entries(node)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, key);
    else if (typeof v === 'string') strings.push([key, v]);
  }
})(en, '');

const violations = [];
for (const [key, value] of strings) {
  for (const rule of RULES) {
    if (!rule.re.test(value)) continue;
    if (EXEMPT[key] === rule.id) continue;
    violations.push({ key, value, rule });
  }
}

// A stale exemption is its own bug: it silently keeps the rule off a string
// that no longer needs it, and the next edit to that key inherits the hole.
const stale = Object.keys(EXEMPT).filter((key) => {
  const entry = strings.find(([k]) => k === key);
  if (!entry) return true;
  const rule = RULES.find((r) => r.id === EXEMPT[key]);
  return !rule?.re.test(entry[1]);
});

if (violations.length === 0 && stale.length === 0) {
  console.log(`✓ copy vocabulary clean (${strings.length} strings in ${FILE})`);
  process.exit(0);
}

for (const v of violations) {
  console.error(`✘ [${v.rule.id}] ${v.key}`);
  console.error(`    ${v.value.length > 120 ? v.value.slice(0, 120) + '…' : v.value}`);
  console.error(`    ${v.rule.why}`);
}
for (const key of stale) {
  console.error(`✘ [stale-exemption] ${key} no longer triggers its rule — remove it from EXEMPT.`);
}
console.error(`\n${violations.length} violation(s), ${stale.length} stale exemption(s).`);
process.exit(1);
