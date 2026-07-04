export const TAG_HUB = '/tags';

export function tagDetailHref(slug: string): string {
  return `/tags/${encodeURIComponent(slug)}`;
}

export function tagCategoryHref(slug: string): string {
  return `/tags/c/${encodeURIComponent(slug)}`;
}
