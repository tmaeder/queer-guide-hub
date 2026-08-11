import { Link, useLocation } from 'react-router';
import { Compass } from 'lucide-react';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Button } from '@/components/ui/button';
import { openAdminCommandPalette } from '@/components/admin/command-palette/commandPaletteBus';

/**
 * Catch-all for unknown /admin/* paths. Without it the shell renders with an
 * empty content area, which reads as a broken page rather than a wrong URL.
 */
export default function AdminNotFound() {
  const location = useLocation();

  return (
    <div>
      <AdminPageHeader
        eyebrow={null}
        title="Page not found"
        subtitle="This admin route doesn't exist."
      />
      <p className="mb-6 text-13 text-muted-foreground">
        <code className="rounded-badge bg-muted px-2 py-1 font-mono text-13">
          {location.pathname}
        </code>
      </p>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link to="/admin">Back to Cockpit</Link>
        </Button>
        <Button variant="outline" size="sm" onClick={openAdminCommandPalette}>
          <Compass size={14} className="mr-2" aria-hidden />
          Search admin
        </Button>
      </div>
    </div>
  );
}
