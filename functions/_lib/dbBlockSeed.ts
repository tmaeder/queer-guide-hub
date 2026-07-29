/**
 * Pre-hydrates the entities a CMS page's database blocks will render, and
 * serializes them into the HTML so the first paint has data instead of a
 * skeleton.
 *
 * Runs the SAME shared modules the browser runs — `parseDatabaseBlocks` and
 * `buildEntityCardQuery` — so the seeded payload and the client's own refetch
 * cannot disagree about what a block contains. Those modules are import-safe
 * from this bundle only because they are alias-free and dependency-free;
 * `src/lib/databaseBlock/__tests__/portability.test.ts` enforces that.
 *
 * The payload carries RAW `v_entity_cards` rows; normalization happens once, on
 * the client, in `src/lib/databaseBlock/seed.ts`.
 *
 * SAFETY: every read goes through `anonSelect` (anon key, no service-role
 * fallback) against `v_entity_cards` (safety gate in the view body). The
 * payload is therefore identical for every viewer, which is what makes it safe
 * to inject for everyone rather than bots only. A signed-in reader may briefly
 * see FEWER entities than they are entitled to, never more — the correct
 * failure direction.
 */

import { anonSelect } from './anonRest';
import { parseDatabaseBlocks } from '../../src/lib/databaseBlock/parse';
import {
  buildEntityCardQuery,
  toPostgrestQueryString,
} from '../../src/lib/databaseBlock/query';

interface SeedEnv {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
}

/** Element id the client reads. Keep in sync with src/lib/databaseBlock/seed.ts. */
export const SEED_SCRIPT_ID = 'qg-db-block-seed';
export const SEED_VERSION = 1;

/** Blocks hydrated per page. Beyond this the client fetches the rest itself. */
const MAX_BLOCKS = 6;
/** Rows per block. Matches the layouts' initial visible window. */
const MAX_ROWS_PER_BLOCK = 24;
/** Above this the payload costs more than the skeleton it removes. */
const MAX_PAYLOAD_BYTES = 24_000;

/**
 * `</script>` inside JSON would close the tag early. Escaping `<` is
 * sufficient and keeps the payload valid JSON. Mirrors escapeJsonLd in detail.ts.
 */
function escapeForScript(json: string): string {
  return json.replace(/</g, '\\u003c');
}

export interface DbBlockSeed {
  scriptTag: string;
  blockCount: number;
  bytes: number;
}

/**
 * Returns the seed script tag for a CMS page, or null when there is nothing
 * worth injecting — no page, no blocks, no rows, or an over-budget payload.
 *
 * Costs ONE query for a page with no blocks, which is the overwhelmingly common
 * case (/terms, /privacy, …).
 */
export async function buildDbBlockSeed(
  env: SeedEnv,
  slug: string,
): Promise<DbBlockSeed | null> {
  const pages = await anonSelect<{ body_doc: unknown }>(
    env,
    'cms_pages',
    `select=body_doc&slug=eq.${encodeURIComponent(slug)}&workflow_state=eq.published&limit=1`,
  );
  if (!pages || pages.length === 0) return null;

  const blocks = parseDatabaseBlocks(pages[0].body_doc).slice(0, MAX_BLOCKS);
  if (blocks.length === 0) return null;

  const entries = await Promise.all(
    blocks.map(async (block) => {
      const query = buildEntityCardQuery(block.entityType, block.source, {
        limit: MAX_ROWS_PER_BLOCK,
      });
      const rows = await anonSelect(
        env,
        query.relation,
        toPostgrestQueryString(query),
      );
      // Emit RAW v_entity_cards rows, not normalized cards: src/lib/
      // databaseBlock/seed.ts runs normalizeEntityCards itself. Normalizing
      // here too would feed EntityCard objects back through a normalizer that
      // reads snake_case columns, and every card would be silently dropped.
      return rows && rows.length ? ([block.blockId, rows] as const) : null;
    }),
  );

  const payloadBlocks: Record<string, unknown> = {};
  for (const entry of entries) {
    if (entry) payloadBlocks[entry[0]] = entry[1];
  }
  if (Object.keys(payloadBlocks).length === 0) return null;

  const json = JSON.stringify({ v: SEED_VERSION, slug, blocks: payloadBlocks });
  if (json.length > MAX_PAYLOAD_BYTES) return null;

  return {
    scriptTag: `<script type="application/json" id="${SEED_SCRIPT_ID}">${escapeForScript(json)}</script>`,
    blockCount: Object.keys(payloadBlocks).length,
    bytes: json.length,
  };
}
