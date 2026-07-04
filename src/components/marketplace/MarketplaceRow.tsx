import { useEffect } from 'react';
import { MarketplaceRailShell } from './MarketplaceRailShell';
import { useMarketplaceRow, type CuratedRowKey } from '@/hooks/useMarketplaceRows';
import { useCuratedIds } from './useCuratedIds';
import type { MarketplaceSurface } from '@/lib/affiliate/marketplace';

interface MarketplaceRowProps {
  rowKey: CuratedRowKey;
  title: string;
  subtitle?: string;
  limit?: number;
  showFavoriteButton?: boolean;
  onToggleFavorite?: (id: string) => void;
  /** Attribution surface for outbound /go links; defaults to the marketplace grid. */
  surface?: MarketplaceSurface;
}

export function MarketplaceRow({
  rowKey,
  title,
  subtitle,
  limit = 12,
  showFavoriteButton,
  surface = 'marketplace_grid',
}: MarketplaceRowProps) {
  const { data, loading, error } = useMarketplaceRow(rowKey, limit);
  const { register } = useCuratedIds();

  useEffect(() => {
    register(rowKey, data.map((l) => l.id));
  }, [rowKey, data, register]);

  if (!loading && (error || data.length === 0)) return null;

  return (
    <MarketplaceRailShell
      id={rowKey}
      title={title}
      subtitle={subtitle}
      listings={data}
      loading={loading}
      surface={surface}
      showFavoriteButton={showFavoriteButton}
    />
  );
}
