/**
 * story-narrate — synthesises `brief_title` + user-story `narrative`
 * ("As a [persona], I [want to], so that [value].") for a feedback_story
 * from its members' titles / descriptions. Called:
 *
 *   • from the trg_auto_story_on_insert trigger on every new story
 *   • from the admin UI on demand ("re-narrate")
 *
 * Skips stories whose `narrative_edited` flag is true — admins' hand-edits
 * are load-bearing and we never stomp them.
 *
 * Uses Cloudflare Workers AI (llama-3.3-70b-instruct-fp8-fast) since the
 * project standardised on CF AI. Single POST per call, ~400 tokens, ~200ms.
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CF_ACCOUNT_ID = Deno.env.get('CLOUDFLARE_ACCOUNT_ID')!;
const CF_API_TOKEN = Deno.env.get('CLOUDFLARE_API_TOKEN')!;
const CF_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

interface MemberText {
  content_type: 'feedback' | 'api_error';
  title?: string;
  description?: string;
  message?: string;
  service?: string;
}

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'content-type': 'application/json' },
  });
}

const SYSTEM = `You write concise user-story narratives for a product admin queue.

Given several feedback / error reports that share a root cause, emit JSON with:
  {
    "brief_title": "3-6 words naming the pain point",
    "narrative": "As a [persona], I [want to ...], so that [value]."
  }

Rules:
- Narrative MUST follow the exact template "As a X, I Y, so that Z."
- Pick the most specific persona the content supports. Examples:
  traveller, LGBTQ+ traveller, venue owner, event organiser, admin, visitor.
- Plain sentence case. No quotes, no markdown, no preface.
- If items are API errors rather than user reports, use persona "admin".
- Output ONLY the JSON object.`;

function buildUserPrompt(members: MemberText[]): string {
  const items = members.slice(0, 8).map((m, i) => {
    if (m.content_type === 'api_error') {
      return `${i + 1}. [error] ${m.service ?? ''} — ${m.message ?? m.title ?? '(no detail)'}`;
    }
    const desc = m.description ? ` — ${m.description.slice(0, 140)}` : '';
    return `${i + 1}. ${m.title ?? '(no title)'}${desc}`;
  });
  return `Items (${members.length} total, showing up to 8):\n${items.join('\n')}`;
}

async function cfNarrate(members: MemberText[]): Promise<{ brief_title: string; narrative: string }> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${CF_MODEL}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CF_API_TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: buildUserPrompt(members) },
      ],
      max_tokens: 200,
      temperature: 0.2,
    }),
  });
  if (!res.ok) {
    throw new Error(`cf narrate ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const body = await res.json();
  const text: string = body?.result?.response ?? '';
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) {
    return {
      brief_title: members[0]?.title?.slice(0, 60) ?? 'Untitled',
      narrative: `As an admin, I want to resolve this, so that users are not blocked.`,
    };
  }
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    /* fall through to fallback */
  }
  const brief = typeof parsed.brief_title === 'string' ? parsed.brief_title.slice(0, 80) : null;
  const narrative = typeof parsed.narrative === 'string' ? parsed.narrative.slice(0, 400) : null;
  return {
    brief_title: brief || members[0]?.title?.slice(0, 60) || 'Untitled',
    narrative: narrative || `As an admin, I want to resolve this, so that users are not blocked.`,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405, headers: cors });

  let body: { story_id?: string; force?: boolean };
  try {
    body = await req.json();
  } catch {
    return jsonResp({ error: 'invalid json' }, 400);
  }
  const storyId = body.story_id;
  if (!storyId) return jsonResp({ error: 'story_id required' }, 400);

  // Skip stories whose narrative was hand-edited, unless caller forces.
  const { data: story, error: storyErr } = await admin
    .from('feedback_stories')
    .select('id, title, brief_title, narrative, narrative_edited')
    .eq('id', storyId)
    .maybeSingle();
  if (storyErr) return jsonResp({ error: storyErr.message }, 500);
  if (!story) return jsonResp({ error: 'story not found' }, 404);
  if (story.narrative_edited && !body.force) {
    return jsonResp({ success: true, skipped: 'narrative_edited' });
  }

  const { data: memberRows, error: memErr } = await admin
    .from('feedback_story_members')
    .select('submission_id')
    .eq('story_id', storyId)
    .limit(8);
  if (memErr) return jsonResp({ error: memErr.message }, 500);
  if (!memberRows?.length) return jsonResp({ error: 'story has no members' }, 400);

  const ids = memberRows.map((r) => r.submission_id);
  const { data: subs, error: subErr } = await admin
    .from('community_submissions')
    .select('content_type, data')
    .in('id', ids);
  if (subErr) return jsonResp({ error: subErr.message }, 500);

  const members: MemberText[] = (subs ?? []).map((s) => {
    const d = (s.data ?? {}) as Record<string, unknown>;
    return {
      content_type: s.content_type as 'feedback' | 'api_error',
      title: typeof d.title === 'string' ? d.title : undefined,
      description: typeof d.description === 'string' ? d.description : undefined,
      message: typeof d.message === 'string' ? d.message : undefined,
      service: typeof d.service === 'string' ? d.service : undefined,
    };
  });

  if (members.length === 0) return jsonResp({ error: 'no usable member content' }, 400);

  let result: { brief_title: string; narrative: string };
  try {
    result = await cfNarrate(members);
  } catch (err) {
    return jsonResp({ error: (err as Error).message }, 502);
  }

  const { error: updErr } = await admin
    .from('feedback_stories')
    .update({
      brief_title: result.brief_title,
      narrative: result.narrative,
    })
    .eq('id', storyId);
  if (updErr) return jsonResp({ error: updErr.message }, 500);

  return jsonResp({ success: true, story_id: storyId, ...result });
});
