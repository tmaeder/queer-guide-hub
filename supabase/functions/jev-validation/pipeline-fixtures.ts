import { buildPipelineRequest, projectPipelineEvidence } from '../_shared/jev-pipeline-judgments.ts'

// Labels fixed before the first API call; these are synthetic records, not venue
// facts. First four are development probes; the remaining eight are held out.
const cases = [
  ['news-faithful', 'news_article', 'rss-news', 'Pride march in Bern', 'The Pride march in Bern takes place on Saturday. Organizers expect 200 participants.', 'The Pride march in Bern is on Saturday.', 'supported'],
  ['news-contradicted', 'news_article', 'rss-news', 'Pride march in Bern', 'The Pride march in Bern is cancelled. The organizers confirmed there will be no march this year.', 'The Pride march in Bern will take place this year.', 'contradicted'],
  ['event-faithful', 'event', 'eventfrog', 'Queer poetry night', 'Queer poetry night at the River Hall starts on Friday at 19:00. Admission costs CHF 10.', 'Queer poetry night at River Hall on Friday at 19:00. Admission CHF 10.', 'supported'],
  ['product-added-claim', 'marketplace', 'ryvkstudio', 'Purple cotton shirt', 'This purple shirt is made from cotton and comes in sizes S to XL. Wash at 30 degrees.', 'A purple cotton shirt made by a queer-owned business.', 'uncertain'],
  ['news-qualified', 'news_article', 'rss-news', 'Festival proposal', 'The city council is considering a proposal for an LGBTQ film festival next summer. No decision or date has been confirmed.', 'The city council is considering an LGBTQ film festival next summer; no decision is confirmed.', 'supported'],
  ['news-lost-qualification', 'news_article', 'rss-news', 'Festival proposal', 'The city council is considering a proposal for an LGBTQ film festival next summer. No decision or date has been confirmed.', 'The city council has confirmed an LGBTQ film festival for next summer.', 'contradicted'],
  ['event-wrong-time', 'event', 'gay-ch', 'Rainbow choir concert', 'The Rainbow choir concert starts at 18:00 on Sunday at the community hall. Doors open at 17:30.', 'The Rainbow choir concert starts at 21:00 on Sunday at the community hall.', 'contradicted'],
  ['event-added-accessibility', 'event', 'gay-ch', 'Rainbow choir concert', 'The Rainbow choir concert starts at 18:00 on Sunday at the community hall. Doors open at 17:30.', 'The Rainbow choir concert is at 18:00 on Sunday. The venue has a wheelchair-accessible toilet.', 'uncertain'],
  ['product-faithful', 'marketplace', 'ryvkstudio', 'Rainbow cotton tote', 'This rainbow tote is made of cotton. Its dimensions are 35 by 40 cm. It has two long handles.', 'A cotton rainbow tote measuring 35 by 40 cm, with two long handles.', 'supported'],
  ['product-wrong-material', 'marketplace', 'ryvkstudio', 'Rainbow cotton tote', 'This rainbow tote is made of cotton. Its dimensions are 35 by 40 cm. It has two long handles.', 'A rainbow tote made of polyester, measuring 35 by 40 cm.', 'contradicted'],
  ['event-german', 'event', 'gaybasel', 'Queerer Spieleabend', 'Der queere Spieleabend findet am Donnerstag ab 19 Uhr im Kulturhaus statt. Der Eintritt ist kostenlos.', 'A queer games evening at the Kulturhaus on Thursday from 19:00, with free admission.', 'supported'],
  ['news-french', 'news_article', 'rss-news', 'Festival de cinéma queer', 'Le festival de cinéma queer se déroule à Lausanne du 4 au 6 juin. Les séances sont proposées en français.', 'A queer film festival in Lausanne from 4 to 6 June, with screenings in French.', 'supported'],
] as const

export const PIPELINE_FIXTURES = Object.fromEntries(cases.map(([name, entity_type, source_name, title, original, candidate, expected], i) => {
  const evidence = projectPipelineEvidence({ entity_type, source_name, raw_data: { title, content: original }, normalized_data: { title, description: candidate }, enriched_data: {} }).evidence
  if (!evidence) throw new Error('Invalid fixed pipeline fixture')
  return [`pipeline-${name}`, { request: buildPipelineRequest(evidence), expected, split: i < 4 ? 'development' : 'held_out' }]
}))
