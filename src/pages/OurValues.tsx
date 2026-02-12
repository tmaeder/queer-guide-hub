import { Heart, Shield, Users, Globe, Lightbulb, Star, Award, Handshake } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";

export default function OurValues() {
  const coreValues = [
    {
      icon: Heart,
      title: "Love & Acceptance",
      description: "We believe love is love, and everyone deserves to be accepted for who they are. Our platform is built on unconditional acceptance and celebration of all identities within the LGBTQ+ spectrum.",
      principles: [
        "Celebrate all forms of love and identity",
        "Create spaces free from judgment",
        "Support authentic self-expression",
        "Foster understanding across differences"
      ]
    },
    {
      icon: Shield,
      title: "Safety & Security",
      description: "The safety of our community members is our highest priority. We implement rigorous verification processes and maintain strict community guidelines to ensure everyone feels secure.",
      principles: [
        "Verify all venue and event listings",
        "Moderate content to prevent harassment",
        "Protect user privacy and data",
        "Respond quickly to safety concerns"
      ]
    },
    {
      icon: Users,
      title: "Community First",
      description: "We put community needs before profit. Every decision we make is evaluated through the lens of how it serves and strengthens the LGBTQ+ community we exist to support.",
      principles: [
        "Listen to community feedback",
        "Prioritize user needs over profits",
        "Support community-led initiatives",
        "Foster meaningful connections"
      ]
    },
    {
      icon: Globe,
      title: "Global Inclusivity",
      description: "Our platform welcomes people from all backgrounds, cultures, and locations. We strive to be accessible and relevant to LGBTQ+ individuals worldwide, respecting local contexts.",
      principles: [
        "Respect cultural differences",
        "Support multiple languages",
        "Ensure global accessibility",
        "Honor local community needs"
      ]
    },
    {
      icon: Lightbulb,
      title: "Innovation & Progress",
      description: "We continuously innovate to better serve our community, using technology as a force for positive change while staying true to our core mission and values.",
      principles: [
        "Embrace new technologies thoughtfully",
        "Continuously improve user experience",
        "Lead with purpose-driven innovation",
        "Stay ahead of community needs"
      ]
    },
    {
      icon: Star,
      title: "Quality & Excellence",
      description: "We maintain high standards in everything we do, from the accuracy of our listings to the quality of our community interactions, ensuring our platform remains trustworthy.",
      principles: [
        "Maintain accurate, up-to-date information",
        "Deliver excellent user experiences",
        "Provide reliable, consistent service",
        "Strive for continuous improvement"
      ]
    }
  ];

  const operationalValues = [
    {
      icon: Award,
      title: "Transparency",
      description: "Open communication about our policies, decisions, and operations",
      examples: ["Clear community guidelines", "Public safety policies", "Regular updates on changes", "Honest communication about challenges"]
    },
    {
      icon: Handshake,
      title: "Collaboration",
      description: "Working together with community organizations and local businesses",
      examples: ["Partner with local LGBTQ+ organizations", "Collaborate with venue owners", "Work with event organizers", "Support community leaders"]
    },
    {
      icon: Heart,
      title: "Empathy",
      description: "Understanding and sharing the experiences of our community members",
      examples: ["Listen to user concerns", "Understand different perspectives", "Respond with compassion", "Support those in need"]
    }
  ];

  const commitments = [
    {
      title: "Environmental Responsibility",
      description: "We're committed to sustainable practices and supporting environmentally conscious businesses in our community.",
      actions: ["Carbon-neutral hosting", "Promote eco-friendly venues", "Digital-first operations", "Support green initiatives"]
    },
    {
      title: "Economic Justice",
      description: "We support LGBTQ+ economic empowerment through our marketplace and by highlighting LGBTQ+ owned businesses.",
      actions: ["Promote LGBTQ+ businesses", "Fair marketplace policies", "Support economic equality", "Transparent pricing"]
    },
    {
      title: "Mental Health Awareness",
      description: "We recognize the importance of mental health in our community and work to provide supportive resources.",
      actions: ["Partner with mental health organizations", "Provide crisis resources", "Promote supportive events", "Create safe spaces for sharing"]
    },
    {
      title: "Youth Support",
      description: "We're especially committed to supporting LGBTQ+ youth with age-appropriate resources and connections.",
      actions: ["Youth-specific safety measures", "Educational resources", "Mentorship connections", "Safe space verification"]
    }
  ];

  return (
    <Box>
      <Container maxWidth="lg" sx={{ py: 6 }}>
        {/* Hero Section */}
        <Box sx={{ textAlign: 'center', mb: 8 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5, mb: 3 }}>
            <Star style={{ width: 48, height: 48 }} color="var(--mui-palette-primary-main)" />
            <Typography variant="h3" sx={{ fontWeight: 700, background: 'linear-gradient(135deg, #f472b6, #a78bfa, #60a5fa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Our Values</Typography>
          </Box>
          <Typography variant="h6" color="text.secondary" sx={{ maxWidth: '48rem', mx: 'auto' }}>
            The principles that guide every decision we make and every feature we build.
            These values are the foundation of The Queer Guide community.
          </Typography>
        </Box>

      {/* Core Values */}
      <Box component="section" sx={{ mb: 8 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, textAlign: 'center', mb: 4 }}>Core Values</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 4 }}>
          {coreValues.map((value, index) => (
            <Card key={index} sx={{ height: '100%' }}>
              <CardContent sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                  <value.icon style={{ width: 32, height: 32 }} color="var(--mui-palette-primary-main)" />
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>{value.title}</Typography>
                </Box>
                <Typography color="text.secondary" sx={{ mb: 2 }}>{value.description}</Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>In practice, this means:</Typography>
                  <Box component="ul" sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                    {value.principles.map((principle, idx) => (
                      <Box component="li" key={idx} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                        <Typography component="span" color="primary" sx={{ mt: 0.5 }}>&#8226;</Typography>
                        <Typography variant="body2" color="text.secondary">{principle}</Typography>
                      </Box>
                    ))}
                  </Box>
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
      </Box>

      {/* Operational Values */}
      <Box component="section" sx={{ mb: 8 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, textAlign: 'center', mb: 4 }}>How We Operate</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' }, gap: 3 }}>
          {operationalValues.map((value, index) => (
            <Card key={index}>
              <CardContent sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                  <value.icon style={{ width: 24, height: 24 }} color="var(--mui-palette-primary-main)" />
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{value.title}</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{value.description}</Typography>
                <Box component="ul" sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  {value.examples.map((example, idx) => (
                    <Box component="li" key={idx} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                      <Typography component="span" color="primary" sx={{ mt: 0.25 }}>&#8226;</Typography>
                      <Typography variant="caption" color="text.secondary">{example}</Typography>
                    </Box>
                  ))}
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
      </Box>

      {/* Values in Action */}
      <Box component="section" sx={{ mb: 8 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, textAlign: 'center', mb: 4 }}>Values in Action</Typography>
        <Box sx={{ background: 'linear-gradient(to right, rgba(var(--mui-palette-primary-mainChannel) / 0.1), rgba(var(--mui-palette-secondary-mainChannel) / 0.1))', borderRadius: 2, p: 4 }}>
          <Box sx={{ textAlign: 'center', maxWidth: '42rem', mx: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }} color="primary">Zero Tolerance</Typography>
            <Typography color="text.secondary">
              We maintain a strict zero-tolerance policy for discrimination, harassment,
              and hate speech across our entire platform. Every report is reviewed, and
              every community member deserves to feel safe and welcome.
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Our Commitments */}
      <Box component="section" sx={{ mb: 8 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, textAlign: 'center', mb: 4 }}>Our Commitments</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
          {commitments.map((commitment, index) => (
            <Card key={index}>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1.5 }}>{commitment.title}</Typography>
                <Typography color="text.secondary" sx={{ mb: 2 }}>{commitment.description}</Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>Our actions:</Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    {commitment.actions.map((action, idx) => (
                      <Typography key={idx} component="span" variant="caption" color="primary" sx={{ bgcolor: 'rgba(var(--mui-palette-primary-mainChannel) / 0.1)', px: 1, py: 0.5, borderRadius: 1 }}>
                        {action}
                      </Typography>
                    ))}
                  </Box>
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
      </Box>

      {/* Community Feedback */}
      <Box component="section" sx={{ mb: 8 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, textAlign: 'center', mb: 4 }}>Accountability</Typography>
        <Card>
          <CardContent sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>We're Accountable to You</Typography>
            <Typography color="text.secondary" sx={{ mb: 3, maxWidth: '42rem', mx: 'auto' }}>
              Our values are meaningless without accountability. We regularly review our practices,
              listen to community feedback, and adjust our approach to better serve our mission.
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' }, gap: 3 }}>
              <Box>
                <Typography sx={{ fontWeight: 600, mb: 1 }}>Monthly Community Reviews</Typography>
                <Typography variant="body2" color="text.secondary">Regular assessment of our policies and practices</Typography>
              </Box>
              <Box>
                <Typography sx={{ fontWeight: 600, mb: 1 }}>Open Feedback Channels</Typography>
                <Typography variant="body2" color="text.secondary">Multiple ways for the community to share concerns</Typography>
              </Box>
              <Box>
                <Typography sx={{ fontWeight: 600, mb: 1 }}>Transparent Reporting</Typography>
                <Typography variant="body2" color="text.secondary">Regular updates on how we're living up to our values</Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>
      </Box>

      {/* Call to Action */}
      <Box component="section" sx={{ textAlign: 'center' }}>
        <Typography variant="h4" sx={{ fontWeight: 700, mb: 2 }}>Living Our Values Together</Typography>
        <Typography variant="subtitle1" color="text.secondary" sx={{ mb: 3, maxWidth: '42rem', mx: 'auto' }}>
          These values come to life through our community. When you use The Queer Guide,
          you're not just finding places and events—you're participating in a movement
          built on these principles.
        </Typography>
        <Card>
          <CardContent sx={{ p: 3 }}>
            <Typography color="text.secondary">
              Have feedback about how we're living up to our values? We want to hear from you.
              Contact us at values@queer.guide
            </Typography>
          </CardContent>
        </Card>
      </Box>
      </Container>
    </Box>
  );
}
