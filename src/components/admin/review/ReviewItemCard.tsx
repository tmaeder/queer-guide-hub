/**
 * ReviewItemCard — Unified card component for all review queues.
 *
 * Renders content preview, status badge, sensitivity flags, relevance score,
 * and action buttons. Used across all Review Hub tabs.
 */

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Check, X, Eye, AlertTriangle } from 'lucide-react';
import { SensitivityBadges } from '@/components/ui/ContentWarningBanner';

export interface ReviewItem {
  id: string;
  title: string;
  subtitle?: string;
  content_type: string;
  status: string;
  created_at: string;
  relevance_score?: number | null;
  sensitivity_flags?: Array<{ category: string; severity: string }> | null;
  reasoning?: string;
  meta?: Record<string, unknown>;
}

interface ReviewItemCardProps {
  item: ReviewItem;
  selected?: boolean;
  onSelect?: (id: string) => void;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  onView?: (id: string) => void;
  compact?: boolean;
}

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'secondary',
  review: 'outline',
  approved: 'default',
  rejected: 'destructive',
  draft: 'outline',
  published: 'default',
  archived: 'outline',
  open: 'secondary',
  OPEN: 'secondary',
  in_review: 'outline',
  IN_REVIEW: 'outline',
  resolved: 'default',
  RESOLVED: 'default',
  dismissed: 'outline',
  REJECTED: 'destructive',
};

const CONTENT_TYPE_LABELS: Record<string, string> = {
  venues: 'Venue',
  events: 'Event',
  news_articles: 'News',
  personalities: 'Person',
  marketplace_listings: 'Listing',
};

export const ReviewItemCard = ({
  item,
  selected,
  onSelect,
  onApprove,
  onReject,
  onView,
  compact = false,
}: ReviewItemCardProps) => {
  return (
    <Card
      className={`mb-2 transition-all ${selected ? 'border-primary bg-accent' : 'border-border bg-background'}`}
    >
      <CardContent className={`${compact ? 'py-2' : 'py-3'} px-4`}>
        <div className="flex items-start gap-3">
          {/* Selection checkbox */}
          {onSelect && (
            <Checkbox
              checked={selected}
              onCheckedChange={() => onSelect(item.id)}
              className="mt-0.5"
            />
          )}

          {/* Main content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-sm font-semibold truncate flex-1">{item.title}</p>

              {/* Content type chip */}
              <Badge variant="outline" className="h-5 text-[0.65rem]">
                {CONTENT_TYPE_LABELS[item.content_type] || item.content_type}
              </Badge>

              {/* Status chip */}
              <Badge variant={STATUS_VARIANTS[item.status] || 'outline'} className="h-5 text-[0.65rem]">
                {item.status}
              </Badge>
            </div>

            {/* Subtitle and meta */}
            {item.subtitle && (
              <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>
            )}

            {/* Sensitivity badges + relevance score */}
            <div className="flex items-center gap-2 mt-1">
              <SensitivityBadges
                sensitivityFlags={item.sensitivity_flags}
                relevanceScore={item.relevance_score}
              />

              {item.reasoning && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <AlertTriangle size={14} style={{ color: '#d97706', cursor: 'help' }} />
                  </TooltipTrigger>
                  <TooltipContent>{item.reasoning}</TooltipContent>
                </Tooltip>
              )}

              <p className="text-xs text-muted-foreground/60 ml-auto">
                {new Date(item.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-1 ml-2 flex-shrink-0">
            {onView && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onView(item.id)}>
                    <Eye size={16} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>View</TooltipContent>
              </Tooltip>
            )}
            {onApprove && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-green-600" onClick={() => onApprove(item.id)}>
                    <Check size={16} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Approve</TooltipContent>
              </Tooltip>
            )}
            {onReject && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => onReject(item.id)}>
                    <X size={16} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Reject</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ReviewItemCard;
