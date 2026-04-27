import type { SubmitBody } from "./schema";

export interface InsertResult {
  id: number | string;
  disposition: string;
}

/**
 * Insert a row into ingestion_staging via Supabase REST. Uses service-role
 * key so RLS does not apply on writes; the service role is only ever held
 * by this worker.
 *
 * Returns the inserted row (or the existing row on idempotent conflict).
 */
export async function insertStagingRow(opts: {
  supabaseUrl: string;
  serviceKey: string;
  userId: string;
  body: SubmitBody;
  payloadHash: string;
  sourceEntityId: string;
  targetTable: string;
}): Promise<InsertResult> {
  const row = {
    raw_data: opts.body.raw_data,
    source_type: "user_submission",
    source_name: `extension:${opts.userId}`,
    source_entity_id: opts.sourceEntityId,
    payload_hash: opts.payloadHash,
    target_table: opts.targetTable,
    entity_type: opts.body.entity_type,
    disposition: "pending",
    ai_validation_status: "pending",
    dedup_status: "pending",
    submitted_by_user_id: opts.userId,
    submission_url: opts.body.source_url,
    submission_notes: opts.body.notes ?? null,
    submission_client: opts.body.client ?? null,
  };

  const url = `${opts.supabaseUrl}/rest/v1/ingestion_staging?on_conflict=source_type,source_entity_id,payload_hash`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: opts.serviceKey,
      Authorization: `Bearer ${opts.serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation,resolution=merge-duplicates",
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`supabase insert failed ${res.status}: ${text}`);
  }
  const data = (await res.json()) as Array<{ id: number | string; disposition: string }>;
  if (!data.length) throw new Error("supabase returned empty result");
  return data[0]!;
}

export async function getSubmissionStatus(opts: {
  supabaseUrl: string;
  serviceKey: string;
  userId: string;
  id: string;
}): Promise<Record<string, unknown> | null> {
  const url =
    `${opts.supabaseUrl}/rest/v1/ingestion_staging` +
    `?id=eq.${encodeURIComponent(opts.id)}` +
    `&submitted_by_user_id=eq.${encodeURIComponent(opts.userId)}` +
    `&select=id,disposition,ai_validation_status,dedup_status,target_table,entity_type,created_at,updated_at`;
  const res = await fetch(url, {
    headers: {
      apikey: opts.serviceKey,
      Authorization: `Bearer ${opts.serviceKey}`,
    },
  });
  if (!res.ok) {
    throw new Error(`supabase select failed ${res.status}: ${await res.text()}`);
  }
  const rows = (await res.json()) as Array<Record<string, unknown>>;
  return rows[0] ?? null;
}
