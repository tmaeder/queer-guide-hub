/**
 * Pure builder for a filtered admin list URL. Deliberately imports NOTHING
 * from the content-type registry: the registry's own type configs
 * (`src/config/contentTypes/*`) link to filtered lists from their cells, and
 * importing `cmsLinks` there closes a cycle (config -> cmsLinks -> registry ->
 * config) that leaves the registry holding `undefined` for whichever config
 * loaded first. Callers outside the registry should use
 * `cmsFilteredListPath` in `cmsLinks`, which also validates the type.
 */

/** Suffix of the display-only companion param, e.g. `city_id_label`. */
export const FILTER_LABEL_SUFFIX = '_label';

export function filteredListHref(
  registryKey: string,
  field: string,
  value: string,
  label?: string | null,
): string {
  const params = new URLSearchParams({ [field]: value });
  if (label) params.set(`${field}${FILTER_LABEL_SUFFIX}`, label);
  return `/admin/content/${registryKey}?${params.toString()}`;
}
