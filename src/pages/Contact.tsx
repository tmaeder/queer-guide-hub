import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FloatingInput } from '@/components/effects';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Mail, HelpCircle, ChevronDown, ChevronRight, Send, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { ColourfulText } from '@/components/effects/ColourfulText';
import { TracingBeam } from '@/components/effects/TracingBeam';
import { EditorialHero } from '@/components/editorial/EditorialHero';
import { EDITORIAL_IMAGES } from '@/lib/editorialImages';

const categories = [
  { value: 'support', label: 'Email Support' },
  { value: 'safety', label: 'Safety & Moderation' },
  { value: 'partnerships', label: 'Partnerships' },
  { value: 'bugs', label: 'Bug Reports' },
  { value: 'other', label: 'Other' },
];

const faqs = [
  {
    question: 'How do I add my business to Queer Guide?',
    answer:
      "Create an account and navigate to the Venues section. Click 'Add Venue' and fill out the required information. All submissions are reviewed before being published.",
  },
  {
    question: 'How do you verify that venues are LGBTQ+ friendly?',
    answer:
      'We use a combination of community reviews, direct outreach to businesses, and verification from local ambassadors. Venues with verified status have been confirmed through multiple sources.',
  },
  {
    question: 'Can I report inappropriate content or behavior?',
    answer:
      'Yes. We have a zero-tolerance policy for harassment, discrimination, or inappropriate content. Use the report button on any post or contact our safety team directly.',
  },
  {
    question: 'How can I become a local ambassador?',
    answer:
      "Local ambassadors are community volunteers who help us maintain accurate information for their regions. Reach out through the contact form above if you're interested.",
  },
  {
    question: 'Is my personal information secure?',
    answer:
      'Yes, we take privacy seriously. Please review our Privacy Policy for detailed information about how we collect, use, and protect your data.',
  },
];

export default function Contact() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: user?.email ?? '',
    category: '',
    message: '',
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.email || !form.category || !form.message) return;

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('contact-form', {
        body: form,
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setSubmitted(true);
      toast({ title: 'Message sent', description: "We'll get back to you soon." });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="container mx-auto px-4 py-8 md:py-12">
        <EditorialHero
          eyebrow="Contact"
          title={<ColourfulText text="Say hello." />}
          subtitle="Send us a question — partnership, safety, bug report, or just a thought. We read everything."
          image={EDITORIAL_IMAGES.contact.hero}
          imagePosition="side"
          decoration="none"
          height="md"
          className="mb-12 md:mb-16"
        />

        <div className="max-w-xl mx-auto mb-16">
          {/* Contact Form */}
          <Card>
            <CardHeader>
              <CardTitle>Send a Message</CardTitle>
            </CardHeader>
            <CardContent>
              {submitted ? (
                <div className="text-center py-8">
                  <Mail size={48} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
                  <h3 className="text-lg font-semibold mb-2">Message Sent</h3>
                  <p className="text-sm text-muted-foreground mb-6">
                    We'll respond as soon as possible.
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSubmitted(false);
                      setForm({ name: '', email: user?.email ?? '', category: '', message: '' });
                    }}
                  >
                    Send Another
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSubmit}>
                  <div className="flex flex-col gap-6">
                    <FloatingInput
                      label="Name"
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      required
                    />
                    <FloatingInput
                      label="Email"
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                      required
                    />
                    <div className="flex flex-col gap-2">
                      <Label id="contact-category-label">Category</Label>
                      <Select
                        value={form.category}
                        onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}
                      >
                        <SelectTrigger
                          aria-labelledby="contact-category-label"
                          aria-label="Category"
                        >
                          <SelectValue placeholder="Select a category" />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.map((c) => (
                            <SelectItem key={c.value} value={c.value}>
                              {c.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="message">Message</Label>
                      <Textarea
                        id="message"
                        placeholder="How can we help?"
                        value={form.message}
                        onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                        required
                        style={{ minHeight: 120 }}
                      />
                    </div>
                    <Button
                      type="submit"
                      disabled={
                        submitting || !form.name || !form.email || !form.category || !form.message
                      }
                    >
                      {submitting ? (
                        <Loader2
                          size={16}
                          style={{ animation: 'spin 1s linear infinite' }}
                          className="mr-2"
                        />
                      ) : (
                        <Send size={16} className="mr-2" />
                      )}
                      {submitting ? 'Sending...' : 'Send Message'}
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </div>

        {/* FAQ */}
        <TracingBeam>
          <section>
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
              <HelpCircle size={24} className="text-primary" />
              Frequently Asked Questions
            </h2>
            <div className="flex flex-col gap-4">
              {faqs.map((faq, index) => (
                <Card key={index}>
                  <Collapsible
                    open={openFaq === index}
                    onOpenChange={() => setOpenFaq(openFaq === index ? null : index)}
                  >
                    <CollapsibleTrigger className="flex w-full flex-col gap-1.5 p-6 text-left">
                      <div className="flex w-full items-center justify-between">
                        <p className="font-semibold text-15">{faq.question}</p>
                        {openFaq === index ? (
                          <ChevronDown size={18} className="shrink-0" />
                        ) : (
                          <ChevronRight size={18} className="shrink-0" />
                        )}
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <CardContent>
                        <p className="text-sm text-muted-foreground">{faq.answer}</p>
                      </CardContent>
                    </CollapsibleContent>
                  </Collapsible>
                </Card>
              ))}
            </div>
          </section>
        </TracingBeam>
      </div>
    </div>
  );
}
