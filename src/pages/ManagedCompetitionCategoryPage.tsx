import { useParams } from 'react-router';
import { Link } from 'react-router';
import { useReferenceTaxonomyState } from '@/hooks/useReferenceTaxonomy';
import { referenceTaxonomyRows } from '@/lib/referenceTaxonomyStore';
import { categoryBySlug } from '@/lib/competitionCategories';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { PageContainer } from '@/components/layout/PageContainer';
import CompetitionCategoryPage from './CompetitionCategoryPage';

/** New categories use a third path segment to avoid the locale-router ambiguity. */
export default function ManagedCompetitionCategoryPage() {
  const { categorySlug = '' } = useParams<{ categorySlug: string }>();
  const result = useReferenceTaxonomyState('competition_category');
  const category = categoryBySlug(categorySlug);
  if (category) return <CompetitionCategoryPage category={category.id} />;
  if (result.loading || (!result.error && !referenceTaxonomyRows('competition_category')))
    return <TrackLoader label="Loading competition category" />;
  if (result.error)
    return (
      <PageContainer>
        <p role="alert">Could not load competition categories.</p>
        <button type="button" onClick={result.retry}>
          Retry
        </button>
      </PageContainer>
    );
  return (
    <PageContainer>
      <h1>Competition category not found</h1>
      <Link to="/competitions">All competition categories</Link>
    </PageContainer>
  );
}
