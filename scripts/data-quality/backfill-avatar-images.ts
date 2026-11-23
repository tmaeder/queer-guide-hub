/**
 * One-off: give every member whose avatar exists only as `avatar_config` an
 * image `avatar_url`, so the ~33 surfaces that read the URL stop showing a
 * letter. New signups are covered client-side by useEnsureAvatarImage; this
 * catches members who have not signed in since.
 *
 *   npx tsx scripts/data-quality/backfill-avatar-images.ts [--dry-run]
 *
 * Reads the service-role key from the logged-in Supabase CLI at run time, so
 * the key is never written to disk or printed. Fill-if-empty: a row that gains
 * an avatar_url meanwhile is left alone.
 */
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { avatarConfigToSvg } from '../../src/lib/avatarImage';
import type { AvatarConfig } from '../../src/components/profile/avatarConfig';

const REF = 'xqeacpakadqfxjxjcewc';
const BASE = `https://${REF}.supabase.co`;
const dryRun = process.argv.includes('--dry-run');

const keys = JSON.parse(
  execFileSync('supabase', ['projects', 'api-keys', '--project-ref', REF, '-o', 'json'], {
    encoding: 'utf8',
  }),
) as { name: string; api_key: string }[];
const KEY = keys.find((k) => k.name === 'service_role')?.api_key;
if (!KEY) throw new Error('service_role key not available from the Supabase CLI');
const auth = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const res = await fetch(
  `${BASE}/rest/v1/profiles?select=user_id,avatar_config&avatar_url=is.null&avatar_config=not.is.null`,
  { headers: auth },
);
if (!res.ok) throw new Error(`select failed: ${res.status} ${await res.text()}`);
const rows = (await res.json()) as { user_id: string; avatar_config: AvatarConfig }[];
console.log(`${rows.length} member(s) need an avatar image${dryRun ? ' (dry run)' : ''}`);

let done = 0;
for (const { user_id, avatar_config } of rows) {
  const webp = await sharp(Buffer.from(avatarConfigToSvg(avatar_config))).webp().toBuffer();
  if (dryRun) {
    console.log(`  ${user_id}: ${webp.length} bytes`);
    continue;
  }
  const path = `${user_id}/built-${Date.now()}.webp`;
  const up = await fetch(`${BASE}/storage/v1/object/avatars/${path}`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'image/webp', 'x-upsert': 'true' },
    body: webp,
  });
  if (!up.ok) throw new Error(`upload ${user_id}: ${up.status} ${await up.text()}`);
  const url = `${BASE}/storage/v1/object/public/avatars/${path}`;
  const patch = await fetch(
    `${BASE}/rest/v1/profiles?user_id=eq.${user_id}&avatar_url=is.null`,
    {
      method: 'PATCH',
      headers: { ...auth, 'Content-Type': 'application/json', Prefer: 'count=exact' },
      body: JSON.stringify({ avatar_url: url }),
    },
  );
  if (!patch.ok) throw new Error(`update ${user_id}: ${patch.status} ${await patch.text()}`);
  done++;
}
console.log(dryRun ? 'dry run: nothing written' : `wrote ${done} avatar image(s)`);
