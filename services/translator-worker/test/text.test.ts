import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { checkGlossary, checkOutput, chunkText, detectLanguage, estimateTokens, inQuietHours, mask, unmask, type Glossary } from '../src/text.ts';

const glossary: Glossary = JSON.parse(readFileSync(new URL('../glossary.json', import.meta.url), 'utf8'));
const join = (cs: { text: string; sep: string }[]) => cs.map((c) => c.text + c.sep).join('');

// --- chunking ---------------------------------------------------------------

test('short text is one chunk and round-trips exactly', () => {
  const s = 'One sentence. Two sentences.';
  const cs = chunkText(s);
  assert.equal(cs.length, 1);
  assert.equal(join(cs), s);
});

test('long text splits on paragraphs, every chunk under the limit, lossless join', () => {
  const para = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(30).trim();
  const s = [para, para, para].join('\n\n');
  const cs = chunkText(s, 700);
  assert.ok(cs.length >= 2);
  for (const c of cs) assert.ok(estimateTokens(c.text) <= 700, `chunk has ${estimateTokens(c.text)} tokens`);
  assert.equal(join(cs), s);
});

test('a single huge paragraph splits on sentence boundaries', () => {
  const s = 'This is a sentence about a venue in Berlin. '.repeat(120).trim();
  const cs = chunkText(s, 300);
  assert.ok(cs.length > 1);
  for (const c of cs) {
    assert.ok(estimateTokens(c.text) <= 300);
    assert.match(c.text, /\.$/, 'chunk ends at a sentence boundary');
  }
  assert.equal(join(cs), s);
});

test('a sentence with no boundaries is hard-split at whitespace, still lossless', () => {
  const s = Array.from({ length: 900 }, (_, i) => `word${i}`).join(' ');
  const cs = chunkText(s, 200);
  for (const c of cs) assert.ok(estimateTokens(c.text) <= 200);
  assert.equal(join(cs), s);
});

test('CJK text counts ~1 token per character', () => {
  assert.ok(estimateTokens('東京の新宿二丁目'.repeat(100)) >= 800);
  const cs = chunkText('東京の新宿二丁目にあるバーです。'.repeat(80), 700);
  for (const c of cs) assert.ok(estimateTokens(c.text) <= 700);
});

// --- masking ----------------------------------------------------------------

test('URLs, emails, placeholders, HTML and the venue name are masked and restored', () => {
  const src = 'Trumps is open. Book at https://trumps.pt/tickets or mail info@trumps.pt. Hi {name}, see <b>details</b>.';
  const m = mask(src, ['Trumps']);
  for (const s of ['https://trumps.pt/tickets', 'info@trumps.pt', '{name}', '<b>', '</b>', 'Trumps']) {
    assert.ok(!m.text.includes(s), `${s} should be masked`);
  }
  assert.equal(unmask(m.text, m), src);
});

test('URL masking does not swallow trailing punctuation', () => {
  const m = mask('See https://example.com/a.');
  assert.match(m.text, /\[\[\d+\]\]\.$/);
});

test('glossary words are not masked (the model drops word-tokens; measured)', () => {
  const m = mask('A queer LGBTQIA+ night with drag queens.', ['Trumps']);
  assert.equal(m.restore.size, 0);
});

test('checkGlossary: do-not-translate terms must survive verbatim', () => {
  const src = 'Trumps is the best known LGBTQIA+ brand in Portugal.';
  assert.equal(checkGlossary(src, 'Trumpsはポルトガルで最も有名なLGBTQIA+ブランドです。', 'ja', glossary), null);
  assert.equal(checkGlossary(src, 'Trumpsはポルトガルで最も有名なブランドです。', 'ja', glossary), 'glossary_miss');
  assert.equal(checkGlossary('A big LGBT party.', 'Une grande fête LGBT.', 'fr', glossary), null, 'LGBT alone is fine');
});

test('checkGlossary: fixed forms per target, whole-word in Latin targets', () => {
  assert.equal(checkGlossary('A queer night.', 'クィアナイト。', 'ja', glossary), null);
  assert.equal(checkGlossary('A queer night.', 'LGBTナイト。', 'ja', glossary), 'glossary_miss');
  assert.equal(checkGlossary('Trans guests welcome.', 'Les personnes trans sont bienvenues.', 'fr', glossary), null);
  assert.equal(checkGlossary('Trans guests welcome.', 'Les personnes transgenres sont bienvenues.', 'fr', glossary), 'glossary_miss');
  assert.equal(checkGlossary('A night with drag queens.', 'Eine Nacht mit Drag-Queens.', 'de', glossary), null, 'hyphenated compound');
  for (const ja of ['ドラァグクイーン', 'ドラッグクイーン', 'ドラグクイーン']) {
    assert.equal(checkGlossary('A night with drag queens.', `${ja}の夜。`, 'ja', glossary), null, ja);
  }
  // German "queer" inflects (queere Nacht), so there is no fixed form to require.
  assert.equal(checkGlossary('A queer night.', 'Eine queere Nacht.', 'de', glossary), null);
  // non-binary has no French form (inflects) → not required
  assert.equal(checkGlossary('A non-binary person.', 'Une personne non binaire.', 'fr', glossary), null);
});

test('checkGlossary: term matching is whole-word, trailing hyphen blocks a prefix', () => {
  assert.equal(checkGlossary('Public transport nearby.', '附近有公共交通。', 'zh', glossary), null);
  assert.equal(checkGlossary('Cheap trans-Atlantic flights.', '便宜的跨大西洋航班。', 'zh', glossary), null);
  assert.equal(checkGlossary('Rally against anti-trans laws.', '反对反跨性别法律的集会。', 'zh', glossary), null);
  assert.equal(checkGlossary('Rally against anti-trans laws.', '反对歧视法律的集会。', 'zh', glossary), 'glossary_miss');
});

test('unmask rejects lost, duplicated or invented tokens', () => {
  const m = mask('Visit https://a.example and https://b.example now.');
  assert.equal(m.restore.size, 2);
  assert.equal(unmask('Besuche [[0]] jetzt.', m), null, 'lost');
  assert.equal(unmask('Besuche [[0]] und [[0]] jetzt.', m), null, 'duplicated');
  assert.equal(unmask('Besuche [[0]], [[1]] und [[2]].', m), null, 'invented');
  assert.equal(unmask('Besuche [[1]] und [[0]] jetzt.', m), 'Besuche https://b.example und https://a.example jetzt.');
});

test('a name may be dropped or repeated (pronoun-dropping languages); a URL may not', () => {
  const m = mask('Trumps is great. Trumps is at https://x.example', ['Trumps']);
  const tok = (v: string) => [...m.restore].filter(([, x]) => x === v).map(([t]) => t);
  const [n1, n2] = tok('Trumps');
  const [url] = tok('https://x.example');
  assert.equal(unmask(`${n1}はすごい。${url}にあります。`, m), 'Trumpsはすごい。https://x.exampleにあります。');
  assert.equal(unmask(`${n1}はすごい。${n1}は${url}。`, m), 'Trumpsはすごい。Trumpsはhttps://x.example。');
  assert.equal(unmask(`${n1}${n2}はすごい。`, m), null, 'URL lost');
});

test('token-shaped text already in the source is protected, not confused with ours', () => {
  const src = 'Use code [[0]] at https://x.example';
  const m = mask(src);
  assert.equal(unmask(m.text, m), src);
});

// --- language + output checks ------------------------------------------------

test('detects German and English source; short text defaults to en', () => {
  assert.equal(detectLanguage('Die Bar liegt mitten in Berlin und ist jeden Abend bis spät geöffnet. Alle sind willkommen.'), 'de');
  assert.equal(detectLanguage('The bar is in the middle of Berlin and is open late every night. Everyone is welcome.'), 'en');
  assert.equal(detectLanguage('Pride Night'), 'en');
});

const SRC = 'Trumps is the best known LGBTQIA+ brand in Portugal and has been for 42 years.';

test('accepts a plausible translation', () => {
  assert.equal(checkOutput(SRC, 'Trumps ist seit 42 Jahren die bekannteste LGBTQIA+-Marke in Portugal.', 'de', 'en'), null);
  assert.equal(checkOutput(SRC, 'Trumpsは42年間ポルトガルで最も有名なLGBTQIA+ブランドです。', 'ja', 'en'), null);
});

test('rejects empty, leaked template, wrong script, untranslated and absurd length', () => {
  assert.equal(checkOutput(SRC, '   ', 'de', 'en'), 'empty_output');
  assert.equal(checkOutput(SRC, 'Trumps ist ...<end_of_turn>', 'de', 'en'), 'template_leak');
  assert.equal(checkOutput(SRC, 'Trumps est la marque LGBTQIA+ la plus connue au Portugal depuis 42 ans.', 'ja', 'en'), 'wrong_language');
  assert.equal(checkOutput(SRC, SRC, 'de', 'en'), 'untranslated');
  assert.equal(checkOutput(SRC, 'Ja.', 'de', 'en'), 'length_ratio');
  assert.equal(checkOutput(SRC, 'Marke '.repeat(100), 'de', 'en'), 'length_ratio');
});

test('rejects English echoed back for a Latin-script target', () => {
  const en = 'Trumps is the best known queer brand in Portugal and has been for many years, with great events every week.';
  assert.equal(checkOutput(en, en.replace('many', 'so many'), 'fr', 'en'), 'wrong_language');
});

// --- scheduling ---------------------------------------------------------------

test('quiet hours, including a window that wraps midnight', () => {
  const at = (h: number) => new Date(2026, 0, 1, h, 30);
  assert.equal(inQuietHours(at(7), '07-23'), true);
  assert.equal(inQuietHours(at(23), '07-23'), false);
  assert.equal(inQuietHours(at(3), '07-23'), false);
  assert.equal(inQuietHours(at(23), '22-06'), true);
  assert.equal(inQuietHours(at(5), '22-06'), true);
  assert.equal(inQuietHours(at(12), '22-06'), false);
  assert.equal(inQuietHours(at(12), 'garbage'), false);
});

// --- main.ts loads -----------------------------------------------------------

test('main.ts parses under Node type stripping (fails on missing env, not on syntax)', () => {
  const r = spawnSync(process.execPath, [new URL('../src/main.ts', import.meta.url).pathname, 'status'], {
    env: { PATH: process.env.PATH ?? '' },
    encoding: 'utf8',
  });
  assert.notEqual(r.status, 0);
  assert.doesNotMatch(r.stderr, /SyntaxError|ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX/);
  assert.match(r.stderr, /missing env SUPABASE_URL/);
});
