/**
 * SubmitHub — /submit/ hub page
 * Shows 6 content type cards for community submissions.
 */

import { useNavigate } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { submissionTypes } from '@/config/submissionRegistry';
import { ArrowRight, Heart, ArrowLeft, Camera } from 'lucide-react';

const SubmitHub = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <Box sx={{ mx: 'auto', py: 4, px: 2 }}>
      {/* Back */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate(-1)}
        style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}
      >
        <ArrowLeft style={{ width: 16, height: 16 }} />
        Back
      </Button>

      {/* Header */}
      <Box sx={{ textAlign: 'center', mb: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1.5 }}>
          <Heart style={{ width: 32, height: 32, color: '#ec4899' }} />
        </Box>
        <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
          Contribute to Queer Guide
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ maxWidth: '32rem', mx: 'auto' }}>
          Help build the world's most comprehensive LGBTQ+ directory. All submissions are reviewed
          before publishing.
        </Typography>
      </Box>

      {/* Auth gate */}
      {!user && (
        <Card sx={{ mb: 3, bgcolor: 'action.hover' }}>
          <CardContent sx={{ p: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
              <strong>Tip:</strong>{' '}
              <Box
                component="span"
                onClick={() => navigate('/auth')}
                sx={{ color: 'text.primary', textDecoration: 'underline', cursor: 'pointer' }}
              >
                Sign in or create an account
              </Box>{' '}
              to submit content. Guest submissions are not currently supported.
            </Typography>
          </CardContent>
        </Card>
      )}

      {/* Content type grid */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' },
          gap: 2,
        }}
      >
        {/* Scan Flyer card */}
        <Card
          sx={{
            cursor: 'pointer',
            transition: 'all 0.2s',
            '&:hover': { transform: 'translateY(-2px)' },
            gridColumn: { sm: '1 / -1', md: '1 / -1' },
            background: 'linear-gradient(135deg, #ec489910 0%, #DB277710 100%)',
          }}
          onClick={() => navigate('/submit/event?mode=scan')}
        >
          <CardContent sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box
                sx={{
                  width: 44,
                  height: 44,
                  borderRadius: 2,
                  bgcolor: '#ec489920',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Camera style={{ width: 22, height: 22, color: '#ec4899' }} />
              </Box>
              <Box sx={{ flex: 1 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.25 }}>
                  Scan a Flyer
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Take a photo of an event flyer or venue card and we'll extract the details
                  automatically.
                </Typography>
              </Box>
              <ArrowRight style={{ width: 18, height: 18, color: '#ec4899', flexShrink: 0 }} />
            </Box>
          </CardContent>
        </Card>

        {submissionTypes.map((type) => {
          const Icon = type.icon;
          return (
            <Card
              key={type.id}
              sx={{
                cursor: 'pointer',
                transition: 'all 0.2s',
                '&:hover': { transform: 'translateY(-2px)' },
              }}
              onClick={() => navigate(`/submit/${type.id}`)}
            >
              <CardContent sx={{ p: 3 }}>
                <Box
                  sx={{
                    width: 44,
                    height: 44,
                    borderRadius: 2,
                    bgcolor: `${type.color}15`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    mb: 1.5,
                  }}
                >
                  <Icon style={{ width: 22, height: 22, color: type.color }} />
                </Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }}>
                  Submit {type.label}
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mb: 1.5, minHeight: '2.5em' }}
                >
                  {type.description}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: type.color }}>
                  <Typography variant="body2" sx={{ fontWeight: 500, color: 'inherit' }}>
                    Get started
                  </Typography>
                  <ArrowRight style={{ width: 14, height: 14 }} />
                </Box>
              </CardContent>
            </Card>
          );
        })}
      </Box>
    </Box>
  );
};

export default SubmitHub;
