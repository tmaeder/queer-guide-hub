import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface DonationRequest {
  amount: number; // Amount in cents (CHF)
  donor_name?: string;
  message?: string;
  is_anonymous?: boolean;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Create Supabase client using the service role for secure operations
    const supabaseService = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Get user email from auth header or use guest email
    let userEmail = "guest@example.com";
    let userId = null;
    
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      try {
        const token = authHeader.replace("Bearer ", "");
        const supabaseClient = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_ANON_KEY") ?? ""
        );
        const { data } = await supabaseClient.auth.getUser(token);
        if (data.user?.email) {
          userEmail = data.user.email;
          userId = data.user.id;
        }
      } catch (error) {
        console.log("Auth error, using guest email:", error);
      }
    }

    const { amount, donor_name, message, is_anonymous }: DonationRequest = await req.json();

    // Validate amount
    if (!amount || amount < 500) { // Minimum 5.00 CHF
      throw new Error("Minimum donation amount is 5.00 CHF");
    }

    // Get zahls.ch configuration
    const zahlsBaseUrl = Deno.env.get("ZAHLS_BASE_URL") || "https://zahls.ch";
    const zahlsPaymentPageId = Deno.env.get("ZAHLS_PAYMENT_PAGE_ID");
    
    if (!zahlsPaymentPageId) {
      throw new Error("zahls.ch payment page ID not configured");
    }

    // Create donation record in database
    const donationId = crypto.randomUUID();
    const { error: dbError } = await supabaseService.from("donations").insert({
      id: donationId,
      user_id: userId,
      email: userEmail,
      amount: amount,
      donor_name: donor_name,
      message: message,
      is_anonymous: is_anonymous || false,
      status: "pending",
      currency: "CHF",
    });

    if (dbError) {
      console.error("Database error:", dbError);
      throw new Error("Failed to create donation record");
    }

    // Create zahls.ch payment URL with parameters
    const paymentUrl = new URL(`${zahlsBaseUrl}/payment/${zahlsPaymentPageId}`);
    paymentUrl.searchParams.set("amount", (amount / 100).toFixed(2)); // Convert cents to CHF
    paymentUrl.searchParams.set("reference", donationId);
    paymentUrl.searchParams.set("customer_email", userEmail);
    paymentUrl.searchParams.set("success_url", `${req.headers.get("origin")}/donation-success?donation_id=${donationId}`);
    paymentUrl.searchParams.set("cancel_url", `${req.headers.get("origin")}/donate`);
    
    if (donor_name) {
      paymentUrl.searchParams.set("customer_name", donor_name);
    }

    return new Response(JSON.stringify({ url: paymentUrl.toString() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Error in create-donation function:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});