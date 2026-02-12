import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LucideIcon } from 'lucide-react';

interface SecurityCardProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  status?: 'active' | 'inactive' | 'warning' | 'error';
  badge?: string;
  children: React.ReactNode;
  className?: string;
}

const statusStyleMap: Record<string, React.CSSProperties> = {
  active: { backgroundColor: '#f0fdf4', color: '#15803d', borderColor: '#bbf7d0' },
  inactive: { backgroundColor: '#f9fafb', color: '#374151', borderColor: '#e5e7eb' },
  warning: { backgroundColor: '#fefce8', color: '#a16207', borderColor: '#fef08a' },
  error: { backgroundColor: '#fef2f2', color: '#b91c1c', borderColor: '#fecaca' },
};

export function SecurityCard({
  title,
  description,
  icon: Icon,
  status = 'active',
  badge,
  children,
}: SecurityCardProps) {
  return (
    <Card style={{ transition: 'box-shadow 0.2s' }}>
      <CardHeader style={{ paddingBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <CardTitle style={{ fontSize: '1.125rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            {Icon && <Icon style={{ height: 20, width: 20 }} />}
            {title}
          </CardTitle>
          {badge && (
            <Badge
              variant="outline"
              style={statusStyleMap[status]}
            >
              {badge}
            </Badge>
          )}
        </div>
        {description && (
          <CardDescription>{description}</CardDescription>
        )}
      </CardHeader>
      <CardContent>
        {children}
      </CardContent>
    </Card>
  );
}
