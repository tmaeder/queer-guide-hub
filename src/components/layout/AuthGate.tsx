/**
 * AuthGate — Reusable authentication gate.
 *
 * Shows a solid-surface sign-in prompt when user is not authenticated.
 * Renders children when authenticated.
 *
 * Usage:
 *   <AuthGate title="Messages" description="Sign in to access your messages">
 *     <MessagingInterface />
 *   </AuthGate>
 */

import React from 'react';
import { Link } from 'react-router-dom';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import { Button } from '@/components/ui/button';
import { Lock } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface AuthGateProps {
  /** Page title shown in the gate */
  title: string;
  /** Description text */
  description?: string;
  /** Content rendered when authenticated */
  children: React.ReactNode;
}

export const AuthGate: React.FC<AuthGateProps> = ({
  title,
  description = 'Please sign in to access this feature.',
  children,
}) => {
  const { user } = useAuth();

  if (!user) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Paper
          variant="outlined"
          sx={{
            p: { xs: 4, sm: 6 },
            textAlign: 'center',
            bgcolor: 'background.paper',
          }}
        >
          <Lock
            style={{
              width: 48,
              height: 48,
              margin: '0 auto 16px',
              color: '#999999',
            }}
          />
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
            {title}
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3, maxWidth: 400, mx: 'auto' }}>
            {description}
          </Typography>
          <Button asChild>
            <Link to="/auth">Sign In</Link>
          </Button>
        </Paper>
      </Container>
    );
  }

  return <>{children}</>;
};
