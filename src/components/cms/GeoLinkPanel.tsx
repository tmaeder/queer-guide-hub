/**
 * GeoLinkPanel — Geo-linking card for the CMS editor sidebar.
 *
 * Shows the current geo-link status (city/country) for a content item,
 * and provides a button to link or re-link the item to its city/country.
 */

import { useState, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MapPin, Loader2, Check, AlertCircle, RefreshCw } from 'lucide-react';
import { useGeoLink } from '@/hooks/useGeoLink';

interface GeoLinkPanelProps {
  contentType: string;
  contentId: string;
  /** Current city name from content (text field) */
  cityName?: string;
  /** Current country name from content (text field) */
  countryName?: string;
  /** Whether city_id FK is already set */
  hasCityId?: boolean;
  /** Whether country_id FK is already set */
  hasCountryId?: boolean;
  onLinked?: () => void;
}

export function GeoLinkPanel({
  contentType,
  contentId,
  cityName,
  countryName,
  hasCityId,
  hasCountryId,
  onLinked,
}: GeoLinkPanelProps) {
  const { loading, result, linkSingle } = useGeoLink();
  const [linked, setLinked] = useState(false);

  const isFullyLinked = hasCityId && hasCountryId;
  const isPartiallyLinked = (hasCityId || hasCountryId) && !isFullyLinked;

  // Map content types for the edge function
  const edgeFnType = contentType === 'news' ? 'news_articles' : contentType;

  const handleLink = useCallback(async () => {
    setLinked(false);
    const response = await linkSingle(edgeFnType, contentId);
    if (response?.success) {
      const item = response.results?.[0];
      if (item?.status === 'linked' || item?.status === 'partial') {
        setLinked(true);
        onLinked?.();
      }
    }
  }, [edgeFnType, contentId, linkSingle, onLinked]);

  // Build location display string
  const locationDisplay = cityName && countryName
    ? `${cityName}, ${countryName}`
    : cityName || countryName || null;

  // Result display
  const resultItem = result?.results?.[0];
  const resolvedDisplay = resultItem
    ? [resultItem.city_resolved, resultItem.country_resolved].filter(Boolean).join(', ')
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <MapPin style={{ height: 16, width: 16, color: 'var(--mui-palette-primary-main)' }} />
            Geo Location
          </Box>
        </CardTitle>
      </CardHeader>
      <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {/* Current status */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          {isFullyLinked ? (
            <>
              <Check style={{ height: 14, width: 14, color: '#16a34a' }} />
              <Typography variant="body2" sx={{ color: '#16a34a', fontWeight: 500 }}>
                Linked
              </Typography>
              {locationDisplay && (
                <Typography variant="body2" color="text.secondary">
                  {locationDisplay}
                </Typography>
              )}
            </>
          ) : isPartiallyLinked ? (
            <>
              <AlertCircle style={{ height: 14, width: 14, color: '#ca8a04' }} />
              <Typography variant="body2" sx={{ color: '#ca8a04', fontWeight: 500 }}>
                Partially linked
              </Typography>
              {locationDisplay && (
                <Typography variant="body2" color="text.secondary">
                  {locationDisplay}
                </Typography>
              )}
            </>
          ) : locationDisplay ? (
            <>
              <AlertCircle style={{ height: 14, width: 14, color: 'var(--muted-foreground)' }} />
              <Typography variant="body2" color="text.secondary">
                {locationDisplay}
              </Typography>
              <Badge variant="outline" style={{ fontSize: '0.625rem', padding: '0 4px' }}>
                Not linked
              </Badge>
            </>
          ) : (
            <>
              <AlertCircle style={{ height: 14, width: 14, color: 'var(--muted-foreground)' }} />
              <Typography variant="caption" color="text.secondary">
                No location data
              </Typography>
            </>
          )}
        </Box>

        {/* Loading */}
        {loading && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
            <Loader2 style={{ height: 14, width: 14, animation: 'spin 1s linear infinite' }} />
            <Typography variant="caption" color="text.secondary">
              Resolving location...
            </Typography>
          </Box>
        )}

        {/* Result after linking */}
        {linked && resultItem && !loading && (
          <Box sx={{
            bgcolor: 'action.hover',
            borderRadius: 1,
            p: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 0.5,
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Check style={{ height: 12, width: 12, color: '#16a34a' }} />
              <Typography variant="caption" sx={{ color: '#16a34a', fontWeight: 500 }}>
                {resultItem.status === 'linked' ? 'Fully linked' : 'Partially linked'}
              </Typography>
            </Box>
            {resolvedDisplay && (
              <Typography variant="caption" color="text.secondary">
                Resolved to: {resolvedDisplay}
              </Typography>
            )}
          </Box>
        )}

        {/* Link / Re-link button */}
        {!loading && (
          <Button
            variant="outline"
            size="sm"
            sx={{ width: '100%' }}
            onClick={handleLink}
          >
            {isFullyLinked ? (
              <RefreshCw style={{ height: 14, width: 14, marginRight: 6 }} />
            ) : (
              <MapPin style={{ height: 14, width: 14, marginRight: 6 }} />
            )}
            {isFullyLinked ? 'Re-link Location' : linked ? 'Link Again' : 'Link Location'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
