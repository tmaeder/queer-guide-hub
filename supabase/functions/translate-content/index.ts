import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const DEEPL_API_KEY = Deno.env.get("DEEPL_API_KEY");

const LANG_MAP: Record<string, string> = {
  en: "EN",
  de: "DE",
  es: "ES",
  fr: "FR",
  pt: "PT-BR",
  it: "IT",
  ru: "RU",
  zh: "ZH-HANS",
  ja: "JA",
  ko: "KO",
  ar: "AR",
};

async function translateWithDeepL(
  texts: string[],
  targetLang: string,
): Promise<string[]> {
  const target = LANG_MAP[targetLang] || targetLang.toUpperCase();

  const res = await fetch("https://api-free.deepl.com/v2/translate", {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${DEEPL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: texts,
      source_lang: "EN",
      target_lang: target,
      tag_handling: "html",
    }),
  });

  if (!res.ok) {
    throw new Error(`DeepL API error: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return data.translations.map(
    (t: { text: string }) => t.text,
  );
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

    if (!DEEPL_API_KEY) {
      return new Response(
        JSON.stringify({ error: "DeepL API key not configured" }),
        { status: 500 },
      );
    }

    const textsToTranslate: string[] = [];
    const fieldOrder: string[] = [];

    for (const field of fields) {
      const value = source_data[field];
      if (value && typeof value === "string" && value.trim().length > 0) {
        textsToTranslate.push(value);
        fieldOrder.push(field);
      }
    }

    if (textsToTranslate.length === 0) {
      return new Response(JSON.stringify({ translations: {} }));
    }

    const translated = await translateWithDeepL(textsToTranslate, target_language);

    const translations: Record<string, string> = {};
    for (let i = 0; i < fieldOrder.length; i++) {
      translations[fieldOrder[i]] = translated[i];
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
            machine_source: "deepl",
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
