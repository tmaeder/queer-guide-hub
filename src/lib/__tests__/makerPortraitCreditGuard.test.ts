import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const DIR = join(__dirname, '../../../supabase/migrations')

/** SQL of the latest migration that (re)defines api_private.get_marketplace_brand, comments stripped. */
function latestDefinition(): { file: string; sql: string } {
  const files = readdirSync(DIR)
    .filter((f) => /^\d{14}_.*\.sql$/.test(f))
    .sort()
    .filter((f) =>
      /create\s+or\s+replace\s+function\s+api_private\.get_marketplace_brand\s*\(/i.test(
        readFileSync(join(DIR, f), 'utf8'),
      ),
    )
  const file = files[files.length - 1]
  const sql = readFileSync(join(DIR, file), 'utf8')
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')
  return { file, sql }
}

describe('maker portrait credit guard', () => {
  const { file, sql } = latestDefinition()

  it('is read from the newest definition', () => {
    // Positive control: an empty match would make every assertion below vacuous.
    expect(file).toBeTruthy()
    expect(sql).toMatch(/portrait_credit/)
  })

  it('shows a credit for the mirrored copy as well as the original image', () => {
    // logo_url is the img.queer.guide copy after mirroring; logo_origin_url is
    // the image it was made from. Comparing against logo_url alone hid all 127
    // credits once the logos were mirrored.
    expect(sql).toMatch(
      /portrait_credit'\s*->>\s*'image_url'\s+in\s*\(\s*t\.logo_url\s*,\s*t\.logo_origin_url\s*\)/i,
    )
  })

  it('still requires the credit to describe the shown image', () => {
    // The credit must stay gated on image_url: dropping the comparison would put
    // a photographer's name under somebody else's photo.
    expect(sql).not.toMatch(/when\s+t\.publication_status\s*=\s*'published'\s+then\s+jsonb_build_object/i)
  })

  it('keeps the publication guard', () => {
    expect(sql).toMatch(/when\s+t\.publication_status\s*=\s*'published'\s+and\s+t\.profile_resolution/i)
  })
})
