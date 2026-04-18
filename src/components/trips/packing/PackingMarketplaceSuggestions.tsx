import { useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Sparkles, ShoppingBag } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import { SuggestionCard } from '@/components/trips/shared/SuggestionCard';
import { useTripPackingSuggestions } from '@/hooks/useTripPackingSuggestions';
import { usePackingMutations } from '@/hooks/useTripPacking';
import { useLlmPackingSuggestions } from '@/hooks/useLlmPackingSuggestions';
import { recordSuggestionImpression, recordSuggestionClick } from '@/utils/tripTracking';
import { useToast } from '@/hooks/use-toast';

interface Props {
  tripId: string;
}

export function PackingMarketplaceSuggestions({ tripId }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data, isLoading } = useTripPackingSuggestions(tripId);
  const { addPackingItem } = usePackingMutations(tripId);
  const llm = useLlmPackingSuggestions(tripId);

  const onRequestSmartSuggestions = () => {
    llm.mutate(undefined, {
      onSuccess: (res) =>
        toast({
          title: res.cached
            ? t('trips.packing.smartCached')
            : t('trips.packing.smartReady'),
        }),
      onError: (err) =>
        toast({
          title: t('trips.packing.smartFailed'),
          description: String(err),
          variant: 'destructive',
        }),
    });
  };
  const smartLoading = llm.isPending;

  const groups = useMemo(() => {
    const m: Record<string, typeof data> = {};
    for (const s of data ?? []) {
      (m[s.category] ||= []).push(s);
    }
    return m;
  }, [data]);

  if (isLoading) return <PageLoadingState count={3} variant="list" />;

  if (!data || data.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
        <Typography variant="body2">{t('trips.packing.noSuggestions')}</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ShoppingBag size={16} />
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            {t('trips.packing.suggestedTitle')}
          </Typography>
        </Box>
        <Box
          component="button"
          type="button"
          disabled={smartLoading}
          onClick={onRequestSmartSuggestions}
          sx={{
            border: 0,
            background: 'transparent',
            color: 'brand.main',
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.5,
            p: 0,
            opacity: smartLoading ? 0.6 : 1,
          }}
        >
          <Sparkles size={13} />
          {smartLoading ? t('trips.packing.smartLoading') : t('trips.packing.smartCta')}
        </Box>
      </Box>

      {Object.entries(groups).map(([category, items]) => (
        <Box key={category}>
          <Typography
            variant="caption"
            sx={{
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'text.secondary',
              mb: 1,
              display: 'block',
            }}
          >
            {t(`trips.packing.category.${category}`, { defaultValue: category })}
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' },
              gap: 1.5,
            }}
          >
            {(items ?? []).map((s) => (
              <SuggestionCard
                key={s.id}
                title={s.title}
                subtitle={s.reason}
                description={s.description}
                imageUrl={s.imageUrl}
                provider={s.provider}
                priceLabel={
                  s.price != null && s.currency ? `${s.price.toFixed(0)} ${s.currency}` : null
                }
                ctaLabel={t('trips.packing.buyCta')}
                onImpression={() =>
                  recordSuggestionImpression({
                    tripId,
                    type: 'packing_product',
                    listingId: s.listingId,
                    externalUrl: s.externalUrl ?? undefined,
                    rankPosition: s.rank,
                  })
                }
                onCtaClick={async () => {
                  if (!s.externalUrl) {
                    toast({
                      title: t('trips.packing.noBuyUrl'),
                      variant: 'destructive',
                    });
                    return;
                  }
                  await recordSuggestionClick({
                    tripId,
                    provider: s.provider,
                    type: 'packing_product',
                    externalUrl: s.externalUrl,
                    listingId: s.listingId,
                    rankPosition: s.rank,
                  });
                  window.open(s.externalUrl, '_blank', 'noopener,noreferrer');
                }}
                secondaryAction={{
                  label: t('trips.packing.addToChecklist'),
                  onClick: () => {
                    addPackingItem.mutate(
                      {
                        trip_id: tripId,
                        name: s.title,
                        category: s.category,
                        quantity: 1,
                        marketplace_listing_id: s.listingId,
                        suggested_by: 'marketplace_suggestion',
                        suggestion_reason: s.reason,
                      },
                      {
                        onSuccess: () => {
                          toast({ title: t('trips.packing.addedToChecklist') });
                        },
                        onError: (err) =>
                          toast({
                            title: t('trips.packing.addFailed'),
                            description: String(err),
                            variant: 'destructive',
                          }),
                      },
                    );
                  },
                  disabled: addPackingItem.isPending,
                }}
              />
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  );
}
