import {
  corsResponse,
  errorResponse,
  getServiceClient,
  jsonResponse,
  requireInternalOrAdmin,
} from "../_shared/supabase-client.ts";
import { validateVenueNormalized } from "../_shared/venue-pipeline-utils.ts";
import {
  BASE,
  csv,
  detail,
  event,
  extract,
  type Item,
  nextCursor,
  type Obj,
  sport,
  venue,
} from "./parse.ts";

const UA =
  "QueerGuideBot/1.0 (+https://queer.guide; weekly public catalogue sync)";
async function publisher(source: string): Promise<string> {
  let u = new URL(source);
  for (let i = 0; i < 5; i++) {
    if (
      u.protocol !== "https:" ||
      !["outxout.com", "www.outxout.com"].includes(u.hostname) ||
      !/^\/(sitemap[^/]*\.xml|venues(?:\/[^/]+)?|events(?:\/[^/]+)?|cities|venue\/[^/]+|event\/[^/]+|service-provider\/[^/]+|sports(?:\/.*)?|api\/city-events)$/
        .test(u.pathname)
    ) throw Error("publisher URL is outside the public source allowlist");
    const res = await fetch(u, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/json,text/csv,application/xml",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(20000),
    });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get("location");
      await res.body?.cancel();
      if (!location) throw Error("redirect without location");
      u = new URL(location, u);
      continue;
    }
    if (!res.ok) throw Error(`publisher HTTP ${res.status}: ${u.pathname}`);
    if (+(res.headers.get("content-length") || 0) > 12000000) {
      await res.body?.cancel();
      throw Error("publisher body too large");
    }
    const reader = res.body!.getReader(), chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 12000000) {
        await reader.cancel();
        throw Error("publisher body too large");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const c of chunks) {
      bytes.set(c, offset);
      offset += c.length;
    }
    const text = new TextDecoder().decode(bytes);
    if (text.length < (u.pathname === "/api/city-events" ? 2 : 30)) {
      throw Error("publisher empty/short response");
    }
    return text;
  }
  throw Error("publisher redirect limit");
}
function task(
  kind: string,
  url: string,
  priority: number,
  payload: Obj = {},
): Obj {
  return { kind, url, priority, payload };
}
function apiTask(city: Obj, cursor: string): Obj {
  const params = new URLSearchParams({
    place_id: city.place_id,
    start_date: cursor,
    end_date: "2100-01-01T00:00:00.000Z",
    limit: "30",
  });
  for (
    const k of ["primary_metro_id", "secondary_metro_id", "tertiary_metro_id"]
  ) if (city[k]) params.set(k, city[k]);
  return task("city-events", `${BASE}/api/city-events?${params}`, 3, {
    city,
    cursor,
  });
}
function validation(item: Item): Obj {
  const n = item.normalized, errors: string[] = [];
  if (!n.name || n.name.length < 2) errors.push("missing_entity_name");
  if (item.target_table === "venues") {
    errors.push(...validateVenueNormalized(n).errors);
  }
  if (item.target_table === "events") {
    if (!n.start_date || !Number.isFinite(Date.parse(n.start_date))) {
      errors.push("invalid_start_date");
    }
    if (
      n.end_date &&
      (!Number.isFinite(Date.parse(n.end_date)) ||
        Date.parse(n.end_date) < Date.parse(n.start_date))
    ) errors.push("invalid_end_date");
    if (!n.location?.city && !n.venue_name) {
      errors.push("missing_event_location");
    }
  }
  return { ...item, validation_errors: errors };
}
async function collect(
  work: Obj,
  scope = "catalogue",
): Promise<{ items: Obj[]; tasks: Obj[] }> {
  const body = await publisher(work.url), tasks: Obj[] = [], items: Item[] = [];
  if (work.kind === "sitemap") {
    const urls = [...body.matchAll(/<loc>\s*(.*?)\s*<\/loc>/g)].map((m) =>
      m[1].replaceAll("&amp;", "&")
    );
    if (!urls.length) throw Error("empty sitemap");
    for (const raw of urls) {
      const parsed = new URL(raw);
      if (
        parsed.protocol !== "https:" ||
        !["outxout.com", "www.outxout.com"].includes(parsed.hostname)
      ) throw Error("unexpected sitemap origin");
      const u = BASE + parsed.pathname + parsed.search;
      if (/\/sitemap[^/]*\.xml$/.test(u)) tasks.push(task("sitemap", u, 0));
      else if (/\/(venues|events)\/[^/]+$/.test(u)) {
        tasks.push(task("catalogue", u, 2));
      } else if (/\/(venue|event|service-provider)\/[^/]+$/.test(u)) {
        tasks.push(task("detail", u, 10));
      }
    }
  } else if (work.kind === "sports") {
    const rows = csv(body);
    if (!rows.length) throw Error("empty sports catalogue");
    items.push(...rows.map(sport));
  } else if (work.kind === "city-events") {
    const data = JSON.parse(body);
    if (!Array.isArray(data.events)) {
      throw Error("city-events response contract changed");
    }
    const rows = data.events as Obj[];
    if (rows.some((e) => !e.event_id || !e.event_slug || !e.start_date)) {
      throw Error("city-events identity/date missing");
    }
    items.push(...rows.map(event));
    const next = nextCursor(rows, work.payload.cursor);
    if (next) tasks.push(apiTask(work.payload.city, next));
  } else {
    const x = extract(body);
    if (work.kind === "detail") items.push(...detail(body, work.url));
    else {
      // Empty city calendars publish a real FAQ instead of event RSC objects.
      // Their complete city API is still walked independently from /cities.
      const explicitEmptyCalendar =
        new URL(work.url).pathname.startsWith("/events/") &&
        (x.emptyEvents ||
          x.jsonld.some((o) =>
            o["@type"] === "FAQPage" &&
            /Nothing is listed|Nothing starting|No events/i.test(
              JSON.stringify(o),
            )
          ));
      if (!x.objects.length && !explicitEmptyCalendar) {
        throw Error(
          "catalogue RSC contract changed or returned an empty shell",
        );
      }
      for (const o of x.objects) {
        if (o.event_id) items.push(event(o));
        else if (o.venue_id && o.venue_slug) items.push(venue(o));
        if (o.place_id && o.place_slug) {
          tasks.push(
            apiTask(
              o,
              new Date().toISOString().slice(0, 10) + "T00:00:00.000Z",
            ),
          );
        }
      }
    }
    if (scope === "catalogue") {
      for (const u of x.links) tasks.push(task("detail", u, 10));
    }
  }
  // A large city catalogue may expose the same object in several RSC subtrees.
  const unique = [
    ...new Map(items.map((i) => [i.source_entity_id, i])).values(),
  ];
  return {
    items: unique.map(validation),
    tasks: [...new Map(tasks.map((t) => [t.kind + " " + t.url, t])).values()],
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsResponse(req);
  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405, req);
  }
  const db = getServiceClient(), auth = await requireInternalOrAdmin(req, db);
  if (auth instanceof Response) return auth;
  const rpc = async (name: string, args: Obj = {}) => {
    const { data, error } = await db.rpc(name, args);
    if (error) throw Error(`${name}: ${error.message}`);
    return data;
  };
  let run: string | null = null, token: string | null = null;
  let failed = false;
  let sourceScope = "catalogue";
  const noteSource = async (values: Obj) => {
    if (sourceScope !== "catalogue") return;
    try {
      const { error } = await db.from("ingestion_sources").update(values).eq(
        "slug",
        "outxout",
      );
      if (error) {
        console.warn("Out x Out registry metrics update failed", error.code);
      }
    } catch {
      console.warn("Out x Out registry metrics unavailable");
    }
  };
  try {
    const body = await req.json().catch(() => ({}));
    sourceScope = body.scope === "canary" ? "canary" : "catalogue";
    if (body.dry_run === true) {
      const samples = Array.isArray(body.urls)
        ? body.urls.slice(0, 4)
        : [`${BASE}/venues`, `${BASE}/cities`, `${BASE}/sports/download`];
      const previews = [];
      for (const u of samples) {
        if (typeof u !== "string") throw Error("preview URL must be a string");
        const kind = u.endsWith("/sports/download")
          ? "sports"
          : /\/(venue|event|service-provider)\//.test(u)
          ? "detail"
          : u.endsWith(".xml")
          ? "sitemap"
          : "catalogue";
        const r = await collect({ kind, url: u, payload: {} }, "canary");
        previews.push({
          url: u,
          items: r.items.length,
          by_table: r.items.reduce((a: Obj, i: Obj) => {
            a[i.target_table] = (a[i.target_table] || 0) + 1;
            return a;
          }, {}),
          tasks: r.tasks.length,
          invalid: r.items.filter((i: Obj) =>
            i.validation_errors.length
          ).length,
        });
      }
      return jsonResponse({ success: true, dry_run: true, previews }, 200, req);
    }
    run = body.run_id ??
      await rpc("outxout_open_run", {
        p_trigger: body.triggered_by ?? "manual",
        // A parent dispatcher may supply its own pipeline_run_id. This adapter
        // owns a distinct durable child run; resume it with the returned run_id.
        p_run_id: null,
        p_scope: body.scope === "canary" ? "canary" : "catalogue",
      });
    token = crypto.randomUUID();
    const claim = await rpc("outxout_claim", { p_run: run, p_token: token });
    sourceScope = claim.scope ?? sourceScope;
    if (claim.busy) {
      return jsonResponse(
        {
          success: true,
          run_id: run,
          pipeline_run_id: run,
          continuation_pending: true,
          busy: true,
        },
        200,
        req,
      );
    }
    if (["completed", "failed", "paused", "cancelled"].includes(claim.phase)) {
      return jsonResponse(
        {
          success: claim.phase === "completed",
          run_id: run,
          pipeline_run_id: run,
          phase: claim.phase,
          continuation_pending: false,
        },
        claim.phase === "failed" ? 500 : 200,
        req,
      );
    }
    const started = Date.now();
    await noteSource({ last_run_at: new Date().toISOString() });
    let processed = 0;
    if (claim.phase === "collect") {
      // Four public fetches at a time, no unbounded background work. Checkpoints
      // and retries live in Postgres; cron resumes after dropped HTTP responses.
      for (
        let i = 0;
        i < claim.jobs.length && Date.now() - started < 32000;
        i += 4
      ) {
        await Promise.all(
          claim.jobs.slice(i, i + 4).map(async (work: Obj) => {
            try {
              const result = await collect(work, claim.scope);
              // Large city catalogues exceed the API statement budget as one
              // transaction. Each item batch is idempotent; only mark the source
              // page done after every batch and its pagination work are durable.
              for (let offset = 0; offset < result.items.length; offset += 20) {
                await rpc("outxout_ingest", {
                  p_run: run,
                  p_items: result.items.slice(offset, offset + 20),
                });
              }
              await rpc("outxout_finish_work", {
                p_run: run,
                p_token: token,
                p_work: work.id,
                p_items: [],
                p_tasks: result.tasks,
              });
              processed++;
            } catch (error) {
              await rpc("outxout_finish_work", {
                p_run: run,
                p_token: token,
                p_work: work.id,
                p_error: String(error).slice(0, 1000),
              });
            }
          }),
        );
      }
    } else {
      const invoke = async (fn: string) => {
        const response = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/${fn}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${
                Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
              }`,
            },
            body: JSON.stringify({
              pipeline_run_id: run,
              batch_size: 20,
              embed_cap: 0,
            }),
            signal: AbortSignal.timeout(45000),
          },
        );
        if (!response.ok) {
          throw Error(
            `${fn}: HTTP ${response.status}: ${
              (await response.text()).slice(0, 300)
            }`,
          );
        }
        const result = await response.json();
        if (result.success === false) {
          throw Error(`${fn}: ${JSON.stringify(result).slice(0, 500)}`);
        }
      };
      const counts = await rpc("outxout_processing_counts", { p_run: run });
      if (counts.validate > 0) await invoke("pipeline-validate");
      else if (counts.dedup > 0) await invoke("pipeline-deduplicate");
      else await rpc("outxout_commit_batch", { p_run: run, p_limit: 10 });
      const result = await rpc("outxout_complete", {
        p_run: run,
        p_token: token,
      });
      if (result.complete) {
        await noteSource({
          last_success_at: new Date().toISOString(),
          last_error: null,
        });
      }
      return jsonResponse(
        {
          success: true,
          run_id: run,
          pipeline_run_id: run,
          ...result,
          items: result.observed ?? 0,
          continuation_pending: !result.complete,
        },
        200,
        req,
      );
    }
    return jsonResponse(
      {
        success: true,
        run_id: run,
        pipeline_run_id: run,
        processed_work: processed,
        continuation_pending: true,
      },
      200,
      req,
    );
  } catch (error) {
    failed = true;
    await noteSource({ last_error: String(error).slice(0, 1000) });
    if (run && token) {
      await db.rpc("outxout_retry_run", {
        p_run: run,
        p_token: token,
        p_error: String(error).slice(0, 1000),
      });
    }
    return errorResponse(error instanceof Error ? error.message : "Out x Out run failed", 500, req);
  } finally {
    if (run && token && !failed) {
      await db.rpc("outxout_release", { p_run: run, p_token: token });
    }
  }
});
