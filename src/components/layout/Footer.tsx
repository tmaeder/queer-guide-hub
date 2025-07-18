import { Link, useNavigate } from "react-router-dom";
import { Heart, Mail, Github, Twitter, Instagram, Plane, MapPin, Calendar, Store, Info, Eye, FileText, Phone, Newspaper, Users, Globe, Tag, Shield, Lock, Cookie, Copyright } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
export function Footer() {
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();
  const legalLinks = [{
    href: "/terms",
    label: "Terms of Service",
    icon: FileText
  }, {
    href: "/privacy",
    label: "Privacy Policy",
    icon: Shield
  }, {
    href: "/cookies",
    label: "Cookie Policy",
    icon: Cookie
  }, {
    href: "/dmca",
    label: "DMCA",
    icon: Copyright
  }];
  const helpLinks = [{
    href: "/about",
    label: "About Us",
    icon: Info
  }, {
    href: "/vision",
    label: "Our Vision",
    icon: Eye
  }, {
    href: "/values",
    label: "Our Values",
    icon: Heart
  }, {
    href: "/contact",
    label: "Contact",
    icon: Phone
  }, {
    href: "/press",
    label: "Press",
    icon: Newspaper
  }, {
    href: "/blog",
    label: "Blog",
    icon: FileText
  }, {
    href: "/directory",
    label: "Directory",
    icon: Users
  }, {
    href: "/tags",
    label: "Tags Wiki",
    icon: Tag
  }];
  const communityLinks = [{
    href: "/travel",
    label: "Travel",
    icon: Plane
  }, {
    href: "/venues",
    label: "Venues",
    icon: MapPin
  }, {
    href: "/events",
    label: "Events",
    icon: Calendar
  }, {
    href: "/marketplace",
    label: "Marketplace",
    icon: Store
  }];
  const socialLinks = [{
    href: "#",
    icon: Twitter,
    label: "Twitter"
  }, {
    href: "#",
    icon: Instagram,
    label: "Instagram"
  }, {
    href: "#",
    icon: Github,
    label: "GitHub"
  }];
  return <footer className="bg-card mt-auto">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8">
          {/* Brand Section */}
          <div className="lg:col-span-2">
            <Link to="/" className="flex items-center gap-2 mb-4">
              <Heart className="h-8 w-8 text-primary fill-current" />
              <h2 className="text-xl font-bold gradient-text">Queer Guide</h2>
            </Link>
            <p className="text-muted-foreground mb-4 max-w-sm">
              Connecting the LGBTQ+ community with safe spaces, events, businesses, and each other. 
              Building a more inclusive world, one connection at a time.
            </p>
            <div className="flex items-center gap-2">
              {socialLinks.map(social => <Button key={social.label} variant="ghost" size="sm" asChild className="h-8 w-8 p-0">
                  <a href={social.href} aria-label={social.label}>
                    <social.icon className="h-4 w-4" />
                  </a>
                </Button>)}
            </div>
          </div>

          {/* Community Links */}
          <div>
            
            <ul className="space-y-2">
              {communityLinks.map(link => <li key={link.href}>
                  <Link to={link.href} className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2">
                    <link.icon className="h-4 w-4" />
                    {link.label}
                  </Link>
                </li>)}
            </ul>
          </div>

          {/* Help Links */}
          <div>
            
            <ul className="space-y-2">
              {helpLinks.map(link => <li key={link.href}>
                  <Link to={link.href} className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2">
                    <link.icon className="h-4 w-4" />
                    {link.label}
                  </Link>
                </li>)}
            </ul>
          </div>

          {/* Legal Links */}
          <div>
            <h3 className="font-semibold mb-4">Legal</h3>
            <ul className="space-y-2">
              {legalLinks.map(link => <li key={link.href}>
                  <Link to={link.href} className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2">
                    <link.icon className="h-4 w-4" />
                    {link.label}
                  </Link>
                </li>)}
            </ul>
          </div>
        </div>

        <Separator className="my-8" />

        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex flex-col md:flex-row items-center gap-4">
            <p className="text-sm text-muted-foreground">
              © {currentYear} Queer Guide. All rights reserved.
            </p>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Made with</span>
              <Heart className="h-4 w-4 text-primary fill-current" />
              <span>for the community</span>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => navigate('/admin')}>
              <FileText className="h-4 w-4" />
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </div>
    </footer>;
}