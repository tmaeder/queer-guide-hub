import { Link, useNavigate } from "react-router-dom";
import { Heart, Mail, Github, Twitter, Instagram, Plane, MapPin, Calendar, Store, Info, Eye, Settings, Phone, Newspaper, Users, Globe, Tag, Shield, Lock, Cookie, Copyright, ChevronUp, FileText, Leaf } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
export function Footer() {
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();
  const legalLinks = [{
    href: "/legal",
    label: "Legal Hub",
    icon: Shield
  }];
  const helpLinks = [{
    href: "/about-hub",
    label: "About Hub",
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
  return <footer className="bg-card border-t mt-auto">
      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8">
          {/* Brand Section */}
          <div className="lg:col-span-2 space-y-4">
            
            
            
            {/* Newsletter Signup */}
            <div className="space-y-2">
              
              
            </div>

            {/* Social Links */}
            <div className="space-y-2">
              
              
            </div>
          </div>

          {/* Community Links */}
          

          {/* Resources & Help */}
          <div className="space-y-4">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <Info className="h-4 w-4 text-primary" />
              Resources
            </h3>
            <ul className="space-y-3">
              {helpLinks.map(link => <li key={link.href}>
                  <Link to={link.href} className="text-sm text-muted-foreground hover:text-primary transition-all duration-200 flex items-center gap-2 group hover:translate-x-1">
                    <link.icon className="h-4 w-4 group-hover:text-primary" />
                    {link.label}
                  </Link>
                </li>)}
            </ul>
          </div>

          {/* Legal & Privacy */}
          <div className="space-y-4">
            
            <ul className="space-y-3">
              {legalLinks.map(link => <li key={link.href}>
                  <Link to={link.href} className="text-sm text-muted-foreground hover:text-primary transition-all duration-200 flex items-center gap-2 group hover:translate-x-1">
                    <link.icon className="h-4 w-4 group-hover:text-primary" />
                    {link.label}
                  </Link>
                </li>)}
            </ul>
          </div>
        </div>

        <Separator className="my-8" />

        {/* Bottom Section */}
        <div className="flex flex-col lg:flex-row items-center justify-between gap-6">
          <div className="flex flex-col md:flex-row items-center gap-4 text-center md:text-left">
            <p className="text-sm text-muted-foreground">
              © {currentYear} Queer Guide. All rights reserved.
            </p>
            
          </div>
          
          {/* Quick Actions */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="h-8 text-xs hover:bg-primary/10 hover:text-primary transition-all duration-200" onClick={() => navigate('/admin')}>
                <Settings className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" className="h-8 text-xs hover:bg-primary/10 hover:text-primary transition-all duration-200" onClick={() => window.scrollTo({
              top: 0,
              behavior: 'smooth'
            })}>
                <ChevronUp className="h-4 w-4" />
              </Button>
            </div>
            <Separator orientation="vertical" className="h-6" />
            <ThemeToggle />
          </div>
        </div>

        {/* Pride Flag Accent */}
        
      </div>
    </footer>;
}