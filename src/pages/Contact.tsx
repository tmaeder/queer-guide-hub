import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Mail, Clock, MessageCircle, Shield, Bug, HelpCircle, ChevronDown, ChevronRight, Send, Loader2 } from "lucide-react";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

const categories = [
  { value: "support", label: "Email Support", icon: Mail, email: "support@queer.guide", responseTime: "24 hours" },
  { value: "safety", label: "Safety & Moderation", icon: Shield, email: "safety@queer.guide", responseTime: "6 hours" },
  { value: "partnerships", label: "Partnerships", icon: MessageCircle, email: "partnerships@queer.guide", responseTime: "48 hours" },
  { value: "bugs", label: "Bug Reports", icon: Bug, email: "bugs@queer.guide", responseTime: "72 hours" },
  { value: "other", label: "Other", icon: Mail, email: "support@queer.guide", responseTime: "48 hours" },
];

const faqs = [
  { question: "How do I add my business to The Queer Guide?", answer: "Create an account and navigate to the Venues section. Click 'Add Venue' and fill out the required information. All submissions are reviewed before being published." },
  { question: "How do you verify that venues are LGBTQ+ friendly?", answer: "We use a combination of community reviews, direct outreach to businesses, and verification from local ambassadors. Venues with verified status have been confirmed through multiple sources." },
  { question: "Can I report inappropriate content or behavior?", answer: "Yes. We have a zero-tolerance policy for harassment, discrimination, or inappropriate content. Use the report button on any post or contact our safety team directly." },
  { question: "How can I become a local ambassador?", answer: "Local ambassadors are community volunteers who help us maintain accurate information for their regions. Contact us through partnerships@queer.guide if you're interested." },
  { question: "Is my personal information secure?", answer: "Yes, we take privacy seriously. Please review our Privacy Policy for detailed information about how we collect, use, and protect your data." },
];

export default function Contact() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: user?.email ?? "",
    category: "",
    message: "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.email || !form.category || !form.message) return;

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("contact-form", {
        body: form,
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setSubmitted(true);
      toast({ title: "Message sent", description: "We'll get back to you soon." });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Box>
      <Container sx={{ py: 6 }}>
        <Box sx={{ textAlign: "center", mb: 6 }}>
          <Typography variant="h3" sx={{ fontWeight: 700, mb: 1 }}>Contact Us</Typography>
          <Typography variant="body1" color="text.secondary">
            Questions, feedback, or need support? Reach out to our community team.
          </Typography>
        </Box>

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, gap: 6, mb: 8 }}>
          {/* Contact Form */}
          <Card>
            <CardHeader>
              <CardTitle>Send a Message</CardTitle>
            </CardHeader>
            <CardContent>
              {submitted ? (
                <Box sx={{ textAlign: "center", py: 4 }}>
                  <Mail style={{ width: 48, height: 48, margin: "0 auto 16px", opacity: 0.5 }} />
                  <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>Message Sent</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                    We'll respond as soon as possible.
                  </Typography>
                  <Button variant="outline" onClick={() => { setSubmitted(false); setForm({ name: "", email: user?.email ?? "", category: "", message: "" }); }}>
                    Send Another
                  </Button>
                </Box>
              ) : (
                <form onSubmit={handleSubmit}>
                  <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
                    <Box>
                      <Label htmlFor="name">Name</Label>
                      <Input
                        id="name"
                        placeholder="Your name"
                        value={form.name}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                        required
                      />
                    </Box>
                    <Box>
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="your@email.com"
                        value={form.email}
                        onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                        required
                      />
                    </Box>
                    <Box>
                      <Label>Category</Label>
                      <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a category" />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.map((c) => (
                            <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Box>
                    <Box>
                      <Label htmlFor="message">Message</Label>
                      <Textarea
                        id="message"
                        placeholder="How can we help?"
                        value={form.message}
                        onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                        required
                        style={{ minHeight: 120 }}
                      />
                    </Box>
                    <Button type="submit" disabled={submitting || !form.name || !form.email || !form.category || !form.message}>
                      {submitting ? <Loader2 style={{ width: 16, height: 16, marginRight: 8, animation: "spin 1s linear infinite" }} /> : <Send style={{ width: 16, height: 16, marginRight: 8 }} />}
                      {submitting ? "Sending..." : "Send Message"}
                    </Button>
                  </Box>
                </form>
              )}
            </CardContent>
          </Card>

          {/* Contact Methods + Info */}
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>Direct Contact</Typography>
            {categories.filter((c) => c.value !== "other").map((method) => (
              <Card key={method.value}>
                <CardContent>
                  <Box sx={{ display: "flex", alignItems: "flex-start", gap: 2 }}>
                    <method.icon style={{ width: 20, height: 20, flexShrink: 0, marginTop: 2 }} color="var(--mui-palette-primary-main)" />
                    <Box sx={{ flex: 1 }}>
                      <Typography sx={{ fontWeight: 600, fontSize: "0.9375rem" }}>{method.label}</Typography>
                      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mt: 0.5 }}>
                        <Typography variant="body2" component="a" href={`mailto:${method.email}`} color="primary.main">
                          {method.email}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          ~{method.responseTime}
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            ))}

            <Card>
              <CardContent>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                  <Clock style={{ width: 18, height: 18 }} color="var(--mui-palette-primary-main)" />
                  <Typography variant="body2"><strong>Response Time</strong> — within 24 hours</Typography>
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                  <Shield style={{ width: 18, height: 18 }} color="var(--mui-palette-primary-main)" />
                  <Typography variant="body2"><strong>Safety First</strong> — priority support for safety concerns</Typography>
                </Box>
              </CardContent>
            </Card>
          </Box>
        </Box>

        {/* FAQ */}
        <Box component="section">
          <Typography variant="h5" sx={{ fontWeight: 700, mb: 3, display: "flex", alignItems: "center", gap: 1 }}>
            <HelpCircle style={{ width: 24, height: 24 }} color="var(--mui-palette-primary-main)" />
            Frequently Asked Questions
          </Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            {faqs.map((faq, index) => (
              <Card key={index}>
                <Collapsible open={openFaq === index} onOpenChange={() => setOpenFaq(openFaq === index ? null : index)}>
                  <CollapsibleTrigger asChild>
                    <CardHeader>
                      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <Typography sx={{ fontWeight: 600, fontSize: "0.9375rem" }}>{faq.question}</Typography>
                        {openFaq === index ? <ChevronDown style={{ width: 18, height: 18, flexShrink: 0 }} /> : <ChevronRight style={{ width: 18, height: 18, flexShrink: 0 }} />}
                      </Box>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent>
                      <Typography variant="body2" color="text.secondary">{faq.answer}</Typography>
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            ))}
          </Box>
        </Box>
      </Container>
    </Box>
  );
}
