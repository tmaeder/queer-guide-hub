import Box from '@mui/material/Box';
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
          sx: { bgcolor: 'grey.100', color: 'text.primary', '&:hover': { opacity: 0.8 } }
        };
      case 'failed':
        return {
          variant: 'destructive' as const,
          icon: AlertTriangle,
          label: 'Failed',
          sx: { bgcolor: 'error.main', color: 'error.contrastText', '&:hover': { opacity: 0.8 } }
        };
      case 'processing':
        return {
          variant: 'secondary' as const,
          icon: RefreshCw,
          label: 'Processing',
          sx: { bgcolor: 'grey.200', color: 'text.primary', '&:hover': { opacity: 0.8 } }
        };
      case 'validating':
        return {
          variant: 'secondary' as const,
          icon: RefreshCw,
          label: 'Validating',
          sx: { bgcolor: 'action.selected', color: 'text.primary', '&:hover': { opacity: 0.8 } }
        };
      case 'cancelled':
        return {
          variant: 'outline' as const,
          icon: X,
          label: 'Cancelled',
          sx: { bgcolor: 'action.disabledBackground', color: 'text.secondary', '&:hover': { opacity: 0.8 } }
        };
      default:
        return {
          variant: 'outline' as const,
          icon: Clock,
          label: 'Pending',
          sx: { bgcolor: 'warning.main', color: 'warning.contrastText', '&:hover': { opacity: 0.8 } }
        };
    }
  };

  const config = getStatusConfig(status);
  const IconComponent = config.icon;
  const iconSizePx = size === 'sm' ? 12 : size === 'lg' ? 20 : 16;

  return (
    <Badge
      variant={config.variant}
      sx={{
        ...config.sx,
        ...(size === 'sm' && { fontSize: '0.75rem', px: 1, py: 0.25 }),
        ...(size === 'lg' && { fontSize: '0.875rem', px: 1.5, py: 0.5 }),
        ...(showIcon && { gap: 0.5 }),
      }}
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
