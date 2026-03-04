import React from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { EmptyState } from '@/components/ui/EmptyState';
import { LucideIcon, LogIn } from 'lucide-react';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';

interface AuthGateProps {
  /** Content shown when user is authenticated */
  children: React.ReactNode;
  /** Icon for the sign-in prompt (default: LogIn) */
  icon?: LucideIcon;
  /** Title for the sign-in prompt */
  title?: string;
  /** Description for the sign-in prompt */
  description?: string;
  /** Optional public preview content shown below the sign-in CTA */
  showPreview?: React.ReactNode;
  /** Max width for the container (default: 'md') */
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
}

/**
 * Shared auth-gating wrapper. Shows children when authenticated,
 * or a sign-in prompt with optional public preview when not.
 */
export const AuthGate: React.FC<AuthGateProps> = ({
  children,
  icon = LogIn,
  title = 'Sign in to continue',
  description = 'Create a free account or sign in to access this feature.',
  showPreview,
  maxWidth = 'md',
}) => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  if (loading) return null;

  if (user) {
    return <>{children}</>;
  }

  return (
    <Container maxWidth={maxWidth} sx={{ py: 4 }}>
      <EmptyState
        icon={icon}
        title={title}
        description={description}
        primaryAction={{
          label: 'Sign In',
          onClick: () => navigate('/auth'),
        }}
        secondaryAction={{
          label: 'Learn More',
          onClick: () => navigate('/about'),
          variant: 'outline',
        }}
      />
      {showPreview && <Box sx={{ mt: 4 }}>{showPreview}</Box>}
    </Container>
  );
};
