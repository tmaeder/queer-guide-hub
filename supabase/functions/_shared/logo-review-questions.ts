import { JEV_MODEL, type JevRequest, type JevResponse } from './jev-client.ts'

export const LOGO_REVIEW_ACCOUNT = 'logo-review-2026-11-27'
export function logoReviewRequest(state: unknown, imageRef?: string): JevRequest {
  return { model: JEV_MODEL, state, questions: {
    own_identity: { type: 'noul', instructions: 'Does the supplied official-page evidence identify the target as the website’s own business, organization or event brand?', criteria: {
      true: 'The masthead, site identity or organization metadata establish this target brand. Ordinary spelling variants, abbreviations and a generic event year do not change the brand.',
      false: 'The target is only a listing, article subject, customer, sponsor or event hosted by a differently named publisher. The evidence identifies a namesake or another locality, or does not establish ownership of this identity.',
    } },
    declared_logo: { type: 'noul', instructions: 'Does the official-page evidence present the candidate as the target brand’s own logo?', criteria: {
      true: 'The candidate is explicitly used as this brand’s masthead/home-link mark or declared Organization logo, with identity corroborated by the supplied source.',
      false: 'The candidate belongs to a CMS, social network, publisher, sponsor or payment service; is a product/photo/banner; or is only an unexplained icon without brand evidence.',
    } },
    conflicting_edition: { type: 'noul', instructions: 'Does the evidence explicitly associate the candidate with a different event edition from the target?', criteria: {
      true: 'A visible year or explicit edition label establishes that this is a different occurrence-specific logo.',
      false: 'The logo is an enduring brand mark without an edition, or it matches the target edition. An upload date alone does not establish a different edition.',
    } },
    ...(imageRef ? { visual_target: { type: 'noul', instructions: `Does the logo in candidate_image visually identify the target brand?`, criteria: {
      true: 'The readable name or recognizable mark matches the target brand and the supplied official-source identity.',
      false: 'It depicts another brand, a generic CMS/social icon, a photograph, an unreadable or blank image, or an uncertain identity.',
    } } } : {}),
  } }
}

export function supportedLogoReview(response: JevResponse): boolean {
  const p = (key: string) => {
    const a=response.answers[key] as { type?: string; noul?: number }
    if (a?.type!=='noul' || typeof a.noul!=='number' || a.noul<0 || a.noul>1) throw new Error('Invalid logo review judgment')
    return a.noul
  }
  return p('own_identity')>=0.97 && p('declared_logo')>=0.97 && p('conflicting_edition')<=0.03
}
