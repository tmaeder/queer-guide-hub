/**
 * AuthGate — Reusable authentication gate.
 *
 * Shows a solid-surface sign-in prompt when user is not authenticated.
 * Renders children when authenticated.
 */

import React from 'react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Button } from '@/components/ui/button';
import { Lock } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface AuthGateProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}

export const AuthGate = ({
  title,
  description = 'Please sign in to access this feature.',
  children,
}: AuthGateProps) => {
  const { user } = useAuth();

  if (!user) {
    return (
      <div className="container mx-auto py-8">
        <div className="border border-border bg-card text-center p-8 sm:p-12">
          <Lock
            style={{
              width: 48,
              height: 48,
              margin: '0 auto 16px',
              color: 'hsl(var(--muted-foreground))',
            }}
          />
          <h4 className="text-3xl font-bold mb-2">{title}</h4>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">{description}</p>
          <Button asChild>
            <LocalizedLink to="/auth">Sign In</LocalizedLink>
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
