import { useMemo } from 'react';
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
      <div className="text-center py-8 text-muted-foreground">
        <p className="text-sm">{t('trips.packing.noSuggestions')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <ShoppingBag size={16} />
          <p className="text-sm font-bold">
            {t('trips.packing.suggestedTitle')}
          </p>
        </div>
        <button
          type="button"
          disabled={smartLoading}
          onClick={onRequestSmartSuggestions}
          className="border-0 bg-transparent font-semibold text-[13px] cursor-pointer inline-flex items-center gap-1 p-0 disabled:opacity-60"
          style={{ color: 'hsl(var(--brand))' }}
        >
          <Sparkles size={13} />
          {smartLoading ? t('trips.packing.smartLoading') : t('trips.packing.smartCta')}
        </button>
      </div>

      {Object.entries(groups).map(([category, items]) => (
        <div key={category}>
          <span className="font-bold uppercase tracking-wider text-xs text-muted-foreground mb-2 block">
            {t(`trips.packing.category.${category}`, { defaultValue: category })}
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
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
          </div>
        </div>
      ))}
    </div>
  );
}
