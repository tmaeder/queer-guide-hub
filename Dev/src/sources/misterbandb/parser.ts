/**
 * MisterBnB parser.
 *
 * NOTE: MisterBnB requires user login to view listings.
 * This parser is a placeholder – it will not be called unless the site
 * becomes publicly accessible. Kept for structural completeness.
 */
import type { SourceRawEntity } from '../../normalize/schema.js'

/** Always returns an empty array – site requires authentication. */
export function parseMisterBnBPage(
  _html: string,
  _pageUrl: string
): SourceRawEntity[] {
  return []
}
