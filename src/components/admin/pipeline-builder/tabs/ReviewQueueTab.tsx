import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, XCircle, GitMerge, RefreshCw, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

type Disposition = 'approve' | 'reject' | 'merge' | 'create_new';

interface ReviewItem {
  id: string;
  source_type: string;
  source_name: string | null;
  target_table: string | null;
  entity_type: string | null;
  ai_validation_result: { errors?: string[]; warnings?: string[]; quality?: number } | null;
  ai_confidence_score: number | null;
  dedup_status: string | null;
  dedup_match_id: string | null;
  dedup_match_score: number | null;
  dedup_details: { match_type?: string; rules?: unknown[] } | null;
  normalized_data: Record<string, unknown> | null;
  review_status: string | null;
  created_at: string;
}

const cellStyle: React.CSSProperties = { padding: '8px 12px', fontSize: 13, verticalAlign: 'top' };
const labelStyle: React.CSSProperties = { fontSize: 11, color: '#6b7280', fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.4 };
const pillStyle = (bg: string, fg: string): React.CSSProperties => ({
  display: 'inline-block', padding: '2px 8px', borderRadius: 999, background: bg, color: fg,
  fontSize: 11, fontWeight: 500, marginRight: 6,
});

export default function ReviewQueueTab() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'venues' | 'hotels' | 'events' | 'personalities' | 'marketplace' | 'cities' | 'countries' | 'merge_candidate'>('all');
  const [selected, setSelected] = useState<ReviewItem | null>(null);

  const { data: items = [], isLoading } = useQuery<ReviewItem[]>({
    queryKey: ['review-queue', filter],
    queryFn: async () => {
      let q = supabase
        .from('ingestion_staging')
        .select('id, source_type, source_name, target_table, entity_type, ai_validation_result, ai_confidence_score, dedup_status, dedup_match_id, dedup_match_score, dedup_details, normalized_data, review_status, created_at')
        .eq('review_status', 'pending_review')
        .order('created_at', { ascending: false })
        .limit(200);
      if (filter === 'venues' || filter === 'hotels')   q = q.eq('target_table', 'venues');
      if (filter === 'events')                           q = q.eq('target_table', 'events');
      if (filter === 'personalities')                    q = q.eq('target_table', 'personalities');
      if (filter === 'marketplace')                      q = q.eq('target_table', 'marketplace_listings');
      if (filter === 'cities')                           q = q.eq('target_table', 'cities');
      if (filter === 'countries')                        q = q.eq('target_table', 'countries');
      if (filter === 'merge_candidate')                  q = q.eq('dedup_status', 'merge_candidate');
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as ReviewItem[];
      if (filter === 'hotels') {
        return rows.filter(r => !!r.normalized_data?.accommodation_type);
      }
      return rows;
    },
    refetchInterval: 30000,
  });

  const decide = useMutation({
    mutationFn: async ({ item, disposition, reason }: { item: ReviewItem; disposition: Disposition; reason?: string }) => {
      const update: Record<string, unknown> = {
        review_status: disposition === 'reject' ? 'rejected' : 'approved',
        disposition:   disposition === 'reject' ? 'rejected' : (disposition === 'merge' ? 'pending' : 'pending'),
        updated_at:    new Date().toISOString(),
      };
      if (disposition === 'merge' || disposition === 'create_new') {
        update.dedup_status = disposition === 'create_new' ? 'unique' : 'duplicate';
      }
      const { error: upErr } = await supabase.from('ingestion_staging').update(update).eq('id', item.id);
      if (upErr) throw upErr;

      // Feedback loop on dedup decisions.
      if (item.dedup_match_id && (disposition === 'merge' || disposition === 'create_new' || disposition === 'reject')) {
        const human = disposition === 'merge'      ? 'confirmed_duplicate'
                    : disposition === 'create_new' ? 'not_duplicate'
                    : 'not_duplicate';
        await supabase.from('dedup_decisions_feedback').insert({
          staging_id: item.id,
          candidate_venue_id: item.dedup_match_id,
          rpc_score: item.dedup_match_score,
          rpc_match_type: item.dedup_details?.match_type ?? null,
          human_decision: human,
          reason: reason ?? null,
        });
      }
      // Audit
      await supabase.from('ingestion_events').insert({
        staging_id: item.id,
        stage: 'review_gate',
        new_status: disposition === 'reject' ? 'rejected' : 'approved',
        actor: 'admin-ui',
        payload: { disposition, reason: reason ?? null },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['review-queue'] });
      setSelected(null);
    },
  });

  const counts = useMemo(() => {
    const c = { all: items.length, hotels: 0, merge: 0 };
    for (const i of items) {
      if (i.normalized_data?.accommodation_type) c.hotels++;
      if (i.dedup_status === 'merge_candidate')  c.merge++;
    }
    return c;
  }, [items]);

  const filterBtn = (key: typeof filter, label: string, n?: number) => (
    <button
      key={key}
      onClick={() => setFilter(key)}
      style={{
        padding: '6px 12px', fontSize: 12, fontWeight: filter === key ? 600 : 400,
        background: filter === key ? '#6366f1' : '#fff', color: filter === key ? '#fff' : '#374151',
        border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer',
      }}
    >{label}{n != null ? ` (${n})` : ''}</button>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Search style={{ width: 16, height: 16, color: '#6b7280' }} />
        <span style={{ fontSize: 14, fontWeight: 600 }}>Review Queue</span>
        <span style={{ fontSize: 12, color: '#9ca3af' }}>{items.length} items pending</span>
        <div style={{ flex: 1 }} />
        {filterBtn('all', 'All')}
        {filterBtn('hotels', 'Hotels/B&Bs', counts.hotels)}
        {filterBtn('venues', 'Venues')}
        {filterBtn('events', 'Events')}
        {filterBtn('personalities', 'Personalities')}
        {filterBtn('marketplace', 'Marketplace')}
        {filterBtn('cities', 'Cities')}
        {filterBtn('countries', 'Countries')}
        {filterBtn('merge_candidate', 'Merge candidates', counts.merge)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 3fr', gap: 16 }}>
        {/* Item list */}
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', overflow: 'hidden', maxHeight: 600, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ background: '#f9fafb' }}>
              <tr>
                <th style={{ ...cellStyle, fontWeight: 500, color: '#6b7280' }}>Source</th>
                <th style={{ ...cellStyle, fontWeight: 500, color: '#6b7280' }}>Name</th>
                <th style={{ ...cellStyle, fontWeight: 500, color: '#6b7280' }}>Issue</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={3} style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>Loading…</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={3} style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>Nothing to review</td></tr>
              ) : items.map(it => {
                const n = it.normalized_data ?? {};
                const name = String(n.name ?? '(unnamed)');
                const isHotel = !!n.accommodation_type;
                const issue = it.dedup_status === 'merge_candidate'
                  ? `merge: ${it.dedup_details?.match_type ?? '?'} ${(Number(it.dedup_match_score ?? 0) * 100).toFixed(0)}%`
                  : (it.ai_validation_result?.warnings ?? []).slice(0, 2).join(', ') || 'review';
                return (
                  <tr
                    key={it.id}
                    onClick={() => setSelected(it)}
                    style={{ cursor: 'pointer', background: selected?.id === it.id ? '#eef2ff' : 'transparent', borderBottom: '1px solid #f3f4f6' }}
                  >
                    <td style={cellStyle}>
                      {isHotel && <span style={pillStyle('#fef3c7', '#92400e')}>{String(n.accommodation_type)}</span>}
                      <div style={{ fontSize: 11, color: '#6b7280' }}>{it.source_type}</div>
                    </td>
                    <td style={cellStyle}>{name}</td>
                    <td style={{ ...cellStyle, fontSize: 11, color: '#b45309' }}>{issue}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Detail panel */}
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', padding: 16, maxHeight: 600, overflowY: 'auto' }}>
          {!selected ? (
            <div style={{ color: '#9ca3af', textAlign: 'center', padding: 40 }}>Select an item</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div style={labelStyle}>Name</div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{String(selected.normalized_data?.name ?? '(unnamed)')}</div>
              </div>
              {selected.ai_validation_result?.warnings?.length ? (
                <div>
                  <div style={labelStyle}>Warnings</div>
                  <div>{selected.ai_validation_result.warnings.map(w => <span key={w} style={pillStyle('#fef3c7', '#92400e')}>{w}</span>)}</div>
                </div>
              ) : null}
              {selected.dedup_status === 'merge_candidate' && (
                <div style={{ background: '#fef9c3', padding: 12, borderRadius: 6 }}>
                  <div style={labelStyle}>Possible duplicate</div>
                  <div style={{ fontSize: 13 }}>
                    {selected.dedup_details?.match_type} · score {(Number(selected.dedup_match_score ?? 0) * 100).toFixed(0)}%
                  </div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>match_id: {selected.dedup_match_id}</div>
                </div>
              )}
              {selected.dedup_status === 'merge_candidate' && selected.target_table === 'events' && selected.dedup_match_id && (
                <EventMergePreview
                  staging={selected.normalized_data ?? {}}
                  existingId={selected.dedup_match_id}
                />
              )}
              {selected.dedup_status === 'merge_candidate' && selected.target_table === 'personalities' && selected.dedup_match_id && (
                <PersonalityMergePreview
                  staging={selected.normalized_data ?? {}}
                  existingId={selected.dedup_match_id}
                />
              )}
              <details>
                <summary style={{ cursor: 'pointer', fontSize: 12, color: '#6b7280' }}>Normalized payload</summary>
                <pre style={{ fontSize: 11, background: '#f9fafb', padding: 8, borderRadius: 4, overflow: 'auto', maxHeight: 240 }}>
{JSON.stringify(selected.normalized_data, null, 2)}
                </pre>
              </details>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button
                  disabled={decide.isPending}
                  onClick={() => decide.mutate({ item: selected, disposition: 'approve' })}
                  style={btnStyle('#22c55e', '#fff')}
                ><CheckCircle style={{ width: 14, height: 14 }} /> Approve</button>
                {selected.dedup_status === 'merge_candidate' && (
                  <>
                    <button
                      disabled={decide.isPending}
                      onClick={() => decide.mutate({ item: selected, disposition: 'merge', reason: 'human-confirmed' })}
                      style={btnStyle('#6366f1', '#fff')}
                    ><GitMerge style={{ width: 14, height: 14 }} /> Confirm merge</button>
                    <button
                      disabled={decide.isPending}
                      onClick={() => decide.mutate({ item: selected, disposition: 'create_new', reason: 'distinct entity' })}
                      style={btnStyle('#fff', '#374151')}
                    ><RefreshCw style={{ width: 14, height: 14 }} /> Create new</button>
                  </>
                )}
                <button
                  disabled={decide.isPending}
                  onClick={() => {
                    const reason = window.prompt('Reason for rejection?') ?? undefined;
                    decide.mutate({ item: selected, disposition: 'reject', reason });
                  }}
                  style={btnStyle('#ef4444', '#fff')}
                ><XCircle style={{ width: 14, height: 14 }} /> Reject</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function btnStyle(bg: string, fg: string): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '8px 14px', fontSize: 13, fontWeight: 500,
    background: bg, color: fg, border: bg === '#fff' ? '1px solid #d1d5db' : 'none',
    borderRadius: 6, cursor: 'pointer',
  };
}

function PersonalityMergePreview({ staging, existingId }: { staging: Record<string, unknown>; existingId: string }) {
  const { data: existing } = useQuery({
    queryKey: ['personality-merge-candidate', existingId],
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> })
        .from('personalities')
        .select('id, name, description, bio, birth_date, death_date, profession, nationality, birth_place, image_url, website_url, wikidata_qid, lgbti_connection')
        .eq('id', existingId).single();
      if (error) throw error;
      return data as Record<string, unknown>;
    },
  });

  if (!existing) return <div style={{ fontSize: 12, color: '#9ca3af' }}>Loading candidate…</div>;

  const rows: Array<{ field: string; staged: unknown; existing: unknown }> = [
    { field: 'name',            staged: staging.name,            existing: existing.name },
    { field: 'wikidata_qid',    staged: staging.wikidata_qid,    existing: existing.wikidata_qid },
    { field: 'birth_date',      staged: staging.birth_date,      existing: existing.birth_date },
    { field: 'death_date',      staged: staging.death_date,      existing: existing.death_date },
    { field: 'profession',      staged: staging.profession,      existing: existing.profession },
    { field: 'nationality',     staged: staging.nationality,     existing: existing.nationality },
    { field: 'birth_place',     staged: staging.birth_place,     existing: existing.birth_place },
    { field: 'image_url',       staged: staging.image_url,       existing: existing.image_url },
    { field: 'website_url',     staged: staging.website_url,     existing: existing.website_url },
    { field: 'lgbti_connection',staged: staging.lgbti_connection,existing: existing.lgbti_connection },
    { field: 'description',     staged: staging.description,     existing: existing.description },
  ];

  const cellBase: React.CSSProperties = { padding: '4px 8px', fontSize: 11, verticalAlign: 'top', wordBreak: 'break-word' };
  const fmt = (v: unknown) => v == null || v === '' ? <span style={{ color: '#d1d5db' }}>—</span> : String(v);

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden' }}>
      <div style={{ padding: '8px 10px', background: '#f9fafb', fontSize: 11, color: '#6b7280', fontWeight: 500 }}>
        Personality field-by-field — staged vs existing
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
            <th style={{ ...cellBase, width: 120, color: '#6b7280', textAlign: 'left', fontWeight: 500 }}>Field</th>
            <th style={{ ...cellBase, color: '#6b7280', textAlign: 'left', fontWeight: 500 }}>Staged</th>
            <th style={{ ...cellBase, color: '#6b7280', textAlign: 'left', fontWeight: 500 }}>Existing</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const changed = String(r.staged ?? '') !== String(r.existing ?? '');
            return (
              <tr key={r.field} style={{ background: changed ? '#fffbeb' : 'transparent', borderBottom: '1px solid #f9fafb' }}>
                <td style={{ ...cellBase, fontFamily: 'monospace', color: '#374151' }}>{r.field}</td>
                <td style={cellBase}>{fmt(r.staged)}</td>
                <td style={cellBase}>{fmt(r.existing)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EventMergePreview({ staging, existingId }: { staging: Record<string, unknown>; existingId: string }) {
  const { data: existing } = useQuery({
    queryKey: ['event-merge-candidate', existingId],
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> })
        .from('events')
        .select('id, title, description, event_type, start_date, end_date, venue_name, city, latitude, longitude, website, ticket_url, edition, data_source, external_id')
        .eq('id', existingId)
        .single();
      if (error) throw error;
      return data as Record<string, unknown>;
    },
  });

  if (!existing) return <div style={{ fontSize: 12, color: '#9ca3af' }}>Loading candidate…</div>;

  const loc = (staging.location as Record<string, unknown>) ?? {};
  const dates = (staging.dates as Record<string, unknown>) ?? {};
  const sg = {
    title: staging.title ?? staging.name,
    start_date: staging.start_date ?? dates.start,
    end_date: staging.end_date ?? dates.end,
    city: loc.city ?? staging.city,
    latitude: loc.lat ?? staging.latitude,
    longitude: loc.lng ?? staging.longitude,
    event_type: staging.event_type,
    website: staging.website,
    venue_name: staging.venue_name,
    edition: staging.edition,
  } as Record<string, unknown>;

  const rows: Array<{ field: string; staged: unknown; existing: unknown }> = [
    { field: 'title',       staged: sg.title,       existing: existing.title },
    { field: 'event_type',  staged: sg.event_type,  existing: existing.event_type },
    { field: 'start_date',  staged: sg.start_date,  existing: existing.start_date },
    { field: 'end_date',    staged: sg.end_date,    existing: existing.end_date },
    { field: 'venue_name',  staged: sg.venue_name,  existing: existing.venue_name },
    { field: 'city',        staged: sg.city,        existing: existing.city },
    { field: 'latitude',    staged: sg.latitude,    existing: existing.latitude },
    { field: 'longitude',   staged: sg.longitude,   existing: existing.longitude },
    { field: 'edition',     staged: sg.edition,     existing: existing.edition },
    { field: 'website',     staged: sg.website,     existing: existing.website },
  ];

  const cellBase: React.CSSProperties = { padding: '4px 8px', fontSize: 11, verticalAlign: 'top', wordBreak: 'break-word' };
  const fmt = (v: unknown) => v == null || v === '' ? <span style={{ color: '#d1d5db' }}>—</span> : String(v);

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '8px 10px', background: '#f9fafb', fontSize: 11, color: '#6b7280', fontWeight: 500 }}>
        Field-by-field — staged vs existing
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
            <th style={{ ...cellBase, width: 110, color: '#6b7280', textAlign: 'left', fontWeight: 500 }}>Field</th>
            <th style={{ ...cellBase, color: '#6b7280', textAlign: 'left', fontWeight: 500 }}>Staged</th>
            <th style={{ ...cellBase, color: '#6b7280', textAlign: 'left', fontWeight: 500 }}>Existing</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const changed = String(r.staged ?? '') !== String(r.existing ?? '');
            const bg = changed ? '#fffbeb' : 'transparent';
            return (
              <tr key={r.field} style={{ background: bg, borderBottom: '1px solid #f9fafb' }}>
                <td style={{ ...cellBase, fontFamily: 'monospace', color: '#374151' }}>{r.field}</td>
                <td style={cellBase}>{fmt(r.staged)}</td>
                <td style={cellBase}>{fmt(r.existing)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
