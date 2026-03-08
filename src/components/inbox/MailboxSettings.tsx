import React, { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Check, Loader2, AlertCircle } from 'lucide-react';
import { useMailboxAddress } from '@/hooks/useMailboxAddress';

export const MailboxSettings: React.FC = () => {
  const { currentAddress, fullEmail, checkAvailability, claimAddress, loading } =
    useMailboxAddress();

  const [handle, setHandle] = useState('');
  const [availability, setAvailability] = useState<{
    available: boolean;
    reason: string;
  } | null>(null);
  const [checking, setChecking] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Debounced availability check
  useEffect(() => {
    if (!handle || handle.length < 3) {
      setAvailability(null);
      return;
    }

    const timeout = setTimeout(async () => {
      setChecking(true);
      try {
        const result = await checkAvailability(handle);
        setAvailability(result);
      } catch {
        setAvailability(null);
      } finally {
        setChecking(false);
      }
    }, 500);

    return () => clearTimeout(timeout);
  }, [handle, checkAvailability]);

  const handleClaim = async () => {
    setError(null);
    setClaiming(true);
    try {
      await claimAddress(handle);
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Failed to claim address');
    } finally {
      setClaiming(false);
    }
  };

  if (currentAddress || success) {
    return (
      <Card className="p-6">
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <Check className="h-5 w-5 text-green-600" />
          <Typography variant="h6" fontWeight={700}>
            Your Email Address
          </Typography>
        </Box>
        <Typography variant="body1" fontWeight={600}>
          {fullEmail || `${handle}@queer.guide`}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          People can send you emails at this address. Incoming messages will appear in your inbox.
        </Typography>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <Typography variant="h6" fontWeight={700} gutterBottom>
        Claim Your Email Address
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Choose a unique handle for your @queer.guide email address. This cannot be changed later.
      </Typography>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Input
          placeholder="yourname"
          value={handle}
          onChange={(e) => {
            setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9.-]/g, ''));
            setError(null);
          }}
          disabled={claiming}
          className="flex-1"
        />
        <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
          @queer.guide
        </Typography>
      </Box>

      {/* Availability indicator */}
      {checking && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1 }}>
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          <Typography variant="caption" color="text.secondary">
            Checking availability...
          </Typography>
        </Box>
      )}
      {!checking && availability && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1 }}>
          {availability.available ? (
            <>
              <Check className="h-3 w-3 text-green-600" />
              <Typography variant="caption" color="success.main">
                {handle}@queer.guide is available
              </Typography>
            </>
          ) : (
            <>
              <AlertCircle className="h-3 w-3 text-red-500" />
              <Typography variant="caption" color="error">
                {availability.reason}
              </Typography>
            </>
          )}
        </Box>
      )}

      {error && (
        <Typography variant="body2" color="error" sx={{ mt: 1 }}>
          {error}
        </Typography>
      )}

      <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
        3-30 characters. Letters, numbers, dots, and hyphens only. Must start and end with a letter
        or number.
      </Typography>

      <Button
        onClick={handleClaim}
        disabled={claiming || !handle || handle.length < 3 || !availability?.available}
        className="mt-3 w-full"
      >
        {claiming ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
        Claim {handle ? `${handle}@queer.guide` : 'Email Address'}
      </Button>
    </Card>
  );
};
