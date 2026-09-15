import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards the Berlin harm-reduction / anti-violence glossary comparison.
 *
 * Sources: sidekicks.berlin (Schwulenberatung Berlin) and MANEO, the gay
 * anti-violence project — the pages and PDFs named in each migration header.
 *
 *   50100101100000  corrections to rows that are already LIVE. The dangerous
 *                   one is `darkroom`: it is ACTIVE with 176 uses and its
 *                   description is the PHOTOGRAPHY sense, so the migration
 *                   overwrites prose. Every property here exists to stop that
 *                   overwrite from becoming unconditional.
 *
 *   50100101100100  revives two rows and creates one. Everything it touches
 *                   must land UNPUBLISHED, and the new row must carry all
 *                   THREE category representations — neither category trigger
 *                   fires on INSERT, so a row created the obvious way renders
 *                   uncategorised on its own page and categorised in search.
 *
 * Assertions run against COMMENT-STRIPPED SQL. Both headers quote the
 * statements they describe almost verbatim, so a bare toContain over the whole
 * file passes with the real statement deleted — the vacuous-assertion class
 * that 29000101100000 and 20360401100300 both hit.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

const CORRECTIONS = '50100101100000_berlin_harm_reduction_glossary_corrections.sql';
const VOCABULARY = '50100101100100_maneo_violence_vocabulary.sql';

/** Line comments only; these files use no block comments. */
const statementsOf = (file: string): string =>
  readFileSync(join(MIGRATIONS, file), 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');

describe('corrections to live rows', () => {
  const sql = statementsOf(CORRECTIONS);

  it('declares a non-system actor', () => {
    // `spiking` is human_reviewed=true and log_unified_tag_change() RAISEs when
    // an actor matching 'system:%' touches such a row. Without this the
    // migration dies on the fill.
    expect(sql).toMatch(/set_config\(\s*'app\.actor'\s*,\s*'migration:[^']+'/);
  });

  it('only rewrites darkroom if it still carries the photography description', () => {
    const stmt = sql.slice(sql.indexOf('update public.unified_tags set'));
    expect(stmt).toMatch(
      /where id = v_darkroom\s+and description like 'A darkroom is used to process photographic film%'/,
    );
  });

  it('aborts rather than overwriting a darkroom row that has already moved', () => {
    expect(sql).toMatch(/darkroom: row did not carry the photography description/);
  });

  it('nulls the wrong Wikidata identifier instead of repointing it', () => {
    // 20261008100000: tag_medical_codes_sync and tag_wikidata_hierarchy rebuild
    // weekly from this column, so a plausible-but-wrong QID regenerates wrong
    // data forever while a null one regenerates nothing.
    const stmt = sql.slice(sql.indexOf('update public.unified_tags set'), sql.indexOf('if not found'));
    expect(stmt).toMatch(/wikidata_id\s*=\s*null/);
    expect(stmt).toMatch(/wikipedia_url\s*=\s*null/);
    expect(stmt).not.toMatch(/wikidata_id\s*=\s*'Q/);
  });

  it('leaves darkroom unpublished even though it rewrites the body', () => {
    const stmt = sql.slice(sql.indexOf('update public.unified_tags set'), sql.indexOf('if not found'));
    expect(stmt).toMatch(/seo_indexable\s*=\s*false/);
    expect(stmt).toMatch(/human_reviewed\s*=\s*false/);
  });

  it('asserts the two merge sides share a category before merging', () => {
    // 20361124161700: merge_tag_concept only DELETEs the loser's category row
    // when the winner holds the same category_id; filed differently it moves
    // the row and trips tag_category_assignments_one_primary_per_tag.
    const guard = sql.slice(sql.indexOf('v_dup'), sql.indexOf('merge_tag_concept'));
    expect(guard).toMatch(/category_id[\s\S]{0,200}is distinct from/);
    expect(guard).toMatch(/demote the loser''s primary junction first/);
  });

  it('merges the duplicate into sti and not the other way round', () => {
    expect(sql).toMatch(/merge_tag_concept\(\s*\n?\s*v_sti,\s*v_dup,/);
  });

  it('refuses to merge into a canonical that is not active', () => {
    expect(sql).toMatch(/canonical `sti` is not active/);
  });

  it('deletes the museum aliases by exact slug, never by pattern', () => {
    // A LIKE '%louis%' sweep would be one typo away from taking `slamming`
    // with it.
    // Scoped to the DELETE itself: the verify block legitimately uses LIKE to
    // prove none survived, so an unscoped slice makes this assertion vacuous.
    const start = sql.indexOf('delete from public.tag_aliases');
    const del = sql.slice(start, sql.indexOf('get diagnostics', start));
    expect(del).toMatch(/alias_slug in \(/);
    expect(del).not.toMatch(/alias_slug like/);
    expect(del).toMatch(/'saint-louis-art-museum'/);
    expect(del).toMatch(/'moshing'/);
  });

  it('proves the real aliases survived the museum cleanup', () => {
    expect(sql).toMatch(
      /if not exists \(select 1 from public\.tag_aliases[\s\S]{0,300}alias_slug = 'slamming'\) then[\s\S]{0,200}raise exception/,
    );
  });

  it('fills the spiking body only when it is empty', () => {
    const fill = sql.slice(sql.indexOf('long_description ='), sql.indexOf('-- Move the German term'));
    expect(fill).toMatch(/where id = v_spiking\s+and coalesce\(long_description, ''\) = ''/);
    expect(sql).toMatch(/spiking: long_description was not empty/);
  });

  it('moves the German alias rather than inserting a second copy', () => {
    // alias_slug is globally UNIQUE, so an INSERT of 'k-o-tropfen' fails and
    // leaving it on `ghb` splits one phrase across two tags.
    expect(sql).toMatch(
      /update public\.tag_aliases set[\s\S]{0,300}where alias_slug = 'k-o-tropfen'\s+and canonical_tag_id = v_ghb/,
    );
  });

  it('asserts no K.O.-Tropfen spelling is left pointing elsewhere', () => {
    expect(sql).toMatch(
      /alias_slug in \('ko-tropfen', 'k-o-tropfen'\)[\s\S]{0,120}t\.slug <> 'spiking'/,
    );
  });

  it('re-asserts darkroom is neither wrong-sense nor published', () => {
    const verify = sql.slice(sql.indexOf('do $verify$'));
    expect(verify).toMatch(/slug = 'darkroom'[\s\S]{0,400}wikidata_id is not null/);
    expect(verify).toMatch(/slug = 'darkroom'[\s\S]{0,400}like '%photographic%'/);
    expect(verify).toMatch(/slug = 'darkroom'[\s\S]{0,400}or seo_indexable/);
  });
});

describe('revivals and the one new term', () => {
  const sql = statementsOf(VOCABULARY);

  it('revives nothing into a published state', () => {
    const revive = sql.slice(sql.indexOf('for rec in select * from _revive'));
    expect(revive).toMatch(/seo_indexable\s*=\s*false/);
    expect(revive).toMatch(/human_reviewed\s*=\s*false/);
    expect(revive).toMatch(/verification_status\s*=\s*'unverified'/);
  });

  it('clears the whole tombstone, not just the status', () => {
    // status='active' with deprecated_at still populated is the state that once
    // stranded 297 tags: the page rendered and search refused to index it.
    const revive = sql.slice(sql.indexOf('for rec in select * from _revive'));
    expect(revive).toMatch(/status\s*=\s*'active'/);
    expect(revive).toMatch(/deprecated_at\s*=\s*null/);
    expect(revive).toMatch(/deprecation_reason\s*=\s*null/);
  });

  it('refuses to revive a merged row', () => {
    // A merged row is a redirect; reviving it yields two live rows for one
    // concept, pointing at each other.
    expect(sql).toMatch(
      /merged_into_id is not null;[\s\S]{0,200}raise exception '[^']*merged, not merely deprecated/,
    );
  });

  it('refuses to revive a row whose body has gone missing', () => {
    expect(sql).toMatch(
      /coalesce\(t\.long_description, ''\) = '';[\s\S]{0,200}raise exception '[^']*have no body/,
    );
  });

  it('refuses a slug that another tag holds as an alias', () => {
    expect(sql).toMatch(
      /from public\.tag_aliases a where a\.alias_slug = r\.slug\);[\s\S]{0,200}raise exception/,
    );
  });

  it('fills the IPV description only when it is empty', () => {
    const fill = sql.slice(sql.indexOf('description =\n      \'Abuse used by one partner'));
    expect(fill).toMatch(/where id = v_ipv\s+and coalesce\(description, ''\) = ''/);
    expect(sql).toMatch(/ipv: description was not empty/);
  });

  it('keeps the queer-specific content the IPV fill exists for', () => {
    // Without this the revival is a generic dictionary definition and the
    // comparison found nothing.
    expect(sql).toMatch(/threatening to out a partner/);
    expect(sql).toMatch(/HIV status/);
  });

  it('creates forced-marriage unpublished', () => {
    const ins = sql.slice(sql.indexOf("'Forced Marriage', 'forced-marriage'"));
    expect(ins).toMatch(/'active',\s*false,\s*false,\s*'unverified'/);
  });

  it('refuses to create forced-marriage over an existing row in any status', () => {
    expect(sql).toMatch(
      /from public\.unified_tags where slug = 'forced-marriage'\)[\s\S]{0,160}raise exception/,
    );
  });

  it('sets the category TEXT on the insert, which no trigger does', () => {
    // trg_sync_tag_category is BEFORE UPDATE; it never fires on an INSERT, so
    // category_id alone leaves the search facet with nothing to render.
    const ins = sql.slice(sql.indexOf('insert into public.unified_tags'));
    expect(ins).toMatch(/category_id, category, entity_kind/);
    expect(ins).toMatch(/\(select name from public\.tag_categories where id = v_cat\)/);
  });

  it('mints the primary junction row, which no trigger does either', () => {
    // /tags/:slug renders the JUNCTION, not the text column.
    expect(sql).toMatch(
      /insert into public\.tag_category_assignments \(tag_id, category_id, is_primary\)\s*\n\s*values \(v_fm, v_cat, true\)/,
    );
  });

  it('asserts all three category representations agree', () => {
    const verify = sql.slice(sql.indexOf('do $verify$'));
    expect(verify).toMatch(/t\.category is distinct from 'Violence & Hate'/);
    expect(verify).toMatch(/tag_category_assignments a[\s\S]{0,200}a\.is_primary/);
    expect(verify).toMatch(/a\.category_id = t\.category_id/);
  });

  it('clears only the wrong fields on watersports', () => {
    // The row's own `description` correctly describes urine play; only the
    // aquatic-sports halves are wrong. 20360401100300 set this rule on
    // `queerness` and 20360101101600 on `casting`.
    const upd = sql.slice(sql.indexOf("where slug = 'watersports'") - 400);
    expect(upd).toMatch(/wikidata_id\s*=\s*null/);
    expect(upd).toMatch(/short_description\s*=\s*null/);
    expect(upd).toMatch(/long_description\s*=\s*null/);
    expect(upd).not.toMatch(/set[\s\S]{0,200}\bdescription\s*=\s*null,\s*\n?\s*wikidata_id/);
  });

  it('guards the watersports cleanup on the wrong identifier it expects', () => {
    expect(sql).toMatch(/where slug = 'watersports'\s+and wikidata_id = 'Q61065'/);
  });

  it('proves watersports kept its correct description', () => {
    const verify = sql.slice(sql.indexOf('do $verify$'));
    expect(verify).toMatch(
      /slug = 'watersports' and coalesce\(description, ''\) = '';[\s\S]{0,200}raise exception/,
    );
  });

  it('does not revive watersports or piss-play', () => {
    // Two deprecated rows hold one concept; choosing between them is a merge
    // decision, not a cleanup.
    expect(sql).not.toMatch(/'piss-play'[\s\S]{0,200}status\s*=\s*'active'/);
    expect(sql).not.toMatch(/slug = 'watersports'[\s\S]{0,200}status\s*=\s*'active'/);
  });
});
