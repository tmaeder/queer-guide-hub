import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, MapPin, Phone, Clock, MessageCircle, Shield, Bug } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
export default function Contact() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    category: "",
    message: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    toast
  } = useToast();
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Simulate form submission
    await new Promise(resolve => setTimeout(resolve, 1000));
    toast({
      title: "Message sent!",
      description: "We'll get back to you within 24 hours."
    });
    setFormData({
      name: "",
      email: "",
      subject: "",
      category: "",
      message: ""
    });
    setIsSubmitting(false);
  };
  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };
  const contactMethods = [{
    icon: Mail,
    title: "Email Support",
    description: "Get help with your account or technical issues",
    contact: "support@queer.guide",
    responseTime: "24 hours"
  }, {
    icon: Shield,
    title: "Safety & Moderation",
    description: "Report safety concerns or content violations",
    contact: "safety@queer.guide",
    responseTime: "6 hours"
  }, {
    icon: MessageCircle,
    title: "Partnerships",
    description: "Business partnerships and collaboration inquiries",
    contact: "partnerships@queer.guide",
    responseTime: "48 hours"
  }, {
    icon: Bug,
    title: "Bug Reports",
    description: "Report technical issues or suggest improvements",
    contact: "bugs@queer.guide",
    responseTime: "72 hours"
  }];
  const faqs = [{
    question: "How do I add my business to The Queer Guide?",
    answer: "You can add your business by creating an account and navigating to the Venues section. Click 'Add Venue' and fill out the required information. All submissions are reviewed before being published."
  }, {
    question: "How do you verify that venues are LGBTQ+ friendly?",
    answer: "We use a combination of community reviews, direct outreach to businesses, and verification from local ambassadors. Venues with verified status have been confirmed through multiple sources."
  }, {
    question: "Can I report inappropriate content or behavior?",
    answer: "Yes, absolutely. We have a zero-tolerance policy for harassment, discrimination, or inappropriate content. Use the report button on any post or contact our safety team directly."
  }, {
    question: "How can I become a local ambassador?",
    answer: "Local ambassadors are community volunteers who help us maintain accurate information for their regions. Contact us through partnerships@queer.guide if you're interested."
  }, {
    question: "Is my personal information secure?",
    answer: "Yes, we take privacy seriously. Please review our Privacy Policy for detailed information about how we collect, use, and protect your data."
  }];
  return <div className="w-full p-6">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4">Contact Us</h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          We're here to help! Whether you have questions, feedback, or need support, 
          don't hesitate to reach out to our community team.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mb-16">
        {/* Contact Form */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle>Send us a message</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name">Name</Label>
                    <Input id="name" type="text" value={formData.name} onChange={e => handleInputChange("name", e.target.value)} required />
                  </div>
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" value={formData.email} onChange={e => handleInputChange("email", e.target.value)} required />
                  </div>
                </div>

                <div>
                  <Label htmlFor="category">Category</Label>
                  <Select value={formData.category} onValueChange={value => handleInputChange("category", value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="general">General Question</SelectItem>
                      <SelectItem value="technical">Technical Support</SelectItem>
                      <SelectItem value="safety">Safety Concern</SelectItem>
                      <SelectItem value="business">Business Inquiry</SelectItem>
                      <SelectItem value="partnership">Partnership</SelectItem>
                      <SelectItem value="feedback">Feedback</SelectItem>
                      <SelectItem value="bug">Bug Report</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="subject">Subject</Label>
                  <Input id="subject" type="text" value={formData.subject} onChange={e => handleInputChange("subject", e.target.value)} required />
                </div>

                <div>
                  <Label htmlFor="message">Message</Label>
                  <Textarea id="message" rows={6} value={formData.message} onChange={e => handleInputChange("message", e.target.value)} placeholder="Please provide as much detail as possible..." required />
                </div>

                <Button type="submit" disabled={isSubmitting} className="w-full">
                  {isSubmitting ? "Sending..." : "Send Message"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Contact Information */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Get in Touch</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <MapPin className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">Global Community</p>
                  <p className="text-sm text-muted-foreground">Serving LGBTQ+ communities worldwide</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">Response Time</p>
                  <p className="text-sm text-muted-foreground">We aim to respond within 24 hours</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Shield className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">Safety First</p>
                  <p className="text-sm text-muted-foreground">Priority support for safety concerns</p>
                </div>
              </div>
            </CardContent>
          </Card>

          
        </div>
      </div>

      {/* FAQ Section */}
      <section>
        <h2 className="text-3xl font-bold text-center mb-8">Frequently Asked Questions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {faqs.map((faq, index) => <Card key={index}>
              <CardContent className="p-6">
                <h3 className="font-semibold mb-3">{faq.question}</h3>
                <p className="text-muted-foreground text-sm">{faq.answer}</p>
              </CardContent>
            </Card>)}
        </div>
      </section>
    </div>;
}