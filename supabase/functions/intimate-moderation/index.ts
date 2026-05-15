import {
  getServiceClient,
  jsonResponse,
  errorResponse,
  corsResponse,
} from '../_shared/supabase-client.ts';
import { llmChatCompletion } from '../_shared/llm-client.ts';

const SYSTEM = `You are a strict content moderator for an LGBTQ+ adult dating profile.
Decide whether the supplied text violates any of these rules:
- mentions of minors / under-18 / "young teen" etc.
- credible threats, doxxing, hate speech targeted at protected groups
- explicit non-consent / coercion / trafficking
- illegal services (drug sales, paid escort solicitation where prohibited)

Respond with JSON only: {"flag":"clean"|"violation","reason":"..."}.
Adults consensually describing kinks, body, role, or sex acts is NOT a violation.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req);
  const supabase = getServiceClient();

  try {
    const body = await req.json().catch(() => ({}));
    const userId = (body as { user_id?: string }).user_id;
    const aboutText = (body as { about_intimate?: string }).about_intimate ?? '';
    const lookingText = (body as { looking_for?: string }).looking_for ?? '';
    if (!userId) return errorResponse('user_id required', 400, req);

    const combined = [aboutText, lookingText].filter(Boolean).join('\n---\n');
    if (!combined.trim()) {
      return jsonResponse({ flag: 'clean', reason: 'empty' }, 200, req);
    }

    const result = await llmChatCompletion({
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: combined.slice(0, 4000) },
      ],
      temperature: 0,
      max_tokens: 200,
      response_format: { type: 'json_object' },
    });

    let parsed: { flag: 'clean' | 'violation'; reason: string };
    try {
      parsed = JSON.parse(result.content);
    } catch {
      parsed = { flag: 'clean', reason: 'unparseable' };
    }

    if (parsed.flag === 'violation') {
      await supabase
        .from('intimate_profiles')
        .update({ moderation_status: 'flagged' })
        .eq('id', userId);
      await supabase.from('moderation_flags').insert({
        flag_type: 'REVIEW',
        status: 'OPEN',
        content_type: 'intimate_profile',
        content_id: userId,
        reason: parsed.reason,
        source: 'system',
      });
    }

    return jsonResponse(parsed, 200, req);
  } catch (e) {
    return errorResponse(String(e), 500, req);
  }
});
