/**
 * Unit tests for the feedback-story title guards. Pure logic — no env, no
 * network. Run with: cd supabase/functions && deno test _tests/story-title-guard.test.ts
 */
import { assertEquals } from 'jsr:@std/assert'
import {
  hasEnoughSignal,
  isMachineAlertText,
  submissionText,
  ungroundedSensitiveConcepts,
} from '../_shared/story-title-guard.ts'

// The exact rows that produced the "LGBTQ Safety Concerns" story on 2026-08-01.
const CI_ALERTS = [
  'Run failure: Deploy Supabase functions on main',
  'Run failure: claude-md-drift on main',
  'Run failure: E2E Nightly on main',
  'Run failure: Deploy workers on main',
]

Deno.test('isMachineAlertText: recognises the alert shapes that reached the board', () => {
  for (const t of CI_ALERTS) assertEquals(isMachineAlertText(t), true)
  assertEquals(
    isMachineAlertText('Run failure: npm_and_yarn in /workers/submit for sharp - Update #147 on main'),
    true,
  )
  assertEquals(isMachineAlertText('advisor: function_search_path_mutable'), true)
  assertEquals(isMachineAlertText('Dependabot could not update sharp'), true)
})

Deno.test('isMachineAlertText: leaves human reports alone', () => {
  assertEquals(isMachineAlertText('Map pins are in the wrong city'), false)
  assertEquals(isMachineAlertText('I felt unsafe at this venue, please remove it'), false)
  assertEquals(isMachineAlertText(''), false)
  assertEquals(isMachineAlertText(null), false)
})

Deno.test('submissionText: falls back to message when title is NULL', () => {
  // github-actions api_error rows carry no `title` — reading only `title`
  // is what emptied the titler's corpus.
  assertEquals(
    submissionText({ title: null, message: 'Run failure: Deploy workers on main' }),
    'Run failure: Deploy workers on main',
  )
  assertEquals(submissionText({ title: 'Broken filter', message: 'x' }), 'Broken filter')
  assertEquals(submissionText({ description: 'only a description' }), 'only a description')
  assertEquals(submissionText({}), '')
  assertEquals(submissionText(null), '')
})

Deno.test('hasEnoughSignal: refuses the empty corpus that caused the hallucination', () => {
  assertEquals(hasEnoughSignal([]), false)
  assertEquals(hasEnoughSignal(['', '  ', '']), false)
  assertEquals(hasEnoughSignal(['404']), false)
  assertEquals(hasEnoughSignal(CI_ALERTS), true)
})

Deno.test('ungroundedSensitiveConcepts: rejects invented safety themes', () => {
  assertEquals(ungroundedSensitiveConcepts('LGBTQ Safety Concerns', CI_ALERTS), [
    'safety',
    'identity',
  ])
  assertEquals(ungroundedSensitiveConcepts('Safety concerns abroad', CI_ALERTS), ['safety'])
})

Deno.test('ungroundedSensitiveConcepts: allows titles the source actually supports', () => {
  const reports = [
    'Venue felt unsafe after dark',
    'Staff made homophobic comments',
    'I was harassed outside the bar',
  ]
  assertEquals(ungroundedSensitiveConcepts('Safety incidents at venue', reports), [])
  // A source saying "homophobic" grounds a draft saying "discrimination".
  assertEquals(ungroundedSensitiveConcepts('Discrimination reports', reports), [])
})

Deno.test('ungroundedSensitiveConcepts: honest paraphrase across the identity group is fine', () => {
  assertEquals(ungroundedSensitiveConcepts('LGBTQ+ venue listings wrong', ['Queer bar is missing']), [])
})

Deno.test('ungroundedSensitiveConcepts: word boundaries, not substrings', () => {
  // "trans" must not fire on "translation"/"transaction".
  assertEquals(ungroundedSensitiveConcepts('Translation strings missing', ['German translation is broken']), [])
  assertEquals(ungroundedSensitiveConcepts('Payment transaction failures', ['transaction declined']), [])
})

Deno.test('ungroundedSensitiveConcepts: neutral titles over machine alerts pass', () => {
  assertEquals(ungroundedSensitiveConcepts('CI workflow failures on main', CI_ALERTS), [])
  assertEquals(ungroundedSensitiveConcepts('Dependabot sharp update failing', CI_ALERTS), [])
})
