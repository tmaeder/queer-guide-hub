import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkOutput, chunkText, detectLanguage, estimateTokens, inQuietHours, mask, unmask, type Glossary } from '../src/text.ts';

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
  const m = mask(src, 'de', glossary, ['Trumps']);
  for (const s of ['https://trumps.pt/tickets', 'info@trumps.pt', '{name}', '<b>', '</b>', 'Trumps']) {
    assert.ok(!m.text.includes(s), `${s} should be masked`);
  }
  assert.equal(unmask(m.text, m), src);
});

test('URL masking does not swallow trailing punctuation', () => {
  const m = mask('See https://example.com/a.', 'fr', glossary);
  assert.match(m.text, /\[\[\d+\]\]\.$/);
});

test('do-not-translate terms come back verbatim; longest match wins', () => {
  const m = mask('A LGBTQIA+ and LGBT space.', 'ja', glossary);
  assert.equal([...m.restore.values()].sort().join('|'), 'LGBT|LGBTQIA+');
});

test('glossary terms are replaced by the fixed form for the target only', () => {
  const ja = mask('A queer night with drag queens.', 'ja', glossary);
  assert.deepEqual(new Set(ja.restore.values()), new Set(['クィア', 'ドラァグクイーン']));
  // non-binary has no French form (inflects) → left for the model
  const fr = mask('A non-binary person.', 'fr', glossary);
  assert.equal(fr.restore.size, 0);
  const ko = mask('A non-binary person.', 'ko', glossary);
  assert.deepEqual([...ko.restore.values()], ['논바이너리']);
});

test('glossary matching is whole-word: "transport" is not "trans"', () => {
  assert.equal(mask('Public transport is nearby.', 'zh', glossary).restore.size, 0);
  assert.equal(mask('Cheap trans-Atlantic flights.', 'zh', glossary).restore.size, 0, 'prefix "trans-" left alone');
  assert.deepEqual([...mask('A rally against anti-trans laws.', 'zh', glossary).restore.values()], ['跨性别'], '"anti-trans" is the term');
});

test('unmask rejects lost, duplicated or invented tokens', () => {
  const m = mask('Visit https://a.example and https://b.example now.', 'de', glossary);
  assert.equal(m.restore.size, 2);
  assert.equal(unmask('Besuche [[0]] jetzt.', m), null, 'lost');
  assert.equal(unmask('Besuche [[0]] und [[0]] jetzt.', m), null, 'duplicated');
  assert.equal(unmask('Besuche [[0]], [[1]] und [[2]].', m), null, 'invented');
  assert.equal(unmask('Besuche [[1]] und [[0]] jetzt.', m), 'Besuche https://b.example und https://a.example jetzt.');
});

test('token-shaped text already in the source is protected, not confused with ours', () => {
  const src = 'Use code [[0]] at https://x.example';
  const m = mask(src, 'de', glossary);
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
