import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Mail, Clock, MessageCircle, Shield, Bug, HelpCircle, ChevronDown, ChevronRight, Send, Loader2 } from "lucide-react";
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
    <div>
      <div className="container mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-2">Contact Us</h1>
          <p className="text-muted-foreground">
            Questions, feedback, or need support? Reach out to our community team.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mb-16">
          {/* Contact Form */}
          <Card>
            <CardHeader>
              <CardTitle>Send a Message</CardTitle>
            </CardHeader>
            <CardContent>
              {submitted ? (
                <div className="text-center py-8">
                  <Mail style={{ width: 48, height: 48, margin: "0 auto 16px", opacity: 0.5 }} />
                  <h3 className="text-lg font-semibold mb-2">Message Sent</h3>
                  <p className="text-sm text-muted-foreground mb-6">
                    We'll respond as soon as possible.
                  </p>
                  <Button variant="outline" onClick={() => { setSubmitted(false); setForm({ name: "", email: user?.email ?? "", category: "", message: "" }); }}>
                    Send Another
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSubmit}>
                  <div className="flex flex-col gap-5">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="name">Name</Label>
                      <Input
                        id="name"
                        placeholder="Your name"
                        value={form.name}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                        required
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="your@email.com"
                        value={form.email}
                        onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                        required
                      />
                    </div>
                    <div className="flex flex-col gap-2">
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
                    <Button type="submit" disabled={submitting || !form.name || !form.email || !form.category || !form.message}>
                      {submitting ? <Loader2 style={{ width: 16, height: 16, marginRight: 8, animation: "spin 1s linear infinite" }} /> : <Send style={{ width: 16, height: 16, marginRight: 8 }} />}
                      {submitting ? "Sending..." : "Send Message"}
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>

          {/* Contact Methods + Info */}
          <div className="flex flex-col gap-4">
            <h2 className="text-xl font-bold">Direct Contact</h2>
            {categories.filter((c) => c.value !== "other").map((method) => (
              <Card key={method.value}>
                <CardContent>
                  <div className="flex items-start gap-4">
                    <method.icon style={{ width: 20, height: 20, flexShrink: 0, marginTop: 2 }} className="text-primary" />
                    <div className="flex-1">
                      <p className="font-semibold text-[0.9375rem]">{method.label}</p>
                      <div className="flex items-center justify-between mt-1">
                        <a href={`mailto:${method.email}`} className="text-sm text-primary">
                          {method.email}
                        </a>
                        <span className="text-xs text-muted-foreground">
                          ~{method.responseTime}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            <Card>
              <CardContent>
                <div className="flex items-center gap-3">
                  <Clock style={{ width: 18, height: 18 }} className="text-primary" />
                  <p className="text-sm"><strong>Response Time</strong> — within 24 hours</p>
                </div>
                <div className="flex items-center gap-3">
                  <Shield style={{ width: 18, height: 18 }} className="text-primary" />
                  <p className="text-sm"><strong>Safety First</strong> — priority support for safety concerns</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* FAQ */}
        <section>
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
            <HelpCircle style={{ width: 24, height: 24 }} className="text-primary" />
            Frequently Asked Questions
          </h2>
          <div className="flex flex-col gap-3">
            {faqs.map((faq, index) => (
              <Card key={index}>
                <Collapsible open={openFaq === index} onOpenChange={() => setOpenFaq(openFaq === index ? null : index)}>
                  <CollapsibleTrigger asChild>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-[0.9375rem]">{faq.question}</p>
                        {openFaq === index ? <ChevronDown style={{ width: 18, height: 18, flexShrink: 0 }} /> : <ChevronRight style={{ width: 18, height: 18, flexShrink: 0 }} />}
                      </div>
                    </CardHeader>
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
      </div>
    </div>
  );
}
