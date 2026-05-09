import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Check, Loader2, AlertCircle } from 'lucide-react';
import { useMailboxAddress } from '@/hooks/useMailboxAddress';

export const MailboxSettings: React.FC = () => {
  const { currentAddress, fullEmail, checkAvailability, claimAddress } = useMailboxAddress();

  const [handle, setHandle] = useState('');
  const [availability, setAvailability] = useState<{
    available: boolean;
    reason: string;
  } | null>(null);
  const [checking, setChecking] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to claim address');
    } finally {
      setClaiming(false);
    }
  };

  if (currentAddress || success) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Check className="h-5 w-5 text-foreground" />
          <h6 className="text-base font-bold">Your Email Address</h6>
        </div>
        <p className="text-base font-semibold">{fullEmail || `${handle}@queer.guide`}</p>
        <p className="text-sm text-muted-foreground mt-2">
          People can send you emails at this address. Incoming messages will appear in your inbox.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h6 className="text-base font-bold mb-2">Claim Your Email Address</h6>
      <p className="text-sm text-muted-foreground mb-6">
        Choose a unique handle for your @queer.guide email address. This cannot be changed later.
      </p>

      <div className="flex items-center gap-2 mb-2">
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
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          @queer.guide
        </span>
      </div>

      {checking && (
        <div className="flex items-center gap-1 mt-2">
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Checking availability...</span>
        </div>
      )}
      {!checking && availability && (
        <div className="flex items-center gap-1 mt-2">
          {availability.available ? (
            <>
              <Check className="h-3 w-3 text-foreground" />
              <span className="text-xs text-foreground">
                {handle}@queer.guide is available
              </span>
            </>
          ) : (
            <>
              <AlertCircle className="h-3 w-3 text-destructive" />
              <span className="text-xs text-destructive">{availability.reason}</span>
            </>
          )}
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive mt-2">{error}</p>
      )}

      <span className="text-xs text-muted-foreground mt-4 block">
        3-30 characters. Letters, numbers, dots, and hyphens only. Must start and end with a letter
        or number.
      </span>

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
