import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CF_ACCOUNT_ID = Deno.env.get("CF_ACCOUNT_ID") || "7aa3765cc5f50f2b681b782eb4a8d296";
const CF_API_TOKEN = Deno.env.get("CF_API_TOKEN");

const LANG_MAP: Record<string, string> = {
  en: "english",
  de: "german",
  es: "spanish",
  fr: "french",
  pt: "portuguese",
  it: "italian",
  ru: "russian",
  zh: "chinese",
  ja: "japanese",
  ko: "korean",
  ar: "arabic",
};

async function translateWithWorkersAI(
  text: string,
  targetLang: string,
): Promise<string> {
  const target = LANG_MAP[targetLang] || targetLang;

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/@cf/meta/m2m100-1.2b`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CF_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        source_lang: "english",
        target_lang: target,
      }),
    },
  );

  if (!res.ok) {
    throw new Error(`Workers AI error: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return data.result?.translated_text || text;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader! } } },
    );

    // Verify admin role
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const { data: role } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["admin", "moderator"])
      .maybeSingle();

    if (!role) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
    }

    const body = await req.json();
    const { table_name, record_id, target_language, fields, source_data } = body;

    if (!table_name || !record_id || !target_language || !fields || !source_data) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400 },
      );
    }

    if (!CF_API_TOKEN) {
      return new Response(
        JSON.stringify({ error: "Cloudflare API token not configured. Set CF_API_TOKEN in edge function secrets." }),
        { status: 500 },
      );
    }

    const textsToTranslate: { field: string; text: string }[] = [];

    for (const field of fields) {
      const value = source_data[field];
      if (value && typeof value === "string" && value.trim().length > 0) {
        textsToTranslate.push({ field, text: value });
      }
    }

    if (textsToTranslate.length === 0) {
      return new Response(JSON.stringify({ translations: {} }));
    }

    // Translate each field (m2m100 handles one text at a time)
    const translations: Record<string, string> = {};
    for (const { field, text } of textsToTranslate) {
      translations[field] = await translateWithWorkersAI(text, target_language);
    }

    // Upsert translations into DB
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    for (const [field, value] of Object.entries(translations)) {
      await serviceClient
        .from("content_translations")
        .upsert(
          {
            table_name,
            record_id,
            field_name: field,
            language: target_language,
            value,
            status: "machine",
            machine_source: "cloudflare-workers-ai",
            translated_by: user.id,
          },
          { onConflict: "table_name,record_id,field_name,language" },
        );
    }

    return new Response(JSON.stringify({ translations }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500 },
    );
  }
});
