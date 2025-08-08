import { Heart, Shield, Users, Globe, Lightbulb, Star, Award, Handshake } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

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
    <div className="w-full p-6">
      {/* Hero Section */}
      <div className="text-center mb-16">
        <div className="flex items-center justify-center gap-3 mb-6">
          <Star className="h-12 w-12 text-primary" />
          <h1 className="text-4xl font-bold gradient-text">Our Values</h1>
        </div>
        <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
          The principles that guide every decision we make and every feature we build. 
          These values are the foundation of The Queer Guide community.
        </p>
      </div>

      {/* Core Values */}
      <section className="mb-16">
        <h2 className="text-3xl font-bold text-center mb-8">Core Values</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {coreValues.map((value, index) => (
            <Card key={index} className="h-full">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <value.icon className="h-8 w-8 text-primary" />
                  <h3 className="text-xl font-semibold">{value.title}</h3>
                </div>
                <p className="text-muted-foreground mb-4">{value.description}</p>
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">In practice, this means:</h4>
                  <ul className="space-y-1">
                    {value.principles.map((principle, idx) => (
                      <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                        <span className="text-primary mt-1">•</span>
                        <span>{principle}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Operational Values */}
      <section className="mb-16">
        <h2 className="text-3xl font-bold text-center mb-8">How We Operate</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {operationalValues.map((value, index) => (
            <Card key={index}>
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-3">
                  <value.icon className="h-6 w-6 text-primary" />
                  <h3 className="text-lg font-semibold">{value.title}</h3>
                </div>
                <p className="text-muted-foreground text-sm mb-3">{value.description}</p>
                <ul className="space-y-1">
                  {value.examples.map((example, idx) => (
                    <li key={idx} className="text-xs text-muted-foreground flex items-start gap-2">
                      <span className="text-primary mt-0.5">•</span>
                      <span>{example}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Values in Action */}
      <section className="mb-16">
        <h2 className="text-3xl font-bold text-center mb-8">Values in Action</h2>
        <div className="bg-gradient-to-r from-primary/10 to-secondary/10 rounded-lg p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-primary mb-2">100%</div>
              <p className="text-sm text-muted-foreground">Verified venue safety checks</p>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-primary mb-2">24hr</div>
              <p className="text-sm text-muted-foreground">Response time for safety reports</p>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-primary mb-2">0%</div>
              <p className="text-sm text-muted-foreground">Tolerance for discrimination</p>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-primary mb-2">50+</div>
              <p className="text-sm text-muted-foreground">Community partnerships</p>
            </div>
          </div>
        </div>
      </section>

      {/* Our Commitments */}
      <section className="mb-16">
        <h2 className="text-3xl font-bold text-center mb-8">Our Commitments</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {commitments.map((commitment, index) => (
            <Card key={index}>
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold mb-3">{commitment.title}</h3>
                <p className="text-muted-foreground mb-4">{commitment.description}</p>
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Our actions:</h4>
                  <div className="flex flex-wrap gap-2">
                    {commitment.actions.map((action, idx) => (
                      <span key={idx} className="bg-primary/10 text-primary text-xs px-2 py-1 rounded">
                        {action}
                      </span>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Community Feedback */}
      <section className="mb-16">
        <h2 className="text-3xl font-bold text-center mb-8">Accountability</h2>
        <Card>
          <CardContent className="p-8 text-center">
            <h3 className="text-xl font-semibold mb-4">We're Accountable to You</h3>
            <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
              Our values are meaningless without accountability. We regularly review our practices, 
              listen to community feedback, and adjust our approach to better serve our mission.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <h4 className="font-semibold mb-2">Monthly Community Reviews</h4>
                <p className="text-sm text-muted-foreground">Regular assessment of our policies and practices</p>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Open Feedback Channels</h4>
                <p className="text-sm text-muted-foreground">Multiple ways for the community to share concerns</p>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Transparent Reporting</h4>
                <p className="text-sm text-muted-foreground">Regular updates on how we're living up to our values</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Call to Action */}
      <section className="text-center">
        <h2 className="text-3xl font-bold mb-4">Living Our Values Together</h2>
        <p className="text-lg text-muted-foreground mb-6 max-w-2xl mx-auto">
          These values come to life through our community. When you use The Queer Guide, 
          you're not just finding places and events—you're participating in a movement 
          built on these principles.
        </p>
        <Card>
          <CardContent className="p-6">
            <p className="text-muted-foreground">
              Have feedback about how we're living up to our values? We want to hear from you. 
              Contact us at values@queer.guide
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}