/** Preserve old bookmarks while every approval lands in the same workspace. */
export function reviewRedirectUrl(search: string, mode?: string): string {
  const params = new URLSearchParams(search);
  const oldMode = mode ?? params.get('mode');
  const panel = params.get('tagPanel');
  if (!params.has('queue') && params.has('tab')) params.set('queue', params.get('tab')!);
  if (!params.has('queue') && oldMode === 'tags') {
    if (panel === 'sensitive') params.set('queue', 'sensitive-tags');
    else if (panel === 'suggestions') params.set('queue', 'tag-enrichment');
    else params.set('family', 'tags');
  }
  if (!params.has('queue') && oldMode === 'merge') {
    if (params.get('family') === 'taxonomy') {
      params.set('queue', 'tag-merges');
      params.delete('family');
    } else params.set('family', 'merge');
  }
  if (!params.has('queue') && oldMode === 'editorial') params.set('queue', 'editorial');
  params.delete('mode');
  params.delete('tab');
  params.delete('tagPanel');
  const query = params.toString();
  return `/admin${query ? `?${query}` : ''}`;
}
