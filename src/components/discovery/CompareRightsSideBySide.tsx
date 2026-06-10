import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Skeleton } from '@/components/ui/skeleton';
import { usePeerCountries } from '@/hooks/usePeerCountries';

interface Props {
  /** The country the editorial page is about. */
  anchorCountryId: string;
  anchorCountryName: string;
  anchorEqualityScore: number | null;
}

/**
 * Three-up comparison of the anchor country against region peers on
 * `equality_score`. Schema-safe: we only depend on equality_score, which
 * exists on every country. When granular rights columns (marriage,
 * transition, adoption, anti-discrim) are wired into countries later, this
 * component will expand into a full matrix.
 */
export function CompareRightsSideBySide({
  anchorCountryId,
  anchorCountryName,
  anchorEqualityScore,
}: Props) {
  const { t } = useTranslation();
  const { data: peers, isLoading } = usePeerCountries({
    anchorCountryId,
    anchorEqualityScore,
  });

  if (isLoading) return <Skeleton variant="rectangular" height={140} className="rounded-container" />;
  if (!peers || peers.length === 0) return null;

  const rows = [
    {
      id: anchorCountryId,
      name: anchorCountryName,
      slug: null as string | null,
      code: null as string | null,
      flag_emoji: null as string | null,
      equality_score: anchorEqualityScore,
      isAnchor: true,
    },
    ...peers.map((p) => ({ ...p, isAnchor: false })),
  ];

  return (
    <div className="overflow-x-auto rounded-container border">
      <table className="w-full text-13">
        <thead>
          <tr className="border-b text-2xs uppercase tracking-[0.14em] text-muted-foreground">
            <th scope="col" className="px-4 py-2 text-left">
              {t('discovery.compareRights.country', 'Country')}
            </th>
            <th scope="col" className="px-4 py-2 text-right tabular-nums">
              {t('discovery.compareRights.equality', 'Equality score')}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className={
                row.isAnchor
                  ? 'border-b bg-muted font-semibold'
                  : 'border-b last:border-b-0'
              }
            >
              <td className="px-4 py-2">
                {row.slug ? (
                  <LocalizedLink to={`/country/${row.slug}`} className="no-underline">
                    {row.flag_emoji ? <span aria-hidden>{row.flag_emoji} </span> : null}
                    <span className="text-foreground hover:underline">{row.name}</span>
                  </LocalizedLink>
                ) : (
                  <>
                    {row.flag_emoji ? <span aria-hidden>{row.flag_emoji} </span> : null}
                    {row.name}
                  </>
                )}
              </td>
              <td className="px-4 py-2 text-right tabular-nums">
                {row.equality_score != null ? `${row.equality_score}/10` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

