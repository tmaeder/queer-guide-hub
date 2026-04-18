import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Skeleton from '@mui/material/Skeleton';
import { AlertTriangle, ExternalLink, Newspaper } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow } from 'date-fns';
import { useTripNews } from '@/hooks/useTripNews';

interface Props {
  countryIds: string[];
}

/**
 * News stream for a trip's destination countries — last 30 days, ranked
 * recency-first. Articles whose title/excerpt match safety + LGBTQ+
 * keywords get an amber alert glyph. Renders nothing when no countries
 * resolve (e.g. trip with only custom-address places).
 */
export function TripNewsSection({ countryIds }: Props) {
  const { t, i18n } = useTranslation();
  const { data: articles, isLoading } = useTripNews(countryIds);

  if (countryIds.length === 0) return null;

  if (isLoading) {
    return (
      <Box sx={{ mt: 4 }}>
        <SectionHeading />
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Skeleton variant="rectangular" height={68} />
          <Skeleton variant="rectangular" height={68} />
          <Skeleton variant="rectangular" height={68} />
        </Box>
      </Box>
    );
  }

  if (!articles || articles.length === 0) {
    return (
      <Box sx={{ mt: 4 }}>
        <SectionHeading />
        <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
          {t('trips.news.empty', 'No recent news for these destinations.')}
        </Typography>
      </Box>
    );
  }

  const flaggedCount = articles.filter((a) => a.isSafetyFlagged).length;

  return (
    <Box sx={{ mt: 4 }}>
      <SectionHeading flaggedCount={flaggedCount} />
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {articles.map((article) => (
          <Box
            key={article.id}
            component="a"
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            sx={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 1.25,
              p: 1.5,
              textDecoration: 'none',
              color: 'inherit',
              borderTop: '1px solid',
              borderColor: 'divider',
              transition: 'background-color 120ms',
              '&:hover': { bgcolor: 'action.hover' },
              '&:first-of-type': { borderTop: 'none' },
            }}
          >
            {article.isSafetyFlagged ? (
              <AlertTriangle
                style={{
                  width: 16,
                  height: 16,
                  flexShrink: 0,
                  marginTop: 3,
                  color: '#b45309',
                }}
                aria-label={t('trips.news.safetyFlag', 'Safety-relevant')}
              />
            ) : (
              <Newspaper
                style={{ width: 16, height: 16, flexShrink: 0, marginTop: 3, opacity: 0.4 }}
                aria-hidden
              />
            )}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: article.isSafetyFlagged ? 700 : 500,
                  lineHeight: 1.3,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {article.title}
              </Typography>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.75,
                  mt: 0.25,
                  color: 'text.secondary',
                  fontSize: 11,
                }}
              >
                {article.publisher_name && <span>{article.publisher_name}</span>}
                {article.publisher_name && <span>·</span>}
                <span>
                  {formatDistanceToNow(new Date(article.published_at), {
                    addSuffix: true,
                  })}
                </span>
              </Box>
            </Box>
            <ExternalLink
              style={{ width: 12, height: 12, flexShrink: 0, marginTop: 5, opacity: 0.4 }}
              aria-hidden
            />
          </Box>
        ))}
      </Box>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block', mt: 1.5, fontSize: 11 }}
      >
        {t('trips.news.disclaimer', {
          defaultValue:
            'News from {{lang}} sources, last 30 days. Safety flags are heuristic — verify with official advisories.',
          lang: i18n.language.toUpperCase(),
        })}
      </Typography>
    </Box>
  );
}

function SectionHeading({ flaggedCount = 0 }: { flaggedCount?: number }) {
  const { t } = useTranslation();
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        mb: 1.5,
      }}
    >
      <Typography
        variant="subtitle2"
        sx={{
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          fontSize: '0.7rem',
          color: 'text.secondary',
        }}
      >
        {t('trips.news.heading', 'Recent news from your destinations')}
      </Typography>
      {flaggedCount > 0 && (
        <Box
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.5,
            px: 1,
            py: 0.25,
            bgcolor: 'rgba(244,67,54,0.1)',
            color: 'error.main',
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          <AlertTriangle style={{ width: 11, height: 11 }} />
          {t('trips.news.flaggedBadge', '{{count}} safety alerts', { count: flaggedCount })}
        </Box>
      )}
    </Box>
  );
}
