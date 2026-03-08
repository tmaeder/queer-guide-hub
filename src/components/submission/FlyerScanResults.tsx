/**
 * FlyerScanResults — Displays AI extraction results with confidence indicators,
 * venue matching, type toggle, and duplicate warnings.
 */

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Check, X } from 'lucide-react';
import type { FlyerScanResult, VenueCandidate } from '@/hooks/useFlyerScan';

interface FlyerScanResultsProps {
  result: FlyerScanResult;
  detectedType: 'event' | 'venue';
  imageUrl: string | null;
  selectedVenueId: string | null;
  onSelectVenue: (id: string | null) => void;
  onChangeType: (type: 'event' | 'venue') => void;
  onApply: () => void;
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

// Fields to display per type
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

export function FlyerScanResults({
  result,
  detectedType,
  imageUrl,
  selectedVenueId,
  onSelectVenue,
  onChangeType,
  onApply,
  onDismiss,
}: FlyerScanResultsProps) {
  const fields = result.extraction.fields;
  const displayFields = detectedType === 'event' ? EVENT_DISPLAY_FIELDS : VENUE_DISPLAY_FIELDS;

  // Filter to fields that actually have values
  const extractedFields = displayFields
    .filter((key) => fields[key] && fields[key].confidence > 0.2)
    .map((key) => ({ key, ...fields[key] }));

  const hasDuplicates =
    result.matches.duplicate_events.length > 0 || result.matches.duplicate_venues.length > 0;
  const venueCandidates = result.matches.venue_candidates;

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent sx={{ p: 2.5 }}>
        {/* Header row: thumbnail + type toggle */}
        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
          {imageUrl && (
            <Box
              component="img"
              src={imageUrl}
              alt="Scanned flyer"
              sx={{
                width: 64,
                height: 64,
                borderRadius: 1.5,
                objectFit: 'cover',
                flexShrink: 0,
              }}
            />
          )}
          <Box sx={{ flex: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.75 }}>
              Scan results
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.75 }}>
              <Chip
                label="Event"
                size="small"
                onClick={() => onChangeType('event')}
                sx={{
                  fontWeight: 600,
                  fontSize: '0.75rem',
                  ...(detectedType === 'event'
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
                  ...(detectedType === 'venue'
                    ? { bgcolor: '#8b5cf6', color: '#fff' }
                    : { bgcolor: 'action.hover' }),
                }}
              />
            </Box>
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
              {result.matches.duplicate_events.length > 0
                ? `Similar event found: "${result.matches.duplicate_events[0].title}"`
                : `Similar venue found: "${result.matches.duplicate_venues[0].name}"`}{' '}
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
              No fields could be extracted from this image.
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
                    selectedVenueId === v.id ? (
                      <Check style={{ width: 14, height: 14 }} />
                    ) : undefined
                  }
                  sx={{
                    fontSize: '0.72rem',
                    ...(selectedVenueId === v.id
                      ? {
                          bgcolor: '#8b5cf620',
                          borderColor: '#8b5cf6',
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

        {/* Action buttons */}
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            size="sm"
            onClick={onApply}
            style={{
              flex: 1,
              backgroundColor: detectedType === 'event' ? '#ec4899' : '#8b5cf6',
              color: '#fff',
            }}
          >
            Use this data
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onDismiss}
            style={{ display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <X style={{ width: 14, height: 14 }} />
            Dismiss
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}
