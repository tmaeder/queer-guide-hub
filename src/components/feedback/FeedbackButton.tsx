import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { MessageSquarePlus, Bug, Lightbulb, Sparkles, BookOpen, Check } from 'lucide-react';
import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import Fab from '@mui/material/Fab';
import Typography from '@mui/material/Typography';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
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

const categories = [
  { value: 'bug', label: 'Bug', icon: Bug, color: '#ef4444' },
  { value: 'idea', label: 'Idea', icon: Lightbulb, color: '#f59e0b' },
  { value: 'improvement', label: 'Improvement', icon: Sparkles, color: '#8b5cf6' },
  { value: 'content-idea', label: 'Content Idea', icon: BookOpen, color: '#0ea5e9' },
] as const;

export function FeedbackButton() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [email, setEmail] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const reset = useCallback(() => {
    setCategory('');
    setTitle('');
    setDescription('');
    setEmail('');
    setHoneypot('');
    setIsSubmitted(false);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
    // Reset after close animation
    setTimeout(reset, 200);
  }, [reset]);

  const handleSubmit = useCallback(async () => {
    if (honeypot) return;
    if (!category || !title.trim() || !description.trim()) {
      toast({ title: 'Please fill in all required fields', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('community_submissions' as any).insert({
        content_type: 'feedback',
        data: {
          title: title.trim(),
          description: description.trim(),
          category,
          contact_email: email.trim() || null,
        },
        submitted_by: user?.id || null,
      });
      if (error) throw error;

      setIsSubmitted(true);
      toast({ title: 'Feedback submitted! Thank you.' });
    } catch (err: any) {
      toast({
        title: 'Submission failed',
        description: err.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [category, title, description, email, honeypot, user, toast]);

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
          {isSubmitted ? (
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
                  {categories.map((cat) => {
                    const Icon = cat.icon;
                    const selected = category === cat.value;
                    return (
                      <Box
                        key={cat.value}
                        onClick={() => setCategory(cat.value)}
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
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
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
                  value={description}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    setDescription(e.target.value)
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
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={{ marginTop: 4 }}
                  />
                </Box>
              )}

              {/* Honeypot */}
              <input
                type="text"
                name="website"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
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
                    disabled={isSubmitting || !category || !title.trim() || !description.trim()}
                  >
                    {isSubmitting ? 'Submitting...' : 'Submit'}
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
