import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, Heart, Home, Share2 } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

export default function DonationSuccess() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const [isShared, setIsShared] = useState(false);

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Supporting LGBTQ+ Community",
          text: "I just donated to support LGBTQ+ community resources and safe spaces worldwide!",
          url: window.location.origin,
        });
        setIsShared(true);
      } catch (error) {
        console.log("Share failed:", error);
      }
    } else {
      // Fallback for browsers that don't support native sharing
      try {
        await navigator.clipboard.writeText(
          `I just donated to support LGBTQ+ community resources and safe spaces worldwide! Check out ${window.location.origin}`
        );
        setIsShared(true);
      } catch (error) {
        console.log("Clipboard failed:", error);
      }
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto text-center">
          {/* Success Message */}
          <div className="mb-8">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              Thank You!
            </h1>
            <p className="text-xl text-muted-foreground">
              Your donation has been processed successfully and will make a real difference in LGBTQ+ lives worldwide.
            </p>
          </div>

          {/* Success Card */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center justify-center space-x-2">
                <Heart className="h-6 w-6 text-red-500" />
                <span>Donation Complete</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                Your support helps us continue building a more inclusive world by:
              </p>
              
              <div className="grid md:grid-cols-2 gap-4 text-left">
                <div className="space-y-2">
                  <h3 className="font-semibold">✨ Expanding Safe Spaces</h3>
                  <p className="text-sm text-muted-foreground">
                    Verifying and promoting LGBTQ+ friendly venues
                  </p>
                </div>
                
                <div className="space-y-2">
                  <h3 className="font-semibold">🌍 Global Community</h3>
                  <p className="text-sm text-muted-foreground">
                    Connecting LGBTQ+ individuals worldwide
                  </p>
                </div>
                
                <div className="space-y-2">
                  <h3 className="font-semibold">📚 Educational Resources</h3>
                  <p className="text-sm text-muted-foreground">
                    Creating comprehensive rights information
                  </p>
                </div>
                
                <div className="space-y-2">
                  <h3 className="font-semibold">🛡️ Rights Advocacy</h3>
                  <p className="text-sm text-muted-foreground">
                    Promoting equality and human rights
                  </p>
                </div>
              </div>

              {sessionId && (
                <div className="bg-muted p-4 rounded-lg">
                  <p className="text-sm">
                    <strong>Transaction ID:</strong> {sessionId}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Save this for your records. You'll receive an email receipt shortly.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button asChild size="lg">
              <Link to="/">
                <Home className="h-4 w-4 mr-2" />
                Return Home
              </Link>
            </Button>
            
            <Button
              variant="outline"
              size="lg"
              onClick={handleShare}
              disabled={isShared}
            >
              <Share2 className="h-4 w-4 mr-2" />
              {isShared ? "Shared!" : "Share Your Support"}
            </Button>
          </div>

          {/* Additional Message */}
          <div className="mt-12 p-6 bg-gradient-to-r from-primary/10 to-secondary/10 rounded-lg">
            <h2 className="text-xl font-semibold mb-2">Want to do more?</h2>
            <p className="text-muted-foreground mb-4">
              Join our community and help us identify safe spaces, share resources, and support LGBTQ+ individuals in your area.
            </p>
            <Button asChild variant="outline">
              <Link to="/groups">
                Join Our Community
              </Link>
            </Button>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}