import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { scrapedNewsStagingSkipReason } from './scraped-news-staging-guard.ts'

Deno.test('Equaldex timeline skips live news staging and retains dry-run preview', () => {
  const source = { slug: 'equaldex-timeline', target_table: 'news_articles' }
  assertEquals(scrapedNewsStagingSkipReason(source, false), 'historical_timeline_not_news')
  assertEquals(scrapedNewsStagingSkipReason(source, true), undefined)
})

Deno.test('the timeline rule is scoped to the source and the news target', () => {
  assertEquals(scrapedNewsStagingSkipReason({ slug: 'another-source', target_table: 'news_articles' }, false), undefined)
  assertEquals(scrapedNewsStagingSkipReason({ slug: 'equaldex-timeline', target_table: 'milestones' }, false), undefined)
})
