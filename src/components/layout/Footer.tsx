import { Link, useNavigate } from "react-router-dom";
import { ChevronUp, FileText, Shield, Lock, Cookie, Copyright, Scale, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

export function Footer() {
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();

  const legalLinks = [
    { href: "/legal", label: "Legal", icon: Shield },
    { href: "/terms", label: "Terms", icon: Scale },
    { href: "/privacy", label: "Privacy", icon: Lock },
    { href: "/cookies", label: "Cookies", icon: Cookie },
    { href: "/dmca", label: "DMCA", icon: Copyright },
  ];

  return (
    <footer className="bg-background/80 backdrop-blur-sm border-t border-border/50 mt-auto">
      <div className="container mx-auto px-4 py-3">
        {/* Single Row Layout */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <p className="text-sm text-muted-foreground">
            &copy; {currentYear} Queer Guide. All rights reserved.
          </p>

          {/* Legal Links */}
          <nav aria-label="Legal" className="flex items-center gap-1 flex-wrap">
            {legalLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                className="text-xs text-muted-foreground hover:text-primary transition-colors px-2 py-1"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Quick Actions */}
          <div className="flex items-center gap-2">
            <Button
              variant="default"
              size="sm"
              className="h-8 text-xs gap-1 bg-primary text-primary-foreground font-semibold focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              onClick={() => navigate("/admin/venues")}
            >
              <Plus className="h-3.5 w-3.5" />
              Submit a Space
            </Button>
            <Separator orientation="vertical" className="h-6" />
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs hover:bg-primary/10 hover:text-primary transition-all duration-200"
              aria-label="Scroll to top"
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
            <Separator orientation="vertical" className="h-6" />
            <Button
              variant="ghost"
              size="sm"
              aria-label="Sitemap"
              className="h-8 text-xs hover:bg-primary/10 hover:text-primary transition-all duration-200"
              onClick={() => navigate("/sitemap")}
            >
              <FileText className="h-4 w-4" />
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </div>
    </footer>
  );
}
