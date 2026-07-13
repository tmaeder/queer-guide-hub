import { getCorsHeaders, requireAdmin, getServiceClient } from '../_shared/supabase-client.ts';

/**
 * archive-wikipedia-personality — admin-only.
 *
 * Given a personality id and a Wikipedia article URL, fetches the rendered
 * article HTML, stores it as a snapshot in the private `personality-attachments`
 * bucket, records a `personality_attachments` row, and stamps
 * `personalities.wikipedia_url`. Ported from the PHP tool's "Wikipedia-Artikel
 * ablegen" feature. The snapshot is a durable evidence copy — it does not change
 * as the live article does.
 *
 * SSRF guard: only *.wikipedia.org article URLs are accepted.
 */

interface ArchiveRequest {
  personalityId?: string;
  url?: string;
}

const WIKI_URL_RE =
  /^https?:\/\/([a-z]{2,3}(?:-[a-z0-9-]+)?)\.(?:m\.)?wikipedia\.org\/wiki\/([^?#]+)/i;
const UUID_RE = /^[0-9a-f-]{36}$/i;
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB snapshot cap

function parseWiki(url: string): { lang: string; title: string; canonical: string } | null {
  const m = WIKI_URL_RE.exec(url.trim());
  if (!m) return null;
  const lang = m[1].toLowerCase();
  const title = decodeURIComponent(m[2]);
  return { lang, title, canonical: `https://${lang}.wikipedia.org/wiki/${m[2]}` };
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const supabase = getServiceClient();
    const auth = await requireAdmin(req, supabase);
    if (auth instanceof Response) return auth;

    const { personalityId, url }: ArchiveRequest = await req.json().catch(() => ({}));
    if (!personalityId || !UUID_RE.test(personalityId))
      return json({ success: false, error: 'Valid personalityId is required.' }, 400);
    if (!url) return json({ success: false, error: 'A Wikipedia URL is required.' }, 400);

    const parsed = parseWiki(url);
    if (!parsed)
      return json({ success: false, error: 'Only https://<lang>.wikipedia.org/wiki/... URLs are accepted.' }, 400);

    // Confirm the personality exists (and get the current name for the title).
    const { data: person, error: personErr } = await supabase
      .from('personalities')
      .select('id, name')
      .eq('id', personalityId)
      .maybeSingle();
    if (personErr) throw personErr;
    if (!person) return json({ success: false, error: 'Personality not found.' }, 404);

    // Fetch the rendered article HTML from the Wikipedia REST API.
    const htmlUrl = `https://${parsed.lang}.wikipedia.org/api/rest_v1/page/html/${encodeURIComponent(
      parsed.title,
    )}`;
    const res = await fetch(htmlUrl, {
      headers: { 'User-Agent': 'Queer-Guide-App/1.0 (personality archive)', Accept: 'text/html' },
    });
    if (!res.ok)
      return json({ success: false, error: `Wikipedia fetch failed: ${res.status}` }, 502);

    const html = await res.text();
    const bytes = new TextEncoder().encode(html);
    if (bytes.byteLength > MAX_BYTES)
      return json({ success: false, error: 'Article too large to archive.' }, 413);

    // A stable, collision-free key. crypto.randomUUID is available in Deno.
    const objectId = crypto.randomUUID();
    const storagePath = `${personalityId}/${objectId}.html`;

    const { error: upErr } = await supabase.storage
      .from('personality-attachments')
      .upload(storagePath, bytes, { contentType: 'text/html; charset=utf-8', upsert: false });
    if (upErr) throw upErr;

    const createdBy = auth.originalActorId ?? (UUID_RE.test(auth.userId) ? auth.userId : null);

    const { data: attachment, error: insErr } = await supabase
      .from('personality_attachments')
      .insert({
        personality_id: personalityId,
        kind: 'wikipedia_snapshot',
        title: `Wikipedia: ${parsed.title.replace(/_/g, ' ')}`,
        source_url: parsed.canonical,
        storage_path: storagePath,
        mime_type: 'text/html',
        size_bytes: bytes.byteLength,
        created_by: createdBy,
      })
      .select()
      .single();
    if (insErr) throw insErr;

    // Stamp the canonical wikipedia_url if not already set.
    await supabase
      .from('personalities')
      .update({ wikipedia_url: parsed.canonical })
      .eq('id', personalityId)
      .is('wikipedia_url', null);

    return json({ success: true, attachment });
  } catch (error) {
    console.error('archive-wikipedia-personality error:', error);
    return json({ success: false, error: 'Failed to archive Wikipedia article.' }, 500);
  }
});
