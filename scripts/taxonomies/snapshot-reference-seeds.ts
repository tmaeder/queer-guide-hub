/** One-time baseline snapshot. Existing stable IDs must be preserved in later migrations. */
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { PRIDE_FLAGS } from '../../src/lib/flags/prideFlags';
import { HANKY_CODE } from '../../src/lib/flags/hankyCode';
import { COMPETITION_CATEGORIES } from '../../src/lib/competitionCategories';
import {
  DEPARTMENT_ORDER,
  DEPARTMENT_LABELS,
  DEPARTMENT_GROUPS,
  GROUP_LABELS,
  GROUP_FINE,
  FINE_LABELS,
  OCCASION_CHIPS,
  SIZE_ORDER,
  SUBCAT_TO_DEPARTMENT,
} from '../../src/lib/marketplaceTaxonomy';

const idFor = (taxonomy: string, value: string) => {
  const hash = createHash('sha256')
    .update(`queer.guide.taxonomy:${taxonomy}:${value}`)
    .digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-8${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
};
type Seed = {
  id: string;
  taxonomy: string;
  value: string;
  name: string;
  metadata: Record<string, unknown>;
  parent_id: string | null;
  sort_order: number;
};
const rows: Seed[] = [];
function add(
  taxonomy: string,
  value: string,
  name: string,
  metadata: Record<string, unknown> = {},
  parent: string | null = null,
  sort_order = 0,
) {
  if (rows.some((row) => row.taxonomy === taxonomy && row.value === value)) return;
  rows.push({
    id: idFor(taxonomy, value),
    taxonomy,
    value,
    name,
    metadata,
    parent_id: parent ? idFor(taxonomy, parent) : null,
    sort_order,
  });
}
for (const [i, flag] of PRIDE_FLAGS.entries())
  add('pride_flag', flag.id, flag.nameEn, { ...flag }, null, i);
for (const [i, entry] of HANKY_CODE.entries())
  add('hanky_code', entry.id, entry.colorEn, { ...entry }, null, i);
for (const [i, category] of COMPETITION_CATEGORIES.entries())
  add('competition_category', category.id, category.label, { ...category }, null, i);
for (const [i, department] of DEPARTMENT_ORDER.entries()) {
  add('marketplace_browse', `department:${department}`, DEPARTMENT_LABELS[department], {}, null, i);
  for (const [j, group] of (DEPARTMENT_GROUPS[department] ?? []).entries()) {
    add(
      'marketplace_browse',
      `group:${group}`,
      GROUP_LABELS[group] ?? group,
      {},
      `department:${department}`,
      j,
    );
    for (const [k, fine] of (GROUP_FINE[group] ?? []).entries())
      add('marketplace_browse', `fine:${fine}`, FINE_LABELS[fine] ?? fine, {}, `group:${group}`, k);
  }
}
for (const [source, department] of Object.entries(SUBCAT_TO_DEPARTMENT))
  add(
    'marketplace_browse',
    `source:${source}`,
    source.replaceAll('_', ' '),
    {},
    `department:${department}`,
  );
for (const [i, chip] of OCCASION_CHIPS.entries())
  add('marketplace_occasion', chip.slug, chip.label, {}, null, i);
for (const [i, size] of SIZE_ORDER.entries())
  add('marketplace_size', size, size.toUpperCase(), {}, null, i);
writeFileSync('src/config/referenceTaxonomySeeds.json', JSON.stringify(rows, null, 2) + '\n');
console.log(`${rows.length} stable reference taxonomy terms snapshotted.`);
