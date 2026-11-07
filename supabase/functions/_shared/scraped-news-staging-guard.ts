/** Historical timeline links identify regions, rather than individual articles. */
export function scrapedNewsStagingSkipReason(
  source: { slug: string; target_table: string },
  dryRun: boolean,
): 'historical_timeline_not_news' | undefined {
  if (!dryRun && source.slug === 'equaldex-timeline' && source.target_table === 'news_articles') {
    return 'historical_timeline_not_news'
  }
}
