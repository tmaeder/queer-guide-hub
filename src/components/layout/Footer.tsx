import { Link } from "react-router-dom";
import { Heart, Mail, Github, Twitter, Instagram } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
export function Footer() {
  const currentYear = new Date().getFullYear();
  const legalLinks = [{
    href: "/terms",
    label: "Terms of Service"
  }, {
    href: "/privacy",
    label: "Privacy Policy"
  }, {
    href: "/cookies",
    label: "Cookie Policy"
  }, {
    href: "/dmca",
    label: "DMCA"
  }];
  const helpLinks = [{
    href: "/about",
    label: "About Us"
  }, {
    href: "/vision",
    label: "Our Vision"
  }, {
    href: "/values",
    label: "Our Values"
  }, {
    href: "/contact",
    label: "Contact"
  }, {
    href: "/press",
    label: "Press"
  }, {
    href: "/blog",
    label: "Blog"
  }, {
    href: "/directory",
    label: "Directory"
  }, {
    href: "/tags",
    label: "Tags Wiki"
  }];
  const communityLinks = [{
    href: "/travel",
    label: "Travel"
  }, {
    href: "/venues",
    label: "Venues"
  }, {
    href: "/events",
    label: "Events"
  }, {
    href: "/marketplace",
    label: "Marketplace"
  }, {
    href: "/community",
    label: "Community"
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
  return <footer className="bg-card border-t mt-auto">
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
            <h3 className="font-semibold mb-4">Community</h3>
            <ul className="space-y-2">
              {communityLinks.map(link => <li key={link.href}>
                  <Link to={link.href} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                    {link.label}
                  </Link>
                </li>)}
            </ul>
          </div>

          {/* Help Links */}
          <div>
            <h3 className="font-semibold mb-4">Help & Support</h3>
            <ul className="space-y-2">
              {helpLinks.map(link => <li key={link.href}>
                  <Link to={link.href} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
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
                  <Link to={link.href} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
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
            <Button variant="ghost" size="sm" asChild>
              
            </Button>
          </div>
        </div>
      </div>
    </footer>;
}