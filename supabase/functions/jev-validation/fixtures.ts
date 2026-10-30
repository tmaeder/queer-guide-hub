import type { FieldVerdict, PublicFieldCandidate } from '../_shared/jev-evidence-judgments.ts'

// Synthetic fixtures, never production users or catalog rows. Labels are not sent to Jev.
const make = (field: string, value: string, text: string, sensitive = false, locality = 'Example City') => ({
  subject: { name: 'Example Centre', locality }, field, value,
  source: { title: 'Synthetic operator statement', url: 'https://example.org/centre', text },
  sensitive, authorization: 'public_record' as const,
})
export const VALIDATION_FIXTURES: Record<string, { candidate: PublicFieldCandidate; expected: FieldVerdict }> = {
  'event-supported': { candidate: make('event_type', 'board-game evening', 'Example Centre in Example City hosts a board-game evening every Thursday.'), expected: 'supported' },
  'event-wrong-activity': { candidate: make('event_type', 'nightclub dance party', 'Example Centre in Example City presents a seated classical piano concert, with no dancing.'), expected: 'contradicted' },
  'namesake-place': { candidate: make('event_type', 'board-game evening', 'The Example Centre in Another City hosts board games. This page concerns only our Another City branch.'), expected: 'uncertain' },
  'accessibility-supported': { candidate: make('step_free_entrance', 'The entrance is step-free.', 'Example Centre in Example City: our main entrance is level with the pavement. There are no steps or thresholds.', true), expected: 'supported' },
  'accessibility-missing': { candidate: make('accessible_restroom', 'The venue has a wheelchair-accessible restroom.', 'Example Centre in Example City has a step-free main entrance. No information about restrooms is provided.', true), expected: 'uncertain' },
  'accessibility-contradicted': { candidate: make('step_free_entrance', 'The entrance is step-free.', 'Example Centre in Example City is reached only by twelve stairs. There is no ramp, lift or alternative entrance.', true), expected: 'contradicted' },
  'ownership-missing': { candidate: make('ownership', 'The centre is LGBTQ-owned.', 'Example Centre in Example City welcomes LGBTQ visitors. Its ownership is not disclosed.', true), expected: 'uncertain' },
  'legal-qualification': { candidate: make('admission_policy', 'Adults aged 18 and over may attend.', 'Example Centre in Example City: admission is limited to adults aged 18 and over.', true), expected: 'supported' },
}
