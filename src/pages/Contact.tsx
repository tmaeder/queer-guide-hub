import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, MapPin, Clock, MessageCircle, Shield, Bug } from "lucide-react";

export default function Contact() {
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
  return <div className="w-full">
      <div className="container mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">Contact Us</h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            We're here to help! Whether you have questions, feedback, or need support, 
            don't hesitate to reach out to our community team.
          </p>
        </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mb-16">
        {/* Contact Methods */}
        <div className="space-y-4">
          <h2 className="text-2xl font-bold mb-4">Reach Out</h2>
          {contactMethods.map((method, index) => (
            <Card key={index}>
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <method.icon className="h-6 w-6 text-primary mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <h3 className="font-semibold mb-1">{method.title}</h3>
                    <p className="text-sm text-muted-foreground mb-3">{method.description}</p>
                    <div className="flex items-center justify-between">
                      <Button variant="outline" size="sm" asChild>
                        <a href={`mailto:${method.contact}`}>
                          <Mail className="h-4 w-4 mr-2" />
                          {method.contact}
                        </a>
                      </Button>
                      <span className="text-xs text-muted-foreground">
                        Response: ~{method.responseTime}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
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
        
        
      </section>
      </div>
    </div>;
}