import React, { useMemo } from 'react';
import Box from '@mui/material/Box';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useNews } from '@/hooks/useNews';
import { useIsMobile } from '@/hooks/use-mobile';
import { format } from 'date-fns';
import { container } from '@/lib/sx';
import { useTranslation } from 'react-i18next';

type Article = {
  id: string;
  slug: string;
  title: string;
  excerpt?: string | null;
  image_url?: string | null;
  published_at: string;
  publisher_name?: string | null;
};

// Decode common HTML entities without touching innerHTML. Covers what news
// feeds typically ship (&amp;, &#39;, &quot;, &lt;, &gt;, &nbsp;, numeric refs).
const ENTITY_MAP: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};
const decodeHtmlEntities = (text: string): string =>
  text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (_, body) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    }
    return ENTITY_MAP[body.toLowerCase()] ?? _;
  });

const Hairline = () => <Box sx={{ height: '1px', bgcolor: 'currentColor', opacity: 0.12 }} />;

// Editorial display font for headlines on this magazine-style block.
// Body text inherits Inter from the MUI theme (see src/theme/muiTheme.ts).
const DISPLAY_FONT = "'Plus Jakarta Sans', sans-serif";

const pulse = {
  animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
  bgcolor: 'action.hover',
};

const LatestNewsSlider = React.memo(() => {
  const { articles, loading, error } = useNews();
  const isMobile = useIsMobile();
  const { t } = useTranslation();

  const latest = useMemo<Article[]>(() => {
    return articles.slice(0, 6) as unknown as Article[];
  }, [articles]);

  if (loading && latest.length === 0) {
    return (
      <Box component="section" sx={{ ...container, py: { xs: 4, md: 8 } }}>
        <Box sx={{ ...pulse, height: 32, width: { xs: 160, md: 240 }, mb: 2 }} />
        <Hairline />
        <Box
          sx={{
            mt: { xs: 3, md: 4 },
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '11fr 9fr' },
            columnGap: { md: 4 },
            rowGap: { xs: 3, md: 0 },
          }}
        >
          <Box sx={{ ...pulse, aspectRatio: '3 / 2', width: '100%' }} />
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {Array.from({ length: isMobile ? 3 : 5 }).map((_, i) => (
              <Box key={i} sx={{ ...pulse, height: 56 }} />
            ))}
          </Box>
        </Box>
      </Box>
    );
  }

  if (error || latest.length === 0) return null;

  const [feature, ...rest] = latest;
  const list = rest.slice(0, 5);

  return (
    <Box component="section" sx={{ ...container, py: { xs: 4, md: 8 } }}>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 2,
          mb: 2,
        }}
      >
        <Box
          component="h2"
          sx={{
            m: 0,
            fontFamily: DISPLAY_FONT,
            fontWeight: 800,
            fontSize: { xs: '1.75rem', md: '2.25rem' },
            letterSpacing: '-0.01em',
            lineHeight: 1.1,
          }}
        >
          {t('home.news.title', 'Latest News')}
        </Box>
        <Box
          component={LocalizedLink}
          to="/news"
          sx={{
            fontSize: { xs: '0.8125rem', md: '0.875rem' },
            color: 'text.primary',
            textDecoration: 'none',
            whiteSpace: 'nowrap',
            transition: 'opacity 0.2s',
            '&:hover': { opacity: 0.7 },
          }}
        >
          {t('common.allStories', 'All stories')} →
        </Box>
      </Box>
      <Hairline />

      {/* Feature + list */}
      <Box
        sx={{
          mt: { xs: 3, md: 4 },
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '11fr 9fr' },
          columnGap: { md: 4 },
          rowGap: { xs: 3, md: 0 },
        }}
      >
        {/* Feature story */}
        <Box
          component={LocalizedLink}
          to={`/news/${feature.slug}`}
          sx={{
            display: 'block',
            textDecoration: 'none',
            color: 'text.primary',
            transition: 'opacity 0.2s',
            '&:hover': { opacity: 0.85 },
          }}
        >
          {feature.image_url && (
            <Box
              sx={{
                width: '100%',
                aspectRatio: '3 / 2',
                overflow: 'hidden',
                bgcolor: 'action.hover',
                mb: 2,
              }}
            >
              <Box
                component="img"
                src={feature.image_url}
                alt=""
                sx={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block',
                }}
              />
            </Box>
          )}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              color: 'text.secondary',
              fontSize: '0.75rem',
              fontWeight: 500,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              mb: 1.5,
            }}
          >
            {feature.publisher_name && (
              <>
                <Box component="span">{feature.publisher_name}</Box>
                <Box component="span" sx={{ opacity: 0.4 }}>
                  ·
                </Box>
              </>
            )}
            <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums' }}>
              {format(new Date(feature.published_at), 'MMM d, yyyy')}
            </Box>
          </Box>
          <Box
            component="h3"
            sx={{
              m: 0,
              fontFamily: DISPLAY_FONT,
              fontWeight: 800,
              fontSize: 'clamp(1.75rem, 4vw, 3rem)',
              lineHeight: 1.1,
              mb: 1.5,
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {decodeHtmlEntities(feature.title)}
          </Box>
          {feature.excerpt && (
            <Box
              sx={{
                fontSize: { xs: '0.9375rem', md: '1rem' },
                color: 'text.secondary',
                lineHeight: 1.5,
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {decodeHtmlEntities(feature.excerpt)}
            </Box>
          )}
        </Box>

        {/* List */}
        <Box>
          {list.map((a, idx) => (
            <React.Fragment key={a.id}>
              {idx > 0 && <Hairline />}
              <Box
                component={LocalizedLink}
                to={`/news/${a.slug}`}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr',
                  columnGap: 2,
                  alignItems: 'baseline',
                  py: { xs: 1.5, md: 2 },
                  textDecoration: 'none',
                  color: 'text.primary',
                  '&:hover .qg-news-title': {
                    color: 'brand.main',
                  },
                }}
              >
                <Box
                  sx={{
                    fontFamily: DISPLAY_FONT,
                    fontWeight: 400,
                    fontSize: '0.875rem',
                    color: 'text.secondary',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {String(idx + 2).padStart(2, '0')}
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Box
                    sx={{
                      fontSize: '0.6875rem',
                      fontWeight: 500,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color: 'text.secondary',
                      mb: 0.5,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.75,
                    }}
                  >
                    {a.publisher_name && (
                      <>
                        <Box component="span">{a.publisher_name}</Box>
                        <Box component="span" sx={{ opacity: 0.4 }}>
                          ·
                        </Box>
                      </>
                    )}
                    <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      {format(new Date(a.published_at), 'MMM d')}
                    </Box>
                  </Box>
                  <Box
                    className="qg-news-title"
                    sx={{
                      fontFamily: DISPLAY_FONT,
                      fontWeight: 600,
                      fontSize: { xs: '0.9375rem', md: '1rem' },
                      lineHeight: 1.3,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      transition: 'color 0.2s',
                    }}
                  >
                    {decodeHtmlEntities(a.title)}
                  </Box>
                </Box>
              </Box>
            </React.Fragment>
          ))}
        </Box>
      </Box>
    </Box>
  );
});
LatestNewsSlider.displayName = 'LatestNewsSlider';

export default LatestNewsSlider;
