import { ContentListPanel } from '@/components/cms/ContentListPanel';

/**
 * Personalities admin surface: the standard CMS list.
 * The generic ContentListPanel is reused untouched via contentTypeId, so all
 * list/edit/bulk behaviour stays identical for personalities.
 *
 * Deep-link support: `?edit=<id>` opens the editor for that personality on
 * mount and strips the param (so refresh/back doesn't reopen), so any page
 * can hand a row off to the admin editor with a plain link. That handling now lives in
 * ContentListPanel, which this page renders, so every registry type gets it
 * and `cmsEditPath` can build the link for any of them.
 */
export default function PersonalitiesAdmin() {
  return <ContentListPanel contentTypeId="personalities" />;
}
