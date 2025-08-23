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

const statusColors = {
  active: 'bg-green-50 text-green-700 border-green-200',
  inactive: 'bg-gray-50 text-gray-700 border-gray-200',
  warning: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  error: 'bg-red-50 text-red-700 border-red-200'
};

export function SecurityCard({
  title,
  description,
  icon: Icon,
  status = 'active',
  badge,
  children,
  className = ''
}: SecurityCardProps) {
  return (
    <Card className={`hover:shadow-md transition-shadow ${className}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            {Icon && <Icon className="h-5 w-5" />}
            {title}
          </CardTitle>
          {badge && (
            <Badge variant="outline" className={statusColors[status]}>
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