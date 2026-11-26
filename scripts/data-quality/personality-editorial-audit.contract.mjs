import test from 'node:test';
import assert from 'node:assert/strict';
import {
  auditPersonality,
  createEditorialBaseline,
  editorialRegressions,
  assertEditorialBaselineRatchet,
  reviewedLanguageExceptions,
} from './audit-personality-editorial.ts';
import { detectPersonalityLanguage } from '../../src/lib/personalityLanguage.ts';
import { personalityProposal } from '../../supabase/functions/_shared/personality-staging.ts';
const row = {
  id: 'legacy-id',
  name: 'Example Writer',
  slug: 'example-writer',
  description: 'Original short description',
  bio: null,
  lgbti_details: null,
  lgbti_connection: null,
};
test('legacy exceptions cannot cover changed text, new issues or new profiles', () => {
  const original = auditPersonality(row),
    baseline = createEditorialBaseline([original]);
  assert.deepEqual(editorialRegressions([original], baseline), []);
  assert.equal(
    editorialRegressions(
      [auditPersonality({ ...row, description: 'Changed short description' })],
      baseline,
    ).length,
    1,
  );
  assert.equal(
    editorialRegressions([auditPersonality({ ...row, id: 'new-id' })], baseline).length,
    1,
  );
  const extra = { ...original, issues: [...original.issues, 'new_issue'] };
  assert.deepEqual(editorialRegressions([extra], baseline)[0].issues, ['new_issue']);
});
test('baseline updates may remove exceptions but cannot add or broaden them', () => {
  const baseline = createEditorialBaseline([auditPersonality(row)]);
  assert.doesNotThrow(() =>
    assertEditorialBaselineRatchet(baseline, { schema_version: 1, allowed: {} }),
  );
  for (const next of [
    createEditorialBaseline([auditPersonality({ ...row, id: 'another-id' })]),
    createEditorialBaseline([auditPersonality({ ...row, description: 'Changed' })]),
  ])
    assert.throws(() => assertEditorialBaselineRatchet(baseline, next), /only remove/);
});
test('an explanation in the raw row does not count as verified public evidence', () => {
  const value =
    'The author creates stories about queer communities and their lives, as documented by the official publisher biography.';
  const result = auditPersonality({
    ...row,
    description: value,
    lgbti_details: value,
    lgbti_connection: 'representation',
    editorial: { details: null, connection: null },
  });
  assert.ok(result.issues.includes('unverified_connection_explanation'));
  assert.ok(result.issues.includes('unverified_connection_category'));
});
test('German prose stays German when an official organization title contains English stopwords', () => {
  const value =
    'Die Aktivistin setzt sich in Uganda für die Rechte intergeschlechtlicher Menschen ein und leitete die Support Initiative for People with atypical sex Development.';
  assert.equal(detectPersonalityLanguage(value), 'de');
  assert.equal(
    detectPersonalityLanguage(
      'The author was known for the book Der Tod in Venedig and wrote about the lives of people in Europe.',
    ),
    'en',
  );
});
test('reviewed title exceptions apply only to the exact published translation', () => {
  const value =
    'Die Biografie nennt als wichtiges Werk Companions on a Journey in Science with the Community.';
  const r = { ...row, localized: { de: { description: value } } };
  assert.ok(auditPersonality(r).issues.includes('de.description_needs_language_review'));
  const exceptions = reviewedLanguageExceptions([
    {
      records: [
        {
          id: row.id,
          review: {
            status: 'reviewed',
            note: 'Official title retained in German prose.',
            language_exceptions: ['de.description'],
          },
          translations: { de: { description: value } },
        },
      ],
    },
  ]);
  assert.ok(
    !auditPersonality(r, exceptions).issues.includes('de.description_needs_language_review'),
  );
  assert.ok(
    auditPersonality(
      {
        ...r,
        localized: { de: { description: value + ' This whole sentence is new and unreviewed.' } },
      },
      exceptions,
    ).issues.includes('de.description_needs_language_review'),
  );
});
test('imports cannot bring their own public or verified status and preserve their source payload', () => {
  const raw = {
    name: 'Imported Writer',
    visibility: 'public',
    verification_status: 'verified',
    description: 'Source excerpt',
  };
  const proposal = personalityProposal(raw);
  assert.equal(proposal.visibility, 'draft');
  assert.equal(proposal.verification_status, 'pending');
  assert.equal(proposal.description, raw.description);
  assert.equal(raw.visibility, 'public');
});
