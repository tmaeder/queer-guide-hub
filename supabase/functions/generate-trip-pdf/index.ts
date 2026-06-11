import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/supabase-client.ts";

const corsFor = (req: Request) => ({
  ...getCorsHeaders(req),
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
});

function escapeHtml(str: string | null | undefined): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(d: string | null | undefined): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatTime(t: string | null | undefined): string {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

function formatDatetime(d: string | null | undefined): string {
  if (!d) return "";
  return new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface TripPlace {
  day_id: string | null;
  country_id: string | null;
  sort_order: number | null;
  start_time: string | null;
  end_time: string | null;
  category: string | null;
  custom_name: string | null;
  custom_address: string | null;
  venue: { id: string; name: string; address: string | null } | null;
  event: { id: string; title: string; address: string | null } | null;
  hotel: { id: string; name: string; address: string | null } | null;
}

interface TripMember {
  user_id: string;
  role: string;
  profile: { id: string; display_name: string | null } | null;
}

interface Country {
  id: string;
  name: string;
  code: string;
  equality_score: number | null;
  lgbti_criminalization: string | null;
}

interface TripDay {
  id: string;
  date: string;
  title: string | null;
}

interface Reservation {
  type: string;
  title: string;
  confirmation_code: string | null;
  provider: string | null;
  check_in: string | null;
  check_out: string | null;
  amount: number | null;
  currency: string | null;
}

interface PackingItem {
  name: string;
  category: string | null;
  quantity: number;
  is_checked: boolean;
}

Deno.serve(async (req) => {
  const cors = corsFor(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { trip_id } = await req.json();
    if (!trip_id) {
      return new Response(JSON.stringify({ error: "trip_id is required" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const [
      tripRes, daysRes, placesRes, membersRes, budgetRes, reservationsRes, packingRes,
    ] = await Promise.all([
      supabase.from("trips").select("*").eq("id", trip_id).single(),
      supabase.from("trip_days").select("*").eq("trip_id", trip_id).order("sort_order"),
      supabase.from("trip_places").select("*, venue:venues(id, name, address), event:events(id, title, address), hotel:hotels(id, name, address)").eq("trip_id", trip_id).order("sort_order"),
      supabase.from("trip_members").select("*, profile:profiles(id, display_name)").eq("trip_id", trip_id),
      supabase.from("trip_budget_items").select("*").eq("trip_id", trip_id).order("date"),
      supabase.from("trip_reservations").select("*").eq("trip_id", trip_id).order("check_in"),
      supabase.from("trip_packing_items").select("*").eq("trip_id", trip_id).order("sort_order"),
    ]);

    if (tripRes.error) {
      return new Response(JSON.stringify({ error: "Trip not found" }), {
        status: 404,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const trip = tripRes.data;
    const days = (daysRes.data || []) as TripDay[];
    const places = (placesRes.data || []) as TripPlace[];
    const members = (membersRes.data || []) as TripMember[];
    const budget = budgetRes.data || [];
    const reservations = (reservationsRes.data || []) as Reservation[];
    const packing = (packingRes.data || []) as PackingItem[];

    const countryIds = [...new Set(places.map((p) => p.country_id).filter(Boolean))];
    let countries: Country[] = [];
    if (countryIds.length > 0) {
      const countryRes = await supabase.from("countries").select("id, name, code, equality_score, lgbti_criminalization").in("id", countryIds);
      countries = (countryRes.data || []) as Country[];
    }

    const memberMap = new Map<string, string>();
    for (const m of members) memberMap.set(m.user_id, m.profile?.display_name || "Unknown");

    const placesByDay = new Map<string, TripPlace[]>();
    for (const p of places) {
      const key = p.day_id || "__unassigned";
      if (!placesByDay.has(key)) placesByDay.set(key, []);
      placesByDay.get(key)!.push(p);
    }

    const budgetByCategory = new Map<string, number>();
    let budgetTotal = 0;
    for (const item of budget) {
      const cat = item.category || "Other";
      budgetByCategory.set(cat, (budgetByCategory.get(cat) || 0) + Number(item.amount));
      budgetTotal += Number(item.amount);
    }

    const paidByPerson = new Map<string, number>();
    const owedByPerson = new Map<string, number>();
    for (const item of budget) {
      const amount = Number(item.amount);
      paidByPerson.set(item.paid_by, (paidByPerson.get(item.paid_by) || 0) + amount);
      const splitCount = item.split_among?.length || 1;
      const share = amount / splitCount;
      for (const uid of item.split_among || []) owedByPerson.set(uid, (owedByPerson.get(uid) || 0) + share);
    }

    const packingByCategory = new Map<string, PackingItem[]>();
    for (const item of packing) {
      const cat = item.category || "General";
      if (!packingByCategory.has(cat)) packingByCategory.set(cat, []);
      packingByCategory.get(cat)!.push(item);
    }

    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${escapeHtml(trip.title)} - Trip Plan</title><style>:root{--primary:#DB2777;--primary-light:#fce7f3;--text:#1e293b;--muted:#64748b;--border:#e2e8f0;--bg:#fff;--section-bg:#f8fafc;--danger:#dc2626;--warning:#f59e0b;--success:#16a34a}*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Inter',-apple-system,sans-serif;color:var(--text);background:var(--bg);line-height:1.5;max-width:800px;margin:0 auto;padding:24px}h1{font-size:28px;margin-bottom:4px;font-family:'Plus Jakarta Sans',sans-serif}h2{font-size:20px;margin:32px 0 16px;padding-bottom:8px;border-bottom:2px solid var(--primary);color:var(--primary)}h3{font-size:16px;margin:16px 0 8px}.meta{color:var(--muted);font-size:14px;margin-bottom:4px}.card{background:var(--section-bg);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:12px}.place-card{display:flex;gap:12px;align-items:flex-start;padding:12px 0;border-bottom:1px solid var(--border)}.place-card:last-child{border-bottom:none}.place-time{min-width:80px;font-size:13px;font-weight:600;color:var(--primary);padding-top:2px}.place-name{font-weight:600;font-size:15px}.place-address{font-size:13px;color:var(--muted)}.place-category{display:inline-block;font-size:11px;background:var(--primary-light);color:var(--primary);padding:2px 8px;border-radius:12px;margin-top:4px}table{width:100%;border-collapse:collapse;font-size:14px}th{text-align:left;padding:8px 12px;background:var(--section-bg);border-bottom:2px solid var(--border);font-weight:600}td{padding:8px 12px;border-bottom:1px solid var(--border)}.amount{text-align:right;font-variant-numeric:tabular-nums}.total-row td{font-weight:700;border-top:2px solid var(--text)}.safety-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}.safety-card{padding:12px;border-radius:8px;border:1px solid var(--border)}.safety-score{font-size:24px;font-weight:700}.score-good{color:var(--success)}.score-warn{color:var(--warning)}.score-bad{color:var(--danger)}.safety-label{font-size:12px;color:var(--muted)}.safety-detail{font-size:13px;margin-top:4px}.packing-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px}.packing-category h3{font-size:14px;margin-bottom:6px}.packing-item{font-size:13px;padding:2px 0;display:flex;align-items:center;gap:6px}.checkbox{width:14px;height:14px;border:2px solid var(--border);border-radius:3px;display:inline-block;flex-shrink:0}.checkbox.checked{background:var(--primary);border-color:var(--primary);position:relative}.checkbox.checked::after{content:"";position:absolute;left:3px;top:0;width:4px;height:8px;border:solid white;border-width:0 2px 2px 0;transform:rotate(45deg)}.reservation-type{display:inline-block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;padding:2px 8px;border-radius:4px;background:var(--primary-light);color:var(--primary);margin-bottom:4px}.confirmation-code{font-family:monospace;font-size:13px;background:#fef3c7;padding:2px 6px;border-radius:4px}.members-list{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}.member-chip{font-size:13px;background:var(--primary-light);color:var(--primary);padding:4px 12px;border-radius:16px;font-weight:500}.balance-positive{color:var(--success)}.balance-negative{color:var(--danger)}.print-btn{position:fixed;top:16px;right:16px;background:var(--primary);color:white;border:none;padding:10px 20px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;z-index:100;box-shadow:0 2px 8px rgba(0,0,0,.15)}.print-btn:hover{opacity:.9}@media print{body{padding:0;max-width:none}.print-btn{display:none}h2{break-after:avoid}.card{break-inside:avoid}.place-card{break-inside:avoid}}</style></head><body><button class="print-btn" onclick="window.print()">Print / Save PDF</button><h1>${escapeHtml(trip.title)}</h1><p class="meta">${trip.start_date && trip.end_date ? `${formatDate(trip.start_date)} &mdash; ${formatDate(trip.end_date)}` : 'Dates TBD'} &middot; ${escapeHtml(trip.currency)} &middot; ${escapeHtml(trip.status)}</p>${trip.description ? `<p class="meta" style="margin-top:8px">${escapeHtml(trip.description)}</p>` : ''}${members.length > 0 ? `<div style="margin-top:12px"><strong style="font-size:14px">Travelers</strong><div class="members-list">${members.map((m) => `<span class="member-chip">${escapeHtml(m.profile?.display_name || 'Unknown')} <span style="font-size:11px;opacity:.7">(${escapeHtml(m.role)})</span></span>`).join('')}</div></div>` : ''}${countries.length > 0 ? `<h2>Safety Overview</h2><div class="safety-grid">${countries.map((c) => { const score = c.equality_score; const scoreClass = score >= 70 ? 'score-good' : score >= 40 ? 'score-warn' : 'score-bad'; return `<div class="safety-card"><div style="font-weight:600;margin-bottom:4px">${escapeHtml(c.name)} <span style="font-size:12px;color:var(--muted)">${escapeHtml(c.code)}</span></div>${score != null ? `<div class="safety-score ${scoreClass}">${score}<span style="font-size:14px;color:var(--muted)">/100</span></div><div class="safety-label">Equality Score</div>` : ''}</div>`; }).join('')}</div>` : ''}<h2>Itinerary</h2>${days.length > 0 ? days.map((day) => { const dp = placesByDay.get(day.id) || []; dp.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)); return `<div class="card"><h3>${formatDate(day.date)}${day.title ? ` &mdash; ${escapeHtml(day.title)}` : ''}</h3>${dp.length > 0 ? dp.map((p) => { const name = p.venue?.name || p.event?.title || p.hotel?.name || p.custom_name || 'Unnamed'; const addr = p.venue?.address || p.event?.address || p.hotel?.address || p.custom_address || ''; const time = p.start_time ? formatTime(p.start_time) + (p.end_time ? ' - ' + formatTime(p.end_time) : '') : ''; return `<div class="place-card"><div class="place-time">${time || '&nbsp;'}</div><div><div class="place-name">${escapeHtml(name)}</div>${addr ? `<div class="place-address">${escapeHtml(addr)}</div>` : ''}${p.category ? `<span class="place-category">${escapeHtml(p.category)}</span>` : ''}</div></div>`; }).join('') : '<p style="font-size:13px;color:var(--muted)">No places yet.</p>'}</div>`; }).join('') : '<p class="meta">No days planned yet.</p>'}${reservations.length > 0 ? `<h2>Reservations</h2>${reservations.map((r) => `<div class="card"><span class="reservation-type">${escapeHtml(r.type)}</span><h3 style="margin-top:4px">${escapeHtml(r.title)}</h3><table style="margin-top:8px">${r.confirmation_code ? `<tr><td style="width:140px;color:var(--muted)">Confirmation</td><td><span class="confirmation-code">${escapeHtml(r.confirmation_code)}</span></td></tr>` : ''}${r.provider ? `<tr><td style="color:var(--muted)">Provider</td><td>${escapeHtml(r.provider)}</td></tr>` : ''}${r.check_in ? `<tr><td style="color:var(--muted)">Check-in</td><td>${formatDatetime(r.check_in)}</td></tr>` : ''}${r.check_out ? `<tr><td style="color:var(--muted)">Check-out</td><td>${formatDatetime(r.check_out)}</td></tr>` : ''}${r.amount ? `<tr><td style="color:var(--muted)">Amount</td><td>${Number(r.amount).toFixed(2)} ${escapeHtml(r.currency || trip.currency)}</td></tr>` : ''}</table></div>`).join('')}` : ''}${budget.length > 0 ? `<h2>Budget</h2><div class="card"><table><thead><tr><th>Category</th><th class="amount">Amount</th></tr></thead><tbody>${[...budgetByCategory.entries()].sort((a, b) => b[1] - a[1]).map(([cat, amt]) => `<tr><td>${escapeHtml(cat)}</td><td class="amount">${amt.toFixed(2)} ${escapeHtml(trip.currency)}</td></tr>`).join('')}<tr class="total-row"><td>Total</td><td class="amount">${budgetTotal.toFixed(2)} ${escapeHtml(trip.currency)}</td></tr></tbody></table></div>` : ''}${packing.length > 0 ? `<h2>Packing</h2><div class="packing-grid">${[...packingByCategory.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([cat, items]) => `<div class="packing-category"><h3>${escapeHtml(cat)}</h3>${items.map((item) => `<div class="packing-item"><span class="checkbox ${item.is_checked ? 'checked' : ''}"></span><span>${escapeHtml(item.name)}${item.quantity > 1 ? ` <span style="color:var(--muted)">&times;${item.quantity}</span>` : ''}</span></div>`).join('')}</div>`).join('')}</div>` : ''}<div style="margin-top:48px;padding-top:16px;border-top:1px solid var(--border);text-align:center"><p class="meta">Generated from <strong>queer.guide</strong> on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p></div></body></html>`;

    return new Response(html, {
      headers: { ...cors, 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch (err) {
    console.error('generate-trip-pdf error:', err);
    return new Response(JSON.stringify({ error: 'Failed to generate trip PDF' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});