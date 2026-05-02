/**
 * GeoLinkPanel — Geo-linking card for the CMS editor sidebar.
 */

import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MapPin, Loader2, Check, AlertCircle, RefreshCw } from 'lucide-react';
import { useGeoLink } from '@/hooks/useGeoLink';

interface GeoLinkPanelProps {
  contentType: string;
  contentId: string;
  cityName?: string;
  countryName?: string;
  hasCityId?: boolean;
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

  const locationDisplay = cityName && countryName
    ? `${cityName}, ${countryName}`
    : cityName || countryName || null;

  const resultItem = result?.results?.[0];
  const resolvedDisplay = resultItem
    ? [resultItem.city_resolved, resultItem.country_resolved].filter(Boolean).join(', ')
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <div className="flex items-center gap-2">
            <MapPin style={{ height: 16, width: 16, color: 'hsl(var(--primary))' }} />
            Geo Location
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2 flex-wrap">
          {isFullyLinked ? (
            <>
              <Check style={{ height: 14, width: 14, color: '#16a34a' }} />
              <p className="text-sm font-medium" style={{ color: '#16a34a' }}>Linked</p>
              {locationDisplay && (
                <p className="text-sm text-muted-foreground">{locationDisplay}</p>
              )}
            </>
          ) : isPartiallyLinked ? (
            <>
              <AlertCircle style={{ height: 14, width: 14, color: '#ca8a04' }} />
              <p className="text-sm font-medium" style={{ color: '#ca8a04' }}>Partially linked</p>
              {locationDisplay && (
                <p className="text-sm text-muted-foreground">{locationDisplay}</p>
              )}
            </>
          ) : locationDisplay ? (
            <>
              <AlertCircle style={{ height: 14, width: 14, color: 'var(--muted-foreground)' }} />
              <p className="text-sm text-muted-foreground">{locationDisplay}</p>
              <Badge variant="outline" style={{ fontSize: '0.625rem', padding: '0 4px' }}>
                Not linked
              </Badge>
            </>
          ) : (
            <>
              <AlertCircle style={{ height: 14, width: 14, color: 'var(--muted-foreground)' }} />
              <span className="text-xs text-muted-foreground">No location data</span>
            </>
          )}
        </div>

        {loading && (
          <div className="flex items-center gap-2 py-1">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span className="text-xs text-muted-foreground">Resolving location...</span>
          </div>
        )}

        {linked && resultItem && !loading && (
          <div className="bg-muted p-2 flex flex-col gap-1">
            <div className="flex items-center gap-1">
              <Check style={{ height: 12, width: 12, color: '#16a34a' }} />
              <span className="text-xs font-medium" style={{ color: '#16a34a' }}>
                {resultItem.status === 'linked' ? 'Fully linked' : 'Partially linked'}
              </span>
            </div>
            {resolvedDisplay && (
              <span className="text-xs text-muted-foreground">
                Resolved to: {resolvedDisplay}
              </span>
            )}
          </div>
        )}

        {!loading && (
          <Button variant="outline" size="sm" onClick={handleLink}>
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
