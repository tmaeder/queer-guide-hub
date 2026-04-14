import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { MessageSquarePlus, Check, Camera } from 'lucide-react';
import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import Fab from '@mui/material/Fab';
import Typography from '@mui/material/Typography';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { captureContext, captureScreenshot } from '@/utils/feedbackContext';
import { feedbackCategories } from '@/config/feedbackCategories';

export function FeedbackButton() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ category: '', title: '', description: '', email: '', honeypot: '' });
  const [status, setStatus] = useState<'idle' | 'submitting' | 'submitted'>('idle');
  const [includeScreenshot, setIncludeScreenshot] = useState(false);
  const [pageUrl, setPageUrl] = useState('');

  // Capture current URL when dialog opens so user sees what will be sent
  useEffect(() => {
    if (open) setPageUrl(window.location.href);
  }, [open]);

  // Default screenshot toggle to ON when category is 'bug'
  useEffect(() => {
    if (form.category === 'bug') setIncludeScreenshot(true);
  }, [form.category]);

  const reset = useCallback(() => {
    setForm({ category: '', title: '', description: '', email: '', honeypot: '' });
    setStatus('idle');
    setIncludeScreenshot(false);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
    // Reset after close animation
    setTimeout(reset, 200);
  }, [reset]);

  const handleSubmit = useCallback(async () => {
    if (form.honeypot) return;
    if (!form.category || !form.title.trim() || !form.description.trim()) {
      toast({ title: 'Please fill in all required fields', variant: 'destructive' });
      return;
    }

    setStatus('submitting');
    try {
      const context = captureContext();

      // Upload screenshot in parallel with DB insert
      const screenshotPromise = includeScreenshot
        ? captureScreenshot().then(async (blob) => {
            if (!blob) return null;
            const fileName = `${crypto.randomUUID()}.jpg`;
            const { data: uploadData, error: uploadError } = await supabase.storage
              .from('feedback-screenshots')
              .upload(fileName, blob, { contentType: 'image/jpeg', upsert: false });
            if (uploadError || !uploadData) return null;
            const { data: publicUrl } = supabase.storage
              .from('feedback-screenshots')
              .getPublicUrl(uploadData.path);
            return publicUrl.publicUrl;
          })
        : Promise.resolve(null);

      const insertPromise = supabase.from('community_submissions' as const).insert({
        content_type: 'feedback',
        data: {
          title: form.title.trim(),
          description: form.description.trim(),
          category: form.category,
          contact_email: form.email.trim() || null,
          context,
          screenshot_url: null, // updated below if screenshot succeeds
        },
        submitted_by: user?.id || null,
      });

      const [screenshotUrl, { error }] = await Promise.all([screenshotPromise, insertPromise]);
      if (error) throw error;

      // If screenshot uploaded, update the submission with the URL
      if (screenshotUrl) {
        await supabase
          .from('community_submissions' as const)
          .update({ data: { title: form.title.trim(), description: form.description.trim(), category: form.category, contact_email: form.email.trim() || null, context, screenshot_url: screenshotUrl } })
          .eq('submitted_by', user?.id ?? '')
          .order('created_at', { ascending: false })
          .limit(1);
      }

      setStatus('submitted');
      toast({ title: 'Feedback submitted! Thank you.' });
    } catch (err: unknown) {
      toast({
        title: 'Submission failed',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
      setStatus('idle');
    }
  }, [form, includeScreenshot, user, toast]);

  return (
    <>
      <Tooltip title="Share Feedback" placement="left">
        <Fab
          size="medium"
          aria-label="Share feedback"
          onClick={() => setOpen(true)}
          sx={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 1200,
            bgcolor: '#DB2777',
            color: '#fff',
            '&:hover': { bgcolor: '#be185d' },
          }}
        >
          <MessageSquarePlus style={{ width: 22, height: 22 }} />
        </Fab>
      </Tooltip>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent style={{ maxWidth: 480 }}>
          {status === 'submitted' ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  bgcolor: '#22c55e',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mx: 'auto',
                  mb: 2,
                }}
              >
                <Check style={{ width: 24, height: 24, color: '#fff' }} />
              </Box>
              <Typography variant="h6" sx={{ mb: 1 }}>
                Thank you!
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Your feedback helps make Queer Guide better for everyone.
              </Typography>
              <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'center' }}>
                <Button variant="outline" onClick={handleClose}>
                  Close
                </Button>
                <Button
                  onClick={() => {
                    handleClose();
                    navigate('/feedback');
                  }}
                >
                  View Feedback Board
                </Button>
              </Box>
            </Box>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Share Feedback</DialogTitle>
              </DialogHeader>

              {/* Category selector */}
              <Box sx={{ mb: 2 }}>
                <Label>What type of feedback?</Label>
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1, mt: 1 }}>
                  {feedbackCategories.map((cat) => {
                    const Icon = cat.icon;
                    const selected = form.category === cat.value;
                    return (
                      <Box
                        key={cat.value}
                        onClick={() => setForm((f) => ({ ...f, category: cat.value }))}
                        sx={{
                          p: 1.5,
                          borderRadius: 1.5,
                          border: 2,
                          borderColor: selected ? cat.color : 'divider',
                          bgcolor: selected ? `${cat.color}10` : 'transparent',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                          transition: 'all 0.15s',
                          '&:hover': { borderColor: cat.color },
                        }}
                      >
                        <Icon style={{ width: 16, height: 16, color: cat.color, flexShrink: 0 }} />
                        <Typography variant="body2" sx={{ fontWeight: selected ? 600 : 400 }}>
                          {cat.label}
                        </Typography>
                      </Box>
                    );
                  })}
                </Box>
              </Box>

              {/* Title */}
              <Box sx={{ mb: 2 }}>
                <Label htmlFor="feedback-title">Title *</Label>
                <Input
                  id="feedback-title"
                  placeholder="Brief summary of your feedback"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  maxLength={200}
                  style={{ marginTop: 4 }}
                />
              </Box>

              {/* Description */}
              <Box sx={{ mb: 2 }}>
                <Label htmlFor="feedback-desc">Description *</Label>
                <Textarea
                  id="feedback-desc"
                  placeholder="Tell us more..."
                  value={form.description}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    setForm((f) => ({ ...f, description: e.target.value }))
                  }
                  style={{ marginTop: 4, minHeight: 100 }}
                />
              </Box>

              {/* Optional email for anonymous users */}
              {!user && (
                <Box sx={{ mb: 2 }}>
                  <Label htmlFor="feedback-email">Email (optional)</Label>
                  <Input
                    id="feedback-email"
                    type="email"
                    placeholder="So we can follow up"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    style={{ marginTop: 4 }}
                  />
                </Box>
              )}

              {/* Screenshot toggle */}
              <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Checkbox
                  id="feedback-screenshot"
                  checked={includeScreenshot}
                  onCheckedChange={(checked) => setIncludeScreenshot(checked === true)}
                />
                <Label
                  htmlFor="feedback-screenshot"
                  style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                >
                  <Camera style={{ width: 14, height: 14 }} />
                  Include screenshot of this page
                </Label>
              </Box>

              {/* Context preview */}
              <Box
                sx={{
                  mb: 2,
                  p: 1.25,
                  borderRadius: 1,
                  bgcolor: 'action.hover',
                  fontSize: '0.7rem',
                }}
              >
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  Automatically included: current page URL, browser info, recent errors
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    display: 'block',
                    fontFamily: 'monospace',
                    fontSize: '0.65rem',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    mt: 0.25,
                  }}
                >
                  {pageUrl}
                </Typography>
              </Box>

              {/* Honeypot */}
              <input
                type="text"
                name="website"
                value={form.honeypot}
                onChange={(e) => setForm((f) => ({ ...f, honeypot: e.target.value }))}
                style={{ position: 'absolute', left: -9999, opacity: 0, height: 0 }}
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
              />

              <DialogFooter>
                <Box sx={{ display: 'flex', gap: 1.5, width: '100%', justifyContent: 'flex-end' }}>
                  <Button variant="outline" onClick={handleClose}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    disabled={status === 'submitting' || !form.category || !form.title.trim() || !form.description.trim()}
                  >
                    {status === 'submitting' ? 'Submitting...' : 'Submit'}
                  </Button>
                </Box>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
