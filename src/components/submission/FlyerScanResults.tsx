/**
 * FlyerScanResults — Displays AI extraction results with confidence indicators,
 * venue matching, type toggle, and duplicate warnings.
 * Supports multiple items across multiple files.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Check, X, ChevronDown, ChevronUp, FileText } from 'lucide-react';
import type { FlyerScanResult, FlyerScanItem, VenueCandidate } from '@/hooks/useFlyerScan';

interface FlyerScanResultsProps {
  results: FlyerScanResult[];
  selectedVenueId: string | null;
  onSelectVenue: (id: string | null) => void;
  onApply: (resultIdx: number, itemIdx: number, detectedType: 'event' | 'venue') => void;
  onDismiss: () => void;
}

// Confidence dot color
function confidenceColor(c: number): string {
  if (c >= 0.8) return '#22c55e';
  if (c >= 0.5) return '#eab308';
  return '#ef4444';
}

function confidenceLabel(c: number): string {
  if (c >= 0.8) return 'High';
  if (c >= 0.5) return 'Medium';
  return 'Low';
}

// Human-readable field labels
const FIELD_LABELS: Record<string, string> = {
  title: 'Title',
  name: 'Name',
  description: 'Description',
  event_type: 'Event Type',
  category: 'Category',
  start_date: 'Start Date',
  end_date: 'End Date',
  venue_name: 'Venue',
  address: 'Address',
  city: 'City',
  country: 'Country',
  postal_code: 'Postal Code',
  organizer_name: 'Organizer',
  organizer_contact: 'Organizer Contact',
  ticket_url: 'Ticket URL',
  website: 'Website',
  phone: 'Phone',
  email: 'Email',
  instagram: 'Instagram',
  price_text: 'Price',
  is_free: 'Free Event',
  age_restriction: 'Age Restriction',
  hours_text: 'Hours',
};

const EVENT_DISPLAY_FIELDS = [
  'title',
  'event_type',
  'start_date',
  'end_date',
  'venue_name',
  'address',
  'city',
  'country',
  'organizer_name',
  'price_text',
  'is_free',
  'website',
  'ticket_url',
];
const VENUE_DISPLAY_FIELDS = [
  'name',
  'category',
  'address',
  'city',
  'country',
  'postal_code',
  'phone',
  'email',
  'website',
  'instagram',
  'hours_text',
];

// ── Single item detail view ───────────────────────────────────────────

function ItemDetail({
  item,
  imageUrl,
  selectedVenueId,
  onSelectVenue,
  onChangeType,
  onApply,
}: {
  item: FlyerScanItem;
  imageUrl: string | null;
  selectedVenueId: string | null;
  onSelectVenue: (id: string | null) => void;
  onChangeType: (type: 'event' | 'venue') => void;
  onApply: () => void;
}) {
  const { t } = useTranslation();
  const { fields, detected_type, matches } = item;
  const displayFields = detected_type === 'event' ? EVENT_DISPLAY_FIELDS : VENUE_DISPLAY_FIELDS;

  const extractedFields = displayFields
    .filter((key) => fields[key] && fields[key].confidence > 0.2)
    .map((key) => ({ key, ...fields[key] }));

  const hasDuplicates = matches.duplicate_events.length > 0 || matches.duplicate_venues.length > 0;
  const venueCandidates = matches.venue_candidates;

  return (
    <>
      {/* Type toggle */}
      <div className="flex gap-1.5 mb-4">
        {imageUrl && (
          <img
            src={imageUrl}
            alt="Scanned flyer"
            className="w-12 h-12 rounded-md object-cover flex-shrink-0"
          />
        )}
        <div className="flex gap-1.5 items-center">
          <Badge
            onClick={() => onChangeType('event')}
            style={{
              fontWeight: 600,
              fontSize: '0.75rem',
              cursor: 'pointer',
              ...(detected_type === 'event'
                ? { backgroundColor: '#ec4899', color: '#fff' }
                : {}),
            }}
            variant={detected_type === 'event' ? 'default' : 'secondary'}
          >
            Event
          </Badge>
          <Badge
            onClick={() => onChangeType('venue')}
            style={{
              fontWeight: 600,
              fontSize: '0.75rem',
              cursor: 'pointer',
              ...(detected_type === 'venue'
                ? { backgroundColor: 'hsl(var(--brand))', color: '#fff' }
                : {}),
            }}
            variant={detected_type === 'venue' ? 'default' : 'secondary'}
          >
            Venue
          </Badge>
        </div>
      </div>

      {/* Duplicate warning */}
      {hasDuplicates && (
        <div
          className="flex items-center gap-2 p-3 mb-4 rounded-md"
          style={{ backgroundColor: '#fef3c7' }}
        >
          <AlertTriangle style={{ width: 16, height: 16, color: '#d97706', flexShrink: 0 }} />
          <span className="text-xs" style={{ color: '#92400e' }}>
            {matches.duplicate_events.length > 0
              ? `Similar event found: "${matches.duplicate_events[0].title}"`
              : `Similar venue found: "${matches.duplicate_venues[0].name}"`}{' '}
            — please check before submitting.
          </span>
        </div>
      )}

      {/* Extracted fields */}
      <div className="flex flex-col gap-1.5 mb-4">
        {extractedFields.map(({ key, value, confidence }) => (
          <div key={key} className="flex items-baseline gap-2">
            <div
              className="rounded-full flex-shrink-0"
              style={{
                width: 8,
                height: 8,
                backgroundColor: confidenceColor(confidence),
                marginTop: '4px',
              }}
              title={`${confidenceLabel(confidence)} confidence (${Math.round(confidence * 100)}%)`}
            />
            <span className="text-xs text-muted-foreground flex-shrink-0" style={{ minWidth: 80 }}>
              {FIELD_LABELS[key] || key}
            </span>
            <span className="text-xs font-medium break-words">
              {typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}
            </span>
          </div>
        ))}
        {extractedFields.length === 0 && (
          <div role="status" data-testid="extraction-empty">
            <span className="text-xs text-muted-foreground block mb-1">
              {t('submission.errors.extractionEmpty')}
            </span>
          </div>
        )}
      </div>

      {/* Venue candidates */}
      {venueCandidates.length > 0 && (
        <div className="mb-4">
          <span className="text-xs text-muted-foreground font-semibold mb-1.5 block">
            Matching venues
          </span>
          <div className="flex flex-wrap gap-1.5">
            {venueCandidates.map((v: VenueCandidate) => (
              <Badge
                key={v.id}
                onClick={() => onSelectVenue(selectedVenueId === v.id ? null : v.id)}
                variant={selectedVenueId === v.id ? 'default' : 'outline'}
                style={{
                  fontSize: '0.72rem',
                  cursor: 'pointer',
                  ...(selectedVenueId === v.id
                    ? {
                        backgroundColor: '#DB277720',
                        borderColor: 'hsl(var(--brand))',
                        borderWidth: 1,
                        borderStyle: 'solid',
                      }
                    : {}),
                }}
              >
                {selectedVenueId === v.id && <Check style={{ width: 14, height: 14, marginRight: 4 }} />}
                {`${v.name} (${Math.round(v.score * 100)}%)`}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Apply button */}
      <Button
        size="sm"
        onClick={onApply}
        style={{
          width: '100%',
          backgroundColor: detected_type === 'event' ? '#ec4899' : 'hsl(var(--brand))',
          color: '#fff',
        }}
      >
        Use this data
      </Button>
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────

export function FlyerScanResults({
  results,
  selectedVenueId,
  onSelectVenue,
  onApply,
  onDismiss,
}: FlyerScanResultsProps) {
  const { t } = useTranslation();
  // Flatten all items with their result indices
  const allItems: Array<{
    resultIdx: number;
    itemIdx: number;
    item: FlyerScanItem;
    result: FlyerScanResult;
  }> = [];
  results.forEach((result, ri) => {
    result.items.forEach((item, ii) => {
      allItems.push({ resultIdx: ri, itemIdx: ii, item, result });
    });
  });

  const [expandedIdx, setExpandedIdx] = useState(0);
  const [itemTypes, setItemTypes] = useState<Record<string, 'event' | 'venue'>>({});
  const isSingleItem = allItems.length === 1;
  const multipleFiles = results.length > 1;

  const getItemType = (ri: number, ii: number): 'event' | 'venue' => {
    const key = `${ri}-${ii}`;
    return (
      itemTypes[key] ||
      allItems.find((a) => a.resultIdx === ri && a.itemIdx === ii)?.item.detected_type ||
      'event'
    );
  };

  const handleChangeType = (ri: number, ii: number, type: 'event' | 'venue') => {
    setItemTypes((prev) => ({ ...prev, [`${ri}-${ii}`]: type }));
  };

  if (allItems.length === 0) {
    return (
      <Card>
        <CardContent data-testid="extraction-empty-card">
          <p className="text-sm text-muted-foreground">
            {t('submission.errors.extractionEmpty')}
          </p>
          <Button variant="outline" size="sm" onClick={onDismiss} style={{ marginTop: 12 }}>
            {t('submission.errors.manualFallbackCta')}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Single item — render flat (same UX as before)
  if (isSingleItem) {
    const { resultIdx, itemIdx, item, result } = allItems[0];
    const effectiveItem = { ...item, detected_type: getItemType(resultIdx, itemIdx) };

    return (
      <Card>
        <CardContent>
          <div className="flex justify-between items-center mb-3">
            <p className="text-sm font-semibold">
              Scan results
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={onDismiss}
              style={{ display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <X style={{ width: 14, height: 14 }} />
              Dismiss
            </Button>
          </div>
          <ItemDetail
            item={effectiveItem}
            imageUrl={result.image_url}
            selectedVenueId={selectedVenueId}
            onSelectVenue={onSelectVenue}
            onChangeType={(type) => handleChangeType(resultIdx, itemIdx, type)}
            onApply={() => onApply(resultIdx, itemIdx, effectiveItem.detected_type)}
          />
        </CardContent>
      </Card>
    );
  }

  // Multiple items — accordion
  return (
    <Card>
      <CardContent>
        <div className="flex justify-between items-center mb-4">
          <p className="text-sm font-semibold">
            Found {allItems.length} items{multipleFiles ? ` across ${results.length} files` : ''}
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDismiss}
            style={{ display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <X style={{ width: 14, height: 14 }} />
            Dismiss
          </Button>
        </div>

        <div className="flex flex-col gap-2">
          {allItems.map(({ resultIdx, itemIdx, item, result }, flatIdx) => {
            const isExpanded = expandedIdx === flatIdx;
            const effectiveType = getItemType(resultIdx, itemIdx);
            const primaryField =
              effectiveType === 'event'
                ? (item.fields.title?.value as string)
                : (item.fields.name?.value as string);

            return (
              <div
                key={`${resultIdx}-${itemIdx}`}
                style={{
                  border: '1px solid',
                  borderColor: isExpanded
                    ? effectiveType === 'event'
                      ? '#ec4899'
                      : 'hsl(var(--brand))'
                    : 'hsl(var(--border))',
                  borderRadius: 8,
                  overflow: 'hidden',
                  transition: 'border-color 0.2s',
                }}
              >
                {/* Collapsed header */}
                <div
                  onClick={() => setExpandedIdx(isExpanded ? -1 : flatIdx)}
                  className="flex items-center gap-2 p-3 cursor-pointer hover:bg-muted"
                >
                  <Badge
                    style={{
                      fontWeight: 600,
                      fontSize: '0.7rem',
                      height: 22,
                      backgroundColor: effectiveType === 'event' ? '#ec489920' : '#DB277720',
                      color: effectiveType === 'event' ? '#ec4899' : 'hsl(var(--brand))',
                    }}
                    variant="outline"
                  >
                    {effectiveType === 'event' ? 'Event' : 'Venue'}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-semibold block overflow-hidden text-ellipsis whitespace-nowrap">
                      {primaryField || 'Untitled'}
                    </span>
                    {multipleFiles && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <FileText style={{ width: 10, height: 10 }} />
                        {result.source_file}
                      </span>
                    )}
                  </div>
                  {isExpanded ? (
                    <ChevronUp style={{ width: 16, height: 16, color: '#999', flexShrink: 0 }} />
                  ) : (
                    <ChevronDown style={{ width: 16, height: 16, color: '#999', flexShrink: 0 }} />
                  )}
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="p-3 pt-0">
                    <ItemDetail
                      item={{ ...item, detected_type: effectiveType }}
                      imageUrl={result.image_url}
                      selectedVenueId={selectedVenueId}
                      onSelectVenue={onSelectVenue}
                      onChangeType={(type) => handleChangeType(resultIdx, itemIdx, type)}
                      onApply={() => onApply(resultIdx, itemIdx, effectiveType)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
