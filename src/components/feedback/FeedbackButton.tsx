import { useState, useCallback, useEffect, useRef } from 'react';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { MessageSquarePlus, Check, Camera } from 'lucide-react';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { insertRow } from '@/hooks/usePageFetchers';
import { useAuth } from '@/hooks/useAuth';
import { captureContext, captureScreenshot } from '@/utils/feedbackContext';
import { feedbackCategories } from '@/config/feedbackCategories';

export function FeedbackButton() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useLocalizedNavigate();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ category: '', title: '', description: '', email: '', honeypot: '' });
  const [status, setStatus] = useState<'idle' | 'submitting' | 'submitted'>('idle');
  const [includeScreenshot, setIncludeScreenshot] = useState(true);
  const [capturing, setCapturing] = useState(false);
  const [pageUrl, setPageUrl] = useState('');
  const screenshotBlobRef = useRef<Blob | null>(null);
  const screenshotUrlRef = useRef<string | null>(null);

  // Capture current URL when dialog opens so user sees what will be sent
  useEffect(() => {
    if (open) setPageUrl(window.location.href);
  }, [open]);

  const reset = useCallback(() => {
    setForm({ category: '', title: '', description: '', email: '', honeypot: '' });
    setStatus('idle');
    setIncludeScreenshot(true);
    if (screenshotUrlRef.current) {
      URL.revokeObjectURL(screenshotUrlRef.current);
      screenshotUrlRef.current = null;
    }
    screenshotBlobRef.current = null;
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
    // Reset after close animation
    setTimeout(reset, 200);
  }, [reset]);

  // Capture screenshot BEFORE the dialog mounts so the feedback window isn't
  // in the shot. The FAB is briefly hidden via `capturing` state.
  const handleOpenClick = useCallback(async () => {
    setCapturing(true);
    // Wait two animation frames so React commits the FAB hide before html2canvas reads the DOM.
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    try {
      const blob = await captureScreenshot();
      if (blob) {
        screenshotBlobRef.current = blob;
        if (screenshotUrlRef.current) URL.revokeObjectURL(screenshotUrlRef.current);
        screenshotUrlRef.current = URL.createObjectURL(blob);
      }
    } finally {
      setCapturing(false);
      setOpen(true);
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    if (form.honeypot) return;
    if (!form.category || !form.title.trim() || !form.description.trim()) {
      toast({ title: 'Please fill in all required fields', variant: 'destructive' });
      return;
    }

    setStatus('submitting');
    try {
      const context = captureContext();

      let screenshotUrl: string | null = null;
      // Use the blob captured when the dialog was opened — not a new shot —
      // so the feedback window doesn't end up in the image.
      const blob = includeScreenshot ? screenshotBlobRef.current : null;
      if (blob) {
        const fileName = `${crypto.randomUUID()}.jpg`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('feedback-screenshots')
          .upload(fileName, blob, { contentType: 'image/jpeg', upsert: false });
        if (!uploadError && uploadData) {
          const { data: publicUrl } = supabase.storage
            .from('feedback-screenshots')
            .getPublicUrl(uploadData.path);
          screenshotUrl = publicUrl.publicUrl;
        }
      }

      const { error } = await insertRow('community_submissions', {
        content_type: 'feedback',
        data: {
          title: form.title.trim(),
          description: form.description.trim(),
          category: form.category,
          contact_email: form.email.trim() || null,
          context,
          screenshot_url: screenshotUrl,
        },
        submitted_by: user?.id || null,
      });
      if (error) throw error;

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
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Share feedback"
            onClick={handleOpenClick}
            disabled={capturing}
            className="fixed bottom-6 right-6 z-[1200] flex h-12 w-12 items-center justify-center bg-foreground text-background transition-opacity hover:opacity-80 disabled:opacity-50"
            style={{
              visibility: capturing ? 'hidden' : 'visible',
            }}
          >
            <MessageSquarePlus style={{ width: 22, height: 22 }} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="left">Share Feedback</TooltipContent>
      </Tooltip>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent style={{ maxWidth: 480 }}>
          {status === 'submitted' ? (
            <div className="text-center py-8">
              <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 bg-foreground">
                <Check style={{ width: 24, height: 24, color: 'hsl(var(--background))' }} />
              </div>
              <h6 className="text-base font-semibold mb-2">Thank you!</h6>
              <p className="text-sm text-muted-foreground mb-6">
                Your feedback helps make Queer Guide better for everyone.
              </p>
              <div className="flex gap-3 justify-center">
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
              </div>
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Share Feedback</DialogTitle>
              </DialogHeader>

              {/* Category selector */}
              <div className="mb-4">
                <Label>What type of feedback?</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {feedbackCategories.map((cat) => {
                    const Icon = cat.icon;
                    const selected = form.category === cat.value;
                    return (
                      <div
                        key={cat.value}
                        onClick={() => setForm((f) => ({ ...f, category: cat.value }))}
                        className="flex items-center gap-2 cursor-pointer rounded-md transition-all"
                        style={{
                          padding: 12,
                          borderWidth: 2,
                          borderStyle: 'solid',
                          borderColor: selected ? cat.color : 'hsl(var(--border))',
                          backgroundColor: selected ? `${cat.color}10` : 'transparent',
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLDivElement).style.borderColor = cat.color;
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLDivElement).style.borderColor = selected
                            ? cat.color
                            : 'hsl(var(--border))';
                        }}
                      >
                        <Icon style={{ width: 16, height: 16, color: cat.color, flexShrink: 0 }} />
                        <p className="text-sm" style={{ fontWeight: selected ? 600 : 400 }}>
                          {cat.label}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Title */}
              <div className="mb-4">
                <Label htmlFor="feedback-title">Title *</Label>
                <Input
                  id="feedback-title"
                  placeholder="Brief summary of your feedback"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  maxLength={200}
                  style={{ marginTop: 4 }}
                />
              </div>

              {/* Description */}
              <div className="mb-4">
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
              </div>

              {/* Optional email for anonymous users */}
              {!user && (
                <div className="mb-4">
                  <Label htmlFor="feedback-email">Email (optional)</Label>
                  <Input
                    id="feedback-email"
                    type="email"
                    placeholder="So we can follow up"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    style={{ marginTop: 4 }}
                  />
                </div>
              )}

              {/* Screenshot toggle + thumbnail preview */}
              <div className="mb-4">
                <div className="flex items-center gap-2">
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
                </div>
                {includeScreenshot && screenshotUrlRef.current && (
                  <div
                    className="mt-2 border border-border rounded overflow-hidden"
                    style={{ marginLeft: 28, maxWidth: 220 }}
                  >
                    <img
                      src={screenshotUrlRef.current}
                      alt="Screenshot preview"
                      style={{ display: 'block', width: '100%', height: 'auto' }}
                    />
                  </div>
                )}
              </div>

              {/* Context preview */}
              <div
                className="mb-4 rounded bg-muted"
                style={{ padding: 10, fontSize: '0.7rem' }}
              >
                <p className="block text-xs text-muted-foreground">
                  Automatically included: current page URL, browser info, recent errors
                </p>
                <p
                  className="block text-muted-foreground"
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '0.65rem',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    marginTop: 2,
                  }}
                >
                  {pageUrl}
                </p>
              </div>

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
                <div className="flex gap-3 w-full justify-end">
                  <Button variant="outline" onClick={handleClose}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    disabled={status === 'submitting' || !form.category || !form.title.trim() || !form.description.trim()}
                  >
                    {status === 'submitting' ? 'Submitting...' : 'Submit'}
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
