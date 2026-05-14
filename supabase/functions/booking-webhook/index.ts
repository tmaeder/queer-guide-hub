import { errorResponse, getServiceClient, jsonResponse } from "../_shared/supabase-client.ts";

/**
 * Booking Webhook Edge Function
 *
 * Receives status updates from booking providers (Impala, Booking.com, etc.)
 * and updates the bookings table accordingly.
 *
 * Each provider has a different payload format — the webhook is stored raw
 * and processed by provider-specific handlers.
 */
Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return errorResponse('POST required', 405);
  }

  try {
    const body = await req.json();
    const provider = new URL(req.url).searchParams.get('provider');

    if (!provider) {
      return errorResponse('Provider query param required', 400);
    }

    const supabase = getServiceClient();

    // Store raw webhook
    const { data: webhook, error: webhookError } = await supabase
      .from('booking_webhooks')
      .insert({
        provider,
        event_type: body.event_type || body.type || 'unknown',
        payload: body,
        processed: false,
      })
      .select('id')
      .single();

    if (webhookError) {
      console.error('Webhook insert error:', webhookError);
      return errorResponse('Failed to store webhook', 500);
    }

    // Process by provider
    let processed = false;
    let bookingId: string | null = null;

    try {
      switch (provider) {
        case 'impala':
          ({ processed, bookingId } = await processImpalaWebhook(supabase, body));
          break;
        case 'hotellook':
          ({ processed, bookingId } = await processHotellookWebhook(supabase, body));
          break;
        default:
          console.warn(`Unknown provider: ${provider}`);
      }
    } catch (processError) {
      console.error(`Webhook processing error for ${provider}:`, processError);
      await supabase
        .from('booking_webhooks')
        .update({ error_message: String(processError) })
        .eq('id', webhook.id);
    }

    // Mark webhook as processed
    if (processed) {
      await supabase
        .from('booking_webhooks')
        .update({
          processed: true,
          processed_at: new Date().toISOString(),
          booking_id: bookingId,
        })
        .eq('id', webhook.id);
    }

    return jsonResponse({ success: true, webhookId: webhook.id, processed });

  } catch (error) {
    console.error('Booking webhook error:', error);
    return errorResponse('Internal server error', 500);
  }
});

async function processImpalaWebhook(
  supabase: ReturnType<typeof getServiceClient>,
  payload: Record<string, unknown>,
): Promise<{ processed: boolean; bookingId: string | null }> {
  const providerBookingId = payload.booking_id as string;
  if (!providerBookingId) return { processed: false, bookingId: null };

  const statusMap: Record<string, string> = {
    confirmed: 'confirmed',
    cancelled: 'cancelled',
    completed: 'completed',
    failed: 'failed',
  };

  const newStatus = statusMap[payload.status as string];
  if (!newStatus) return { processed: false, bookingId: null };

  const { data } = await supabase
    .from('bookings')
    .update({
      status: newStatus,
      provider_booking_id: providerBookingId,
      provider_data: payload,
    })
    .eq('provider', 'impala')
    .eq('provider_booking_id', providerBookingId)
    .select('id')
    .single();

  return { processed: !!data, bookingId: data?.id || null };
}

async function processHotellookWebhook(
  _supabase: ReturnType<typeof getServiceClient>,
  _payload: Record<string, unknown>,
): Promise<{ processed: boolean; bookingId: string | null }> {
  // Hotellook doesn't have real-time webhooks — this is a placeholder
  // for when we switch to a provider that does (Impala, Booking.com)
  return { processed: false, bookingId: null };
}
