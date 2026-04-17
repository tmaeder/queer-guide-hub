import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Shield, AlertTriangle, Info, CheckCircle } from 'lucide-react';

interface SecurityAlertProps {
  level: 'info' | 'warning' | 'error' | 'success';
  title: string;
  description: string;
  sx?: Record<string, unknown>;
}

export function SecurityAlert({ level, title, description, sx }: SecurityAlertProps) {
  const getIcon = () => {
    switch (level) {
      case 'info': return <Info style={{ height: 16, width: 16 }} />;
      case 'warning': return <AlertTriangle style={{ height: 16, width: 16 }} />;
      case 'error': return <Shield style={{ height: 16, width: 16 }} />;
      case 'success': return <CheckCircle style={{ height: 16, width: 16 }} />;
      default: return <Info style={{ height: 16, width: 16 }} />;
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
