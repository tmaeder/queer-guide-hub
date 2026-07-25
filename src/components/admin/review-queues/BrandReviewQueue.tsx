import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { untypedSupabase } from '@/integrations/supabase/untyped';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { EntityReviewQueue } from './EntityReviewQueue';

export interface BrandReviewRow {
  id: string;
  brand_key: string;
  display_name: string;
  suggested_tags: string[] | null;
  ownership_tags: string[] | null;
  confidence: number | null;
  evidence: string | null;
  detection_source: string | null;
  product_count: number | null;
  top_source: string | null;
  sample_url: string | null;
}

export const OWNERSHIP_VOCAB = [
  'queer_owned',
  'trans_owned',
  'bipoc_owned',
  'women_owned',
  'disabled_owned',
  'nonprofit',
] as const;

export const SENSITIVE_TAGS = ['queer_owned', 'trans_owned', 'bipoc_owned'] as const;

function tagLabel(tag: string): string {
  return tag.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Which sensitive tags (if any) require the explicit confirm the RPC demands.
 * Exported for the unit test — this mirrors approve_marketplace_brand's
 * p_confirm contract exactly.
 */
export function sensitiveConfirmMessage(tags: string[], brandName: string): string | null {
  const sensitive = tags.filter((t) => (SENSITIVE_TAGS as readonly string[]).includes(t));
  if (sensitive.length === 0) return null;
  return `Publicly assert ${sensitive.map(tagLabel).join(' + ')} for "${brandName}"? This claim appears on brand pages and product badges — approve only with evidence.`;
}

/**
 * The headless brand-ownership pipeline's missing UI. marketplace_register_brands
 * (weekly cron) stages candidate brands with suggested_tags; nothing reaches the
 * public ownership badges until an admin approves here via the trust-gated
 * approve_marketplace_brand RPC.
 */
export function BrandReviewQueue() {
  const queryClient = useQueryClient();
  // Per-row working state: checked tags + optional note.
  const [drafts, setDrafts] = useState<Record<string, { tags: string[]; note: string }>>({});

  const { data: rows, isLoading } = useQuery({
    queryKey: ['brand-review-queue'],
    queryFn: async (): Promise<BrandReviewRow[]> => {
      const { data, error } = await untypedSupabase.rpc('marketplace_brands_pending', {
        p_limit: 50,
      });
      if (error) throw error;
      return (data ?? []) as BrandReviewRow[];
    },
  });

  const draftFor = (r: BrandReviewRow) =>
    drafts[r.id] ?? { tags: r.suggested_tags ?? [], note: '' };

  const setDraft = (id: string, patch: Partial<{ tags: string[]; note: string }>, base: BrandReviewRow) =>
    setDrafts((d) => ({ ...d, [id]: { ...draftFor(base), ...d[id], ...patch } }));

  const decide = useMutation({
    mutationFn: async ({
      row,
      action,
      confirmed,
    }: {
      row: BrandReviewRow;
      action: 'approve' | 'reject';
      confirmed: boolean;
    }) => {
      const draft = draftFor(row);
      const { error } =
        action === 'approve'
          ? await untypedSupabase.rpc('approve_marketplace_brand', {
              p_brand_id: row.id,
              p_tags: draft.tags,
              p_confirm: confirmed,
              p_note: draft.note || null,
            })
          : await untypedSupabase.rpc('reject_marketplace_brand', {
              p_brand_id: row.id,
              p_note: draft.note || null,
            });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brand-review-queue'] });
      queryClient.invalidateQueries({ queryKey: ['admin-counts'] });
    },
  });

  return (
    <EntityReviewQueue<BrandReviewRow>
      title="Review queue — brand ownership claims"
      description="Candidate brands staged by the weekly registry scan. Ownership tags publish to brand pages and product badges only after approval; queer/trans/BIPOC claims need an explicit confirm."
      rows={rows}
      isLoading={isLoading}
      entityName={(r) => r.display_name}
      fieldLabel={(r) => r.detection_source}
      headerExtras={(r) => (
        <>
          {r.product_count != null && (
            <span className="text-13 text-muted-foreground tabular-nums">
              {r.product_count} products
            </span>
          )}
          {r.top_source && (
            <Badge variant="outline" className="font-normal">
              {r.top_source}
            </Badge>
          )}
        </>
      )}
      renderBody={(r) => {
        const draft = draftFor(r);
        return (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-4">
              {OWNERSHIP_VOCAB.map((tag) => (
                <label key={tag} className="flex items-center gap-1.5 text-13">
                  <Checkbox
                    checked={draft.tags.includes(tag)}
                    onCheckedChange={(checked) =>
                      setDraft(
                        r.id,
                        {
                          tags: checked
                            ? [...draft.tags, tag]
                            : draft.tags.filter((t) => t !== tag),
                        },
                        r,
                      )
                    }
                  />
                  {tagLabel(tag)}
                  {(SENSITIVE_TAGS as readonly string[]).includes(tag) && (
                    <span className="text-muted-foreground" title="Requires explicit confirmation">
                      *
                    </span>
                  )}
                </label>
              ))}
            </div>
            {r.evidence && <p className="text-13 text-muted-foreground">{r.evidence}</p>}
            {r.sample_url && (
              <a
                href={r.sample_url}
                target="_blank"
                rel="noreferrer"
                className="text-13 text-muted-foreground underline"
              >
                sample product
              </a>
            )}
            <Input
              placeholder="Reviewer note (optional)"
              value={draft.note}
              onChange={(e) => setDraft(r.id, { note: e.target.value }, r)}
              className="max-w-md"
            />
          </div>
        );
      }}
      approveLabel="Approve"
      rejectLabel="Reject"
      approveGuard={(r) => sensitiveConfirmMessage(draftFor(r).tags, r.display_name)}
      decideSuccess={(action) =>
        action === 'approve'
          ? 'Approved — tags fan out on the next ownership-apply run'
          : 'Rejected'
      }
      onDecide={(row, action, confirmed) => decide.mutateAsync({ row, action, confirmed })}
    />
  );
}
