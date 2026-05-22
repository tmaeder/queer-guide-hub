import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Shield, AlertTriangle, Info, CheckCircle } from 'lucide-react';

interface SecurityAlertProps {
  level: 'info' | 'warning' | 'error' | 'success';
  title: string;
  description: string;
}

export function SecurityAlert({ level, title, description }: SecurityAlertProps) {
  const getIcon = () => {
    switch (level) {
      case 'info': return <Info size={16} />;
      case 'warning': return <AlertTriangle size={16} />;
      case 'error': return <Shield size={16} />;
      case 'success': return <CheckCircle size={16} />;
      default: return <Info size={16} />;
    }
  };

  const getVariant = () => {
    switch (level) {
      case 'error': return 'destructive';
      case 'warning': return 'default';
      default: return 'default';
    }
  };

  return (
    <Alert variant={getVariant()}>
      {getIcon()}
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{description}</AlertDescription>
    </Alert>
  );
}
