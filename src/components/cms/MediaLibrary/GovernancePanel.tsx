import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Lock, Tag as TagIcon, X, LayoutTemplate } from 'lucide-react';
import { useMediaMutations } from '@/hooks/useMediaMutations';
import { ACCESS_LEVELS, BRAND_CATEGORIES, TEMPLATE_STATUSES } from './types';
import type { AccessLevel, BrandCategory, TemplateStatus, MediaDetailData } from './types';

/**
 * DAM governance controls: access tier, brand category, and tags. Access-tier changes on an
 * already-uploaded asset only move the DB row's visibility; a note flags that existing bytes
 * are not relocated between buckets (re-upload for a hard byte-level move).
 */
export function GovernancePanel({ detail }: { detail: MediaDetailData }) {
  const mutations = useMediaMutations();
  const [tagDraft, setTagDraft] = useState('');
  const tags = detail.tags ?? [];
  const nonPublicAlready = detail.access_level !== 'public';
  // cms_media bytes now relocate automatically on a tier flip (dam-relocate-asset);
  // only image_asset bytes live on the R2 CDN and are not per-object relocated.
  const bytesStayOnCdn = detail.source_type === 'image_asset';
  const isTemplate = detail.brand_category === 'template';

  const addTag = () => {
    const slug = tagDraft.trim().toLowerCase();
    if (slug) mutations.addTag.mutate({ item: detail, slug });
    setTagDraft('');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Governance</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-sm font-medium mb-1 flex items-center gap-1">
              Access level
              {nonPublicAlready && <Lock size={12} className="text-muted-foreground" />}
            </p>
            <Select
              value={detail.access_level}
              onValueChange={(v) =>
                mutations.updateGovernance.mutate({ item: detail, updates: { access_level: v as AccessLevel } })
              }
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ACCESS_LEVELS.map((a) => (
                  <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <p className="text-sm font-medium mb-1">Brand category</p>
            <Select
              value={detail.brand_category ?? 'none'}
              onValueChange={(v) =>
                mutations.updateGovernance.mutate({
                  item: detail,
                  updates: { brand_category: v === 'none' ? null : (v as BrandCategory) },
                })
              }
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No category</SelectItem>
                {BRAND_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {bytesStayOnCdn && nonPublicAlready && (
          <p className="text-xs text-muted-foreground">
            This is an image-asset served from the public image CDN — changing the tier restricts the
            record, but the file bytes remain publicly fetchable by URL. For truly private bytes, store
            the asset as CMS media (which relocates into private storage on a tier change).
          </p>
        )}

        {isTemplate && (
          <div>
            <p className="text-sm font-medium mb-1 flex items-center gap-1">
              <LayoutTemplate size={13} /> Template status
            </p>
            <div className="flex items-center gap-2">
              <Select
                value={detail.template_status ?? 'none'}
                onValueChange={(v) =>
                  mutations.setTemplateStatus.mutate({
                    item: detail,
                    status: v === 'none' ? null : (v as TemplateStatus),
                  })
                }
              >
                <SelectTrigger style={{ maxWidth: 240 }}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not set</SelectItem>
                  {TEMPLATE_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {detail.template_status === 'approved' && <Badge variant="secondary">Published</Badge>}
              {detail.template_status === 'deprecated' && <Badge variant="outline">Retired</Badge>}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Only approved templates count as published for reuse. Changes are audited.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium flex items-center gap-1">
            <TagIcon size={13} /> Tags
          </p>
          <div className="flex flex-wrap items-center gap-1">
            {tags.length === 0 && <span className="text-sm text-muted-foreground">No tags.</span>}
            {tags.map((t) => (
              <Badge key={t} variant="secondary" className="gap-1">
                {t}
                <button
                  type="button"
                  aria-label={`Remove tag ${t}`}
                  onClick={() => mutations.removeTag.mutate({ item: detail, slug: t })}
                  className="ml-0.5"
                >
                  <X size={11} />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
              placeholder="Add existing tag slug…"
              style={{ maxWidth: 240 }}
            />
            <Button variant="outline" size="sm" onClick={addTag} disabled={mutations.addTag.isPending}>
              Add
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
