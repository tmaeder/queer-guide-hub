// Generic webhook retest runner. POSTs retest details to a target URL; the
// receiver runs the test and POSTs back to feedback-retest-callback.

import type { RetestRunner } from './types.ts';
import { signHmac } from '../hmac.ts';

export const webhookRetestRunner: RetestRunner = {
  name: 'webhook',
  async dispatch({ retestId, routineRunId, storyId, kind, callbackUrl, hmacSecret }) {
    const url = Deno.env.get('FEEDBACK_RETEST_WEBHOOK_URL');
    const secret = Deno.env.get('FEEDBACK_RETEST_WEBHOOK_HMAC_SECRET');
    if (!url || !secret) {
      throw new Error('webhook retest runner requires FEEDBACK_RETEST_WEBHOOK_URL + FEEDBACK_RETEST_WEBHOOK_HMAC_SECRET');
    }

    const body = JSON.stringify({
      retest_id: retestId,
      routine_run_id: routineRunId,
      story_id: storyId,
      kind,
      callback_url: callbackUrl,
      callback_hmac_secret: hmacSecret,
      ts: new Date().toISOString(),
    });
    const sig = await signHmac(body, secret);

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Feedback-Signature': sig },
      body,
    });

    if (!res.ok) {
      throw new Error(`webhook retest dispatch failed (${res.status}): ${await res.text().catch(() => '')}`);
    }
    const json = (await res.json().catch(() => ({}))) as { external_ref?: string };
    return { externalRef: json.external_ref ?? `webhook-retest:${retestId}` };
  },
};
