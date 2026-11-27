import { useParams } from 'react-router';
import { LoadingSpinner } from '@/components/ui/loading';
import { PageContainer } from '@/components/layout/PageContainer';
import { useSpotKind } from '@/hooks/useSpotKind';
import EntityDetail from './EntityDetail';

/**
 * /spots/:slug — one URL for places and organisations (spots P3a). Renders the existing venue
 * or organisation page; their canonical URLs stay /venues/* and /organizations/* until the
 * redirect switch, so this route adds no duplicate URL for search engines.
 *
 * Unknown slugs fall through to the venue page, which owns not-found, merged-slug redirects
 * and the sign-in gate for safety-gated places.
 */
export default function SpotDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { data: kind, isLoading } = useSpotKind(slug);

  if (isLoading) {
    return (
      <PageContainer className="flex justify-center">
        <LoadingSpinner />
      </PageContainer>
    );
  }
  return <EntityDetail source={kind === 'organization' ? 'organization' : 'venue'} />;
}
