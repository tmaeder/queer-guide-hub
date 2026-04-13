import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Mail, MapPin, Clock, MessageCircle, Shield, Bug, HelpCircle, ChevronDown, ChevronRight } from "lucide-react";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";

export default function Contact() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
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
  return <Box>
      <Container sx={{ py: 6 }}>
        <Box sx={{ textAlign: 'center', mb: 6 }}>
          <Typography variant="h3" sx={{ fontWeight: 700, mb: 2 }}>Contact Us</Typography>
          <Typography variant="h6" color="text.secondary" sx={{ mx: 'auto' }}>
            We're here to help! Whether you have questions, feedback, or need support,
            don't hesitate to reach out to our community team.
          </Typography>
        </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 6, mb: 8 }}>
        {/* Contact Methods */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>Reach Out</Typography>
          {contactMethods.map((method, index) => (
            <Card key={index}>
              <CardContent sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                  <method.icon style={{ width: 24, height: 24, flexShrink: 0, marginTop: 2 }} color="var(--mui-palette-primary-main)" />
                  <Box sx={{ flex: 1 }}>
                    <Typography sx={{ fontWeight: 600, mb: 0.5 }}>{method.title}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{method.description}</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Button variant="outline" size="sm" asChild>
                        <a href={`mailto:${method.contact}`}>
                          <Mail style={{ width: 16, height: 16, marginRight: 8 }} />
                          {method.contact}
                        </a>
                      </Button>
                      <Typography variant="caption" color="text.secondary">
                        Response: ~{method.responseTime}
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>

        {/* Contact Information */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Card>
            <CardHeader>
              <CardTitle>Get in Touch</CardTitle>
            </CardHeader>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <MapPin style={{ width: 20, height: 20 }} color="var(--mui-palette-primary-main)" />
                <Box>
                  <Typography sx={{ fontWeight: 500 }}>Global Community</Typography>
                  <Typography variant="body2" color="text.secondary">Serving LGBTQ+ communities worldwide</Typography>
                </Box>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Clock style={{ width: 20, height: 20 }} color="var(--mui-palette-primary-main)" />
                <Box>
                  <Typography sx={{ fontWeight: 500 }}>Response Time</Typography>
                  <Typography variant="body2" color="text.secondary">We aim to respond within 24 hours</Typography>
                </Box>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Shield style={{ width: 20, height: 20 }} color="var(--mui-palette-primary-main)" />
                <Box>
                  <Typography sx={{ fontWeight: 500 }}>Safety First</Typography>
                  <Typography variant="body2" color="text.secondary">Priority support for safety concerns</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>


        </Box>
      </Box>

      {/* FAQ Section */}
      <Box component="section">
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <HelpCircle style={{ width: 24, height: 24 }} color="var(--mui-palette-primary-main)" />
            Frequently Asked Questions
          </Box>
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {faqs.map((faq, index) => (
            <Card key={index}>
              <Collapsible open={openFaq === index} onOpenChange={() => setOpenFaq(openFaq === index ? null : index)}>
                <CollapsibleTrigger asChild>
                  <CardHeader sx={{ cursor: 'pointer', py: 2, '&:hover': { bgcolor: 'action.hover' }, transition: 'background-color 0.2s' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Typography sx={{ fontWeight: 600, fontSize: '0.9375rem' }}>{faq.question}</Typography>
                      {openFaq === index ? <ChevronDown style={{ width: 18, height: 18, flexShrink: 0 }} /> : <ChevronRight style={{ width: 18, height: 18, flexShrink: 0 }} />}
                    </Box>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent sx={{ pt: 0, pb: 2 }}>
                    <Typography variant="body2" color="text.secondary">{faq.answer}</Typography>
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          ))}
        </Box>
      </Box>
      </Container>
    </Box>;
}
