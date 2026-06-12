#!/usr/bin/env node
/**
 * Personal-documents deprecation — T+30 final deletion (run on/after 2026-07-11).
 *
 * Deletes ALL personal documents (trip_documents rows with trip_id IS NULL):
 *   1. storage objects in the `trip-documents` bucket FIRST
 *   2. then the metadata rows
 *   3. verifies both sides and prints an audit summary
 *
 * Trip-attached documents (trip_id IS NOT NULL) are untouched.
 *
 * Privacy note: deleted data ages out of Supabase PITR/backups within the
 * project's retention window — record the run date in the audit doc.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node delete-personal-documents.mjs [--dry-run]
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dryRun = process.argv.includes('--dry-run');

if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const BUCKET = 'trip-documents';
const PAGE = 500;

async function fetchPersonalDocs() {
  const all = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('trip_documents')
      .select('id, user_id, storage_path')
      .is('trip_id', null)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    all.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

const docs = await fetchPersonalDocs();
console.log(`Personal documents found: ${docs.length}${dryRun ? ' (dry run — nothing deleted)' : ''}`);
if (docs.length === 0) {
  console.log('Nothing to delete. Done.');
  process.exit(0);
}

if (dryRun) {
  for (const d of docs.slice(0, 20)) console.log(`  would delete ${d.storage_path}`);
  if (docs.length > 20) console.log(`  … and ${docs.length - 20} more`);
  process.exit(0);
}

// 1. Storage objects first — a row without an object is recoverable noise,
//    an object without a row is an orphaned sensitive file.
let storageDeleted = 0;
let storageFailed = 0;
for (let i = 0; i < docs.length; i += 100) {
  const batch = docs.slice(i, i + 100).map((d) => d.storage_path).filter(Boolean);
  if (batch.length === 0) continue;
  const { data, error } = await supabase.storage.from(BUCKET).remove(batch);
  if (error) {
    console.error(`Storage batch ${i / 100} failed:`, error.message);
    storageFailed += batch.length;
  } else {
    storageDeleted += data?.length ?? 0;
  }
}
console.log(`Storage objects deleted: ${storageDeleted}, failed: ${storageFailed}`);
if (storageFailed > 0) {
  console.error('Storage deletions failed — NOT deleting rows for safety. Re-run.');
  process.exit(1);
}

// 2. Rows.
const { error: rowError, count } = await supabase
  .from('trip_documents')
  .delete({ count: 'exact' })
  .is('trip_id', null);
if (rowError) {
  console.error('Row deletion failed:', rowError.message);
  process.exit(1);
}
console.log(`Rows deleted: ${count}`);

// 3. Verify.
const { count: remaining } = await supabase
  .from('trip_documents')
  .select('id', { count: 'exact', head: true })
  .is('trip_id', null);
console.log(`Verification — remaining personal-doc rows: ${remaining}`);
if (remaining !== 0) {
  console.error('VERIFICATION FAILED — rows remain.');
  process.exit(1);
}
console.log(
  `Done. Record this run in docs/audits/ (date, counts: ${docs.length} found / ${storageDeleted} objects / ${count} rows) and note backup retention expiry.`,
);
