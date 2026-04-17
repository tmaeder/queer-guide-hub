/**
 * FlyerScanResults — Displays AI extraction results with confidence indicators,
 * venue matching, type toggle, and duplicate warnings.
 * Supports multiple items across multiple files.
 */

import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
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
      <Box sx={{ display: 'flex', gap: 0.75, mb: 2 }}>
        {imageUrl && (
          <Box
            component="img"
            src={imageUrl}
            alt="Scanned flyer"
            sx={{
              width: 48,
              height: 48,
              borderRadius: 1.5,
              objectFit: 'cover',
              flexShrink: 0,
            }}
          />
        )}
        <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center' }}>
          <Chip
            label="Event"
            size="small"
            onClick={() => onChangeType('event')}
            sx={{
              fontWeight: 600,
              fontSize: '0.75rem',
              ...(detected_type === 'event'
                ? { bgcolor: '#ec4899', color: '#fff' }
                : { bgcolor: 'action.hover' }),
            }}
          />
          <Chip
            label="Venue"
            size="small"
            onClick={() => onChangeType('venue')}
            sx={{
              fontWeight: 600,
              fontSize: '0.75rem',
              ...(detected_type === 'venue'
                ? { bgcolor: '#DB2777', color: '#fff' }
                : { bgcolor: 'action.hover' }),
            }}
          />
        </Box>
      </Box>

      {/* Duplicate warning */}
      {hasDuplicates && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            p: 1.5,
            mb: 2,
            borderRadius: 1.5,
            bgcolor: '#fef3c7',
          }}
        >
          <AlertTriangle style={{ width: 16, height: 16, color: '#d97706', flexShrink: 0 }} />
          <Typography variant="caption" sx={{ color: '#92400e' }}>
            {matches.duplicate_events.length > 0
              ? `Similar event found: "${matches.duplicate_events[0].title}"`
              : `Similar venue found: "${matches.duplicate_venues[0].name}"`}{' '}
            — please check before submitting.
          </Typography>
        </Box>
      )}

      {/* Extracted fields */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mb: 2 }}>
        {extractedFields.map(({ key, value, confidence }) => (
          <Box key={key} sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                bgcolor: confidenceColor(confidence),
                flexShrink: 0,
                mt: '4px',
              }}
              title={`${confidenceLabel(confidence)} confidence (${Math.round(confidence * 100)}%)`}
            />
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ minWidth: 80, flexShrink: 0 }}
            >
              {FIELD_LABELS[key] || key}
            </Typography>
            <Typography variant="caption" sx={{ fontWeight: 500, wordBreak: 'break-word' }}>
              {typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}
            </Typography>
          </Box>
        ))}
        {extractedFields.length === 0 && (
          <Typography variant="caption" color="text.secondary">
            No fields could be extracted.
          </Typography>
        )}
      </Box>

      {/* Venue candidates */}
      {venueCandidates.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontWeight: 600, mb: 0.75, display: 'block' }}
          >
            Matching venues
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
            {venueCandidates.map((v: VenueCandidate) => (
              <Chip
                key={v.id}
                label={`${v.name} (${Math.round(v.score * 100)}%)`}
                size="small"
                onClick={() => onSelectVenue(selectedVenueId === v.id ? null : v.id)}
                icon={
                  selectedVenueId === v.id ? <Check style={{ width: 14, height: 14 }} /> : undefined
                }
                sx={{
                  fontSize: '0.72rem',
                  ...(selectedVenueId === v.id
                    ? {
                        bgcolor: '#DB277720',
                        borderColor: '#DB2777',
                        borderWidth: 1,
                        borderStyle: 'solid',
                      }
                    : {}),
                }}
              />
            ))}
          </Box>
        </Box>
      )}

      {/* Apply button */}
      <Button
        size="sm"
        onClick={onApply}
        style={{
          width: '100%',
          backgroundColor: detected_type === 'event' ? '#ec4899' : '#DB2777',
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
        <CardContent>
          <Typography variant="body2" color="text.secondary">
            No events or venues could be extracted from the uploaded files.
          </Typography>
          <Button variant="outline" size="sm" onClick={onDismiss} style={{ marginTop: 12 }}>
            Dismiss
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
          <Box
            sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}
          >
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Scan results
            </Typography>
            <Button
              variant="ghost"
              size="sm"
              onClick={onDismiss}
              style={{ display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <X style={{ width: 14, height: 14 }} />
              Dismiss
            </Button>
          </Box>
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
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            Found {allItems.length} items{multipleFiles ? ` across ${results.length} files` : ''}
          </Typography>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDismiss}
            style={{ display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <X style={{ width: 14, height: 14 }} />
            Dismiss
          </Button>
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {allItems.map(({ resultIdx, itemIdx, item, result }, flatIdx) => {
            const isExpanded = expandedIdx === flatIdx;
            const effectiveType = getItemType(resultIdx, itemIdx);
            const primaryField =
              effectiveType === 'event'
                ? (item.fields.title?.value as string)
                : (item.fields.name?.value as string);

            return (
              <Box
                key={`${resultIdx}-${itemIdx}`}
                sx={{
                  border: 1,
                  borderColor: isExpanded
                    ? effectiveType === 'event'
                      ? '#ec4899'
                      : '#DB2777'
                    : 'divider',
                  borderRadius: 2,
                  overflow: 'hidden',
                  transition: 'border-color 0.2s',
                }}
              >
                {/* Collapsed header */}
                <Box
                  onClick={() => setExpandedIdx(isExpanded ? -1 : flatIdx)}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    p: 1.5,
                    cursor: 'pointer',
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                >
                  <Chip
                    label={effectiveType === 'event' ? 'Event' : 'Venue'}
                    size="small"
                    sx={{
                      fontWeight: 600,
                      fontSize: '0.7rem',
                      height: 22,
                      bgcolor: effectiveType === 'event' ? '#ec489920' : '#DB277720',
                      color: effectiveType === 'event' ? '#ec4899' : '#DB2777',
                    }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: 600,
                        display: 'block',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {primaryField || 'Untitled'}
                    </Typography>
                    {multipleFiles && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                      >
                        <FileText style={{ width: 10, height: 10 }} />
                        {result.source_file}
                      </Typography>
                    )}
                  </Box>
                  {isExpanded ? (
                    <ChevronUp style={{ width: 16, height: 16, color: '#999', flexShrink: 0 }} />
                  ) : (
                    <ChevronDown style={{ width: 16, height: 16, color: '#999', flexShrink: 0 }} />
                  )}
                </Box>

                {/* Expanded detail */}
                {isExpanded && (
                  <Box sx={{ p: 1.5, pt: 0 }}>
                    <ItemDetail
                      item={{ ...item, detected_type: effectiveType }}
                      imageUrl={result.image_url}
                      selectedVenueId={selectedVenueId}
                      onSelectVenue={onSelectVenue}
                      onChangeType={(type) => handleChangeType(resultIdx, itemIdx, type)}
                      onApply={() => onApply(resultIdx, itemIdx, effectiveType)}
                    />
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>
      </CardContent>
    </Card>
  );
}
