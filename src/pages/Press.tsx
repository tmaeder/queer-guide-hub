import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Newspaper, Download, Mail, Calendar, Award, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
export default function Press() {
  const [contactForm, setContactForm] = useState({
    name: "",
    organization: "",
    email: "",
    phone: "",
    deadline: "",
    inquiry: ""
  });
  const {
    toast
  } = useToast();
  const pressReleases = [{
    date: "December 2024",
    title: "The Queer Guide Launches Comprehensive LGBTQ+ Platform",
    summary: "New platform connects community members with verified safe spaces, events, and businesses worldwide.",
    category: "Launch",
    downloadUrl: "#"
  }, {
    date: "January 2025",
    title: "Partnership with Local LGBTQ+ Organizations Expands Safety Network",
    summary: "The Queer Guide announces partnerships with 25+ community organizations to verify and promote safe spaces.",
    category: "Partnership",
    downloadUrl: "#"
  }, {
    date: "February 2025",
    title: "10,000+ Community Members Join The Queer Guide in First Quarter",
    summary: "Rapid growth demonstrates strong need for centralized LGBTQ+ resource platform.",
    category: "Milestone",
    downloadUrl: "#"
  }];
  const mediaKit = [{
    title: "Brand Guidelines",
    description: "Logo files, brand colors, typography, and usage guidelines",
    type: "PDF",
    size: "2.3 MB"
  }, {
    title: "High-Resolution Logos",
    description: "PNG, SVG, and vector formats for print and digital use",
    type: "ZIP",
    size: "5.1 MB"
  }, {
    title: "Platform Screenshots",
    description: "High-quality screenshots of key platform features",
    type: "ZIP",
    size: "8.7 MB"
  }, {
    title: "Company Fact Sheet",
    description: "Key statistics, mission statement, and company overview",
    type: "PDF",
    size: "1.2 MB"
  }];
  const coverage = [{
    outlet: "LGBTQ Nation",
    title: "New Platform Helps Queer People Find Safe Spaces Worldwide",
    date: "March 2025",
    type: "Feature Article"
  }, {
    outlet: "Tech Crunch",
    title: "The Queer Guide Raises $2M to Expand Global Safe Space Network",
    date: "February 2025",
    type: "Funding News"
  }, {
    outlet: "The Advocate",
    title: "How Technology is Making LGBTQ+ Travel Safer",
    date: "January 2025",
    type: "Opinion Piece"
  }];
  const keyStats = [{
    label: "Registered Users",
    value: "2",
    icon: Users
  }, {
    label: "Verified Venues",
    value: "6",
    icon: Award
  }, {
    label: "Cities Covered",
    value: "5",
    icon: Calendar
  }, {
    label: "Active Events",
    value: "14",
    icon: Calendar
  }, {
    label: "Community Groups",
    value: "8",
    icon: Users
  }, {
    label: "Marketplace Listings",
    value: "8",
    icon: Award
  }];
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast({
      title: "Press inquiry submitted",
      description: "We'll get back to you within 24 hours."
    });
    setContactForm({
      name: "",
      organization: "",
      email: "",
      phone: "",
      deadline: "",
      inquiry: ""
    });
  };
  return <div className="w-full p-6">
      {/* Hero Section */}
      <div className="text-center mb-12">
        <div className="flex items-center justify-center gap-3 mb-4">
          <Newspaper className="h-12 w-12 text-primary" />
          <h1 className="text-4xl font-bold gradient-text">Press & Media</h1>
        </div>
        <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
          Resources for journalists, bloggers, and media professionals covering 
          The Queer Guide and LGBTQ+ technology initiatives.
        </p>
      </div>

      {/* Quick Stats */}
      <section className="mb-16">
        <h2 className="text-2xl font-bold text-center mb-8">At a Glance</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {keyStats.map((stat, index) => <Card key={index}>
              <CardContent className="p-6 text-center">
                <stat.icon className="h-8 w-8 text-primary mx-auto mb-3" />
                <div className="text-3xl font-bold text-primary mb-1">{stat.value}</div>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </CardContent>
            </Card>)}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-8">
          {/* Press Releases */}
          <section>
            <h2 className="text-2xl font-bold mb-6">Press Releases</h2>
            <div className="space-y-4">
              {pressReleases.map((release, index) => <Card key={index}>
                  <CardContent className="p-6">
                    <div className="flex justify-between items-start mb-3">
                      <Badge variant="outline">{release.category}</Badge>
                      <span className="text-sm text-muted-foreground">{release.date}</span>
                    </div>
                    <h3 className="text-lg font-semibold mb-2">{release.title}</h3>
                    <p className="text-muted-foreground mb-4">{release.summary}</p>
                    <Button variant="outline" size="sm" className="gap-2">
                      <Download className="h-4 w-4" />
                      Download
                    </Button>
                  </CardContent>
                </Card>)}
            </div>
          </section>

          {/* Media Coverage */}
          <section>
            <h2 className="text-2xl font-bold mb-6">Recent Coverage</h2>
            <div className="space-y-4">
              {coverage.map((article, index) => <Card key={index}>
                  <CardContent className="p-6">
                    <div className="flex justify-between items-start mb-2">
                      <Badge variant="secondary">{article.type}</Badge>
                      <span className="text-sm text-muted-foreground">{article.date}</span>
                    </div>
                    <h3 className="font-semibold mb-1">{article.title}</h3>
                    <p className="text-sm text-muted-foreground">{article.outlet}</p>
                  </CardContent>
                </Card>)}
            </div>
          </section>
        </div>

        {/* Sidebar */}
        <div className="space-y-8">
          {/* Media Kit */}
          <Card>
            <CardHeader>
              <CardTitle>Media Kit</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {mediaKit.map((item, index) => <div key={index} className="flex justify-between items-center p-3 bg-muted rounded">
                  <div className="flex-1">
                    <h4 className="font-medium text-sm">{item.title}</h4>
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                    <span className="text-xs text-muted-foreground">{item.type} • {item.size}</span>
                  </div>
                  <Button variant="ghost" size="sm">
                    <Download className="h-4 w-4" />
                  </Button>
                </div>)}
            </CardContent>
          </Card>

          {/* Key Facts */}
          <Card>
            <CardHeader>
              <CardTitle>Key Facts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <h4 className="font-medium text-sm">Founded</h4>
                <p className="text-sm text-muted-foreground">2024</p>
              </div>
              <div>
                <h4 className="font-medium text-sm">Mission</h4>
                <p className="text-sm text-muted-foreground">
                  Connecting LGBTQ+ individuals with safe spaces and community
                </p>
              </div>
              <div>
                <h4 className="font-medium text-sm">Headquarters</h4>
                <p className="text-sm text-muted-foreground">Global (Remote-First)</p>
              </div>
              <div>
                <h4 className="font-medium text-sm">Platform Type</h4>
                <p className="text-sm text-muted-foreground">
                  Web-based directory and community platform
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Press Contact */}
          <Card>
            <CardHeader>
              <CardTitle>Press Contact</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" value={contactForm.name} onChange={e => setContactForm(prev => ({
                  ...prev,
                  name: e.target.value
                }))} required />
                </div>
                <div>
                  <Label htmlFor="organization">Organization</Label>
                  <Input id="organization" value={contactForm.organization} onChange={e => setContactForm(prev => ({
                  ...prev,
                  organization: e.target.value
                }))} required />
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={contactForm.email} onChange={e => setContactForm(prev => ({
                  ...prev,
                  email: e.target.value
                }))} required />
                </div>
                <div>
                  <Label htmlFor="phone">Phone (Optional)</Label>
                  <Input id="phone" value={contactForm.phone} onChange={e => setContactForm(prev => ({
                  ...prev,
                  phone: e.target.value
                }))} />
                </div>
                <div>
                  <Label htmlFor="deadline">Deadline</Label>
                  <Input id="deadline" value={contactForm.deadline} onChange={e => setContactForm(prev => ({
                  ...prev,
                  deadline: e.target.value
                }))} placeholder="e.g., End of week" />
                </div>
                <div>
                  <Label htmlFor="inquiry">Press Inquiry</Label>
                  <Textarea id="inquiry" rows={4} value={contactForm.inquiry} onChange={e => setContactForm(prev => ({
                  ...prev,
                  inquiry: e.target.value
                }))} placeholder="Please describe your story, interview request, or press inquiry..." required />
                </div>
                <Button type="submit" className="w-full gap-2">
                  <Mail className="h-4 w-4" />
                  Submit Inquiry
                </Button>
              </form>
              
              
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Executive Bios */}
      
    </div>;
}