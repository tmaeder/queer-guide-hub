import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Heart, Users, Globe, Shield } from "lucide-react";

const PRESET_AMOUNTS = [5, 10, 25, 50, 100, 250]; // CHF amounts

export default function Donate() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [selectedAmount, setSelectedAmount] = useState<number | null>(10);
  const [customAmount, setCustomAmount] = useState("");
  const [donorName, setDonorName] = useState("");
  const [message, setMessage] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleAmountSelect = (amount: number) => {
    setSelectedAmount(amount);
    setCustomAmount("");
  };

  const handleCustomAmountChange = (value: string) => {
    setCustomAmount(value);
    setSelectedAmount(null);
  };

  const getDonationAmount = () => {
    if (selectedAmount) return selectedAmount * 100; // Convert to cents
    if (customAmount) return Math.round(parseFloat(customAmount) * 100);
    return 0;
  };

  const handleDonate = async () => {
    const amount = getDonationAmount();
    
    if (amount < 500) {
      toast({
        title: "Invalid Amount",
        description: "Minimum donation amount is 5.00 CHF",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-donation", {
        body: {
          amount,
          donor_name: donorName,
          message,
          is_anonymous: isAnonymous,
        },
      });

      if (error) throw error;

      if (data?.url) {
        // Open zahls.ch payment page in a new tab
        window.open(data.url, '_blank');
      }
    } catch (error) {
      console.error("Donation error:", error);
      toast({
        title: "Error",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-8">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            Support Our Mission
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Help us build a more inclusive world by supporting LGBTQ+ community resources, 
            safe spaces, and visibility initiatives around the globe.
          </p>
        </div>

        {/* Impact Cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          <Card className="text-center">
            <CardContent className="pt-6">
              <Heart className="h-8 w-8 text-primary mx-auto mb-2" />
              <h3 className="font-semibold mb-2">Safe Spaces</h3>
              <p className="text-sm text-muted-foreground">
                Supporting verified LGBTQ+ friendly venues and organizations
              </p>
            </CardContent>
          </Card>
          
          <Card className="text-center">
            <CardContent className="pt-6">
              <Users className="h-8 w-8 text-primary mx-auto mb-2" />
              <h3 className="font-semibold mb-2">Community</h3>
              <p className="text-sm text-muted-foreground">
                Connecting and empowering LGBTQ+ individuals worldwide
              </p>
            </CardContent>
          </Card>
          
          <Card className="text-center">
            <CardContent className="pt-6">
              <Globe className="h-8 w-8 text-primary mx-auto mb-2" />
              <h3 className="font-semibold mb-2">Global Reach</h3>
              <p className="text-sm text-muted-foreground">
                Expanding our platform to serve communities internationally
              </p>
            </CardContent>
          </Card>
          
          <Card className="text-center">
            <CardContent className="pt-6">
              <Shield className="h-8 w-8 text-primary mx-auto mb-2" />
              <h3 className="font-semibold mb-2">Rights Advocacy</h3>
              <p className="text-sm text-muted-foreground">
                Promoting equality and human rights education
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Donation Form */}
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl text-center">Make a Donation</CardTitle>
              <CardDescription className="text-center">
                Your support makes a real difference in LGBTQ+ lives worldwide
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Amount Selection */}
              <div>
                <Label className="text-base font-medium mb-4 block">Select Amount (CHF)</Label>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {PRESET_AMOUNTS.map((amount) => (
                    <Button
                      key={amount}
                      variant={selectedAmount === amount ? "default" : "outline"}
                      onClick={() => handleAmountSelect(amount)}
                      className="h-12"
                    >
                      {amount} CHF
                    </Button>
                  ))}
                </div>
                
                <div className="flex items-center space-x-2">
                  <Label htmlFor="custom-amount" className="whitespace-nowrap">Other:</Label>
                  <div className="relative flex-1">
                    <Input
                      id="custom-amount"
                      type="number"
                      placeholder="5.00"
                      value={customAmount}
                      onChange={(e) => handleCustomAmountChange(e.target.value)}
                      className="pr-12"
                      min="5"
                      step="0.01"
                    />
                    <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground font-medium">CHF</span>
                  </div>
                </div>
              </div>

              {/* Donor Information */}
              <div className="space-y-4">
                <div>
                  <Label htmlFor="donor-name">Your Name (Optional)</Label>
                  <Input
                    id="donor-name"
                    value={donorName}
                    onChange={(e) => setDonorName(e.target.value)}
                    placeholder="Enter your name"
                    disabled={isAnonymous}
                  />
                </div>

                <div>
                  <Label htmlFor="message">Message (Optional)</Label>
                  <Textarea
                    id="message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Share a message of support..."
                    rows={3}
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="anonymous"
                    checked={isAnonymous}
                    onCheckedChange={(checked) => {
                      setIsAnonymous(checked as boolean);
                      if (checked) setDonorName("");
                    }}
                  />
                  <Label htmlFor="anonymous" className="text-sm">
                    Make this donation anonymous
                  </Label>
                </div>
              </div>

              {/* Donation Summary */}
              <div className="bg-muted p-4 rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="font-medium">Donation Amount:</span>
                  <span className="text-xl font-bold">
                    {selectedAmount || (customAmount ? parseFloat(customAmount).toFixed(2) : "0.00")} CHF
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  100% of your donation goes directly to supporting our mission
                </p>
              </div>

              {/* Donate Button */}
              <Button
                onClick={handleDonate}
                disabled={isLoading || getDonationAmount() < 500}
                className="w-full h-12 text-lg"
                size="lg"
              >
                {isLoading ? "Processing..." : `Donate ${selectedAmount || (customAmount ? parseFloat(customAmount).toFixed(2) : "0.00")} CHF`}
              </Button>

              <p className="text-xs text-muted-foreground text-center">
                Secure payment processing by zahls.ch. Your donation is processed securely with TWINT, credit cards, and PostFinance.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Additional Info */}
        <div className="max-w-4xl mx-auto mt-12 text-center">
          <h2 className="text-2xl font-bold mb-6">How Your Donation Helps</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div>
              <h3 className="font-semibold mb-2">Platform Development</h3>
              <p className="text-muted-foreground">
                Continuously improving our platform to better serve the LGBTQ+ community with new features and enhanced security.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Community Outreach</h3>
              <p className="text-muted-foreground">
                Partnering with local organizations to verify safe spaces and expand our global network.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Educational Resources</h3>
              <p className="text-muted-foreground">
                Creating and maintaining comprehensive resources about LGBTQ+ rights and safety worldwide.
              </p>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}