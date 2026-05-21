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

  const locationDisplay =
    cityName && countryName ? `${cityName}, ${countryName}` : cityName || countryName || null;

  const resultItem = result?.results?.[0];
  const resolvedDisplay = resultItem
    ? [resultItem.city_resolved, resultItem.country_resolved].filter(Boolean).join(', ')
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <div className="flex items-center gap-2">
            <MapPin size={16} style={{ color: 'hsl(var(--primary))' }} />
            Geo Location
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2 flex-wrap">
          {isFullyLinked ? (
            <>
              <Check size={14} className="text-foreground" />
              <p className="text-sm font-medium text-foreground">Linked</p>
              {locationDisplay && (
                <p className="text-sm text-muted-foreground">{locationDisplay}</p>
              )}
            </>
          ) : isPartiallyLinked ? (
            <>
              <AlertCircle size={14} style={{ color: 'hsl(var(--foreground) / 0.55)' }} />
              <p className="text-sm font-medium" style={{ color: 'hsl(var(--foreground) / 0.55)' }}>
                Partially linked
              </p>
              {locationDisplay && (
                <p className="text-sm text-muted-foreground">{locationDisplay}</p>
              )}
            </>
          ) : locationDisplay ? (
            <>
              <AlertCircle size={14} className="text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{locationDisplay}</p>
              <Badge variant="outline" style={{ padding: '0 4px' }} className="text-2xs">
                Not linked
              </Badge>
            </>
          ) : (
            <>
              <AlertCircle size={14} className="text-muted-foreground" />
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
              <Check size={12} className="text-foreground" />
              <span className="text-xs font-medium text-foreground">
                {resultItem.status === 'linked' ? 'Fully linked' : 'Partially linked'}
              </span>
            </div>
            {resolvedDisplay && (
              <span className="text-xs text-muted-foreground">Resolved to: {resolvedDisplay}</span>
            )}
          </div>
        )}

        {!loading && (
          <Button variant="outline" size="sm" onClick={handleLink}>
            {isFullyLinked ? (
              <RefreshCw size={14} className="mr-1.5" />
            ) : (
              <MapPin size={14} className="mr-1.5" />
            )}
            {isFullyLinked ? 'Re-link Location' : linked ? 'Link Again' : 'Link Location'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
