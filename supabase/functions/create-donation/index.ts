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

    // Get zahls.ch API configuration
    const zahlsApiKey = Deno.env.get("ZAHLS_API_KEY");
    const zahlsInstanceName = Deno.env.get("ZAHLS_INSTANCE_NAME");
    
    if (!zahlsApiKey || !zahlsInstanceName) {
      throw new Error("zahls.ch API credentials not configured");
    }

    // Create donation record in database first
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

    // Create zahls.ch gateway using their REST API (same as payrexx format)
    const zahlsApiUrl = `https://${zahlsInstanceName}.zahls.ch/v1.0/Gateway/`;
    
    const gatewayData = {
      instance: zahlsInstanceName,
      amount: amount, // Amount in cents
      currency: "CHF",
      purpose: `Donation to Queer Guide`,
      successRedirectUrl: `${req.headers.get("origin")}/donation-success?donation_id=${donationId}`,
      cancelRedirectUrl: `${req.headers.get("origin")}/donate`,
      failedRedirectUrl: `${req.headers.get("origin")}/donate?error=payment_failed`,
      referenceId: donationId,
      "fields[forename]": donor_name?.split(' ')[0] || '',
      "fields[surname]": donor_name?.split(' ').slice(1).join(' ') || '',
      "fields[email]": userEmail,
      "fields[custom_field_1]": message || '',
    };

    console.log("Creating zahls.ch gateway with data:", JSON.stringify(gatewayData, null, 2));

    const response = await fetch(zahlsApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${btoa(`${zahlsInstanceName}:${zahlsApiKey}`)}`,
      },
      body: new URLSearchParams(gatewayData).toString(),
    });

    console.log("zahls.ch API response status:", response.status);
    const responseText = await response.text();
    console.log("zahls.ch API response body:", responseText);
    
    if (!response.ok) {
      console.error("zahls.ch API error:", response.status, responseText);
      throw new Error(`zahls.ch API error: ${response.status} - ${responseText}`);
    }

    const gateway = JSON.parse(responseText);
    console.log("zahls.ch gateway created:", JSON.stringify(gateway, null, 2));

    return new Response(JSON.stringify({ url: gateway.data?.link || gateway.link }), {
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