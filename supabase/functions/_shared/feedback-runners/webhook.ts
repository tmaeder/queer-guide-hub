// Generic webhook fix runner. POSTs the prompt + callback details to a target
// URL with an HMAC signature; the receiver runs Claude however it wants and
// POSTs back to the claude-routine-callback edge function.
//
// Required env:
//   FEEDBACK_FIX_WEBHOOK_URL=https://my-runner.example.com/run
//   FEEDBACK_FIX_WEBHOOK_HMAC_SECRET=<shared secret>

import type { FixRunner } from './types.ts';
import { signHmac } from '../hmac.ts';

export const webhookFixRunner: FixRunner = {
  name: 'webhook',
  async dispatch({ runId, storyId, prompt, callbackUrl, hmacSecret }) {
    const url = Deno.env.get('FEEDBACK_FIX_WEBHOOK_URL');
    const secret = Deno.env.get('FEEDBACK_FIX_WEBHOOK_HMAC_SECRET');
    if (!url || !secret) {
      throw new Error('webhook runner requires FEEDBACK_FIX_WEBHOOK_URL + FEEDBACK_FIX_WEBHOOK_HMAC_SECRET');
    }

    const body = JSON.stringify({
      run_id: runId,
      story_id: storyId,
      prompt,
      callback_url: callbackUrl,
      callback_hmac_secret: hmacSecret,
      ts: new Date().toISOString(),
    });
    const sig = await signHmac(body, secret);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Feedback-Signature': sig,
      },
      body,
    });

    if (!res.ok) {
      throw new Error(`webhook dispatch failed (${res.status}): ${await res.text().catch(() => '')}`);
    }

    const json = (await res.json().catch(() => ({}))) as { external_ref?: string };
    return { externalRef: json.external_ref ?? `webhook:${runId}` };
  },
};
