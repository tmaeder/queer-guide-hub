import { Badge } from '@/components/ui/badge';
import { CheckCircle, AlertTriangle, Clock, RefreshCw, X, Pause } from 'lucide-react';
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
        return {
          variant: 'default' as const,
          icon: CheckCircle,
          label: 'Completed',
          className: 'bg-muted text-foreground hover:opacity-80'
        };
      case 'failed':
        return {
          variant: 'destructive' as const,
          icon: AlertTriangle,
          label: 'Failed',
          className: 'bg-destructive text-destructive-foreground hover:opacity-80'
        };
      case 'processing':
        return {
          variant: 'secondary' as const,
          icon: RefreshCw,
          label: 'Processing',
          className: 'bg-secondary text-secondary-foreground hover:opacity-80'
        };
      case 'validating':
        return {
          variant: 'secondary' as const,
          icon: RefreshCw,
          label: 'Validating',
          className: 'bg-accent text-accent-foreground hover:opacity-80'
        };
      case 'cancelled':
        return {
          variant: 'outline' as const,
          icon: X,
          label: 'Cancelled',
          className: 'bg-muted/50 text-muted-foreground hover:opacity-80'
        };
      default:
        return {
          variant: 'outline' as const,
          icon: Clock,
          label: 'Pending',
          className: 'bg-warning text-warning-foreground hover:opacity-80'
        };
    }
  };

  const config = getStatusConfig(status);
  const IconComponent = config.icon;
  const iconSize = size === 'sm' ? 'h-3 w-3' : size === 'lg' ? 'h-5 w-5' : 'h-4 w-4';

  return (
    <Badge 
      variant={config.variant} 
      className={`${config.className} ${size === 'sm' ? 'text-xs px-2 py-0.5' : size === 'lg' ? 'text-sm px-3 py-1' : ''} ${showIcon ? 'gap-1' : ''}`}
    >
      {showIcon && (
        <IconComponent 
          className={`${iconSize} ${status === 'processing' || status === 'validating' ? 'animate-spin' : ''}`} 
        />
      )}
      {config.label}
    </Badge>
  );
};