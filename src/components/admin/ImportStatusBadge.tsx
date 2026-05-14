import { Badge } from '@/components/ui/badge';
import { CheckCircle, AlertTriangle, Clock, RefreshCw, X } from 'lucide-react';
import { ImportJob } from '@/hooks/useImportHub';

interface ImportStatusBadgeProps {
  status: ImportJob['status'];
  showIcon?: boolean;
  size?: 'sm' | 'default' | 'lg';
}

export const ImportStatusBadge = ({ status, showIcon = true, size = 'default' }: ImportStatusBadgeProps) => {
  const getStatusConfig = (status: ImportJob['status']) => {
    switch (status) {
      case 'completed':
        return { variant: 'default' as const, icon: CheckCircle, label: 'Completed' };
      case 'failed':
        return { variant: 'destructive' as const, icon: AlertTriangle, label: 'Failed' };
      case 'processing':
        return { variant: 'secondary' as const, icon: RefreshCw, label: 'Processing' };
      case 'validating':
        return { variant: 'secondary' as const, icon: RefreshCw, label: 'Validating' };
      case 'cancelled':
        return { variant: 'outline' as const, icon: X, label: 'Cancelled' };
      default:
        return { variant: 'outline' as const, icon: Clock, label: 'Pending' };
    }
  };

  const config = getStatusConfig(status);
  const IconComponent = config.icon;
  const iconSizePx = size === 'sm' ? 12 : size === 'lg' ? 20 : 16;

  return (
    <Badge
      variant={config.variant}

    >
      {showIcon && (
        <IconComponent
          style={{
            width: iconSizePx,
            height: iconSizePx,
            ...(status === 'processing' || status === 'validating' ? { animation: 'spin 1s linear infinite' } : {})
          }}
        />
      )}
      {config.label}
    </Badge>
  );
};
