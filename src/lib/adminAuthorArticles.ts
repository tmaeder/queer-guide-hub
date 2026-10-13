export function authorArticlesPath(author: string) {
  return `/admin/news-authors/articles?${new URLSearchParams({ author })}`;
}
