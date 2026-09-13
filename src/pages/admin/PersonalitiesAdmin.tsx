import { useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { ContentListPanel } from '@/components/cms/ContentListPanel';
import { PersonalityCheckPanel } from '@/components/admin/PersonalityCheckPanel';
import { PersonhoodApprovalInfo } from '@/components/admin/PersonhoodApprovalInfo';
import { useAdminShell } from '@/components/admin/shell/AdminShell';

/**
 * Personalities admin surface ("Personencheck"): a PHP-tool-style dashboard
 * header (KPI tiles + ampel + anniversary stream) above the standard CMS list.
 * The generic ContentListPanel is reused untouched via contentTypeId, so all
 * list/edit/bulk behaviour stays identical for personalities.
 *
 * Deep-link support: `?edit=<id>` opens the editor for that personality on
 * mount and strips the param (so refresh/back doesn't reopen). Lets the
 * read-only person-db companion tool hand a row off to the real admin editor
 * without embedding any auth of its own.
 */
export default function PersonalitiesAdmin() {
  const [params, setParams] = useSearchParams();
  const { openEditor } = useAdminShell();

  useEffect(() => {
    const id = params.get('edit');
    if (!id) return;
    openEditor('personalities', id);
    const next = new URLSearchParams(params);
    next.delete('edit');
    setParams(next, { replace: true });
  }, [params, openEditor, setParams]);

  return (
    /* gap-4, not px-4 pt-4 wrappers: AdminShell's <main> already owns the
       horizontal gutter, so the old wrappers double-padded these two panels
       against the list below them. */
    <div className="flex flex-col gap-4">
      <PersonalityCheckPanel />
      <PersonhoodApprovalInfo />
      <ContentListPanel contentTypeId="personalities" />
    </div>
  );
}
