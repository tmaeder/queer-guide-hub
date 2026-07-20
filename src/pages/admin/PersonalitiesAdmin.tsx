import { ContentListPanel } from '@/components/cms/ContentListPanel';
import { PersonalityCheckPanel } from '@/components/admin/PersonalityCheckPanel';
import { PersonhoodApprovalInfo } from '@/components/admin/PersonhoodApprovalInfo';

/**
 * Personalities admin surface ("Personencheck"): a PHP-tool-style dashboard
 * header (KPI tiles + ampel + anniversary stream) above the standard CMS list.
 * The generic ContentListPanel is reused untouched via contentTypeId, so all
 * list/edit/bulk behaviour stays identical for personalities.
 */
export default function PersonalitiesAdmin() {
  return (
    <div className="flex flex-col">
      <div className="px-4 pt-4">
        <PersonalityCheckPanel />
      </div>
      <div className="px-4 pt-4">
        <PersonhoodApprovalInfo />
      </div>
      <ContentListPanel contentTypeId="personalities" />
    </div>
  );
}
