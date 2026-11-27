import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.5";
import {
  getCorsHeaders,
  getServiceClient,
  requireAdmin,
} from "../_shared/supabase-client.ts";
import { chatCompletion } from "../_shared/openai-client.ts";
import { consumeLlmBudget } from "../_shared/llm-budget.ts";
import {
  independentSources,
  KNOWLEDGE_DRAFT_PROMPT,
  KNOWLEDGE_EVALUATION_PROMPT,
  normalizeEvaluation,
  type SourceEvidence,
  validateKnowledgePatch,
} from "../_shared/knowledge-editorial-policy.ts";

// Explicit source hosts prevent arbitrary server-side URL fetching. New publishers
// require a reviewed code change; redirects are checked at every hop.
import { fetchKnowledgeSource } from "../_shared/knowledge-source-fetch.ts";

Deno.serve(async (req) => {
  const headers = {
    ...getCorsHeaders(req),
    "Content-Type": "application/json",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST required" }), {
      status: 405,
      headers,
    });
  }
  let failedProposal: string | undefined;
  let failedBatch: string | undefined;
  let failedStage = "request";
  try {
    const service = getServiceClient();
    let auth = await requireAdmin(req, service);
    if (auth instanceof Response && auth.status === 403) {
      const token = req.headers.get("Authorization")?.replace(/^Bearer /, "") ??
        "";
      const { data: userData } = await service.auth.getUser(token);
      if (userData.user) {
        const { data: roles } = await service.from("user_roles").select("role")
          .eq("user_id", userData.user.id).in("role", ["admin", "moderator"]);
        if (roles?.length) {
          auth = {
            userId: userData.user.id,
            isServiceRole: false,
            originalActorId: null,
          };
        }
      }
    }
    if (auth instanceof Response) return auth;
    const workerIsService = auth.isServiceRole;
    const { action, id } = await req.json();
    if (
      !["generate", "validate", "sweep"].includes(action) ||
      !(typeof id === "string" &&
        (/^[0-9a-f-]{36}$/i.test(id) || (action === "sweep" && id === "all")))
    ) throw new Error("Invalid action or proposal ID");
    // Preserve human identity for saves; trusted service access is used only for
    // worker validation receipts and the automatic publishing operation.
    const user = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization") ?? "" },
        },
      },
    );
    async function rpc(
      name: string,
      proposalId: string,
      payload: Record<string, unknown> = {},
      trusted = false,
    ) {
      const { data, error } =
        await (trusted || workerIsService ? service : user).rpc(
          "knowledge_editorial_action",
          { p_action: name, p_id: proposalId, p_payload: payload },
        );
      if (error || data?.ok === false) {
        throw new Error(error?.message ?? data?.error);
      }
      return data;
    }
    if (action === "sweep") {
      if (!workerIsService) {
        throw new Error("Automatic sweep requires service role");
      }
      const { data: batches, error: batchError } = await service.from(
        "knowledge_editorial_batches",
      ).select("id").eq("automatic_enabled", true).not(
        "accepted_at",
        "is",
        null,
      ).is("paused_reason", null);
      if (batchError) throw batchError;
      const batchIds = (batches ?? []).filter((b) =>
        id === "all" || b.id === id
      ).map((b) => b.id);
      if (!batchIds.length) {
        return new Response(
          JSON.stringify({ results: [], reason: "No accepted enabled batch" }),
          { headers },
        );
      }
      const { data: entries, error } = await service.from(
        "knowledge_editorial_entries",
      ).select("id,entity_type,entity_id").in("batch_id", batchIds);
      if (error) throw error;
      const entryIds = (entries ?? []).map((e) => e.id);
      if (!entryIds.length) {
        return new Response(JSON.stringify({ results: [] }), { headers });
      }
      const { data: history, error: historyError } = await service.from(
        "knowledge_editorial_proposals",
      ).select("id,entry_id,status,published_at,created_at").in(
        "entry_id",
        entryIds,
      ).order("created_at", { ascending: false });
      if (historyError) throw historyError;
      const { data: recentErrors } = await service.from(
        "knowledge_editorial_events",
      ).select("proposal_id").eq("action", "worker_error").gt(
        "created_at",
        new Date(Date.now() - 86400000).toISOString(),
      );
      const failedIds = new Set((recentErrors ?? []).map((e) => e.proposal_id));
      const results: unknown[] = [];
      for (
        const row of (history ?? []).filter((q) => q.status === "review").slice(
          0,
          5,
        )
      ) {
        try {
          results.push(await rpc("publish_auto", row.id, {}, true));
        } catch (error) {
          results.push({
            id: row.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      // Prepare one revision per tick, after 90 days. Failures leave a visible
      // draft; the next tick resumes that stage instead of duplicating work.
      const cutoff = Date.now() - 90 * 86400000;
      for (const entry of entries ?? []) {
        const latest = (history ?? []).find((q) => q.entry_id === entry.id);
        if (latest && failedIds.has(latest.id)) continue;
        if (
          latest && ["review", "approved", "rejected"].includes(latest.status)
        ) continue;
        if (
          latest?.status === "published" &&
          Date.parse(latest.published_at) > cutoff
        ) continue;
        let current = latest;
        if (!current || ["published", "superseded"].includes(current.status)) {
          current = await rpc("create", entry.id, {}, true);
        }
        if (!current) continue;
        const nextAction = current.status === "research"
          ? "generate"
          : "validate";
        const response = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/knowledge-editorial`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${
                Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
              }`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ action: nextAction, id: current.id }),
            signal: AbortSignal.timeout(90000),
          },
        );
        results.push({
          id: current.id,
          stage: nextAction,
          ...await response.json(),
        });
        break;
      }
      return new Response(JSON.stringify({ results }), { headers });
    }
    failedProposal = id;
    failedStage = action;
    const { data: proposal, error } = await service.from(
      "knowledge_editorial_proposals",
    ).select("*").eq("id", id).single();
    if (error) throw error;
    if (!["research", "draft", "review"].includes(proposal.status)) {
      throw new Error("Proposal must be open and unapproved");
    }
    const { data: entry, error: entryError } = await service.from(
      "knowledge_editorial_entries",
    ).select("*").eq("id", proposal.entry_id).single();
    if (entryError) throw entryError;
    failedBatch = entry.batch_id;
    const urls: string[] = action === "generate"
      ? entry.source_urls
      : proposal.sources.map((s: SourceEvidence) => s.url);
    if (urls.length < 2 || urls.length > 6) {
      throw new Error("Provide two to six reviewed source URLs");
    }
    const evidence = await Promise.all(urls.map(fetchKnowledgeSource));
    // Reuse the existing caller allocation; never fail open or create a budget.
    const budgetKey = Deno.env.get("KNOWLEDGE_LLM_BUDGET_CALLER") ??
      "knowledge-editorial";
    const { data: allocation, error: allocationError } = await service.from(
      "llm_budget",
    ).select("daily_cap").eq("caller_key", budgetKey).maybeSingle();
    if (allocationError || !allocation || allocation.daily_cap <= 0) {
      throw new Error(
        "No existing AI budget assigned to knowledge editorial; configure an existing allocation without increasing spending limits",
      );
    }
    const budget = await consumeLlmBudget(service, budgetKey, 1);
    if (!budget.allowed || budget.degraded || budget.cap === null) {
      throw new Error(
        "Existing AI allocation unavailable or exhausted; live content retained",
      );
    }
    const prompt = action === "generate"
      ? KNOWLEDGE_DRAFT_PROMPT
      : KNOWLEDGE_EVALUATION_PROMPT;
    const result = await chatCompletion(service, {
      callerFn: "knowledge-editorial",
      contextKey: id,
      temperature: 0.2,
      max_tokens: action === "generate" ? 4500 : 1200,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: prompt }, {
        role: "user",
        content: JSON.stringify({
          entity: {
            name: entry.name,
            slug: entry.slug,
            kind: entry.entity_type,
            question: entry.reader_question,
            format: entry.format,
          },
          candidate: action === "validate" ? proposal.patch : undefined,
          source_claims: action === "validate" ? proposal.sources : undefined,
          evidence,
        }),
      }],
    });
    const output = JSON.parse(result.content);
    if (action === "generate") {
      if (
        validateKnowledgePatch(entry.entity_type, output.patch ?? {}).length
      ) throw new Error("Draft failed structural checks");
      if (
        !Array.isArray(output.sources) || !independentSources(output.sources) ||
        output.sources.some((s: SourceEvidence) =>
          !evidence.some((ev) =>
            ev.url === s.url || urls[evidence.indexOf(ev)] === s.url
          ) || !s.supports || !s.title || !s.publisher
        )
      ) throw new Error("Draft returned unverified or incomplete sources");
      await rpc("save", id, {
        expected_updated_at: proposal.updated_at,
        patch: output.patch,
        sources: output.sources,
        provenance: {
          model: result.model,
          policy: "knowledge-v1",
          generated_at: new Date().toISOString(),
        },
      });
    } else {
      const structural = validateKnowledgePatch(
        entry.entity_type,
        proposal.patch,
      );
      const evaluation = normalizeEvaluation(output);
      evaluation.checks.valid_markup = !structural.some((s) =>
        s !== "internal_language"
      );
      evaluation.checks.no_internal_language &&= !structural.includes(
        "internal_language",
      );
      evaluation.checks.sources_retrieved = true;
      evaluation.checks.independent_sources &&= independentSources(
        proposal.sources,
      );
      const sources = proposal.sources.map((
        source: SourceEvidence,
        index: number,
      ) => ({
        ...source,
        excerpt: evidence[index].text,
        retrieved_at: new Date().toISOString(),
        content_hash: evidence[index].hash,
      }));
      const saved = await rpc("save", id, {
        expected_updated_at: proposal.updated_at,
        patch: proposal.patch,
        sources,
        provenance: proposal.provenance,
      });
      await rpc("checks", id, {
        content_hash: saved.validation_hash,
        ...evaluation,
        evaluator: { model: result.model, policy: "knowledge-v1", evaluated_at: new Date().toISOString() },
      }, true);
    }
    return new Response(JSON.stringify({ ok: true }), { headers });
  } catch (error) {
    if (failedProposal && failedBatch) {
      try {
        await getServiceClient().from("knowledge_editorial_events").insert({
          proposal_id: failedProposal,
          batch_id: failedBatch,
          action: "worker_error",
          detail: {
            stage: failedStage,
            reason: error instanceof Error ? error.message : "Worker failed",
          },
        });
      } catch { /* Error reporting must not hide the original failure. */ }
    }
    return new Response(
      JSON.stringify({
        error: error instanceof Error
          ? error.message
          : "Editorial operation failed; live content retained",
      }),
      { status: 400, headers },
    );
  }
});
