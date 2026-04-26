import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsResponse, errorResponse, getServiceClient, jsonResponse } from "../_shared/supabase-client.ts";
import { sendEmail, isEmailConfigured } from "../_shared/email.ts";

/**
 * Booking Confirmation Email
 *
 * Triggered after a booking is created or confirmed.
 * Sends a confirmation email to the user with booking details.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req);

  try {
    if (!isEmailConfigured()) {
      return errorResponse('Email service not configured', 503, req);
    }

    const { bookingId } = await req.json();
    if (!bookingId) return errorResponse('bookingId required', 400, req);

    const supabase = getServiceClient();

    // Fetch booking with user email
    const { data: booking, error: bookingErr } = await supabase
      .from('bookings')
      .select('*, trips(title)')
      .eq('id', bookingId)
      .single();

    if (bookingErr || !booking) {
      return errorResponse('Booking not found', 404, req);
    }

    // Get user email
    const { data: userData } = await supabase.auth.admin.getUserById(booking.user_id);
    const email = userData?.user?.email;
    if (!email) {
      return errorResponse('User email not found', 404, req);
    }

    const typeLabel = booking.booking_type === 'hotel' ? 'Hotel' : booking.booking_type === 'flight' ? 'Flight' : 'Activity';
    const statusLabel = booking.status === 'confirmed' ? 'Confirmed' : booking.status === 'pending' ? 'Pending' : booking.status;
    const currencySymbol = booking.currency === 'EUR' ? '€' : booking.currency === 'USD' ? '$' : booking.currency;
    const amount = booking.total_amount ? `${currencySymbol}${Math.round(booking.total_amount)}` : '';

    const checkIn = booking.check_in ? new Date(booking.check_in).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '';
    const checkOut = booking.check_out ? new Date(booking.check_out).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '';

    const tripInfo = booking.trips?.title ? `<p style="margin:8px 0;color:#666;">Trip: ${booking.trips.title}</p>` : '';

    const html = `
<!DOCTYPE html>
<html>
<body style="font-family:Inter,system-ui,sans-serif;margin:0;padding:0;background:#f5f5f5;">
<div style="max-width:560px;margin:0 auto;padding:32px 16px;">
  <div style="background:#fff;padding:32px;border-radius:0;">
    <div style="text-align:center;margin-bottom:24px;">
      <h1 style="font-size:20px;font-weight:800;margin:0;color:#0a0a0a;">${typeLabel} Booking ${statusLabel}</h1>
    </div>

    <p style="margin:0 0 16px;color:#333;">Hi${booking.guest_name ? ` ${booking.guest_name}` : ''},</p>
    <p style="margin:0 0 16px;color:#333;">Your ${typeLabel.toLowerCase()} booking is <strong>${statusLabel.toLowerCase()}</strong>.</p>

    <div style="background:#fafafa;padding:16px;margin:16px 0;">
      <p style="margin:4px 0;font-weight:600;">${booking.guest_name || typeLabel + ' Booking'}</p>
      <p style="margin:4px 0;color:#666;">Provider: ${booking.provider}</p>
      ${checkIn ? `<p style="margin:4px 0;color:#666;">${checkOut ? `${checkIn} — ${checkOut}` : checkIn}</p>` : ''}
      ${amount ? `<p style="margin:4px 0;font-weight:700;color:#b60d3d;">${amount}</p>` : ''}
      ${tripInfo}
    </div>

    <p style="margin:16px 0 0;color:#666;font-size:13px;">
      View all your bookings at <a href="https://queer.guide/bookings" style="color:#b60d3d;">queer.guide/bookings</a>
    </p>
  </div>
  <p style="text-align:center;color:#999;font-size:11px;margin-top:16px;">
    queer.guide — Safe spaces, vibrant events, and communities that get you.
  </p>
</div>
</body>
</html>`;

    const result = await sendEmail({
      from: 'Queer Guide <bookings@queer.guide>',
      to: [email],
      subject: `${typeLabel} Booking ${statusLabel}${amount ? ` — ${amount}` : ''}`,
      html,
      text: `Your ${typeLabel.toLowerCase()} booking is ${statusLabel.toLowerCase()}. ${checkIn ? `Dates: ${checkIn}${checkOut ? ` — ${checkOut}` : ''}` : ''} ${amount ? `Amount: ${amount}` : ''} View at https://queer.guide/bookings`,
    });

    if (result.error) {
      console.error('Email send error:', result.error);
      return errorResponse('Failed to send email', 500, req);
    }

    return jsonResponse({ success: true, emailId: result.id }, 200, req);

  } catch (error) {
    console.error('Booking confirmation error:', error);
    return errorResponse('Internal server error', 500, req);
  }
});
