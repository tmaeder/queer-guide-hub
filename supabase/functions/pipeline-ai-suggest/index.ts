import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import { anthropicMessages } from '../_shared/anthropic-shim.ts'

// ============================================================
// pipeline-ai-suggest
// Takes a natural-language description + available node type slugs,
// returns a suggested DAG as { nodes: [{slug, label, config}], edges: [{source, target}] }
// Uses Claude Haiku for fast iteration.
// ============================================================

interface NodeTypeDescriptor {
  slug: string
  display_name: string
  description: string | null
  category: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  if (req.method !== 'POST') return errorResponse('POST required', 405, req)

  const supabase = getServiceClient()

  try {
    const body = await req.json().catch(() => ({}))
    const description = String(body.description || '').trim()
    if (description.length < 10) {
      return errorResponse('description must be at least 10 characters', 400, req)
    }

    // Fetch available node types (admin UI passes this too, but we re-fetch for safety)
    const { data: nodeTypes, error: ntErr } = await supabase
      .from('pipeline_node_types')
      .select('slug, display_name, description, category')
      .eq('is_enabled', true)
      .order('category, slug')
    if (ntErr) return errorResponse(`node_types: ${ntErr.message}`, 500, req)

    const catalog = (nodeTypes as NodeTypeDescriptor[]).map(n =>
      `- ${n.slug} (${n.category}): ${n.display_name}${n.description ? ' — ' + n.description : ''}`
    ).join('\n')

    const prompt = `You are a pipeline architect. Design a DAG for the user's request using ONLY the node types below.

User request: "${description}"

Available node types:
${catalog}

Return ONLY valid JSON (no prose, no markdown fences). Format:
{
  "nodes": [
    { "id": "n1", "slug": "<slug from catalog>", "label": "Human label", "config": {} }
  ],
  "edges": [
    { "source": "n1", "target": "n2" }
  ],
  "rationale": "one-sentence explanation of the flow"
}

Rules:
- Use node slugs EXACTLY as listed (case-sensitive).
- Every pipeline must start with at least one "source" category node.
- End with a "pipeline-commit" or commit-style node if data persistence is needed.
- Include "pipeline-validate", "pipeline-deduplicate", "pipeline-review-gate" for data ingestion flows.
- node ids should be short like n1, n2 — they're for edges only.
- Keep config empty {} — admin will fill it in.
- 3-10 nodes typical, 15 max.`

    let json: { content: Array<{ type: string; text: string }> }
    try {
      json = await anthropicMessages({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      })
    } catch (e) {
      return errorResponse(`LLM error: ${(e as Error).message}`, 500, req)
    }
    const text = json.content?.find(c => c.type === 'text')?.text ?? ''

    // Strip accidental code fences
    const jsonText = text.replace(/^```json\s*|\s*```$/g, '').trim()
    let parsed: unknown
    try {
      parsed = JSON.parse(jsonText)
    } catch (e) {
      return errorResponse(`LLM returned invalid JSON: ${(e as Error).message}`, 500, req)
    }

    const typedParsed = parsed as { nodes?: unknown[]; edges?: unknown[]; rationale?: string }
    if (!Array.isArray(typedParsed.nodes) || !Array.isArray(typedParsed.edges)) {
      return errorResponse('LLM response missing nodes/edges arrays', 500, req)
    }

    // Validate slugs against catalog
    const validSlugs = new Set((nodeTypes as NodeTypeDescriptor[]).map(n => n.slug))
    const invalid: string[] = []
    for (const n of typedParsed.nodes as Array<{ slug?: string }>) {
      if (!n.slug || !validSlugs.has(n.slug)) invalid.push(n.slug || '(missing)')
    }
    if (invalid.length > 0) {
      return errorResponse(`LLM suggested unknown slugs: ${invalid.join(', ')}`, 500, req)
    }

    return jsonResponse({
      success: true,
      suggestion: typedParsed,
    }, 200, req)

  } catch (error) {
    console.error('pipeline-ai-suggest error:', error)
    return errorResponse((error as Error).message, 500, req)
  }
})
