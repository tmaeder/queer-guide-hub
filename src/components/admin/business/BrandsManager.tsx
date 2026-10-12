import { useContext, useState } from 'react';
import { ContentListPanel } from '@/components/cms/ContentListPanel';
import { brandListConfig } from './organisationListConfigs';
import { AdminShellContext } from '@/components/admin/shell/AdminShell';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { untypedRpc } from '@/integrations/supabase/untyped';
import { toast } from 'sonner';
export function BrandsManager() {
  const shell = useContext(AdminShellContext);
  const navigate = useNavigate();
  const [version, setVersion] = useState(0);
  const [applying, setApplying] = useState(false);
  const apply = async () => {
    setApplying(true);
    try {
      const { error } = await untypedRpc('run_marketplace_ownership_apply', {});
      if (error) throw error;
      toast.success('Ownership applied to products');
      setVersion((v) => v + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not apply ownership');
    } finally {
      setApplying(false);
    }
  };
  return (
    <>
      <ContentListPanel
        contentTypeId={brandListConfig.id}
        configOverride={brandListConfig}
        workspace
        operational
        hideHeader
        refreshKey={version}
        onEdit={(_type, id) => shell?.openEditor('marketplace_brands', id)}
        onCreate={() => shell?.openEditor('marketplace_brands', null)}
        onEditRow={(row) => shell?.openEditor('marketplace_brands', String(row.id))}
        rowActions={(row) =>
          ['pending', 'needs_review'].includes(String(row.ownership_review_status))
            ? [
                {
                  label: 'Review ownership',
                  run: () =>
                    navigate(
                      `/admin?queue=brand-ownership&selected=${encodeURIComponent(`brand-ownership:${row.id}`)}`,
                    ),
                },
              ]
            : []
        }
        tools={
          <Button variant="ghost" size="sm" disabled={applying} onClick={() => void apply()}>
            {applying ? 'Applying…' : 'Apply ownership to products'}
          </Button>
        }
      />
    </>
  );
}
